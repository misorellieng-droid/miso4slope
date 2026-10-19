import { describe, expect, test } from 'vitest'
import { FAIXA_PADRAO } from '../argilaMole/faixaColunas'
import { classeDaCamada, custoPorMetro, PREMISSAS_PADRAO as P, quantFaixa, quantMuro, quantSecaoConcreto, quantSecaoGabiao, quantSecaoGrampeado, sobreNasCamadas } from '../quantitativos'
import type { Layer, SlopeGeometry } from '../types'

const geo: SlopeGeometry = { bench_height: 3.5, slope_ratio: 1.5, berm_width: 0, berm_slope_pct: 0, total_height: 3.5, water_table_depth: 0.2, gamma_water: 9.81, analysis_condition: 'undrained', surcharge_q: 20 }
const layers: Layer[] = [
  { name: 'Argila', y_top: 0, y_base: -10, c: 12, phi: 0, gamma: 15 },
  { name: 'Areia', y_top: -10, y_base: -20, c: 0, phi: 35, gamma: 19 },
]
const get = (q: { itens: { cod: string; qtd: number; liquida: number }[] }, c: string) => q.itens.find((i) => i.cod === c)!

describe('quantitativos', () => {
  test('classe do solo', () => {
    expect(classeDaCamada({ c: 12, phi: 0 })).toBe('muito_mole')
    expect(classeDaCamada({ c: 20, phi: 0 })).toBe('mole')
    expect(classeDaCamada({ c: 40, phi: 0 })).toBe('firme')
    expect(classeDaCamada({ c: 0, phi: 35 })).toBe('granular')
  })
  test('sobreconsumo ponderado pelas camadas: 10 m de argila muito mole + 2 m de areia', () => {
    const { fator } = sobreNasCamadas(layers, 12, P)
    expect(fator).toBeCloseTo((10 * 0.3 + 2 * 0.05) / 12, 10)
  })
  test('faixa de brita: 0,8 m, malha 2,5 m, faixa 10 m, L 15,5 m', () => {
    const f = { ...FAIXA_PADRAO, tipo: 'brita' as const, diametro: 0.8, malha: 2.5, largura: 10, comprimento: 15.5 }
    const q = quantFaixa(f, { espessura: 0.8, T: 0 }, geo, layers, P)
    const nCol = 10 / 6.25 // 1,6 colunas/m
    expect(get(q, 'perf_col').qtd).toBeCloseTo(nCol * 15.5, 6)
    const liq = nCol * ((Math.PI * 0.64) / 4) * 15.5
    expect(get(q, 'brita_col').liquida).toBeCloseTo(liq, 6)
    expect(get(q, 'brita_col').qtd).toBeGreaterThan(liq)
    expect(q.itens.some((i) => i.cod === 'geotextil')).toBe(false)
    expect(q.itens.some((i) => i.cod === 'geogrelha')).toBe(false)
  })
  test('GEC tem geotêxtil e rígida tem concreto no lugar da brita', () => {
    const base = { ...FAIXA_PADRAO, diametro: 0.8, malha: 2.5, largura: 10 }
    const g = quantFaixa({ ...base, tipo: 'gec' }, { espessura: 0.8, T: 200 }, geo, layers, P)
    expect(get(g, 'geotextil').liquida).toBeCloseTo(1.6 * Math.PI * 0.8 * base.comprimento, 6)
    expect(g.itens.some((i) => i.cod === 'geogrelha')).toBe(true)
    const r = quantFaixa({ ...base, tipo: 'rigida' }, { espessura: 0.8, T: 200 }, geo, layers, P)
    expect(r.itens.some((i) => i.cod === 'concreto_estaca')).toBe(true)
    expect(r.itens.some((i) => i.cod === 'brita_col')).toBe(false)
  })
  test('GEC: sobreconsumo vem da expansão da meia, não do solo', () => {
    const f = { ...FAIXA_PADRAO, tipo: 'gec' as const, diametro: 0.8, malha: 2.5, largura: 10, eps_r: 2 }
    const q = quantFaixa(f, { espessura: 0.8, T: 0 }, geo, layers, P)
    expect(get(q, 'brita_col').qtd / get(q, 'brita_col').liquida - 1).toBeCloseTo(1.02 ** 2 - 1 + 0.03, 8)
  })
  test('muro de concreto', () => {
    const q = quantSecaoConcreto({ H: 3, base: 2.4, sapata: 0.4, parede_topo: 0.3, parede_base: 0.4, embutimento: 0.5 }, P)
    const vol = 2.4 * 0.4 + 0.35 * (3.5 - 0.4)
    expect(get(q, 'concreto').liquida).toBeCloseTo(vol, 6)
    expect(get(q, 'aco').qtd).toBeCloseTo(vol * 80, 6)
  })
  test('gabião: pedra = área trapezoidal', () => {
    const q = quantSecaoGabiao({ H: 3, embutimento: 0.5, base: 2.5, topo: 1, camadas: 4 }, P)
    expect(get(q, 'pedra').liquida).toBeCloseTo(((2.5 + 1) / 2) * 3.5, 6)
  })
  test('grampeado: grampos por metro × comprimento', () => {
    const q = quantSecaoGrampeado({ H: 6, face: 0.1, grampo: 6, linhas_grampos: 5, espacamento_h: 1.5, espacamento_v: 1.2, inclinacao: 15 }, P)
    expect(get(q, 'perf_grampo').qtd).toBeCloseTo((5 / 1.5) * 6, 6)
    expect(get(q, 'projetado').liquida).toBeCloseTo(0.6, 6)
  })
  test('integração ao longo do alinhamento', () => {
    const d = { H: 3, base: 2.4, sapata: 0.4, parede_topo: 0.3, parede_base: 0.4, embutimento: 0.5 }
    const um = quantMuro('concreto', [{ s: 0, dim: d }], P)!
    const dois = quantMuro('concreto', [{ s: 0, dim: d }, { s: 20, dim: d }], P)!
    expect(dois.comprimento).toBe(20)
    expect(dois.media.itens[0].qtd).toBeCloseTo(um.media.itens[0].qtd, 6)
    expect(dois.total.concreto).toBeCloseTo(um.media.itens[0].qtd * 20, 6)
  })
  test('custo só soma o que tem preço', () => {
    const q = quantSecaoGabiao({ H: 3, embutimento: 0.5, base: 2.5, topo: 1, camadas: 4 }, P)
    expect(custoPorMetro(q, {}).total).toBeNull()
    const c = custoPorMetro(q, { pedra: 100 })
    expect(c.total).toBeCloseTo(100 * get(q, 'pedra').qtd, 6)
    expect(c.completo).toBe(false)
    expect(c.faltam).toContain('tela_gabiao')
  })
})
