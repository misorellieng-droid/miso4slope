import { momentoReforcos, saiPelaFaceContida } from './reforco'
import { buildRawSlices, MIN_VALID_SLICES, surchargeRange } from './slices'
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
const MAX_ITERATIONS = 100
const CONVERGENCE_TOL = 1e-6

// Abaixo desse valor, m_alpha = cos(α) + sen(α)·tanφ'/FS torna a iteração de
// Bishop numericamente instável (1/FS explode e a iteração converge para um
// ponto fixo espúrio, não para o FS físico real). Limite padrão da literatura
// (Fredlund & Krahn, 1977): mα < 0,2 é considerado não confiável.
const MIN_M_ALPHA = 0.2

// Dados mínimos de uma fatia para a iteração de Bishop — os mesmos que a
// planilha usa por linha (aba Fatias): c', φ', W, u e α.
export interface BishopSliceInput {
  c: number
  phi_rad: number
  W: number
  u: number
  alpha_rad: number
}

/**
 * Iteração do FS de Bishop Simplificado sobre fatias já montadas, todas de
 * largura b:
 *
 *   FS = [ Σ (c'·b + (W − u·b)·tanφ') / mα  +  extraResisting ] / Σ W·senα
 *   mα = cosα + senα·tanφ'/FS
 *
 * extraResisting é um termo resistente adicional, já dividido pelo raio
 * (momento/R) — usado pelos grampos no muro de solo grampeado; 0 no talude
 * comum. Retorna null se o círculo for inválido (Σ W·senα ≤ 0, mα < 0,2 ou
 * FS não finito).
 */
export function iterateBishop(
  raw: BishopSliceInput[],
  b: number,
  extraResisting = 0
): { FS: number; converged: boolean; iterations: number } | null {
  const sumWSinAlpha = raw.reduce((a, s) => a + s.W * Math.sin(s.alpha_rad), 0)
  if (sumWSinAlpha <= 0) return null

  // A iteração é uma busca de ponto fixo; o teste de mα < 0,2 com uma estimativa
  // inicial ruim (FS muito abaixo do real) rejeitaria círculos válidos antes de
  // convergir. Por isso tenta mais de uma estimativa inicial e só rejeita se
  // nenhuma convergir para um FS com mα aceitável em todas as fatias.
  for (const start of [1.3, 2.5, 5, 10]) {
    const r = runFixedPoint(raw, b, extraResisting, sumWSinAlpha, start)
    if (r) return r
  }
  return null
}

function runFixedPoint(
  raw: BishopSliceInput[],
  b: number,
  extraResisting: number,
  sumWSinAlpha: number,
  start: number
): { FS: number; converged: boolean; iterations: number } | null {
  let FS = start
  let converged = false
  let iterations = 0

  for (iterations = 1; iterations <= MAX_ITERATIONS; iterations++) {
    let sumNumerator = extraResisting
    for (const s of raw) {
      const mAlpha = Math.cos(s.alpha_rad) + (Math.sin(s.alpha_rad) * Math.tan(s.phi_rad)) / FS
      if (mAlpha < MIN_M_ALPHA) return null
      sumNumerator += (s.c * b + (s.W - s.u * b) * Math.tan(s.phi_rad)) / mAlpha
    }

    const FSNew = sumNumerator / sumWSinAlpha
    if (!Number.isFinite(FSNew) || FSNew <= 0) return null

    if (Math.abs(FSNew - FS) < CONVERGENCE_TOL) {
      FS = FSNew
      converged = true
      break
    }
    FS = FSNew
  }

  return { FS, converged, iterations }
}

/**
 * Calcula o FS de Bishop Simplificado para um círculo de tentativa.
 * Retorna null se o círculo for geometricamente inválido.
 */
export function bishopFS(
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

  if (saiPelaFaceContida(geo, fill == null ? 'corte' : 'aterro', x_left)) return null
  const reforco = momentoReforcos(circle, geo, fill == null ? 'corte' : 'aterro', x_left, x_right)
  const solved = iterateBishop(raw, b, reforco.momentoSobreR)
  if (!solved) return null
  const { FS, converged, iterations } = solved

  const slices: SliceResult[] = raw.map((s, idx) => {
    const mAlpha = Math.cos(s.alpha_rad) + (Math.sin(s.alpha_rad) * Math.tan(s.phi_rad)) / FS
    const L = b / Math.cos(s.alpha_rad)
    const cb = s.c * b
    const wUTanPhi = (s.W - s.u * b) * Math.tan(s.phi_rad)
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
      W_sobrecarga: s.W_sobrecarga,
      alpha_rad: s.alpha_rad,
      alpha_deg: (s.alpha_rad * 180) / Math.PI,
      u: s.u,
      cb,
      w_u_tanphi: wUTanPhi,
      w_sin_alpha: s.W * Math.sin(s.alpha_rad),
      m_alpha: mAlpha,
      numerator_term: (cb + wUTanPhi) / mAlpha,
    }
  })

  return {
    FS,
    circle,
    slices,
    x_left,
    x_right,
    converged,
    iterations,
    is_adequate: FS >= FS_MIN_NBR,
    fs_min_nbr: FS_MIN_NBR,
    method: 'bishop',
    condition: geo.analysis_condition ?? 'drained',
    surcharge_q: geo.surcharge_q ?? 0,
    surcharge_x_start: surchargeRange(geo).x_start,
    surcharge_x_end: surchargeRange(geo).x_end,
    crosses_base: built.crosses_base,
    y_min: built.y_min,
    base_y: built.base_y,
  }
}
