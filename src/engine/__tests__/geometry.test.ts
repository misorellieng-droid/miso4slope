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

describe('buildProfile — inclinação da berma', () => {
  // duas bancadas cheias de 8m e uma berma de 2,5m no meio (total_height=16, bench_height=8)
  const geo: SlopeGeometry = {
    bench_height: 8,
    slope_ratio: 1.5,
    berm_width: 2.5,
    total_height: 16,
    water_table_depth: 10,
  }

  // profile: [0]=aproximação [1]=pé(0,0) [2]=topo da 1ª bancada/início da berma
  // [3]=fim da berma [4]=topo da 2ª bancada/crista ...
  test('sem berm_slope_pct (padrão), a berma continua plana — comportamento anterior preservado', () => {
    const profile = buildProfile(geo, 'aterro')
    const bermStart = profile[2]
    const bermEnd = profile[3]
    expect(bermEnd.y).toBeCloseTo(bermStart.y)
  })

  test('berm_slope_pct negativo (desce): a berma perde cota da bancada para a borda', () => {
    const profile = buildProfile({ ...geo, berm_slope_pct: -4 }, 'aterro')
    const bermStart = profile[2]
    const bermEnd = profile[3]
    expect(bermEnd.y).toBeLessThan(bermStart.y)
    expect(bermEnd.y - bermStart.y).toBeCloseTo(2.5 * -0.04) // largura × declividade
  })

  test('berm_slope_pct positivo (sobe): a berma ganha cota da bancada para a borda', () => {
    const profile = buildProfile({ ...geo, berm_slope_pct: 4 }, 'aterro')
    const bermStart = profile[2]
    const bermEnd = profile[3]
    expect(bermEnd.y).toBeGreaterThan(bermStart.y)
    expect(bermEnd.y - bermStart.y).toBeCloseTo(2.5 * 0.04)
  })

  test('a plataforma final continua plana na última cota, independente da inclinação da berma', () => {
    const profile = buildProfile({ ...geo, berm_slope_pct: -4 }, 'aterro')
    const last = profile[profile.length - 1]
    const secondLast = profile[profile.length - 2]
    expect(last.y).toBeCloseTo(secondLast.y)
  })
})

describe('buildProfile — trecho antes do pé no corte', () => {
  // pé no corte é uma "plataforma de corte" (cota de projeto, onde se escava
  // até) — não o terreno original, que ali já foi escavado. O trecho visual
  // antes do pé deve ficar plano, mesmo com terreno natural customizado
  // (que continua valendo para outras finalidades, como a profundidade das
  // camadas de fundação, via effectiveNaturalTerrain — só não pra esse
  // trecho específico do desenho).
  const geo: SlopeGeometry = {
    bench_height: 8,
    slope_ratio: 1.5,
    berm_width: 2.5,
    total_height: 18,
    water_table_depth: 10,
    natural_terrain: [
      { x: -20, y: 0 },
      { x: 20, y: 15 },
    ],
  }

  test('corte: o trecho antes do pé fica plano, ignorando o terreno natural customizado', () => {
    const profile = buildProfile(geo, 'corte')
    const beforeToe = profile.filter((p) => p.x <= 0)
    expect(beforeToe.every((p) => p.y === beforeToe[0].y)).toBe(true)
    expect(beforeToe[0].y).toBe(0)
  })

  test('aterro: o trecho antes do pé segue o terreno natural customizado (comportamento preservado)', () => {
    const profile = buildProfile(geo, 'aterro')
    const beforeToe = profile.filter((p) => p.x <= 0)
    // com natural_terrain subindo de (-20,0) a (20,15), o ponto em x=-20 tem y=0 (não plano até lá)
    const farLeft = beforeToe.find((p) => p.x === -20)
    expect(farLeft?.y).toBeCloseTo(0)
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
