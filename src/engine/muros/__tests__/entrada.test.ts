import { describe, expect, test } from 'vitest'
import { groundY } from '../../geometry'
import { doMotor, lerMurosSecoes, modelarSecao, paraMotor, secaoCritica } from '../entrada'
import { areaCentroide, dentroPoligono, segmentoCirculo } from '../geometria2d'
import { soloDeAnalise, soloParaSecao } from '../solo'
import exemplo from './fixtures/EXEMPLO_muros_secoes.json'

const leitura = lerMurosSecoes(exemplo)
const arq = leitura.arquivo!
const muro = (id: string) => arq.muros.find((m) => m.id === id)!

describe('leitura do _muros_secoes.json (exemplo ME-DYN-TALUDE v1.7.1)', () => {
  test('lê os 3 muros e as 9 seções sem erro', () => {
    expect(leitura.erros).toEqual([])
    expect(arq.plato).toBe('PLATO_EX')
    expect(arq.muros.map((m) => m.tipo)).toEqual(['concreto', 'gabiao', 'grampeado'])
    expect(arq.muros.reduce((a, m) => a + m.secoes.length, 0)).toBe(9)
    expect(arq.muros_tipos?.concreto?.base_fator).toBe(0.6)
  })

  test('seção crítica = maior H', () => {
    expect(secaoCritica(muro('M1')).s).toBe(150)
    expect(secaoCritica(muro('M2')).s).toBe(150)
    expect(secaoCritica(muro('M3')).s).toBe(155)
  })

  test('rejeita muro de tipo desconhecido e seção sem talude, mantendo os demais', () => {
    const r = lerMurosSecoes({
      versao: 1,
      plato: 'X',
      muros: [{ id: 'A', tipo: 'pedra', secoes: [] }, { ...exemplo.muros[0], secoes: [{ ...exemplo.muros[0].secoes[0], talude: [] }, exemplo.muros[0].secoes[1]] }],
    })
    expect(r.erros.length).toBe(2)
    expect(r.arquivo!.muros.length).toBe(1)
    expect(r.arquivo!.muros[0].secoes.length).toBe(1)
  })
})

describe('modelo da seção no referencial do motor', () => {
  test('aterro (lado aberto "fora") espelha; corte (lado aberto "plato") não', () => {
    const m1 = modelarSecao(muro('M1'), secaoCritica(muro('M1')))
    const m3 = modelarSecao(muro('M3'), secaoCritica(muro('M3')))
    expect(m1.espelhado).toBe(true)
    expect(m3.espelhado).toBe(false)
    expect(m1.avisos).toEqual([])
    expect(m3.avisos).toEqual([])
  })

  test('o lado alto fica à direita e a superfície tem x crescente', () => {
    for (const m of arq.muros) {
      for (const s of m.secoes) {
        const mod = modelarSecao(m, s)
        const sup = mod.superficie
        expect(sup[0].y).toBeLessThan(sup[sup.length - 1].y)
        for (let i = 1; i < sup.length; i++) expect(sup[i].x).toBeGreaterThanOrEqual(sup[i - 1].x)
        expect(Math.min(...sup.map((p) => p.y))).toBeCloseTo(0, 6) // zDatum = menor cota
      }
    }
  })

  test('ida e volta entre o arquivo e o motor', () => {
    const mod = modelarSecao(muro('M1'), secaoCritica(muro('M1')))
    const [x, z] = doMotor(mod, paraMotor(mod, [3.356, 91.8]))
    expect(x).toBeCloseTo(3.356, 9)
    expect(z).toBeCloseTo(91.8, 9)
  })

  test('gabião M2 s=150: a última caixa (topo 93,0) sobe acima do terrapleno (92,533) e vira superfície', () => {
    const mod = modelarSecao(muro('M2'), secaoCritica(muro('M2')))
    const p = paraMotor(mod, [12.0, 0]) // x=12,0 está sobre a caixa do topo (11,51 a 12,51)
    expect(groundY(p.x, mod.superficie) + mod.zDatum).toBeCloseTo(93.0, 6)
    const q = paraMotor(mod, [10.0, 0]) // sobre o talude 1:1,5, acima das caixas
    expect(groundY(q.x, mod.superficie) + mod.zDatum).toBeCloseTo(100 - 10 / 1.5, 3)
  })

  test('concreto M1 s=150: no topo da parede a superfície é a cota do platô e o pé da face fica em 93,164', () => {
    const mod = modelarSecao(muro('M1'), secaoCritica(muro('M1')))
    expect(groundY(paraMotor(mod, [0.2, 0]).x, mod.superficie) + mod.zDatum).toBeCloseTo(100, 6)
    expect(groundY(paraMotor(mod, [1.0, 0]).x, mod.superficie) + mod.zDatum).toBeCloseTo(93.164, 6)
    expect(mod.peFace.y + mod.zDatum).toBeCloseTo(93.164, 9)
  })
})

describe('geometria 2D', () => {
  test('área e centroide do corpo do muro de concreto M1 s=150 (sapata + parede)', () => {
    const poly = secaoCritica(muro('M1')).corpo[0].map(([x, y]) => ({ x, y }))
    const { area } = areaCentroide(poly)
    // sapata 4,102 × 0,684 + parede trapezoidal (0,3 no topo, 0,684 na base) × 7,336
    const esperado = 4.102 * 0.684 + ((0.3 + 0.684) / 2) * (100 - 92.664)
    expect(area).toBeCloseTo(esperado, 2)
    expect(dentroPoligono(0, 95, poly)).toBe(true) // na parede
    expect(dentroPoligono(-1, 95, poly)).toBe(false) // aterro atrás da parede
  })

  test('interseção segmento × círculo', () => {
    const ts = segmentoCirculo({ x: -2, y: 0 }, { x: 2, y: 0 }, 0, 0, 1)
    expect(ts.map((t) => +t.toFixed(6))).toEqual([0.25, 0.75])
  })
})

describe('solo da seção', () => {
  test('camadas por cota relativa da análise vão para a cota do Civil 3D pela cota do pé', () => {
    const mod = modelarSecao(muro('M1'), secaoCritica(muro('M1')))
    const solo = soloDeAnalise('teste', {
      geometry: { toe_elevation: 87.5, water_table_depth: 2 },
      layers: [{ name: 'argila', y_top: 0, y_base: -5, c: 10, phi: 25, gamma: 17 }],
      fill: { c: 5, phi: 30, gamma: 19 },
    })
    const ss = soloParaSecao(solo, mod, 'aterro', secaoCritica(muro('M1')).pe_face)
    // zDatum da seção = 87,5 → camada fica em y 0 a −5; N.A. em 87,5 − 2 = 85,5 → y = −2
    expect(ss.layers[0].y_top).toBeCloseTo(0, 9)
    expect(ss.layers[0].y_base).toBeCloseTo(-5, 9)
    expect(ss.waterY).toBeCloseTo(-2, 9)
    // acima do terreno natural é aterro; abaixo, a camada
    expect(ss.materialEm(paraMotor(mod, [5, 90]).x, 90 - 87.5).gamma).toBe(19)
    expect(ss.materialEm(paraMotor(mod, [5, 86]).x, 86 - 87.5).gamma).toBe(17)
  })
})
