import { describe, expect, test } from 'vitest'
import { parseSondagemJson } from '../sondagemJson'

const json = JSON.stringify({
  schema: 'miso-spt/1',
  furos: [
    {
      id: 'SPT-201',
      pagina_pdf: 5,
      cota_boca: null,
      nivel_agua_m: 0.9,
      camadas: [
        { topo_m: 0, base_m: 0.1, descricao: 'Camada vegetal, verde', n_spt: 4 },
        { topo_m: 0.1, base_m: 4.5, descricao: 'Areia-argilosa, média' },
        { topo_m: 4.5, base_m: 5.7, descricao: 'Argila pouco arenosa, cinza', tipo: 'coesivo' },
      ],
      spt: [
        { prof_m: 1, n_spt: 4 }, { prof_m: 2, n_spt: 5 }, { prof_m: 3, n_spt: 6 }, { prof_m: 4, n_spt: 4 },
        { prof_m: 5, n_spt: 2 },
      ],
    },
  ],
})

describe('parseSondagemJson', () => {
  test('lê camadas, N.A. e calcula N médio por camada', () => {
    const { furos, erros } = parseSondagemJson(json)
    expect(erros).toEqual([])
    const f = furos[0]
    expect(f.identifier).toBe('SPT-201')
    expect(f.extraction.water_table_depth).toBe(0.9)
    expect(f.extraction.layers[1].n_spt).toBe(5) // média de 4,5,6,4 = 4,75 → 5
    expect(f.extraction.layers[1].soil_class).toBe('granular')
    expect(f.extraction.layers[2].n_spt).toBe(2)
    expect(f.cotaBoca).toBeNull()
  })
  test('JSON inválido ou schema errado gera erro', () => {
    expect(parseSondagemJson('{').erros.length).toBe(1)
    expect(parseSondagemJson('{"furos":[]}').erros.length).toBe(1)
  })
  test('camada sem N medido avisa', () => {
    const r = parseSondagemJson(JSON.stringify({ schema: 'miso-spt/1', furos: [{ id: 'A', camadas: [{ topo_m: 0, base_m: 1, descricao: 'areia' }] }] }))
    expect(r.furos[0].avisos.length).toBe(1)
  })
})
