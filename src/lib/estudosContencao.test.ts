import { describe, expect, it } from 'vitest'
import { codificarJson, decodificarJson } from './estudosContencao'

describe('codificarJson / decodificarJson', () => {
  it('preserva Infinity e valores comuns após ida e volta pelo JSON', () => {
    const original = { FS: Infinity, neg: -Infinity, n: 1.5, lista: [1, Infinity, { x: 'a' }], nulo: null }
    const viaBanco = JSON.parse(JSON.stringify(codificarJson(original)))
    expect(decodificarJson<typeof original>(viaBanco)).toEqual(original)
  })

  it('não confunde objetos comuns com marcador', () => {
    const o = { a: { b: 2 }, c: 'Infinity' }
    expect(decodificarJson(codificarJson(o))).toEqual(o)
  })
})
