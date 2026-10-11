import { describe, expect, test } from 'vitest'
import { lerMurosSecoes } from '../entrada'
import { diferencaCorpo, gerarCorpo } from '../geradores'
import exemplo from './fixtures/EXEMPLO_muros_secoes.json'

const arq = lerMurosSecoes(exemplo).arquivo!

describe('geradores replicam o pré-dimensionamento do ME-DYN-TALUDE v1.7.1', () => {
  for (const muro of arq.muros) {
    for (const secao of muro.secoes) {
      test(`${muro.id} (${muro.tipo}) s=${secao.s}: corpo, grampos e dim iguais ao arquivo (±2 mm)`, () => {
        const g = gerarCorpo(muro, secao, secao.H, arq.muros_tipos!)!
        expect(g).not.toBeNull()
        expect(diferencaCorpo(secao, g)).toBeLessThan(0.002)
        for (const [k, v] of Object.entries(secao.dim)) {
          expect((g.dim as Record<string, number>)[k], k).toBeCloseTo(v as number, 2)
        }
      })
    }
  }
})
