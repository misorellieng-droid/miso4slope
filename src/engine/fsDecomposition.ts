import { bishopFS } from './bishop'
import { felleniusFS } from './fellenius'
import type {
  CircleParams,
  FaceCoverage,
  FillMaterial,
  FillZone,
  Layer,
  SlopeGeometry,
  StabilityMethod,
} from './types'

const SOLVERS: Record<StabilityMethod, typeof bishopFS> = {
  bishop: bishopFS,
  fellenius: felleniusFS,
}

function zero<T extends { c: number; phi: number }>(items: T[], field: 'c' | 'phi'): T[] {
  return items.map((item) => ({ ...item, [field]: 0 }))
}

export interface PartialFS {
  fsCoesao: number | null // FS recalculado assumindo φ'=0 em todas as camadas — só a coesão resiste
  fsAtrito: number | null // FS recalculado assumindo c'=0 em todas as camadas — só o atrito resiste
}

/**
 * Decompõe o FS de um círculo já resolvido em dois cenários hipotéticos
 * independentes — não uma partição aditiva do FS real (que somaria ao FS
 * total): cada um é um recálculo completo do Bishop/Fellenius (com sua
 * própria iteração, no caso do Bishop) para o mesmo círculo, zerando φ' em
 * todo o perfil (só a coesão resiste) ou zerando c' em todo o perfil (só o
 * atrito resiste). Serve como diagnóstico de quanto cada parcela de
 * resistência, isoladamente, sustentaria o talude nessa superfície — não
 * são parcelas que se somam ao FS informado no resultado principal.
 */
export function computePartialFS(
  method: StabilityMethod,
  circle: CircleParams,
  geo: SlopeGeometry,
  layers: Layer[],
  fill: FillMaterial | null,
  coverage: FaceCoverage | undefined,
  fillZones: FillZone[] | undefined,
  n_slices: number
): PartialFS {
  const solve = SOLVERS[method]

  const layersNoPhi = zero(layers, 'phi')
  const layersNoC = zero(layers, 'c')
  const fillNoPhi = fill ? { ...fill, phi: 0 } : null
  const fillNoC = fill ? { ...fill, c: 0 } : null
  const zonesNoPhi = fillZones?.length ? zero(fillZones, 'phi') : fillZones
  const zonesNoC = fillZones?.length ? zero(fillZones, 'c') : fillZones

  const resultCoesao = solve(circle, geo, layersNoPhi, fillNoPhi, coverage, zonesNoPhi, n_slices)
  const resultAtrito = solve(circle, geo, layersNoC, fillNoC, coverage, zonesNoC, n_slices)

  return {
    fsCoesao: resultCoesao?.FS ?? null,
    fsAtrito: resultAtrito?.FS ?? null,
  }
}
