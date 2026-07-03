import { describe, expect, test } from 'vitest'
import { classifySoilFromDescription, convertSondagemToLayers, mockExtractSondagem } from '../sondagem'
import type { SondagemLayer } from '../types'

describe('classifySoilFromDescription', () => {
  test('substantivo "argila" antes de "areia" → coesivo', () => {
    expect(classifySoilFromDescription('argila arenosa, pouco siltosa, mole')).toBe('coesivo')
  })

  test('substantivo "areia" antes de "argila" → granular', () => {
    expect(classifySoilFromDescription('areia argilosa, medianamente compacta')).toBe('granular')
  })

  test('só "silte", sem areia → coesivo', () => {
    expect(classifySoilFromDescription('silte pouco arenoso, rijo')).toBe('coesivo')
  })

  test('só "areia", sem argila/silte → granular', () => {
    expect(classifySoilFromDescription('areia média, compacta')).toBe('granular')
  })

  test('nem areia nem argila/silte → assume coesivo (conservador)', () => {
    expect(classifySoilFromDescription('matacão de granito')).toBe('coesivo')
  })
})

describe('convertSondagemToLayers', () => {
  const sondagemLayers: SondagemLayer[] = [
    { depth_top: 0, depth_base: 7, description: 'Argila arenosa, mole', n_spt: 5, soil_class: 'coesivo' },
    { depth_top: 7, depth_base: 12, description: 'Areia siltosa, compacta', n_spt: 20, soil_class: 'granular' },
  ]

  test('converte profundidade da boca do furo para y relativo ao pé', () => {
    // boca do furo na cota 610, pé do talude na cota 604.989 (furo 5,011m acima do pé)
    const layers = convertSondagemToLayers(sondagemLayers, 610, 604.989)
    expect(layers[0].y_top).toBeCloseTo(610 - 0 - 604.989)
    expect(layers[0].y_base).toBeCloseTo(610 - 7 - 604.989)
    expect(layers[1].y_top).toBeCloseTo(610 - 7 - 604.989)
    expect(layers[1].y_base).toBeCloseTo(610 - 12 - 604.989)
  })

  test('calcula c\'/φ\'/γ pela correlação com N_SPT e preserva rastreabilidade', () => {
    const layers = convertSondagemToLayers(sondagemLayers, 610, 604.989)
    expect(layers[0].soil_class).toBe('coesivo')
    expect(layers[0].n_spt).toBe(5)
    expect(layers[0].c).toBeGreaterThan(0)
    expect(layers[1].soil_class).toBe('granular')
    expect(layers[1].c).toBe(0)
    expect(layers[1].phi).toBeGreaterThan(0)
  })
})

describe('mockExtractSondagem', () => {
  test('retorna camadas com N.A. e nota de origem rastreável', async () => {
    const result = await mockExtractSondagem()
    expect(result.layers.length).toBeGreaterThan(0)
    expect(result.water_table_depth).toBeGreaterThan(0)
    expect(result.source_note.toLowerCase()).toContain('simulada')
    for (const layer of result.layers) {
      expect(layer.depth_base).toBeGreaterThan(layer.depth_top)
      expect(['granular', 'coesivo']).toContain(layer.soil_class)
    }
  })
})
