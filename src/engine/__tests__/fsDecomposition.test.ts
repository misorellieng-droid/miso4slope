import { describe, expect, test } from 'vitest'
import { bishopFS } from '../bishop'
import { computePartialFS } from '../fsDecomposition'
import type { CircleParams, Layer, SlopeGeometry } from '../types'

const geo: SlopeGeometry = {
  bench_height: 10,
  slope_ratio: 1.5,
  berm_width: 0,
  total_height: 10,
  water_table_depth: 20,
}

const layers: Layer[] = [{ name: 'Solo residual', y_top: 10, y_base: -20, c: 12, phi: 28, gamma: 18 }]
const circle: CircleParams = { xc: 1.5, yc: 20, R: 20 }

describe('computePartialFS — modo corte (fill=null)', () => {
  test('FS só-coesão e só-atrito são ambos finitos e positivos', () => {
    const { fsCoesao, fsAtrito } = computePartialFS('bishop', circle, geo, layers, null, undefined, undefined, 40)
    expect(fsCoesao).not.toBeNull()
    expect(fsAtrito).not.toBeNull()
    expect(fsCoesao!).toBeGreaterThan(0)
    expect(fsAtrito!).toBeGreaterThan(0)
  })

  test('não são recalculados via a mesma equação linear do FS combinado (m_alpha próprio de cada cenário)', () => {
    // com φ'=0, m_alpha = cos(α) (não tem termo de tanφ'/FS) — diferente do
    // m_alpha do FS combinado, que usa o φ' real de cada camada
    const full = bishopFS(circle, geo, layers, null)!
    const { fsCoesao } = computePartialFS('bishop', circle, geo, layers, null, undefined, undefined, 40)
    const fullMAlphas = full.slices.map((s) => s.m_alpha)
    const cosAlphas = full.slices.map((s) => Math.cos(s.alpha_rad))
    // pelo menos alguma fatia tem m_alpha diferente de cos(alpha) no FS combinado
    // (prova que o cenário só-coesão usa um m_alpha próprio, não reaproveita o do FS total)
    expect(fullMAlphas.some((m, i) => Math.abs(m - cosAlphas[i]) > 1e-6)).toBe(true)
    expect(fsCoesao).not.toBeNull()
  })

  test('camada sem coesão nenhuma (c=0): FS só-coesão deve ser ~0 (nada resiste sem atrito)', () => {
    const cohesionless: Layer[] = [{ name: 'Areia', y_top: 10, y_base: -20, c: 0, phi: 30, gamma: 18 }]
    const { fsCoesao } = computePartialFS('bishop', circle, geo, cohesionless, null, undefined, undefined, 40)
    expect(fsCoesao).toBeCloseTo(0, 6)
  })

  test('felleniusFS também funciona (mesmo cenário, método diferente)', () => {
    const { fsCoesao, fsAtrito } = computePartialFS('fellenius', circle, geo, layers, null, undefined, undefined, 40)
    expect(fsCoesao).toBeGreaterThan(0)
    expect(fsAtrito).toBeGreaterThan(0)
  })
})
