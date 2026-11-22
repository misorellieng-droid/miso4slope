import { describe, expect, test } from 'vitest'
import { bishopFS } from '../bishop'
import { findCriticalCircle } from '../search'
import { comportamentoPadrao, condicaoResultante, migrarAnalise, avisosCamada } from '../comportamento'
import type { Layer, SlopeGeometry } from '../types'
import {
  aterroReferencia as aterro,
  camadasPerfilA,
  camadasPerfilB,
  circulos,
  coberturaReferencia as cob,
  geoReferencia,
  rachaoReferencia as rachao,
} from './fixtures/perfisReferencia'

const fs = (geo: SlopeGeometry, layers: Layer[], c = circulos.B_drenado) =>
  bishopFS(c, geo, layers, aterro, cob, rachao, 40)!.FS

// fim de construção "misto": argilas não drenadas, areias drenadas (padrão da condição)
const mistoB = (condicao: 'drained' | 'undrained' = 'undrained') =>
  camadasPerfilB.map((l) => ({ ...l, comportamento: comportamentoPadrao(condicao, l) }))

describe('Fixtures do motor legado (camadas sem "comportamento" herdam a condição global)', () => {
  test('perfil A: 0,860 nos dois modos', async () => {
    for (const cond of ['drained', 'undrained'] as const) {
      const r = await findCriticalCircle({ ...geoReferencia, analysis_condition: cond }, camadasPerfilA, aterro, cob, rachao, 40)
      expect(r.FS).toBeCloseTo(0.86, 2)
      expect(r.circle.xc).toBeCloseTo(3.26, 1)
    }
  }, 120000)
  test('perfil B: 1,181 drenado e 1,340 não drenado (antigo)', () => {
    expect(fs({ ...geoReferencia, analysis_condition: 'drained' }, camadasPerfilB)).toBeCloseTo(1.181, 2)
    expect(fs({ ...geoReferencia, analysis_condition: 'undrained' }, camadasPerfilB, circulos.B_naoDrenado)).toBeCloseTo(1.34, 2)
  })
})

describe('T1: equivalência com só argila', () => {
  test('drenado e não drenado dão o mesmo FS e o mesmo círculo', async () => {
    const rD = await findCriticalCircle({ ...geoReferencia, analysis_condition: 'drained' }, camadasPerfilA, aterro, cob, rachao, 40)
    const rU = await findCriticalCircle({ ...geoReferencia, analysis_condition: 'undrained' }, camadasPerfilA, aterro, cob, rachao, 40)
    expect(rD.FS).toBeCloseTo(rU.FS, 6)
    expect(rD.circle).toEqual(rU.circle)
  }, 120000)
})

describe('T2: regressão do perfil misto', () => {
  test('fim de construção misto reproduz o FS drenado (1,181 ± 0,005)', async () => {
    const geo = { ...geoReferencia, analysis_condition: 'undrained' as const }
    const layers = mistoB()
    expect(layers.map((l) => l.comportamento)).toEqual(['nao_drenado', 'drenado', 'nao_drenado', 'nao_drenado', 'drenado'])
    const r = await findCriticalCircle(geo, layers, aterro, cob, rachao, 40)
    expect(Math.abs(r.FS - 1.181)).toBeLessThanOrEqual(0.005)
    expect(r.condition).toBe('mixed')
    expect(fs(geo, layers)).toBeCloseTo(1.181, 2)
  }, 120000)
  test('condição resultante', () => {
    expect(condicaoResultante(camadasPerfilB, 'drained')).toBe('drained')
    expect(condicaoResultante(camadasPerfilB, 'undrained')).toBe('undrained')
    expect(condicaoResultante(mistoB(), 'undrained')).toBe('mixed')
  })
})

describe('T3: poropressão em areia homogênea (talude infinito)', () => {
  const geo: SlopeGeometry = { bench_height: 10, slope_ratio: 2, berm_width: 0, total_height: 10, water_table_depth: 50, min_arc_width: 3 }
  const areia: Layer[] = [{ name: 'Areia', y_top: 0, y_base: -20, c: 0, phi: 30, gamma: 20, comportamento: 'drenado' }]
  const fill = { c: 0, phi: 30, gamma: 20 }
  test('sem poropressão ≈ tan30/tan26,57 = 1,155', async () => {
    const r = await findCriticalCircle(geo, areia, fill, { type: 'none', depth: 0 }, undefined, 40)
    expect(r.FS).toBeGreaterThan(1.1)
    expect(r.FS).toBeLessThan(1.25)
  }, 120000)
  test('fluxo paralelo (N.A. na superfície): ru = γw·cos²β/γsat → FS ≈ 0,59', async () => {
    const beta = Math.atan(1 / 2)
    const ru = (9.81 * Math.cos(beta) ** 2) / 20
    const r = await findCriticalCircle({ ...geo, ru }, areia, fill, { type: 'none', depth: 0 }, undefined, 40)
    expect(Math.abs(r.FS - 0.59)).toBeLessThanOrEqual(0.08)
  }, 120000)
})

describe('T5: sensibilidade (FS crítico de cada variação)', () => {
  const crit = async (geo: SlopeGeometry, layers: Layer[]) =>
    (await findCriticalCircle(geo, layers, aterro, cob, rachao, 40, 'bishop', undefined, { rapido: true })).FS
  const geo = { ...geoReferencia, analysis_condition: 'undrained' as const }
  test('reduzir su pela metade reduz o FS de forma monotônica', async () => {
    const vals: number[] = []
    for (const k of [1, 0.75, 0.5])
      vals.push(await crit(geo, mistoB().map((l) => (l.comportamento === 'nao_drenado' ? { ...l, c: l.c * k } : l))))
    expect(vals[0]).toBeGreaterThan(vals[1])
    expect(vals[1]).toBeGreaterThan(vals[2])
  }, 300000)
  test('aumentar a sobrecarga reduz o FS', async () => {
    const vals: number[] = []
    for (const q of [0, 20, 40, 80]) vals.push(await crit({ ...geo, surcharge_q: q }, mistoB()))
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeLessThan(vals[i - 1])
  }, 300000)
})

describe('T6: migração', () => {
  test('análise antiga não drenada vira camadas explícitas, preserva dados e resultado', () => {
    const geoAntiga = { ...geoReferencia, analysis_condition: 'undrained' as const, ru: 0.3 }
    const m = migrarAnalise(geoAntiga, camadasPerfilB)
    expect(m.migrou).toBe(true)
    expect(m.layers.every((l) => l.comportamento === 'nao_drenado')).toBe(true)
    expect(m.layers.map((l) => ({ ...l, comportamento: undefined }))).toEqual(camadasPerfilB.map((l) => ({ ...l, comportamento: undefined })))
    expect(m.geometry.ru).toBeUndefined() // ru era ignorado no modo não drenado
    expect(m.geometry.comportamento_migrado).toBe(true) // há areia (φ > 0) abaixo do N.A. sem poropressão
    expect(fs(m.geometry, m.layers, circulos.B_naoDrenado)).toBeCloseTo(1.34, 2)
  })
  test('análise antiga drenada: sem banner, resultado idêntico', () => {
    const geoAntiga = { ...geoReferencia, analysis_condition: 'drained' as const }
    const m = migrarAnalise(geoAntiga, camadasPerfilB)
    expect(m.geometry.comportamento_migrado).toBeUndefined()
    expect(fs(m.geometry, m.layers)).toBeCloseTo(1.181, 2)
  })
  test('migração é idempotente', () => {
    const m = migrarAnalise({ ...geoReferencia, analysis_condition: 'undrained' }, camadasPerfilB)
    expect(migrarAnalise(m.geometry, m.layers).migrou).toBe(false)
  })
})

describe('avisos por camada', () => {
  const geo = { ...geoReferencia, analysis_condition: 'drained' as const }
  test('drenado com φ = 0 e c > 0 sugere su como coesão', () => {
    expect(avisosCamada({ ...camadasPerfilB[0], comportamento: 'drenado' }, 0, geo)).toContain('su_como_coesao')
  })
  test('não drenado com φ > 0 abaixo do N.A.', () => {
    expect(avisosCamada({ ...camadasPerfilB[1], comportamento: 'nao_drenado' }, 1, geo)).toEqual(['phi_nao_drenado', 'phi_abaixo_na'])
  })
})
