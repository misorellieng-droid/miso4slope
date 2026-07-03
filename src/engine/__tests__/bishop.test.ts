import { describe, expect, test } from 'vitest'
import { findCriticalCircle } from '../search'
import type { FillMaterial, Layer, SlopeGeometry } from '../types'

const geo: SlopeGeometry = {
  bench_height: 8,
  slope_ratio: 1.5,
  berm_width: 2.5,
  total_height: 18.011,
  water_table_depth: 14.25,
  gamma_water: 9.81,
}

const layers: Layer[] = [
  { name: 'Argila mole', y_top: 0, y_base: -1.5, c: 5, phi: 22, gamma: 15.0 },
  { name: 'Argila porosa', y_top: -1.5, y_base: -6.0, c: 6, phi: 23, gamma: 15.5 },
  { name: 'Argila rija', y_top: -6.0, y_base: -13.0, c: 18, phi: 35, gamma: 19.0 },
  { name: 'Areia compacta', y_top: -13.0, y_base: -16.51, c: 0, phi: 39, gamma: 19.5 },
  { name: 'Argila siltosa', y_top: -16.51, y_base: -17.15, c: 10, phi: 32, gamma: 18.0 },
  { name: 'Areia média', y_top: -17.15, y_base: -25.0, c: 0, phi: 33, gamma: 18.5 },
]

const fill: FillMaterial = { c: 8, phi: 25, gamma: 18 }

describe('bishop simplificado — círculo crítico SP-10', () => {
  test(
    'converge para FS e círculo próximos do modelo de referência',
    async () => {
      const result = await findCriticalCircle(geo, layers, fill)

      expect(result.FS).toBeGreaterThan(1.1)
      expect(result.FS).toBeLessThan(1.3) // FS ≈ 1,189 ± 0,05

      expect(result.circle.R).toBeGreaterThan(28)
      expect(result.circle.R).toBeLessThan(45) // R ≈ 35,5 m

      expect(result.converged).toBe(true)
    },
    120_000
  )
})
