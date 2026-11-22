// Comportamento por camada: 'nao_drenado' usa su (c) com φ digitado (normalmente 0)
// e não gera poropressão; 'drenado' usa c', φ' e poropressão (N.A. ou ru).
// A condição global (geometry.analysis_condition) só define o padrão das camadas
// novas e o valor assumido por camadas antigas, sem o campo.
import type { AnalysisCondition, Layer, SlopeGeometry } from './types'

export type Comportamento = 'nao_drenado' | 'drenado'

export const NOME_CONDICAO: Record<AnalysisCondition | 'mixed', string> = {
  drained: "Drenada (longo prazo, c', φ' e poropressão)",
  undrained: 'Não drenada (fim de construção, c = su, φ = 0)',
  mixed: 'Mista (por camada)',
}

/** Padrão de uma camada nova: no longo prazo tudo drenado; no fim de construção só argila (φ = 0, coesiva) é não drenada. */
export function comportamentoPadrao(
  condicao: AnalysisCondition | undefined,
  camada: Pick<Layer, 'phi' | 'soil_class'>
): Comportamento {
  if (condicao !== 'undrained') return 'drenado'
  return camada.soil_class === 'granular' || camada.phi > 0 ? 'drenado' : 'nao_drenado'
}

/** Comportamento efetivo; camada sem o campo (formato antigo) herda a condição global. */
export function comportamentoDe(camada: Layer, condicao: AnalysisCondition | undefined): Comportamento {
  return camada.comportamento ?? (condicao === 'undrained' ? 'nao_drenado' : 'drenado')
}

export function condicaoResultante(layers: Layer[], condicao: AnalysisCondition | undefined): AnalysisCondition | 'mixed' {
  if (layers.length === 0) return condicao ?? 'drained'
  const nd = layers.filter((l) => comportamentoDe(l, condicao) === 'nao_drenado').length
  if (nd === 0) return 'drained'
  return nd === layers.length ? 'undrained' : 'mixed'
}

/**
 * Migra uma análise no formato antigo sem perder dados: cada camada recebe o
 * comportamento que reproduz o cálculo anterior (global não drenada → todas
 * nao_drenado). O `ru`, que era ignorado no modo não drenado, é removido para
 * não passar a atuar. `comportamento_migrado` liga o banner de recálculo se
 * houver camada com φ > 0 abaixo do N.A. calculada sem poropressão.
 */
export function migrarAnalise<G extends SlopeGeometry>(geometry: G, layers: Layer[]): { geometry: G; layers: Layer[]; migrou: boolean } {
  if (layers.every((l) => l.comportamento)) return { geometry, layers, migrou: false }
  const novas = layers.map((l) => ({ ...l, comportamento: comportamentoDe(l, geometry.analysis_condition) }))
  const undrained = geometry.analysis_condition === 'undrained'
  const geo: G = undrained ? { ...geometry, ru: undefined } : geometry
  const g: G = temPhiAbaixoDoNA(novas, geo) ? { ...geo, comportamento_migrado: true } : geo
  return { geometry: g, layers: novas, migrou: true }
}

function cotaBase(l: Layer): number | undefined {
  return l.y_base
}

/** Camada não drenada com φ > 0 cuja base fica abaixo do N.A. (poropressão ignorada onde há atrito). */
export function temPhiAbaixoDoNA(layers: Layer[], geo: SlopeGeometry): boolean {
  return layers.some((l, i) => avisosCamada(l, i, geo).includes('phi_abaixo_na'))
}

export type AvisoCamada = 'su_como_coesao' | 'phi_nao_drenado' | 'phi_abaixo_na'

export function avisosCamada(l: Layer, _i: number, geo: SlopeGeometry): AvisoCamada[] {
  const out: AvisoCamada[] = []
  const comp = comportamentoDe(l, geo.analysis_condition)
  if (comp === 'drenado' && l.phi === 0 && l.c > 0) out.push('su_como_coesao')
  if (comp === 'nao_drenado' && l.phi > 0) {
    out.push('phi_nao_drenado')
    const base = cotaBase(l)
    // camadas em modo profundidade (sem y_base) são comparadas pela profundidade da base
    const abaixo = base != null ? base < -geo.water_table_depth : (l.depth_base ?? 0) > geo.water_table_depth
    if (abaixo) out.push('phi_abaixo_na')
  }
  return out
}

export const TEXTO_AVISO: Record<AvisoCamada, string> = {
  su_como_coesao:
    "Esta camada parece usar su como coesão. Isso é comportamento não drenado, não longo prazo. No longo prazo informe c' e φ'.",
  phi_nao_drenado:
    'Camada não drenada com φ > 0: o atrito é mantido como digitado e sem poropressão. Confira se não deveria ser drenada.',
  phi_abaixo_na: 'Há atrito (φ > 0) abaixo do N.A. sem poropressão: o atrito pode estar superestimado.',
}
