import { describe, expect, test } from 'vitest'
import { bishopFS } from '../bishop'
import { findCriticalCircle } from '../search'
import type { FaceCoverage, FillMaterial, Layer, SlopeGeometry } from '../types'

// Aterro sobre argila mole (φ = 0). Valores de referência vêm de um código
// independente (grade grossa), não de software comercial; tolerância ±0,05.
const TOL = 0.05

const fill: FillMaterial = { c: 8, phi: 25, gamma: 18 }
const grass: FaceCoverage = { type: 'grass', depth: 1.5 }
const argila = (su: number): Layer[] => [{ name: 'Argila mole', y_top: 0, y_base: -15, c: su, phi: 0, gamma: 17 }]

const casoA: SlopeGeometry = {
  bench_height: 1.75,
  slope_ratio: 3,
  berm_width: 5,
  berm_slope_pct: 0,
  total_height: 3.5,
  water_table_depth: 0.5,
  gamma_water: 9.81,
}
const casoB: SlopeGeometry = { ...casoA, bench_height: 3.5, berm_width: 0 }
const comQ = (g: SlopeGeometry, q: number): SlopeGeometry => ({ ...g, surcharge_q: q })

const fsOf = (c: { xc: number; yc: number; R: number }, g: SlopeGeometry, layers: Layer[]) =>
  bishopFS(c, g, layers, fill, grass)!.FS

describe('Caso A — círculos informados', () => {
  test('raso xc 5,95 yc 5,88 R 14,70 → ~1,54', () => {
    expect(fsOf({ xc: 5.95, yc: 5.88, R: 14.7 }, casoA, argila(15))).toBeCloseTo(1.54, 1)
  })
  test('profundo xc 8 yc 13 R 28 → ~1,36', () => {
    expect(Math.abs(fsOf({ xc: 8, yc: 13, R: 28 }, casoA, argila(15)) - 1.36)).toBeLessThanOrEqual(TOL)
  })
  test('com q = 20 kPa, raso → ~1,26', () => {
    expect(Math.abs(fsOf({ xc: 5.95, yc: 5.88, R: 14.7 }, comQ(casoA, 20), argila(15)) - 1.26)).toBeLessThanOrEqual(TOL)
  })
})

describe('Caso A — busca automática', () => {
  test('sem sobrecarga: FS ≤ círculo profundo e distingue mecanismos', async () => {
    const r = await findCriticalCircle(casoA, argila(15), fill, grass)
    expect(r.FS).toBeLessThanOrEqual(1.36 + 1e-6)
    expect(r.is_adequate).toBe(false)
    expect(r.worst_circles!.length).toBeGreaterThanOrEqual(3)
    expect(r.worst_circles![0].FS).toBeCloseTo(r.FS, 6)
  }, 120_000)

  test('q = 20 kPa: FS mínimo ~1,02', async () => {
    const r = await findCriticalCircle(comQ(casoA, 20), argila(15), fill, grass)
    expect(r.FS).toBeLessThanOrEqual(1.02 + TOL)
    expect(r.FS).toBeGreaterThan(1.02 - 0.15)
  }, 120_000)
})

describe('Caso B — talude único 1:3', () => {
  const ref = [
    { su: 14, sem: 1.22, com: 0.93 },
    { su: 16, sem: 1.38, com: 1.05 },
    { su: 20, sem: 1.71, com: 1.3 },
  ]
  for (const { su, sem, com } of ref) {
    test(`su ${su}: sem q ~${sem}`, async () => {
      const r = await findCriticalCircle(casoB, argila(su), fill, grass)
      expect(Math.abs(r.FS - sem)).toBeLessThanOrEqual(TOL)
    }, 120_000)
    test(`su ${su}: q = 20 ~${com}`, async () => {
      const r = await findCriticalCircle(comQ(casoB, 20), argila(su), fill, grass)
      expect(Math.abs(r.FS - com)).toBeLessThanOrEqual(TOL)
    }, 120_000)
  }
})

describe('Sobrecarga e condição de análise', () => {
  const c = { xc: 5.95, yc: 5.88, R: 14.7 }
  test('sobrecarga reduz o FS e entra no peso das fatias sob a plataforma', () => {
    const sem = bishopFS(c, casoA, argila(15), fill, grass)!
    const com = bishopFS(c, comQ(casoA, 20), argila(15), fill, grass)!
    expect(com.FS).toBeLessThan(sem.FS)
    const carregadas = com.slices.filter((s) => (s.W_sobrecarga ?? 0) > 0)
    expect(carregadas.length).toBeGreaterThan(0)
    // fatias totalmente sob a plataforma levam q·b; a da crista, só a parte carregada
    const somaQ = com.slices.reduce((a, s) => a + (s.W_sobrecarga ?? 0), 0)
    expect(somaQ).toBeCloseTo(20 * (com.x_right - 15.5), 6) // crista em x = 15,5 m
    for (const s of carregadas.slice(1)) expect(s.W_sobrecarga).toBeCloseTo(20 * s.b, 6)
    expect(sem.slices.every((s) => (s.W_sobrecarga ?? 0) === 0)).toBe(true)
  })
  test('extensão carregada limita a sobrecarga', () => {
    const toda = bishopFS(c, comQ(casoA, 20), argila(15), fill, grass)!
    const curta = bishopFS(c, { ...comQ(casoA, 20), surcharge_width: 1 }, argila(15), fill, grass)!
    expect(curta.FS).toBeGreaterThan(toda.FS)
  })
  test('não drenada zera a poropressão; drenada com N.A. alto usa u', () => {
    const solo: Layer[] = [{ name: 'Argila', y_top: 0, y_base: -15, c: 5, phi: 22, gamma: 17 }]
    const g = { ...casoA, water_table_depth: 0 }
    const dren = bishopFS(c, g, solo, fill, grass)!
    const nd = bishopFS(c, { ...g, analysis_condition: 'undrained' }, solo, fill, grass)!
    expect(nd.slices.every((s) => s.u === 0)).toBe(true)
    expect(dren.slices.some((s) => s.u > 0)).toBe(true)
    expect(nd.FS).toBeGreaterThan(dren.FS)
    expect(nd.condition).toBe('undrained')
  })
  test('círculo que cruza a base é sinalizado', () => {
    const r = bishopFS({ xc: 8, yc: 13, R: 29 }, casoA, argila(15), fill, grass)!
    expect(r.crosses_base).toBe(true)
    expect(bishopFS({ xc: 8, yc: 13, R: 28 }, casoA, argila(15), fill, grass)!.crosses_base).toBe(false)
  })
})
