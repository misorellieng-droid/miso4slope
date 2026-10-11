import { describe, expect, test } from 'vitest'
import { lerMurosSecoes } from '../entrada'
import { refazerTalude } from '../talude'
import exemplo from './fixtures/EXEMPLO_muros_secoes.json'

const arq = lerMurosSecoes(exemplo).arquivo!
const muro = (id: string) => arq.muros.find((m) => m.id === id)!

describe('talude refeito com outra inclinação', () => {
  test('com a inclinação atual, reproduz a linha do arquivo (±1 cm)', () => {
    for (const m of arq.muros) {
      for (const s of m.secoes) {
        const r = refazerTalude(m, s, m.talude_h_por_v)!
        expect(r, `${m.id} s=${s.s}`).not.toBeNull()
        expect(r.talude.length).toBe(s.talude.length)
        r.talude.forEach(([x, z], i) => {
          expect(Math.abs(x - s.talude[i][0]), `${m.id} s=${s.s} ponto ${i}`).toBeLessThan(0.01)
          expect(Math.abs(z - s.talude[i][1]), `${m.id} s=${s.s} ponto ${i}`).toBeLessThan(0.01)
        })
        expect(r.H).toBeCloseTo(s.H, 2)
      }
    }
  })

  test('M1 (concreto na crista, aterro): 1:2 leva o pé do aterro para fora e aumenta a terra', () => {
    const s = muro('M1').secoes[0]
    const r15 = refazerTalude(muro('M1'), s, 1.5)!
    const r20 = refazerTalude(muro('M1'), s, 2.0)!
    expect(r20.terminaNoPlato).toBe(false)
    expect(r20.H).toBeCloseTo(s.H, 9) // muro não muda
    const fim15 = r15.talude[r15.talude.length - 1]
    const fim20 = r20.talude[r20.talude.length - 1]
    expect(fim20[1]).toBeCloseTo(87.5, 6) // termina no terreno
    expect(fim20[0]).toBeGreaterThan(fim15[0])
    expect(r20.area).toBeGreaterThan(r15.area)
    // o trecho junto ao muro (da berma de 1 m para baixo) passa a ter 1:2
    const [a, b] = [r20.talude[3], r20.talude[4]]
    expect(Math.abs((b[0] - a[0]) / (b[1] - a[1]))).toBeCloseTo(2.0, 6)
  })

  test('M3 (grampeado no pé, corte): 1:1,5 acima do muro alcança o terreno mais longe, muro igual', () => {
    const s = muro('M3').secoes[0]
    const r = refazerTalude(muro('M3'), s, 1.5)!
    const fim = r.talude[r.talude.length - 1]
    expect(fim[1]).toBeCloseTo(113.55, 6)
    expect(fim[0]).toBeCloseTo(1.311 + 1.5 * (113.55 - 107.766), 3)
    expect(r.H).toBeCloseTo(s.H, 9)
  })

  test('M2 (gabião no pé, junto à divisa): platô e muro fixos — talude mais suave deixa o muro mais alto', () => {
    const s = muro('M2').secoes[0]
    const r = refazerTalude(muro('M2'), s, 2.0)!
    expect(r.terminaNoPlato).toBe(true)
    // talude de x = 0 a 11,2: desce 11,2/2 = 5,6 m → topo do muro em 94,4; H = 94,4 − 87,5 = 6,9
    expect(r.talude[1][1]).toBeCloseTo(94.4, 6)
    expect(r.H).toBeCloseTo(6.9, 6)
    expect(r.talude[0]).toEqual([0, 100])
  })
})
