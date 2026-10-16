import { findCriticalCircle } from '../search'
import type {
  AnalysisResult,
  FaceCoverage,
  FillMaterial,
  Layer,
  ReinforcementLayer,
  SlopeGeometry,
} from '../types'
import { geometriaFaceVertical } from './cortina'

// Pré-dimensionamento de muro de solo reforçado com geossintético, face
// vertical, sobre qualquer solo de fundação.
//   Interna: Tmax = Ka·σv·Sv por camada; ruptura, arrancamento e conexão.
//   Externa: o bloco reforçado como muro de gravidade (tombamento,
//            deslizamento na base, capacidade de carga com excentricidade).
//   Global:  mesmo motor de fatias do talude, com cada camada de reforço como
//            força horizontal limitada pelo arrancamento.
// O aterro da Nova Análise é usado como solo reforçado e como solo retido
// (coesão desprezada nos empuxos). Não verifica recalque, drenagem nem o
// detalhe da face; não é projeto executivo.

export interface ParamsMSE {
  embutimento: number // m, base abaixo do terreno
  comprimento: number // m (0 = automático: 0,7·H, mínimo 2,0)
  espacamento: number // m, vertical
  tult: number // kN/m, resistência última do geossintético (0 = automática)
  rfCr: number // fator de redução: fluência
  rfId: number // dano de instalação
  rfD: number // durabilidade
  ci: number // coeficiente de interação solo-reforço (arrancamento)
  efConexao: number // 0–1, resistência da conexão com a face / Tadm
  fsAlvoGlobal: number
}

export const MSE_PADRAO: ParamsMSE = {
  embutimento: 0.5,
  comprimento: 0,
  espacamento: 0.4,
  tult: 0,
  rfCr: 1.6,
  rfId: 1.1,
  rfD: 1.1,
  ci: 0.8,
  efConexao: 0.8,
  fsAlvoGlobal: 1.5,
}

const FS_RUP_MIN = 1.0
const FS_ARRANC_MIN = 1.5
const FS_TOMB_MIN = 2.0
const FS_DESL_MIN = 1.5
const FS_CAP_MIN = 3.0

const rad = (g: number) => (g * Math.PI) / 180
const kaRankine = (phi: number) => Math.tan(rad(45 - phi / 2)) ** 2

export interface CamadaMSE {
  h: number // cota do reforço acima da base (m)
  z: number // profundidade abaixo do topo (m)
  sigmaV: number
  Tmax: number // kN/m
  La: number // m, distância da face à superfície de Rankine
  Le: number // m, comprimento de ancoragem
  Tpo: number // kN/m, arrancamento
  fsRup: number
  fsArranc: number
  fsConexao: number
}

export interface ExternaMSE {
  Pa: number // kN/m, empuxo horizontal (aterro + sobrecarga)
  V: number // kN/m
  Mr: number
  Md: number
  e: number // excentricidade (m)
  Bef: number // largura efetiva (m)
  fsTomb: number
  fsDesl: number
  qmax: number // kPa
  qult: number // kPa
  fsCap: number
  fundacao: { nome: string; c: number; phi: number; gamma: number; espessura: number | null }
}

export interface AvisoMSE {
  nivel: 'aviso' | 'erro'
  texto: string
}

export interface ResultadoMSE {
  H: number
  q: number
  L: number
  Sv: number
  camadas: CamadaMSE[]
  Ka: number
  tultNecessario: number
  tultAdotado: number
  tadm: number
  externa: ExternaMSE
  fs0: number // global sem reforço
  fsGlobal: number // global com reforço
  circulo: AnalysisResult
  avisos: AvisoMSE[]
}

/** Camada de fundação na cota da base do muro. */
function fundacaoEm(layers: Layer[], cotaBase: number) {
  const topo = (l: Layer) => l.y_top ?? 0
  const base = (l: Layer) => l.y_base ?? -Infinity
  let i = layers.findIndex((l) => topo(l) >= cotaBase - 1e-9 && base(l) <= cotaBase + 1e-9)
  if (i < 0) i = layers.length - 1
  const l = layers[Math.max(i, 0)]
  const esp = l && Number.isFinite(base(l)) ? cotaBase - base(l) : null
  return { nome: l?.name ?? 'Fundação', c: l?.c ?? 0, phi: l?.phi ?? 0, gamma: l?.gamma ?? 18, espessura: esp }
}

/** Capacidade de carga de faixa (Meyerhof), em kPa. */
function qultFaixa(c: number, phi: number, gamma: number, B: number, q0: number): number {
  if (phi < 1) return 5.14 * c + q0
  const t = Math.tan(rad(phi))
  const Nq = Math.exp(Math.PI * t) * Math.tan(rad(45 + phi / 2)) ** 2
  const Nc = (Nq - 1) / t
  const Ng = (Nq - 1) * Math.tan(rad(1.4 * phi))
  return c * Nc + q0 * Nq + 0.5 * gamma * B * Ng
}

/** Estabilidades interna e externa (analíticas; sem o cálculo global). */
export function dimensionarMSE(
  H: number,
  q: number,
  fill: FillMaterial,
  layers: Layer[],
  p: ParamsMSE
) {
  const L = p.comprimento > 0 ? p.comprimento : Math.max(0.7 * H, 2)
  const Sv = p.espacamento
  const Ka = kaRankine(fill.phi)
  const rfTotal = p.rfCr * p.rfId * p.rfD

  const n = Math.max(1, Math.ceil(H / Sv - 1e-9))
  const tmaxPorCamada: { h: number; z: number; sigmaV: number; Tmax: number; La: number }[] = []
  for (let i = 0; i < n; i++) {
    const h = Math.min(i * Sv + Sv / 2, H - 0.05)
    const z = H - h
    const sigmaV = fill.gamma * z + q
    const Tmax = Ka * sigmaV * Sv
    const La = h * Math.tan(rad(45 - fill.phi / 2))
    tmaxPorCamada.push({ h, z, sigmaV, Tmax, La })
  }
  const tultNecessario = Math.max(...tmaxPorCamada.map((c) => c.Tmax)) * rfTotal * FS_RUP_MIN
  const tultAdotado = p.tult > 0 ? p.tult : Math.max(10, Math.ceil(tultNecessario / 5) * 5)
  const tadm = tultAdotado / rfTotal
  const tcon = p.efConexao * tadm

  const tanR = Math.tan(rad(fill.phi))
  const camadas: CamadaMSE[] = tmaxPorCamada.map((c) => {
    const Le = Math.max(L - c.La, 0)
    const Tpo = 2 * p.ci * tanR * c.sigmaV * Le
    return {
      ...c,
      Le,
      Tpo,
      fsRup: tadm / Math.max(c.Tmax, 1e-9),
      fsArranc: Tpo / Math.max(c.Tmax, 1e-9),
      fsConexao: tcon / Math.max(c.Tmax, 1e-9),
    }
  })

  // externa: bloco reforçado (L × H) como muro de gravidade
  const P1 = 0.5 * Ka * fill.gamma * H * H
  const P2 = Ka * q * H
  const Pa = P1 + P2
  const V = fill.gamma * H * L + q * L
  const Mr = (V * L) / 2
  const Md = (P1 * H) / 3 + (P2 * H) / 2
  const e = Math.max(Md / V, 0)
  const Bef = Math.max(L - 2 * e, 0.01)
  const f = fundacaoEm(layers, -p.embutimento)
  const tanF = Math.tan(rad(f.phi))
  const resDesl = Math.min(V * tanR, V * tanF + f.c * L)
  const qult = qultFaixa(f.c, f.phi, f.gamma, Bef, f.gamma * p.embutimento)
  const qmax = V / Bef
  const externa: ExternaMSE = {
    Pa,
    V,
    Mr,
    Md,
    e,
    Bef,
    fsTomb: Md > 0 ? Mr / Md : Infinity,
    fsDesl: Pa > 0 ? resDesl / Pa : Infinity,
    qmax,
    qult,
    fsCap: qult / qmax,
    fundacao: f,
  }
  return { L, Sv, Ka, camadas, tultNecessario, tultAdotado, tadm, externa, rfTotal }
}

function avisosMSE(
  r: Omit<ResultadoMSE, 'avisos' | 'fs0' | 'fsGlobal' | 'circulo' | 'H' | 'q'>,
  p: ParamsMSE,
  H: number,
  fsGlobal: number,
  yMinCirculo: number
): AvisoMSE[] {
  const out: AvisoMSE[] = []
  const pior = (f: (c: CamadaMSE) => number) => Math.min(...r.camadas.map(f))
  if (pior((c) => c.fsRup) < FS_RUP_MIN - 1e-9) out.push({ nivel: 'erro', texto: `Ruptura do reforço: FS mínimo ${pior((c) => c.fsRup).toFixed(2)} (< ${FS_RUP_MIN}). Reduza o espaçamento ou use geossintético mais resistente (Tult ≥ ${r.tultNecessario.toFixed(0)} kN/m).` })
  if (pior((c) => c.fsArranc) < FS_ARRANC_MIN) out.push({ nivel: 'erro', texto: `Arrancamento: FS mínimo ${pior((c) => c.fsArranc).toFixed(2)} (< ${FS_ARRANC_MIN}). Aumente o comprimento L (hoje ${r.L.toFixed(1)} m).` })
  if (pior((c) => c.fsConexao) < 1) out.push({ nivel: 'erro', texto: `Conexão com a face: FS mínimo ${pior((c) => c.fsConexao).toFixed(2)} (< 1,0). Revise a conexão ou o espaçamento.` })
  const x = r.externa
  if (x.fsTomb < FS_TOMB_MIN) out.push({ nivel: 'erro', texto: `Tombamento: FS ${x.fsTomb.toFixed(2)} (< ${FS_TOMB_MIN}). Aumente L.` })
  if (x.e > r.L / 6) out.push({ nivel: 'aviso', texto: `Excentricidade ${x.e.toFixed(2)} m fora do terço central (L/6 = ${(r.L / 6).toFixed(2)} m).` })
  if (x.fsDesl < FS_DESL_MIN) out.push({ nivel: 'erro', texto: `Deslizamento na base: FS ${x.fsDesl.toFixed(2)} (< ${FS_DESL_MIN}). Aumente L, o embutimento ou melhore a fundação.` })
  if (x.fsCap < FS_CAP_MIN) out.push({ nivel: 'erro', texto: `Capacidade de carga da fundação (${x.fundacao.nome}): FS ${x.fsCap.toFixed(2)} (< ${FS_CAP_MIN}). Fundação insuficiente para o muro; considere melhoria do solo ou outra solução.` })
  if (x.fundacao.espessura != null && x.fundacao.espessura < x.Bef) out.push({ nivel: 'aviso', texto: `A camada de fundação (${x.fundacao.nome}) tem ${x.fundacao.espessura.toFixed(1)} m abaixo da base, menor que a largura efetiva (${x.Bef.toFixed(1)} m): a capacidade de carga depende também das camadas abaixo, que não foram combinadas.` })
  if (fsGlobal < p.fsAlvoGlobal) out.push({ nivel: 'erro', texto: `Estabilidade global: FS ${fsGlobal.toFixed(2)} (< ${p.fsAlvoGlobal}). ${yMinCirculo >= -0.1 ? 'O mecanismo crítico passa pelo próprio muro: aumente a resistência do geossintético (Tult), reduza o espaçamento ou aumente L.' : 'O mecanismo crítico passa sob a base do muro (fundação): o reforço não o intercepta; melhore a fundação ou aumente L/embutimento.'}` })
  if (H > 8) out.push({ nivel: 'aviso', texto: 'Muro acima de 8 m: confira o método (reforço extensível, empuxo e coesão do solo reforçado) com o projetista.' })
  out.push({ nivel: 'aviso', texto: 'Recalque (total e diferencial), drenagem do maciço, compactação junto à face, detalhe da face e conexão não foram verificados. Face vertical; solo reforçado = aterro da Nova Análise, sem coesão nos empuxos.' })
  return out
}

/** Reforços (força horizontal por camada) para o motor de estabilidade global. */
export function reforcosParaMotor(r: Pick<ResultadoMSE, 'camadas' | 'L' | 'tadm'>, p: ParamsMSE, fill: FillMaterial): ReinforcementLayer[] {
  return r.camadas.map((c) => ({
    y: c.h,
    x_start: 0,
    x_end: r.L,
    T: r.tadm,
    mu: p.ci * Math.tan(rad(fill.phi)),
    gamma_cover: fill.gamma,
  }))
}

/** Fluxo completo: interna + externa + global (sem e com reforço). */
export async function analisarMSE(
  geo: SlopeGeometry,
  layers: Layer[],
  fill: FillMaterial,
  coverage: FaceCoverage | undefined,
  p: ParamsMSE,
  onProgress?: (msg: string) => void
): Promise<ResultadoMSE> {
  const H = geo.total_height
  const q = geo.surcharge_q ?? 0
  const base = dimensionarMSE(H, q, fill, layers, p)
  // só superfícies globais (largura ≥ 1,5·H); as locais são a estabilidade interna e a capacidade de carga
  const g0 = { ...geometriaFaceVertical(geo), min_arc_width: 1.5 * H }

  onProgress?.('Estabilidade global sem reforço…')
  const r0 = await findCriticalCircle({ ...g0, reinforcement: undefined }, layers, fill, coverage, undefined, 40, 'bishop')
  onProgress?.('Estabilidade global com reforço…')
  const rf = await findCriticalCircle(
    { ...g0, reinforcement: reforcosParaMotor({ camadas: base.camadas, L: base.L, tadm: base.tadm }, p, fill) },
    layers,
    fill,
    coverage,
    undefined,
    40,
    'bishop'
  )
  const { rfTotal: _rf, ...semRf } = base
  void _rf
  return {
    H,
    q,
    ...semRf,
    fs0: r0.FS,
    fsGlobal: rf.FS,
    circulo: rf,
    avisos: avisosMSE(semRf, p, H, rf.FS, rf.y_min ?? 0),
  }
}
