import { buildProfile } from '../geometry'
import { findCriticalCircle } from '../search'
import type {
  AnalysisResult,
  FaceCoverage,
  FillMaterial,
  FillZone,
  ImprovementStrip,
  Layer,
  ReinforcementLayer,
  SlopeGeometry,
  StabilityMethod,
} from '../types'

// Pré-dimensionamento de uma faixa de colunas (CMC ou brita) sob o pé do
// aterro, com colchão de brita e geogrelha. Não é projeto executivo: o solo
// tratado entra como material composto (razão de área) no mesmo motor de
// fatias do talude, e a geogrelha entra como força horizontal na superfície
// de ruptura.

export type TipoColuna = 'brita' | 'gec' | 'rigida'

export const TIPOS_COLUNA: TipoColuna[] = ['brita', 'gec', 'rigida']
export const NOME_TIPO: Record<TipoColuna, string> = {
  brita: 'Brita simples',
  gec: 'Brita encamisada com geotêxtil (GEC)',
  rigida: 'Coluna rígida (CMC ou concreto)',
}
/** Concentração de tensões n padrão por tipo (HIPÓTESE). */
export const N_PADRAO: Record<TipoColuna, number> = { brita: 5, gec: 5, rigida: 20 }

export interface FaixaColunas {
  tipo: TipoColuna | 'cmc' // 'cmc' = valor de faixas salvas antes dos 3 tipos, tratado como 'rigida'
  xRef: number // m, posição x do pé de referência (0 = pé do talude; ou o pé de uma bancada superior)
  frente: number // m da borda da faixa até o pé de referência (positivo = à frente do pé)
  largura: number // m, largura total da faixa (na direção x)
  comprimento: number // m, do terreno até a ponta (inclui o embutimento no apoio)
  diametro: number // m
  malha: number // m, espaçamento entre colunas
  arranjo: 'quadrado' | 'triangular'
  gamma_col: number // kN/m³
  phi_col: number // graus (brita)
  n_stress: number // concentração de tensão coluna/solo (brita)
  tau_col: number // kPa, resistência ao cisalhamento da coluna rígida (vale só se tau_manual)
  tau_manual: boolean // false: τ_col = 0,1·fck·1000
  sigma_h0: number // kPa, tensão horizontal inicial no solo mole (HIPÓTESE)
  J: number // kN/m, rigidez da meia (GEC)
  eps_r: number // %, deformação radial admissível da meia (GEC)
  T_ult: number // kN/m, resistência última da meia (GEC)
  FS_fl: number // fator de redução para fluência (GEC)
  fck: number // MPa, coluna rígida
  eta: number // eficiência ao cisalhamento da coluna rígida
}

export interface ColchaoGeogrelha {
  espessura: number // m de brita
  T: number // kN/m, resistência de projeto
  alem_crista?: number // m de reforço além da crista, sob a plataforma (padrão 10)
  mu?: number
}

export const FAIXA_PADRAO: FaixaColunas = {
  tipo: 'brita',
  xRef: 0,
  frente: 3,
  largura: 10,
  comprimento: 15.5,
  diametro: 0.8,
  malha: 2.5,
  arranjo: 'quadrado',
  gamma_col: 19,
  phi_col: 40,
  n_stress: 5,
  tau_col: 1000,
  tau_manual: false,
  sigma_h0: 50,
  J: 2500,
  eps_r: 2,
  T_ult: 150,
  FS_fl: 2,
  fck: 10,
  eta: 0.5,
}

export function tipoEfetivo(f: Pick<FaixaColunas, 'tipo'>): TipoColuna {
  return f.tipo === 'cmc' ? 'rigida' : f.tipo
}

/** Completa uma faixa salva (versão antiga ou parcial) com os padrões atuais. */
export function normalizaFaixa(raw: Partial<FaixaColunas> | null | undefined): FaixaColunas {
  const f = { ...FAIXA_PADRAO, ...(raw ?? {}) }
  if (raw && raw.tipo === 'cmc') {
    // faixa salva antes dos 3 tipos: o τ editado então vale como manual
    f.tipo = 'rigida'
    f.tau_manual = raw.tau_manual ?? raw.tau_col != null
    f.n_stress = raw.n_stress ?? N_PADRAO.rigida
  }
  return f
}

/** τ_col da coluna rígida (kPa): 0,1·fck(MPa)·1000, a menos que editado. */
export function tauColuna(f: Pick<FaixaColunas, 'fck' | 'tau_col' | 'tau_manual'>): number {
  return f.tau_manual ? f.tau_col : 0.1 * f.fck * 1000
}

/** Razão de substituição m = A_coluna / A_célula (malha quadrada ou triangular). */
export function razaoAreas(f: Pick<FaixaColunas, 'diametro' | 'malha' | 'arranjo'>): number {
  const aCol = (Math.PI * f.diametro * f.diametro) / 4
  const aCel = f.arranjo === 'triangular' ? (Math.sqrt(3) / 2) * f.malha * f.malha : f.malha * f.malha
  return Math.min(aCol / aCel, 1)
}

export function faixaParaMelhoria(f: FaixaColunas): ImprovementStrip {
  return {
    x_start: f.xRef - f.frente,
    x_end: f.xRef - f.frente + f.largura,
    y_top: 0,
    y_base: -f.comprimento,
    kind: tipoEfetivo(f) === 'rigida' ? 'cmc' : 'brita',
    area_ratio: razaoAreas(f),
    gamma_col: f.gamma_col,
    phi_col: f.phi_col,
    n_stress: f.n_stress,
    tau_col: f.eta * tauColuna(f), // contribuição efetiva: η·τ_col
  }
}

export function colchaoParaReforco(c: ColchaoGeogrelha, f: FaixaColunas, geo: SlopeGeometry): ReinforcementLayer {
  const profile = buildProfile(geo, 'aterro')
  const xCrest = profile[profile.length - 2].x
  return {
    y: Math.min(c.espessura * 0.25, 0.3),
    x_start: f.xRef - f.frente,
    x_end: xCrest + (c.alem_crista ?? 10),
    T: c.T,
    mu: c.mu ?? 0.6,
    gamma_cover: 19,
  }
}

export interface ResultadoFaixa {
  FS: number
  result: AnalysisResult
  m: number
}

export interface Alerta {
  nivel: 'aviso' | 'erro'
  texto: string
}

/** FS crítico do aterro com a faixa e o colchão (ou sem, se f = null). */
export async function fsComFaixa(
  geo: SlopeGeometry,
  layers: Layer[],
  fill: FillMaterial,
  coverage: FaceCoverage | undefined,
  fillZones: FillZone[] | undefined,
  f: FaixaColunas | null,
  colchao: ColchaoGeogrelha | null,
  method: StabilityMethod = 'bishop',
  nSlices = 40
): Promise<ResultadoFaixa> {
  const g: SlopeGeometry = { ...geo, improvement: undefined, reinforcement: undefined }
  if (f) g.improvement = [faixaParaMelhoria(f)]
  if (f && colchao && colchao.T > 0) g.reinforcement = [colchaoParaReforco(colchao, f, geo)]
  const result = await findCriticalCircle(g, layers, fill, coverage, fillZones, nSlices, method)
  return { FS: result.FS, result, m: f ? razaoAreas(f) : 0 }
}

/** Avisos de pré-dimensionamento que não dependem do cálculo do FS. */
export function alertasFaixa(layers: Layer[], f: FaixaColunas): Alerta[] {
  const out: Alerta[] = []
  const m = razaoAreas(f)
  const profundidadeBase = Math.max(0, ...layers.filter((l) => (l.phi ?? 0) === 0).map((l) => -(l.y_base ?? 0)))
  const moles = layers.filter((l) => (l.phi ?? 0) === 0 && (l.y_top ?? 0) > -f.comprimento)
  const suMin = moles.length ? Math.min(...moles.map((l) => l.c)) : null

  if (m < 0.05) {
    out.push({ nivel: 'aviso', texto: `Razão de substituição baixa (m = ${(m * 100).toFixed(1)}%): o ganho de resistência tende a ser pequeno.` })
  }
  if (m > 0.35) {
    out.push({ nivel: 'aviso', texto: `Razão de substituição alta (m = ${(m * 100).toFixed(1)}%): confira se a malha é executável.` })
  }
  if (f.comprimento < profundidadeBase + 0.5) {
    out.push({
      nivel: 'aviso',
      texto: `A ponta das colunas (${f.comprimento.toFixed(1)} m) não embute 0,5 m abaixo da base da camada mole (${profundidadeBase.toFixed(1)} m). Sem apoio na camada resistente, o recalque e a estabilidade não são os calculados.`,
    })
  }
  if (f.tipo === 'brita' && suMin != null && suMin < 15) {
    out.push({
      nivel: 'aviso',
      texto: `su mínimo da argila na faixa = ${suMin.toFixed(0)} kPa. Colunas de brita em argila muito mole (a literatura costuma apontar eficiência baixa abaixo de ~15 kPa) têm pouco confinamento lateral e podem não desenvolver a resistência assumida. Argila muito mole para brita sem confinamento: considere brita encamisada ou coluna rígida.`,
    })
  }
  if (tipoEfetivo(f) === 'rigida') {
    out.push({
      nivel: 'aviso',
      texto: `Resistência ao cisalhamento da coluna adotada: τ_col = ${tauColuna(f).toFixed(0)} kPa, com eficiência η = ${f.eta}. Flexão e cisalhamento do fuste (estrutural) não foram verificados; dependem do ensaio de resistência do material e da distribuição de esforços.`,
    })
  }
  out.push({
    nivel: 'aviso',
    texto: 'Recalque total e diferencial NÃO foram calculados, nem a transferência de carga (arqueamento). Verifique antes de adotar a solução.',
  })
  return out
}

export interface LinhaVarredura {
  largura: number
  malha: number
  m: number
  FS: number
  atende: boolean
}

/** FS para combinações de largura da faixa × malha. */
export async function varrerFaixa(
  geo: SlopeGeometry,
  layers: Layer[],
  fill: FillMaterial,
  coverage: FaceCoverage | undefined,
  base: FaixaColunas,
  colchao: ColchaoGeogrelha | null,
  larguras: number[],
  malhas: number[],
  fsAlvo = 1.5,
  onProgress?: (feitos: number, total: number) => void
): Promise<LinhaVarredura[]> {
  const out: LinhaVarredura[] = []
  const total = larguras.length * malhas.length
  let feitos = 0
  for (const largura of larguras) {
    for (const malha of malhas) {
      const f = { ...base, largura, malha }
      const r = await fsComFaixa(geo, layers, fill, coverage, undefined, f, colchao)
      out.push({ largura, malha, m: r.m, FS: r.FS, atende: r.FS >= fsAlvo })
      onProgress?.(++feitos, total)
    }
  }
  return out
}

/** x dos pés do talude: o pé inferior e o pé de cada bancada acima (fim de cada berma). */
export function pesDoTalude(geo: SlopeGeometry): number[] {
  const prof = buildProfile(geo, 'aterro')
  const xs: number[] = []
  for (let i = 1; i < prof.length; i++) {
    if (prof[i].y > prof[i - 1].y + 1e-9 && prof[i - 1].x >= -1e-9) xs.push(prof[i - 1].x)
  }
  return xs.length ? xs : [0]
}

/** A superfície crítica passa pela faixa? (sobreposição em x entre o arco e a faixa) */
export function circuloAtravessaFaixa(r: AnalysisResult, f: FaixaColunas): boolean {
  const x0 = f.xRef - f.frente
  const x1 = x0 + f.largura
  return r.x_right > x0 && r.x_left < x1
}

// ---------------------------------------------------------------------------
// Verificação da coluna (fórmulas fechadas, argila não drenada: φ = 0, c = su)
// ---------------------------------------------------------------------------

export interface VerificacaoColuna {
  tipo: TipoColuna
  a: number // razão de substituição
  muC: number // fração da tensão na coluna (σ_col = μc·σv)
  muS: number // fração da tensão no solo
  cComp: number // kPa, coesão equivalente da faixa (brita/GEC)
  phiComp: number // graus, atrito equivalente da faixa (brita/GEC)
  tauCol: number // kPa, τ_col da coluna rígida
  sigmaCol: number // kPa, tensão na coluna
  sigmaRLim?: number // kPa, tensão radial limite (brita/GEC)
  deltaSigmaR?: number // kPa, confinamento da meia (GEC)
  kp?: number
  qUlt: number // kPa: q_ult (brita/GEC) ou fck/1,4 (rígida)
  fsColuna: number
  tracaoMeia?: number // kN/m (GEC)
  tracaoAdm?: number // kN/m, T_ult/FS_fl (GEC)
  razaoTracao?: number // T / (T_ult/FS_fl) (GEC): ≤ 1 atende
  deltaTau: number // kPa, ganho de resistência ao cisalhamento por unidade de área (a σv dado)
  reducaoRecalque: number // fração (0 a 1): 1 − μs
}

/** Δτ na superfície de ruptura: a·μc·σv·tanφc − a·su (brita/GEC) ou a·η·τ_col − a·su (rígida). */
export function deltaTau(f: FaixaColunas, su: number, sigmaV: number): number {
  const a = razaoAreas(f)
  if (tipoEfetivo(f) === 'rigida') return a * f.eta * tauColuna(f) - a * su
  const n = Math.max(f.n_stress, 1)
  const muC = n / (1 + (n - 1) * a)
  return a * muC * sigmaV * Math.tan((f.phi_col * Math.PI) / 180) - a * su
}

/**
 * Verificações da coluna e parâmetros equivalentes. su: resistência não drenada
 * da argila mole (kPa); sigmaV: tensão vertical de topo γ·H + q (kPa).
 */
export function verificarColuna(f: FaixaColunas, su: number, sigmaV: number): VerificacaoColuna {
  const tipo = tipoEfetivo(f)
  const a = razaoAreas(f)
  const n = Math.max(f.n_stress, 1)
  const muC = n / (1 + (n - 1) * a)
  const muS = 1 / (1 + (n - 1) * a)
  const sigmaCol = muC * sigmaV
  const base = {
    tipo,
    a,
    muC,
    muS,
    cComp: (1 - a) * su,
    tauCol: tauColuna(f),
    sigmaCol,
    deltaTau: deltaTau(f, su, sigmaV),
    reducaoRecalque: 1 - muS,
  }
  if (tipo === 'rigida') {
    const adm = (f.fck * 1000) / 1.4
    return { ...base, phiComp: 0, qUlt: adm, fsColuna: adm / sigmaCol }
  }
  const phiC = (f.phi_col * Math.PI) / 180
  const phiComp = (Math.atan(a * muC * Math.tan(phiC)) * 180) / Math.PI
  const kp = Math.tan(Math.PI / 4 + phiC / 2) ** 2
  const r = f.diametro / 2
  const dSr = tipo === 'gec' ? (f.J * (f.eps_r / 100)) / r : 0
  const sigmaRLim = f.sigma_h0 + 4 * su + dSr
  const qUlt = kp * sigmaRLim
  const out: VerificacaoColuna = { ...base, phiComp, sigmaRLim, kp, qUlt, fsColuna: qUlt / sigmaCol }
  if (tipo === 'gec') {
    out.deltaSigmaR = dSr
    out.tracaoMeia = dSr * r
    out.tracaoAdm = f.T_ult / f.FS_fl
    out.razaoTracao = out.tracaoMeia / out.tracaoAdm
  }
  return out
}

/** Faixa com outro tipo, mantendo a geometria; n volta ao padrão do novo tipo. */
export function comTipo(f: FaixaColunas, tipo: TipoColuna): FaixaColunas {
  return tipoEfetivo(f) === tipo ? { ...f, tipo } : { ...f, tipo, n_stress: N_PADRAO[tipo] }
}

/** Alertas de FS da coluna, confinamento da meia e transferência de carga. */
export function alertasColuna(v: VerificacaoColuna, su: number, temGeogrelha: boolean): Alerta[] {
  const out: Alerta[] = []
  if (v.fsColuna < 1.5) {
    out.push({
      nivel: 'erro',
      texto:
        v.tipo === 'rigida'
          ? `FS da coluna = ${v.fsColuna.toFixed(2)} (< 1,5): tensão na coluna acima do admissível. Aumente fck ou o diâmetro, ou feche a malha.`
          : `FS da coluna = ${v.fsColuna.toFixed(2)} (< 1,5): risco alto de estufamento. Troque o tipo: ${v.tipo === 'brita' ? 'brita encamisada (GEC) ou coluna rígida' : 'coluna rígida'}.`,
    })
  } else if (v.fsColuna < 2) {
    out.push({ nivel: 'aviso', texto: `FS da coluna = ${v.fsColuna.toFixed(2)} (< 2,0): risco de ${v.tipo === 'rigida' ? 'sobretensão na coluna' : 'estufamento'}.` })
  }
  if (v.tipo === 'brita' && su < 15) {
    out.push({ nivel: 'aviso', texto: `su = ${su.toFixed(0)} kPa (< 15): argila muito mole para brita sem confinamento.` })
  }
  if (v.tipo === 'gec' && v.razaoTracao != null && v.razaoTracao > 1) {
    out.push({
      nivel: 'erro',
      texto: `Tração na meia (${v.tracaoMeia!.toFixed(1)} kN/m) acima de T_ult/FS_fl (${v.tracaoAdm!.toFixed(1)} kN/m): razão ${v.razaoTracao.toFixed(2)}. Use meia mais resistente ou reduza J·εr.`,
    })
  }
  if (v.tipo === 'rigida') {
    out.push({
      nivel: 'aviso',
      texto: 'Coluna rígida sem armadura rompe de forma frágil; a contribuição ao cisalhamento é limitada pela eficiência η. Confirmar com projeto de fundação.',
    })
    if (!temGeogrelha) {
      out.push({
        nivel: 'erro',
        texto: 'Coluna rígida exige colchão de transferência de carga com geogrelha: defina T > 0 no colchão.',
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// ΔFS por fórmula rápida (conferência do Bishop)
// ---------------------------------------------------------------------------

export interface GanhoRapido {
  lFaixa: number // m, comprimento do arco que cruza a faixa
  sigmaVPlano: number // kPa, σv médio no plano de ruptura dentro da faixa
  deltaTau: number // kPa
  R: number // m
  Md: number // kN·m/m, momento motor do círculo crítico sem faixa
  deltaFS: number
}

/** Momento motor R·ΣW·senα de um resultado do motor de fatias. */
export function momentoMotor(r: AnalysisResult): number {
  return r.circle.R * r.slices.reduce((acc, s) => acc + s.w_sin_alpha, 0)
}

/** ΔFS ≈ Δτ·L_faixa·R / M_d. */
export function deltaFsFormula(deltaTauKpa: number, lFaixa: number, R: number, Md: number): number {
  return (deltaTauKpa * lFaixa * R) / Md
}

/**
 * ΔFS rápido com o círculo crítico SEM faixa. σv no plano = σv de topo +
 * γ_argila·profundidade média do arco dentro da faixa.
 */
export function ganhoRapido(
  semFaixa: AnalysisResult,
  f: FaixaColunas,
  su: number,
  sigmaVTopo: number,
  gammaArgila: number
): GanhoRapido | null {
  const { xc, yc, R } = semFaixa.circle
  const x0 = Math.max(f.xRef - f.frente, semFaixa.x_left)
  const x1 = Math.min(f.xRef - f.frente + f.largura, semFaixa.x_right)
  if (x1 <= x0) return null
  const N = 400
  const dx = (x1 - x0) / N
  let L = 0
  let somaProf = 0
  for (let i = 0; i < N; i++) {
    const t = (x0 + dx * (i + 0.5) - xc) / R
    if (Math.abs(t) >= 1) continue
    const y = yc - R * Math.sqrt(1 - t * t)
    if (y > 0 || y < -f.comprimento) continue // fora da faixa em profundidade
    const dl = dx / Math.sqrt(1 - t * t)
    L += dl
    somaProf += -y * dl
  }
  if (L <= 0) return null
  const sigmaVPlano = sigmaVTopo + gammaArgila * (somaProf / L)
  const dt = deltaTau(f, su, sigmaVPlano)
  const Md = momentoMotor(semFaixa)
  return { lFaixa: L, sigmaVPlano, deltaTau: dt, R, Md, deltaFS: deltaFsFormula(dt, L, R, Md) }
}

export interface ContextoColuna {
  su: number // kPa, menor su (φ = 0) das camadas atravessadas pelas colunas (LIDO)
  gammaArgila: number // kN/m³, peso da argila (LIDO)
  sigmaV: number // kPa, γ·H + q do aterro (CALCULADO)
}

/** su, γ da argila e σv de topo a partir das camadas e do aterro da Nova Análise. */
export function contextoColuna(geo: SlopeGeometry, layers: Layer[], fill: FillMaterial, f: Pick<FaixaColunas, 'comprimento'>): ContextoColuna {
  const moles = layers.filter((l) => (l.phi ?? 0) === 0)
  const nasColunas = moles.filter((l) => (l.y_top ?? 0) > -f.comprimento)
  const ref = nasColunas.length ? nasColunas : moles
  const su = ref.length ? Math.min(...ref.map((l) => l.c)) : 0
  const gammaArgila = ref.length ? ref[0].gamma : 15
  return { su, gammaArgila, sigmaV: fill.gamma * geo.total_height + (geo.surcharge_q ?? 0) }
}
