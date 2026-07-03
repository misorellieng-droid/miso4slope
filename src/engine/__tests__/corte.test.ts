import { describe, expect, test } from 'vitest'
import { bishopFS } from '../bishop'
import { felleniusFS } from '../fellenius'
import type { CircleParams, Layer, SlopeGeometry } from '../types'

// Talude de corte simples: sem bancada intermediária, sem material importado
// (fill=null) — toda a face exposta e a fundação abaixo dela são as mesmas
// camadas naturais.
const geo: SlopeGeometry = {
  bench_height: 10,
  slope_ratio: 1.5,
  berm_width: 0,
  total_height: 10,
  water_table_depth: 20, // N.A. bem abaixo, sem poro-pressão relevante neste teste
}

const layers: Layer[] = [{ name: 'Solo residual', y_top: 10, y_base: -20, c: 12, phi: 28, gamma: 18 }]

const circle: CircleParams = { xc: 1.5, yc: 20, R: 20 }

describe('modo corte — bishopFS/felleniusFS com fill=null', () => {
  test('bishopFS calcula um FS finito e positivo, usando só as camadas naturais', () => {
    const result = bishopFS(circle, geo, layers, null)
    expect(result).not.toBeNull()
    expect(result!.FS).toBeGreaterThan(0)
    expect(Number.isFinite(result!.FS)).toBe(true)
    // sem material de aterro: toda fatia deve ter W_aterro ≈ 0
    for (const s of result!.slices) {
      expect(s.W_aterro).toBeCloseTo(0, 6)
      expect(s.c).toBeCloseTo(12)
      expect(s.phi).toBeCloseTo(28)
    }
  })

  test('felleniusFS calcula um FS finito e positivo, usando só as camadas naturais', () => {
    const result = felleniusFS(circle, geo, layers, null)
    expect(result).not.toBeNull()
    expect(result!.FS).toBeGreaterThan(0)
    expect(Number.isFinite(result!.FS)).toBe(true)
    for (const s of result!.slices) {
      expect(s.W_aterro).toBeCloseTo(0, 6)
    }
  })
})
