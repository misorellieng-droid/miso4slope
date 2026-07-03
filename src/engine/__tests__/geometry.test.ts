import { describe, expect, test } from 'vitest'
import { buildProfile, effectiveNaturalTerrain, groundY } from '../geometry'
import type { SlopeGeometry } from '../types'

describe('buildProfile — ordem das bancadas por modo', () => {
  // total_height=18,011 e bench_height=8 → resto de 2,011 + duas bancadas cheias de 8
  const geo: SlopeGeometry = {
    bench_height: 8,
    slope_ratio: 1.5,
    berm_width: 2.5,
    total_height: 18.011,
    water_table_depth: 14.25,
  }

  test('aterro: a bancada resto fica junto ao pé (primeira subida)', () => {
    const profile = buildProfile(geo, 'aterro')
    // primeiro ponto após o pé (x=0,y=0) sobe a bancada resto (2,011m), não uma cheia (8m)
    const firstRise = profile.find((p) => p.y > 0)
    expect(firstRise!.y).toBeCloseTo(2.011)
  })

  test('corte: a bancada resto fica junto à crista (última subida)', () => {
    const profile = buildProfile(geo, 'corte')
    const firstRise = profile.find((p) => p.y > 0)
    expect(firstRise!.y).toBeCloseTo(8) // primeira subida agora é uma bancada cheia
    // a última cota antes da plataforma final é a crista, com o resto (18,011 total)
    const crestY = Math.max(...profile.map((p) => p.y))
    expect(crestY).toBeCloseTo(18.011)
  })
})

describe('effectiveNaturalTerrain', () => {
  const geo: SlopeGeometry = {
    bench_height: 8,
    slope_ratio: 1.5,
    berm_width: 0,
    total_height: 19,
    water_table_depth: 10,
  }

  test('aterro sem terreno customizado: sem referência (mantém padrão y=0 do resto do código)', () => {
    expect(effectiveNaturalTerrain(geo, 'aterro')).toBeUndefined()
  })

  test('corte sem terreno customizado: referência plana na cota da crista (total_height)', () => {
    const terrain = effectiveNaturalTerrain(geo, 'corte')
    expect(terrain).toBeDefined()
    expect(groundY(0, terrain!)).toBeCloseTo(19)
    expect(groundY(1000, terrain!)).toBeCloseTo(19)
    expect(groundY(-1000, terrain!)).toBeCloseTo(19)
  })

  test('com terreno customizado, é sempre ele — em qualquer modo', () => {
    const custom = [
      { x: -20, y: 5 },
      { x: 20, y: 25 },
    ]
    const geoWithTerrain = { ...geo, natural_terrain: custom }
    expect(effectiveNaturalTerrain(geoWithTerrain, 'aterro')).toBe(custom)
    expect(effectiveNaturalTerrain(geoWithTerrain, 'corte')).toBe(custom)
  })
})
