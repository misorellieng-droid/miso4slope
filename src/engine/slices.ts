import { buildProfile, effectiveNaturalTerrain, groundY } from './geometry'
import { avgSoil, profileBaseAt, resolveFillZones, splitHeightByGround } from './soil'
import type {
  AnalysisMode,
  CircleParams,
  FaceCoverage,
  FillMaterial,
  FillZone,
  Layer,
  MaterialSegment,
  SlopeGeometry,
  Point,
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
  W_sobrecarga: number // q × largura da fatia sob a área carregada (0 fora dela)
  alpha_rad: number
  u: number
}

export interface BuiltSlices {
  x_left: number
  x_right: number
  b: number
  raw: RawSlice[]
  crosses_base: boolean
  y_min: number
  base_y: number | null
}

// Área carregada na plataforma: q (kPa) entre x_start e x_end (m).
export interface SurchargeSpec {
  q: number
  x_start: number
  x_end: number
}

/**
 * Extensão x da área carregada da plataforma: da crista (último vértice antes
 * do trecho plano final) até crista + surcharge_width; sem largura informada,
 * vale para toda a plataforma (x_end = ∞).
 */
export function surchargeRange(
  geo: SlopeGeometry,
  profile: Point[] = buildProfile(geo)
): { x_start: number; x_end: number } {
  const xCrest = profile[profile.length - 2].x
  const w = geo.surcharge_width
  return { x_start: xCrest, x_end: w != null && w > 0 ? xCrest + w : Infinity }
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
  const undrained = geo.analysis_condition === 'undrained'
  const q = geo.surcharge_q ?? 0
  const range = surchargeRange(geo, profile)
  const surcharge: SurchargeSpec | undefined = q > 0 ? { q, ...range } : undefined
  return buildRawSlicesOnProfile(circle, {
    profile,
    surcharge,
    undrained,
    ru: !undrained && (geo.ru ?? 0) > 0 ? geo.ru : undefined,
    refTerrain: effectiveNaturalTerrain(geo, mode),
    waterY: -geo.water_table_depth,
    gammaWater: geo.gamma_water ?? 9.81,
    layers,
    fill,
    coverage,
    resolvedFillZones: fillZones?.length ? resolveFillZones(fillZones, geo.total_height) : undefined,
    n_slices,
  })
}

// Tudo o que a montagem das fatias precisa, já resolvido: o perfil da
// superfície (poligonal com x não-decrescente), o terreno de referência das
// camadas e a cota do N.A. no mesmo referencial. O talude paramétrico monta
// isso a partir de SlopeGeometry (buildRawSlices); a verificação de muros
// monta a partir das poligonais do Civil 3D (engine/muros).
export interface SliceSetup {
  profile: Point[]
  refTerrain: Point[] | undefined
  waterY: number
  gammaWater: number
  layers: Layer[]
  fill: FillMaterial | null
  coverage?: FaceCoverage
  resolvedFillZones?: Layer[]
  n_slices: number
  surcharge?: SurchargeSpec
  undrained?: boolean // sem poropressão (tensões totais, c = su e φ = 0)
  ru?: number         // razão de poropressão: u = ru·γh, substitui o N.A.
}

export function buildRawSlicesOnProfile(circle: CircleParams, setup: SliceSetup): BuiltSlices | null {
  const { profile, refTerrain, waterY, gammaWater, layers, fill, coverage, resolvedFillZones, n_slices } = setup
  const { surcharge, undrained, ru } = setup
  const range = findValidRange(circle, profile)
  if (!range) return null

  const { x_left, x_right } = range
  const b = (x_right - x_left) / n_slices

  const raw: RawSlice[] = []
  let crosses_base = false
  let y_min = Infinity
  let base_y: number | null = null
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
    // A sobrecarga só soma peso (W); não gera poropressão. Largura carregada
    // da fatia = interseção de [xm ± b/2] com a área carregada.
    const W_sobrecarga = surcharge
      ? surcharge.q * Math.max(0, Math.min(xm + b / 2, surcharge.x_end) - Math.max(xm - b / 2, surcharge.x_start))
      : 0
    const u = undrained
      ? 0
      : ru != null
        ? (ru * W) / b
        : y_base < waterY
          ? gammaWater * (waterY - y_base)
          : 0

    y_min = Math.min(y_min, y_base)
    const sliceBase = profileBaseAt(xm, layers, refTerrain)
    if (sliceBase !== null) {
      base_y = base_y === null ? sliceBase : Math.min(base_y, sliceBase)
      if (y_base < sliceBase - 1e-4) crosses_base = true
    }

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
      W: W + W_sobrecarga,
      W_aterro,
      W_fundacao,
      W_sobrecarga,
      alpha_rad,
      u,
    })
  }

  if (raw.length < MIN_VALID_SLICES) return null

  return { x_left, x_right, b, raw, crosses_base, y_min, base_y }
}
