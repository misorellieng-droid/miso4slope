import { buildRawSlices, MIN_VALID_SLICES } from './slices'
import type {
  AnalysisResult,
  CircleParams,
  FaceCoverage,
  FillMaterial,
  FillZone,
  Layer,
  SliceResult,
  SlopeGeometry,
} from './types'

const FS_MIN_NBR = 1.5

// Fatias quase verticais (α perto de 90°) fazem L=b/cosα explodir — sem a
// correção iterativa que o Bishop tem, o Fellenius não tem como absorver
// isso; círculos que gerem fatias assim são rejeitados como implausíveis.
const MIN_COS_ALPHA = 0.1

/**
 * Calcula o FS pelo Método Comum das Fatias (Fellenius / Método Sueco) para
 * um círculo de tentativa. Diferente do Bishop Simplificado: não itera (não
 * tem o fator de correção mα) e usa o comprimento da base da fatia ao longo
 * do arco (L = b/cosα) em vez da largura (b) nos termos de coesão e
 * poro-pressão. Por não corrigir a inclinação da base, tende a dar FS mais
 * conservador (mais baixo) que Bishop para o mesmo círculo — isso é
 * característica do método, não erro de cálculo.
 * Retorna null se o círculo for geometricamente inválido.
 */
export function felleniusFS(
  circle: CircleParams,
  geo: SlopeGeometry,
  layers: Layer[],
  fill: FillMaterial | null,
  coverage?: FaceCoverage,
  fillZones?: FillZone[],
  n_slices = 40
): AnalysisResult | null {
  const built = buildRawSlices(circle, geo, layers, fill, coverage, fillZones, n_slices)
  if (!built) return null
  const { x_left, x_right, b, raw } = built
  if (raw.length < MIN_VALID_SLICES) return null

  if (raw.some((s) => Math.abs(Math.cos(s.alpha_rad)) < MIN_COS_ALPHA)) return null

  const sumWSinAlpha = raw.reduce((a, s) => a + s.W * Math.sin(s.alpha_rad), 0)
  if (sumWSinAlpha <= 0) return null

  const slices: SliceResult[] = raw.map((s, idx) => {
    const L = b / Math.cos(s.alpha_rad)
    const cL = s.c * L
    const wCosAlpha = s.W * Math.cos(s.alpha_rad)
    const uL = s.u * L
    const wUTanPhi = (wCosAlpha - uL) * Math.tan(s.phi_rad)
    return {
      index: idx + 1,
      xm: s.xm,
      y_top: s.y_top,
      y_base: s.y_base,
      h: s.h,
      h_aterro: s.h_aterro,
      h_fundacao: s.h_fundacao,
      materialSegments: s.materialSegments,
      c: s.c,
      phi: s.phi_deg,
      gamma: s.gamma,
      b,
      L,
      W: s.W,
      W_aterro: s.W_aterro,
      W_fundacao: s.W_fundacao,
      alpha_rad: s.alpha_rad,
      alpha_deg: (s.alpha_rad * 180) / Math.PI,
      u: s.u,
      cb: cL,
      w_u_tanphi: wUTanPhi,
      w_sin_alpha: s.W * Math.sin(s.alpha_rad),
      m_alpha: 1, // Fellenius não tem fator de correção — mantido em 1 por consistência estrutural com o Bishop
      numerator_term: cL + wUTanPhi,
    }
  })

  const FS = slices.reduce((a, s) => a + s.numerator_term, 0) / sumWSinAlpha
  if (!Number.isFinite(FS) || FS <= 0) return null

  return {
    FS,
    circle,
    slices,
    x_left,
    x_right,
    converged: true, // não iterativo — sempre "converge" de uma vez
    iterations: 1,
    is_adequate: FS >= FS_MIN_NBR,
    fs_min_nbr: FS_MIN_NBR,
    method: 'fellenius',
  }
}
