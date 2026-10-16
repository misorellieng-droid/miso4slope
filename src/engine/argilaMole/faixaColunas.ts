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

export interface FaixaColunas {
  tipo: 'brita' | 'cmc'
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
  tau_col: number // kPa, resistência ao cisalhamento mobilizável (CMC)
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
  phi_col: 38,
  n_stress: 3,
  tau_col: 150,
}

/** Razão de substituição m = A_coluna / A_célula (malha quadrada ou triangular). */
export function razaoAreas(f: Pick<FaixaColunas, 'diametro' | 'malha' | 'arranjo'>): number {
  const aCol = (Math.PI * f.diametro * f.diametro) / 4
  const aCel = f.arranjo === 'triangular' ? 0.866 * f.malha * f.malha : f.malha * f.malha
  return Math.min(aCol / aCel, 1)
}

export function faixaParaMelhoria(f: FaixaColunas): ImprovementStrip {
  return {
    x_start: f.xRef - f.frente,
    x_end: f.xRef - f.frente + f.largura,
    y_top: 0,
    y_base: -f.comprimento,
    kind: f.tipo,
    area_ratio: razaoAreas(f),
    gamma_col: f.gamma_col,
    phi_col: f.phi_col,
    n_stress: f.n_stress,
    tau_col: f.tau_col,
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
      texto: `su mínimo da argila na faixa = ${suMin.toFixed(0)} kPa. Colunas de brita em argila muito mole (a literatura costuma apontar eficiência baixa abaixo de ~15 kPa) têm pouco confinamento lateral e podem não desenvolver a resistência assumida. Confirme e considere CMC.`,
    })
  }
  if (f.tipo === 'cmc') {
    out.push({
      nivel: 'aviso',
      texto: `Resistência ao cisalhamento da coluna adotada: ${f.tau_col.toFixed(0)} kPa. Flexão e cisalhamento do fuste (estrutural) não foram verificados; dependem do ensaio de resistência do CMC e da distribuição de esforços.`,
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
