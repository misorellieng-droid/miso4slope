import { buildProfile, effectiveNaturalTerrain, groundY } from './geometry'
import { avgSoil, resolveFillZones, splitHeightByGround } from './soil'
import type {
  AnalysisMode,
  CircleParams,
  FaceCoverage,
  FillMaterial,
  FillZone,
  Layer,
  MaterialSegment,
  SlopeGeometry,
} from './types'

const SWEEP_POINTS = 2000
const MIN_ARC_WIDTH = 3 // m
export const MIN_VALID_SLICES = 5

export function arcY(x: number, circle: CircleParams): number | null {
  const dx = x - circle.xc
  const inside = circle.R * circle.R - dx * dx
  if (inside < 0) return null
  return circle.yc - Math.sqrt(inside)
}

function interpolateZeroCrossing(x1: number, d1: number, x2: number, d2: number): number {
  if (d2 === d1) return x1
  const t = d1 / (d1 - d2)
  return x1 + t * (x2 - x1)
}

/**
 * Varre o eixo x procurando a maior região contígua onde o arco do círculo
 * fica abaixo do perfil do terreno (a "fatia" de terreno que o círculo corta).
 * Retorna null se não houver uma região válida com largura mínima.
 */
export function findValidRange(
  circle: CircleParams,
  profile: ReturnType<typeof buildProfile>
): { x_left: number; x_right: number } | null {
  const xMin = circle.xc - circle.R
  const xMax = circle.xc + circle.R
  if (xMax <= xMin) return null

  const step = (xMax - xMin) / SWEEP_POINTS
  const xs: number[] = []
  const diffs: number[] = []

  for (let i = 0; i <= SWEEP_POINTS; i++) {
    const x = xMin + i * step
    const y = arcY(x, circle)
    if (y === null) continue
    xs.push(x)
    diffs.push(groundY(x, profile) - y)
  }

  // encontra a maior sequência contígua com diff > 0 (arco abaixo do terreno)
  let bestStart = -1
  let bestEnd = -1
  let curStart = -1
  for (let i = 0; i < diffs.length; i++) {
    if (diffs[i] > 0) {
      if (curStart === -1) curStart = i
    } else {
      if (curStart !== -1) {
        if (bestStart === -1 || i - curStart > bestEnd - bestStart) {
          bestStart = curStart
          bestEnd = i - 1
        }
        curStart = -1
      }
    }
  }
  if (curStart !== -1 && (bestStart === -1 || diffs.length - curStart > bestEnd - bestStart)) {
    bestStart = curStart
    bestEnd = diffs.length - 1
  }
  if (bestStart === -1) return null

  // refina as bordas por interpolação linear até o cruzamento diff=0
  const x_left =
    bestStart > 0
      ? interpolateZeroCrossing(xs[bestStart - 1], diffs[bestStart - 1], xs[bestStart], diffs[bestStart])
      : xs[bestStart]
  const x_right =
    bestEnd < diffs.length - 1
      ? interpolateZeroCrossing(xs[bestEnd], diffs[bestEnd], xs[bestEnd + 1], diffs[bestEnd + 1])
      : xs[bestEnd]

  if (x_right - x_left < MIN_ARC_WIDTH) return null
  return { x_left, x_right }
}

export interface RawSlice {
  xm: number
  y_top: number
  y_base: number
  h: number
  h_aterro: number
  h_fundacao: number
  materialSegments: MaterialSegment[]
  c: number
  phi_rad: number
  phi_deg: number
  gamma: number
  W: number
  W_aterro: number
  W_fundacao: number
  alpha_rad: number
  u: number
}

export interface BuiltSlices {
  x_left: number
  x_right: number
  b: number
  raw: RawSlice[]
}

/**
 * Monta as fatias de um círculo de tentativa: geometria, material (via
 * avgSoil — resistência na base, peso integrado) e poro-pressão. Comum aos
 * dois métodos de equilíbrio-limite (Bishop e Fellenius) — a diferença entre
 * eles está só em como cada fatia entra na equação de FS, não em como a
 * fatia em si é construída.
 */
export function buildRawSlices(
  circle: CircleParams,
  geo: SlopeGeometry,
  layers: Layer[],
  fill: FillMaterial | null,
  coverage?: FaceCoverage,
  fillZones?: FillZone[],
  n_slices = 40
): BuiltSlices | null {
  const mode: AnalysisMode = fill == null ? 'corte' : 'aterro'
  const profile = buildProfile(geo, mode)
  const range = findValidRange(circle, profile)
  if (!range) return null

  const { x_left, x_right } = range
  const b = (x_right - x_left) / n_slices
  const gammaWater = geo.gamma_water ?? 9.81
  const waterY = -geo.water_table_depth
  const resolvedFillZones = fillZones?.length ? resolveFillZones(fillZones, geo.total_height) : undefined
  const refTerrain = effectiveNaturalTerrain(geo, mode)

  const raw: RawSlice[] = []
  for (let i = 1; i <= n_slices; i++) {
    const xm = x_left + b * (i - 0.5)
    const y_top = groundY(xm, profile)
    const yArc = arcY(xm, circle)
    if (yArc === null) continue
    const y_base = yArc
    const h = y_top - y_base
    if (h <= 0) continue

    const soil = avgSoil(xm, y_top, y_base, layers, fill, coverage, resolvedFillZones, refTerrain)
    const { h_aterro, h_fundacao } = splitHeightByGround(xm, y_top, y_base, refTerrain, fill != null)
    const phi_rad = (soil.phi * Math.PI) / 180
    const W_aterro = soil.gammaH_aterro * b
    const W_fundacao = soil.gammaH_fundacao * b
    const W = W_aterro + W_fundacao
    const alpha_rad = Math.asin((xm - circle.xc) / circle.R)
    const u = y_base < waterY ? gammaWater * (waterY - y_base) : 0

    raw.push({
      xm,
      y_top,
      y_base,
      h,
      h_aterro,
      h_fundacao,
      materialSegments: soil.segments,
      c: soil.c,
      phi_rad,
      phi_deg: soil.phi,
      gamma: soil.gamma,
      W,
      W_aterro,
      W_fundacao,
      alpha_rad,
      u,
    })
  }

  if (raw.length < MIN_VALID_SLICES) return null

  return { x_left, x_right, b, raw }
}
