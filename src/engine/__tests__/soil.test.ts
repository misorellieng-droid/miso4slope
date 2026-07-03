import { describe, expect, test } from 'vitest'
import { avgSoil, resolveFillZones, soilAt, splitHeightByGround } from '../soil'
import type { FaceCoverage, FillMaterial, FillZone, Layer, Point } from '../types'

const layers: Layer[] = []
const fill: FillMaterial = { c: 10, phi: 25, gamma: 18 }

describe('avgSoil — cobertura da face do aterro', () => {
  test('sem coverage, usa o c\' nominal do aterro (comportamento anterior preservado)', () => {
    const s = avgSoil(0, 5, 0, layers, fill)
    expect(s.c).toBeCloseTo(10)
  })

  test('fatia rasa (inteira dentro da zona de influência) com face sem proteção reduz o c\' médio', () => {
    const coverage: FaceCoverage = { type: 'none', depth: 1.5 }
    // fatia de 1m de altura, inteira dentro da zona de 1,5m de influência
    const s = avgSoil(0, 1, 0, layers, fill, coverage)
    expect(s.c).toBeLessThan(10)
    expect(s.c).toBeGreaterThan(3) // retenção mínima (0,3) na superfície, sobe linearmente até 1m de profundidade
  })

  test('fatia com base longe da superfície não é afetada — resistência é avaliada na base, não em média', () => {
    const coverage: FaceCoverage = { type: 'none', depth: 1.5 }
    // fatia de 20m de altura: a base (y=0) está a 20m do topo (y_top=20), bem além
    // dos 1,5m de influência — a cobertura não reduz nada, mesmo a fatia sendo alta
    const s = avgSoil(0, 20, 0, layers, fill, coverage)
    expect(s.c).toBeCloseTo(10)
  })

  test('a cobertura é avaliada na profundidade da base, não do topo', () => {
    const coverage: FaceCoverage = { type: 'none', depth: 1.5 }
    // fatia de 20m de altura, mas com a BASE (não o topo) dentro da zona de influência
    // (y_top=20, y_base=19 → base a 1m do topo, dentro dos 1,5m)
    const s = avgSoil(0, 20, 19, layers, fill, coverage)
    expect(s.c).toBeLessThan(10)
  })

  test('cobertura vegetal (grama) reduz menos que face sem proteção', () => {
    const bare: FaceCoverage = { type: 'none', depth: 1.5 }
    const grass: FaceCoverage = { type: 'grass', depth: 1.5 }
    const sBare = avgSoil(0, 1, 0, layers, fill, bare)
    const sGrass = avgSoil(0, 1, 0, layers, fill, grass)
    expect(sGrass.c).toBeGreaterThan(sBare.c)
  })

  test('revestimento rígido preserva o c\' nominal mesmo na superfície', () => {
    const rigid: FaceCoverage = { type: 'rigid', depth: 1.5 }
    const s = avgSoil(0, 1, 0, layers, fill, rigid)
    expect(s.c).toBeCloseTo(10)
  })

  test('cobertura não afeta material da fundação (y < 0)', () => {
    const foundationLayers: Layer[] = [{ name: 'Argila', y_top: 0, y_base: -10, c: 20, phi: 20, gamma: 17 }]
    const coverage: FaceCoverage = { type: 'none', depth: 1.5 }
    const s = avgSoil(0, -1, -5, foundationLayers, fill, coverage)
    expect(s.c).toBeCloseTo(20)
  })
})

describe('resolveFillZones', () => {
  test('empilha as zonas a partir da crista para baixo', () => {
    const zones: FillZone[] = [
      { name: 'Superior', thickness: 0.9, compaction_degree: 100, c: 15, phi: 28, gamma: 19 },
      { name: 'Intermediária', thickness: 2, compaction_degree: 97, c: 12, phi: 27, gamma: 18.5 },
    ]
    const resolved = resolveFillZones(zones, 18)
    expect(resolved[0].y_top).toBeCloseTo(18)
    expect(resolved[0].y_base).toBeCloseTo(17.1)
    expect(resolved[0].c).toBe(15)
    expect(resolved[1].y_top).toBeCloseTo(17.1)
    expect(resolved[1].y_base).toBeCloseTo(15.1)
    expect(resolved[1].c).toBe(12)
  })
})

describe('soilAt — zonas de compactação do aterro', () => {
  const fillZones: Layer[] = [{ name: 'Superior', y_top: 18, y_base: 17.1, c: 15, phi: 28, gamma: 19 }]

  test('dentro da zona, usa os parâmetros da zona em vez do corpo do aterro', () => {
    const s = soilAt(0, 17.5, [], fill, fillZones)
    expect(s.c).toBeCloseTo(15)
  })

  test('fora da zona (mais fundo), cai no material do corpo do aterro', () => {
    const s = soilAt(0, 10, [], fill, fillZones)
    expect(s.c).toBeCloseTo(fill.c)
  })

  test('sem fillZones definido, comportamento igual ao anterior (usa fill)', () => {
    const s = soilAt(0, 17.5, [], fill)
    expect(s.c).toBeCloseTo(fill.c)
  })
})

describe('soilAt — terreno natural customizado e camadas por profundidade', () => {
  // terreno subindo de y=-5 (x=-20) até y=5 (x=20), cruzando y=0 em x=0 (o pé)
  const terrain: Point[] = [
    { x: -20, y: -5 },
    { x: 20, y: 5 },
  ]
  const depthLayers: Layer[] = [
    { name: 'Camada 1', depth_top: 0, depth_base: 2, c: 8, phi: 24, gamma: 17 },
    { name: 'Camada 2', depth_top: 2, depth_base: 6, c: 15, phi: 28, gamma: 18 },
  ]

  test('sem terreno customizado, fronteira aterro/fundação continua em y=0', () => {
    expect(soilAt(0, 0.01, [], fill).c).toBeCloseTo(fill.c)
    expect(soilAt(0, -0.01, depthLayers, fill).c).toBeCloseTo(8)
  })

  test('com terreno customizado, a fronteira acompanha a superfície local (não é mais y=0)', () => {
    // em x=10, terreno está em y=2.5 (interpolado) — acima disso é aterro, abaixo é fundação
    const groundAt10 = 2.5
    expect(soilAt(10, groundAt10 + 0.1, [], fill, undefined, terrain).c).toBeCloseTo(fill.c)
    expect(soilAt(10, groundAt10 - 0.1, depthLayers, fill, undefined, terrain).c).toBeCloseTo(8)
  })

  test('camadas com depth_top/depth_base acompanham a superfície em qualquer x', () => {
    // em x=-10, terreno está em y=-2.5; camada 1 vai de -2.5 até -4.5 (profundidade 0 a 2m)
    const groundAtMinus10 = -2.5
    expect(soilAt(-10, groundAtMinus10 - 1, depthLayers, fill, undefined, terrain).c).toBeCloseTo(8) // 1m de profundidade → camada 1
    expect(soilAt(-10, groundAtMinus10 - 3, depthLayers, fill, undefined, terrain).c).toBeCloseTo(15) // 3m de profundidade → camada 2
  })

  test('camadas absolutas (sem depth_top/depth_base) continuam funcionando mesmo com terreno customizado', () => {
    const absoluteLayers: Layer[] = [{ name: 'Fixa', y_top: -2, y_base: -8, c: 33, phi: 20, gamma: 16 }]
    expect(soilAt(-10, -5, absoluteLayers, fill, undefined, terrain).c).toBeCloseTo(33)
  })
})

describe('avgSoil — resistência na base, peso integrado ao longo da altura', () => {
  const fillMat: FillMaterial = { c: 8, phi: 25, gamma: 18 }
  const foundationLayers: Layer[] = [{ name: 'Argila mole', y_top: 0, y_base: -10, c: 5, phi: 22, gamma: 15 }]

  test('fatia que cruza aterro e fundação usa c\'/φ\' só da fundação (base), não uma mistura', () => {
    // fatia de y_top=5 (dentro do aterro) até y_base=-3 (dentro da fundação)
    const s = avgSoil(0, 5, -3, foundationLayers, fillMat)
    expect(s.c).toBeCloseTo(5) // c' da fundação, não uma média entre 8 e 5
    expect(s.phi).toBeCloseTo(22) // φ' da fundação, não uma média entre 25 e 22
  })

  test('mas o peso (γ) integra as duas parcelas — não é nem o γ do aterro nem o da fundação isolado', () => {
    // aterro γ=18 (0 a 5m, 5m de espessura) + fundação γ=15 (0 a -3m, 3m de espessura)
    const s = avgSoil(0, 5, -3, foundationLayers, fillMat)
    const expectedGamma = (18 * 5 + 15 * 3) / 8 // média ponderada pela espessura de cada parcela
    // avgSoil amostra por pontos discretos (Riemann), não integra exatamente —
    // tolerância maior aqui só por causa da discretização, não é imprecisão do método
    expect(s.gamma).toBeCloseTo(expectedGamma, 0)
    expect(s.gamma).toBeGreaterThan(15)
    expect(s.gamma).toBeLessThan(18)
  })

  test('fatia inteira no aterro usa c\'/φ\'/γ do aterro normalmente', () => {
    const s = avgSoil(0, 5, 1, foundationLayers, fillMat)
    expect(s.c).toBeCloseTo(8)
    expect(s.phi).toBeCloseTo(25)
    expect(s.gamma).toBeCloseTo(18)
  })

  test('fatia inteira na fundação usa c\'/φ\'/γ da fundação normalmente', () => {
    const s = avgSoil(0, -1, -5, foundationLayers, fillMat)
    expect(s.c).toBeCloseTo(5)
    expect(s.phi).toBeCloseTo(22)
    expect(s.gamma).toBeCloseTo(15)
  })
})

describe('splitHeightByGround', () => {
  test('fatia inteira no aterro: h_aterro = h, h_fundacao = 0', () => {
    const r = splitHeightByGround(0, 5, 1, undefined)
    expect(r.h_aterro).toBeCloseTo(4)
    expect(r.h_fundacao).toBeCloseTo(0)
  })

  test('fatia inteira na fundação: h_aterro = 0, h_fundacao = h', () => {
    const r = splitHeightByGround(0, -1, -5, undefined)
    expect(r.h_aterro).toBeCloseTo(0)
    expect(r.h_fundacao).toBeCloseTo(4)
  })

  test('fatia que cruza a superfície: soma das duas parcelas bate com h total', () => {
    const r = splitHeightByGround(0, 5, -3, undefined)
    expect(r.h_aterro).toBeCloseTo(5)
    expect(r.h_fundacao).toBeCloseTo(3)
    expect(r.h_aterro + r.h_fundacao).toBeCloseTo(8)
  })

  test('com terreno customizado, a divisão acompanha a superfície local', () => {
    const terrain: Point[] = [
      { x: -20, y: -5 },
      { x: 20, y: 5 },
    ]
    // em x=10, terreno está em y=2.5
    const r = splitHeightByGround(10, 5, 0, terrain)
    expect(r.h_aterro).toBeCloseTo(2.5) // 5 até 2.5
    expect(r.h_fundacao).toBeCloseTo(2.5) // 2.5 até 0
  })
})
