import { buildProfile } from './geometry'
import type { AnalysisResult, Layer, SliceResult, SlopeGeometry, ZonaFundacao } from './types'

// Fundação em duas zonas (A tratada dentro do terreno, B natural fora da divisa).
// Referencial do usuário: x = 0 na borda da plataforma, positivo rumo ao pé e
// além; o motor usa x = 0 no pé, positivo rumo à plataforma. A conversão é
// x_usuário = x_crista − x_motor (a crista do motor é o último vértice antes
// do trecho plano final). z é a profundidade abaixo do terreno natural.

export type Origem = 'LIDO' | 'CALCULADO' | 'EMPÍRICO' | 'HIPÓTESE'

export const ZONA_PADRAO: ZonaFundacao = {
  ativa: false,
  camada: 0,
  limite_modo: 'alem_pe',
  alem_pe: 0,
  x_abs: 0,
  d_tr: null,
  modo: 'su',
  su_topo: 25,
  k: 0,
  r: 0.25, // EMPÍRICO
  U: 0.8, // HIPÓTESE
  q_pre: 40, // HIPÓTESE
  B: 20, // HIPÓTESE
  c_comp: 20, // HIPÓTESE
  phi_comp: 25, // HIPÓTESE
  transicao: 'abrupta',
  L_trans: 5,
}

export const NOTA_PRECARGA =
  'su_A(z) = su0 + r·Δσ′v(z)·U, com Δσ′v(z) = q_pré·B/(B+z) (espraiamento 2:1). r é EMPÍRICO; U, q_pré e B são HIPÓTESE.'

/** x da crista no referencial do motor (origem no pé). */
export function xCristaMotor(geo: SlopeGeometry): number {
  const profile = buildProfile(geo, 'aterro')
  return profile[profile.length - 2].x
}

/** Limite horizontal da Zona A no referencial do usuário (m). */
export function xLimUsuario(zf: ZonaFundacao, xPeUsuario: number): number {
  return zf.limite_modo === 'x_abs' ? zf.x_abs : xPeUsuario + zf.alem_pe
}

/** Espessura da camada (m): topo − base pelas cotas ou pelas profundidades. */
export function espessuraCamada(layer: Layer): number {
  if (layer.depth_top != null && layer.depth_base != null) return layer.depth_base - layer.depth_top
  if (layer.y_top != null && layer.y_base != null) return layer.y_top - layer.y_base
  return 0
}

/** Camada tratada (a primeira, se o índice não existir). */
export function camadaTratada(zf: ZonaFundacao, layers: Layer[]): { layer: Layer; indice: number } | null {
  if (!layers.length) return null
  const indice = Math.min(Math.max(zf.camada ?? 0, 0), layers.length - 1)
  return { layer: layers[indice], indice }
}

/** Zona B com sobrescritas de γ aplicadas à camada tratada (c, φ entram por fatia). */
export function camadasEfetivas(layers: Layer[], zf: ZonaFundacao | undefined): Layer[] {
  if (!zf?.ativa || zf.b_gamma == null) return layers
  const alvo = camadaTratada(zf, layers)
  if (!alvo) return layers
  return layers.map((l, i) => (i === alvo.indice ? { ...l, gamma: zf.b_gamma as number } : l))
}

export interface ParamsZona {
  c: number
  phi: number
  wA: number // fração Zona A (0 a 1), geométrica — mesmo no cenário sem tratamento
}

/** Parâmetros da Zona B numa profundidade z. */
export function paramsZonaB(zf: ZonaFundacao, layer: Layer, z: number): { c: number; phi: number } {
  return {
    c: (zf.b_su_topo ?? layer.c) + (zf.b_k ?? 0) * Math.max(z, 0),
    phi: zf.b_phi ?? layer.phi,
  }
}

/** Parâmetros da Zona A numa profundidade z (antes da transição). */
export function paramsZonaA(zf: ZonaFundacao, layer: Layer, z: number): { c: number; phi: number } {
  const zz = Math.max(z, 0)
  if (zf.modo === 'colunas') return { c: zf.c_comp, phi: zf.phi_comp }
  if (zf.modo === 'precarga') {
    const b = paramsZonaB(zf, layer, zz)
    const d = zf.q_pre * (zf.B / (zf.B + zz))
    return { c: b.c + zf.r * d * Math.min(Math.max(zf.U, 0), 1), phi: b.phi }
  }
  return { c: zf.su_topo + zf.k * zz, phi: 0 }
}

/**
 * Parâmetros do ponto médio da base de uma fatia: x (usuário) e z (profundidade
 * abaixo do terreno). Zona A se x ≤ x_lim e z ≤ d_tr; senão Zona B. Transição
 * gradual interpola linearmente de x_lim a x_lim + L.
 */
export function paramsNoPonto(zf: ZonaFundacao, layer: Layer, xUsuario: number, xLim: number, z: number): ParamsZona {
  const b = paramsZonaB(zf, layer, z)
  const dentroProf = zf.d_tr == null || z <= zf.d_tr + 1e-9
  if (!dentroProf) return { ...b, wA: 0 }
  let wB = xUsuario <= xLim ? 0 : 1
  if (zf.transicao === 'gradual' && zf.L_trans > 0) {
    wB = Math.min(Math.max((xUsuario - xLim) / zf.L_trans, 0), 1)
  }
  const wA = 1 - wB
  if (zf.sem_tratamento || wA <= 0) return { ...b, wA }
  const a = paramsZonaA(zf, layer, z)
  return { c: wA * a.c + wB * b.c, phi: wA * a.phi + wB * b.phi, wA }
}

/** Resumo de um arco: saída em y = 0 e % do comprimento dentro da Zona A. */
export function resumoArco(
  geo: SlopeGeometry,
  slices: SliceResult[],
  xLeft: number
): { x_saida: number; pct_zona_a: number } {
  const xCrista = xCristaMotor(geo)
  let total = 0
  let dentro = 0
  for (const s of slices) {
    total += s.L
    dentro += s.L * (s.zona_a ?? 0)
  }
  return { x_saida: xCrista - xLeft, pct_zona_a: total > 0 ? (100 * dentro) / total : 0 }
}

export function comResumo(geo: SlopeGeometry, r: AnalysisResult): AnalysisResult {
  if (!geo.zona_fundacao?.ativa) return r
  return { ...r, ...resumoArco(geo, r.slices, r.x_left) }
}

/** Aviso padrão: o crítico contorna a zona tratada? */
export function contornaZona(zf: ZonaFundacao, geo: SlopeGeometry, r: Pick<AnalysisResult, 'x_saida' | 'pct_zona_a'>): boolean {
  const xLim = xLimUsuario(zf, xCristaMotor(geo))
  return (r.x_saida ?? -Infinity) > xLim + 1e-6 || (r.pct_zona_a ?? 100) < 50
}
