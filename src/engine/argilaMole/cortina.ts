import { findCriticalCircle } from '../search'
import type { AnalysisResult, FaceCoverage, FillMaterial, Layer, SlopeGeometry, StabilityMethod } from '../types'

// Pré-dimensionamento de uma cortina de estacas na face vertical do aterro,
// atirantada a uma estaca de reação, com ficha na camada resistente.
//
// Duas parcelas de carga na cortina, somadas (simplificação conservadora):
//   1) empuxo do aterro e da sobrecarga contidos pela face (K·γ·H²/2 + K·q·H);
//   2) força T (kN/m) que a cortina precisa entregar na superfície de ruptura
//      para o talude global atingir o FS alvo (achada por bisseção no FS).
// Cada estaca é uma viga apoiada no tirante (topo) e engastada na areia,
// com a carga concentrada na cota onde a ruptura cruza a cortina.
// Não é projeto executivo: o fluxo do solo mole entre as estacas, a
// interação solo-estaca (p-y), o recalque e o dimensionamento estrutural
// detalhado não são verificados.

export interface ParamsCortina {
  x: number // m, posição da cortina (face do aterro)
  diametro: number // m, estaca
  espacamento: number // m, c/c
  cotaTirante: number // m, nível do tirante (topo da viga)
  ficha: number // m, embutimento na camada resistente
  distReacao: number // m, entre a cortina e a estaca de reação
  diametroReacao: number // m
  comprimentoReacao: number // m, a partir do terreno
  empuxo: 'k0' | 'ka'
  phiAreia: number // °
  gammaAreia: number // kN/m³
  fyk: number // MPa (aço do tirante e das barras)
  fsAlvo: number
}

export const CORTINA_PADRAO: ParamsCortina = {
  x: 0,
  diametro: 0.8,
  espacamento: 1.0,
  cotaTirante: 2.7,
  ficha: 3,
  distReacao: 18,
  diametroReacao: 0.8,
  comprimentoReacao: 19.8,
  empuxo: 'k0',
  phiAreia: 35,
  gammaAreia: 19,
  fyk: 500,
  fsAlvo: 1.5,
}

const GAMMA_F = 1.4
const GAMMA_S = 1.15
const GAMMA_W = 9.81

/** Geometria com a face do aterro vertical (cortina), sem bermas. */
export function geometriaFaceVertical(geo: SlopeGeometry): SlopeGeometry {
  return { ...geo, bench_height: geo.total_height, slope_ratio: 0.02, berm_width: 0 }
}

export interface ResultadoForca {
  fs0: number // sem cortina
  T: number // kN/m necessário (0 se já atende)
  fsFinal: number
  atingiu: boolean // false = nem com o T máximo testado
  circulo: AnalysisResult
  yCruz: number | null // cota onde a ruptura crítica cruza a cortina
  historico: { T: number; FS: number }[]
}

const T_MAX = 3000

/** Menor T (kN/m) que leva o FS crítico ao alvo, por bisseção. */
export async function forcaNecessaria(
  geo: SlopeGeometry,
  layers: Layer[],
  fill: FillMaterial,
  coverage: FaceCoverage | undefined,
  p: ParamsCortina,
  yTip: number,
  method: StabilityMethod = 'bishop',
  onProgress?: (msg: string) => void
): Promise<ResultadoForca> {
  const g0 = geometriaFaceVertical(geo)
  const historico: { T: number; FS: number }[] = []
  const rodar = async (T: number) => {
    const g: SlopeGeometry = {
      ...g0,
      // sempre presente (mesmo com T = 0): a cortina contém a face do aterro
      curtains: [{ x: p.x, T, y_top: g0.total_height, y_tip: yTip }],
    }
    onProgress?.(`FS com T = ${T.toFixed(0)} kN/m…`)
    const r = await findCriticalCircle(g, layers, fill, coverage, undefined, 40, method)
    historico.push({ T, FS: r.FS })
    return r
  }

  const r0 = await rodar(0)
  const yCruzDe = (r: AnalysisResult): number | null => {
    const { xc, yc, R } = r.circle
    const inside = R * R - (p.x - xc) ** 2
    return inside > 0 && p.x >= r.x_left && p.x <= r.x_right ? yc - Math.sqrt(inside) : null
  }
  if (r0.FS >= p.fsAlvo) {
    return { fs0: r0.FS, T: 0, fsFinal: r0.FS, atingiu: true, circulo: r0, yCruz: yCruzDe(r0), historico }
  }

  let lo = 0
  let hi = 100
  let rHi = await rodar(hi)
  while (rHi.FS < p.fsAlvo && hi < T_MAX) {
    lo = hi
    hi = Math.min(hi * 2, T_MAX)
    rHi = await rodar(hi)
  }
  if (rHi.FS < p.fsAlvo) {
    return { fs0: r0.FS, T: hi, fsFinal: rHi.FS, atingiu: false, circulo: rHi, yCruz: yCruzDe(rHi), historico }
  }
  for (let i = 0; i < 7 && hi - lo > Math.max(5, 0.03 * hi); i++) {
    const mid = (lo + hi) / 2
    const r = await rodar(mid)
    if (r.FS >= p.fsAlvo) {
      hi = mid
      rHi = r
    } else lo = mid
  }
  return { fs0: r0.FS, T: hi, fsFinal: rHi.FS, atingiu: true, circulo: rHi, yCruz: yCruzDe(rHi), historico }
}

export interface Esforcos {
  // cargas por estaca
  cargas: { nome: string; valor: number; cota: number }[] // kN, cota (m)
  Ptotal: number
  // viga apoiada no tirante e engastada na areia
  comprimentoViga: number
  cotaEngaste: number
  Ftirante: number // kN por estaca (reação no tirante)
  Mmax: number // kN·m por estaca
  Vengaste: number // kN
  // estaca
  AsNec: number // cm²
  taxaAco: number // fração da seção
  // tirante
  AtirNec: number // cm²
  // ficha
  Hu: number // kN (Broms, areia)
  fsFicha: number
  // estaca de reação
  cotaPontaReacao: number
  cotaRupturaReacao: number | null
  HuReacao: number
  fsReacao: number
  ancorada: boolean
  fichaNecessaria: number | null // m, para FS da ficha ≥ 2 (null = acima de 25 m)
}

const kp = (phi: number) => Math.tan(((45 + phi / 2) * Math.PI) / 180) ** 2

/** Viga apoiada em A (topo, tirante) e engastada em B; carga P a distância a de A. */
function propped(P: number, a: number, L: number) {
  const aa = Math.min(Math.max(a, 0), L)
  const b = L - aa
  const RA = (P * b * b * (3 * L - b)) / (2 * L ** 3)
  const MB = (P * aa * b * (L + b)) / (2 * L * L)
  return { RA, MB, MspanSag: RA * aa }
}

export function dimensionarCortina(
  H: number, // altura do aterro contido (m)
  q: number, // kPa
  fill: FillMaterial,
  layers: Layer[],
  p: ParamsCortina,
  T: number, // kN/m vindo da estabilidade global
  yCruz: number | null,
  yRupturaReacao: number | null,
  buscarFicha = true
): Esforcos {
  const baseArgila = Math.min(...layers.filter((l) => (l.phi ?? 0) === 0).map((l) => l.y_base ?? 0), 0)
  const K = p.empuxo === 'k0' ? 1 - Math.sin((fill.phi * Math.PI) / 180) : Math.tan(((45 - fill.phi / 2) * Math.PI) / 180) ** 2
  const s = p.espacamento

  // engaste equivalente: 2 diâmetros abaixo do topo da areia, no máximo a ficha
  const zEng = Math.min(2 * p.diametro, p.ficha)
  const cotaEngaste = baseArgila - zEng
  const L = p.cotaTirante - cotaEngaste

  const cargas: Esforcos['cargas'] = []
  const P1 = ((K * fill.gamma * H * H) / 2) * s
  const P2 = K * q * H * s
  if (P1 > 0) cargas.push({ nome: 'Empuxo do aterro', valor: P1, cota: H / 3 })
  if (P2 > 0) cargas.push({ nome: 'Empuxo da sobrecarga', valor: P2, cota: H / 2 })
  if (T > 0) cargas.push({ nome: 'Força da estabilidade global (T)', valor: T * s, cota: yCruz ?? baseArgila / 2 })

  let RA = 0
  let MB = 0
  let Mmax = 0
  let Ptotal = 0
  for (const c of cargas) {
    const r = propped(c.valor, p.cotaTirante - c.cota, L)
    RA += r.RA
    MB += r.MB
    Ptotal += c.valor
  }
  // momento positivo máximo no vão: avalia ao longo da viga
  const n = 200
  for (let i = 0; i <= n; i++) {
    const x = (L * i) / n // a partir do tirante, para baixo
    let M = RA * x
    for (const c of cargas) {
      const a = p.cotaTirante - c.cota
      if (x > a) M -= c.valor * (x - a)
    }
    Mmax = Math.max(Mmax, Math.abs(M))
  }
  Mmax = Math.max(Mmax, MB)
  const Vengaste = Math.max(Ptotal - RA, 0)

  // estaca de concreto: As ≈ Md / (fyd · 0,6 D) (braço de alavanca aproximado)
  const fyd = (p.fyk * 1000) / GAMMA_S // kPa
  const Md = GAMMA_F * Mmax
  const As = Md / (fyd * 0.6 * p.diametro) // m²
  const area = (Math.PI * p.diametro ** 2) / 4
  const AtirNec = ((GAMMA_F * RA) / fyd) * 1e4

  // ficha (Broms, areia, estaca curta): Hu = 0,5 γ' D L³ Kp / (e + L)
  const gl = p.gammaAreia - GAMMA_W
  const Kp = kp(p.phiAreia)
  const e = Vengaste > 1e-6 ? MB / Vengaste : 1e6
  const Lf = Math.max(p.ficha - zEng, 0.1)
  const Hu = (0.5 * gl * p.diametro * Lf ** 3 * Kp) / (e + Lf)
  const fsFicha = Vengaste > 1e-6 ? Hu / Vengaste : Infinity

  // estaca de reação: areia abaixo da base da argila + argila abaixo da ruptura
  const cotaPontaR = -p.comprimentoReacao
  const embSolo = Math.max(baseArgila - cotaPontaR, 0)
  const HuSand = 1.5 * Kp * gl * p.diametroReacao * embSolo ** 2
  const suMin = Math.min(...layers.filter((l) => (l.phi ?? 0) === 0).map((l) => l.c), Infinity)
  const lArgilaAbaixo =
    yRupturaReacao != null ? Math.max(yRupturaReacao - baseArgila - 1.5 * p.diametroReacao, 0) : 0
  const HuClay = Number.isFinite(suMin) ? 9 * suMin * p.diametroReacao * lArgilaAbaixo : 0
  const HuReacao = HuSand + HuClay
  const fsReacao = RA > 1e-6 ? HuReacao / RA : Infinity

  return {
    cargas,
    Ptotal,
    comprimentoViga: L,
    cotaEngaste,
    Ftirante: RA,
    Mmax,
    Vengaste,
    AsNec: As * 1e4,
    taxaAco: As / area,
    AtirNec,
    Hu,
    fsFicha,
    cotaPontaReacao: cotaPontaR,
    cotaRupturaReacao: yRupturaReacao,
    HuReacao,
    fsReacao,
    ancorada: yRupturaReacao == null ? true : cotaPontaR < yRupturaReacao - 1,
    fichaNecessaria: buscarFicha ? fichaMinima(H, q, fill, layers, p, T, yCruz, yRupturaReacao) : null,
  }
}

/** Menor ficha (passo 0,25 m, até 25 m) com FS da ficha ≥ 2, mantendo o resto igual. */
function fichaMinima(
  H: number,
  q: number,
  fill: FillMaterial,
  layers: Layer[],
  p: ParamsCortina,
  T: number,
  yCruz: number | null,
  yRupturaReacao: number | null
): number | null {
  for (let f = 1; f <= 25; f += 0.25) {
    const e = dimensionarCortina(H, q, fill, layers, { ...p, ficha: f }, T, yCruz, yRupturaReacao, false)
    if (e.fsFicha >= 2) return f
  }
  return null
}

export interface AvisoCortina {
  nivel: 'aviso' | 'erro'
  texto: string
}

export function avisosCortina(e: Esforcos, p: ParamsCortina, f: ResultadoForca): AvisoCortina[] {
  const out: AvisoCortina[] = []
  if (!f.atingiu) {
    out.push({
      nivel: 'erro',
      texto: `Mesmo com T = ${f.T.toFixed(0)} kN/m a cortina não leva o FS ao alvo (${f.fsFinal.toFixed(2)}): há um mecanismo que a cortina não intercepta (por exemplo, passando abaixo da ponta ou à frente dela).`,
    })
  }
  if (e.taxaAco > 0.04) {
    out.push({
      nivel: 'erro',
      texto: `Taxa de armadura estimada de ${(e.taxaAco * 100).toFixed(1)}% (> 4%) na estaca de Ø ${p.diametro.toFixed(2)} m com c/c ${p.espacamento.toFixed(2)} m: a seção não comporta o momento. Aumente o diâmetro ou reduza o espaçamento, ou rever a solução.`,
    })
  } else if (e.taxaAco > 0.02) {
    out.push({ nivel: 'aviso', texto: `Taxa de armadura estimada de ${(e.taxaAco * 100).toFixed(1)}%: alta; verifique com o estrutural.` })
  }
  if (e.fsFicha < 2) {
    out.push({
      nivel: 'erro',
      texto: `Ficha de ${p.ficha.toFixed(1)} m insuficiente: resistência passiva na areia / esforço no engaste = ${Number.isFinite(e.fsFicha) ? e.fsFicha.toFixed(2) : '∞'} (mínimo 2,0). Aumente a ficha${e.fichaNecessaria != null ? ` (≈ ${e.fichaNecessaria.toFixed(1)} m com este esforço)` : ' (mais de 25 m: solução inviável nessa configuração)'}.`,
    })
  }
  if (!e.ancorada) {
    out.push({
      nivel: 'erro',
      texto: `A ponta da estaca de reação (${e.cotaPontaReacao.toFixed(1)} m) fica acima da superfície de ruptura nessa posição (${e.cotaRupturaReacao?.toFixed(1)} m): o tirante não está ancorado em solo estável.`,
    })
  }
  if (e.fsReacao < 1.5) {
    out.push({
      nivel: 'erro',
      texto: `Estaca de reação: resistência lateral / força do tirante = ${Number.isFinite(e.fsReacao) ? e.fsReacao.toFixed(2) : '∞'} (mínimo 1,5). Aumente a profundidade, o diâmetro ou o afastamento.`,
    })
  }
  out.push({
    nivel: 'aviso',
    texto:
      'Pré-dimensionamento: engaste equivalente, cargas concentradas e soma das parcelas de empuxo e de T (conservador). Não verifica o fluxo do solo mole entre as estacas, interação p-y, recalque, cisalhamento do fuste nem a estabilidade da estaca de reação em grupo.',
  })
  return out
}

/** Cota do arco inferior do círculo em x (null se o círculo não chega ali). */
export function cotaRupturaEm(c: { xc: number; yc: number; R: number }, x: number): number | null {
  const inside = c.R * c.R - (x - c.xc) ** 2
  return inside > 0 ? c.yc - Math.sqrt(inside) : null
}

export interface AnaliseCortina {
  forca: ResultadoForca
  esforcos: Esforcos
  avisos: AvisoCortina[]
  yPonta: number
}

/** Fluxo completo: T necessário (estabilidade global) → esforços → avisos. */
export async function analisarCortina(
  geo: SlopeGeometry,
  layers: Layer[],
  fill: FillMaterial,
  coverage: FaceCoverage | undefined,
  p: ParamsCortina,
  onProgress?: (msg: string) => void
): Promise<AnaliseCortina> {
  const baseArgila = Math.min(...layers.filter((l) => (l.phi ?? 0) === 0).map((l) => l.y_base ?? 0), 0)
  const yPonta = baseArgila - p.ficha
  const forca = await forcaNecessaria(geo, layers, fill, coverage, p, yPonta, 'bishop', onProgress)
  const yReacao = cotaRupturaEm(forca.circulo.circle, p.x + p.distReacao)
  const esforcos = dimensionarCortina(
    geo.total_height,
    geo.surcharge_q ?? 0,
    fill,
    layers,
    p,
    forca.T,
    forca.yCruz,
    yReacao
  )
  return { forca, esforcos, avisos: avisosCortina(esforcos, p, forca), yPonta }
}
