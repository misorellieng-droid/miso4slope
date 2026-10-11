import { describe, expect, test } from 'vitest'
import { lerMurosSecoes } from '../entrada'
import { soloDeAnalise } from '../solo'
import { PARAMETROS_PADRAO } from '../tipos'
import { montarSaida, verificarMuro } from '../verificar'
import exemplo from './fixtures/EXEMPLO_muros_secoes.json'

const arq = lerMurosSecoes(exemplo).arquivo!
const solo = soloDeAnalise('teste', {
  geometry: { toe_elevation: 87.5, water_table_depth: 10 },
  layers: [{ name: 'Argila siltosa', depth_top: 0, depth_base: 40, c: 15, phi: 27, gamma: 18 }],
  fill: { c: 10, phi: 28, gamma: 18 },
})
// poucas inclinações para o teste não demorar
const params = { ...PARAMETROS_PADRAO, metodo_empuxo: 'coulomb' as const, inclinacoes_teste: [1.5, 2.0] }

describe('verificação de ponta a ponta → _muros_verificacao.json', () => {
  test(
    'M1 (concreto): todas as seções, seção crítica, sugestão com os nomes do ME-DYN-TALUDE',
    () => {
      const d = verificarMuro(arq.muros[0], solo, params, arq.muros_tipos)
      const s = d.saida
      expect(s.id).toBe('M1')
      expect(s.secoes.map((x) => x.s)).toEqual([150, 145, 155])
      expect(s.secao_critica).toBe(150) // maior H
      expect(Object.keys(s.fs).sort()).toEqual(['deslizamento', 'global', 'tombamento'])
      expect(s.ok).toBe(false) // deslizamento ≈ 1,0 < 1,5 com este solo
      // sugestão: inclinação testada + só os fatores que mudaram, com os nomes do Dynamo
      expect([1.5, 2.0]).toContain(s.sugestao.talude_h_por_v)
      const permitidos = ['base_fator', 'ponta_fator', 'sapata_esp_fator', 'parede_base_fator', 'embutimento']
      for (const k of Object.keys(s.sugestao.muros_tipos?.concreto ?? {})) expect(permitidos).toContain(k)
      expect(d.sugerida?.ok).toBe(true) // a sugestão é conferida com a busca completa
    },
    180_000
  )

  test('muro sem dados de solo sai com ok = false e aviso', () => {
    const d = verificarMuro(arq.muros[1], null, params, arq.muros_tipos)
    expect(d.semSolo).toBe(true)
    expect(d.saida.ok).toBe(false)
    expect(d.saida.fs.global).toBeNull()
    expect(d.saida.avisos[0]).toMatch(/Sem dados de solo/)
    const out = montarSaida(arq, [d])
    expect(out.versao).toBe(1)
    expect(out.plato).toBe('PLATO_EX')
    expect(JSON.parse(JSON.stringify(out)).muros[0].id).toBe('M2')
  })
})
