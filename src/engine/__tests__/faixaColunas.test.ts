import { describe, expect, test } from 'vitest'
import { bishopFS } from '../bishop'
import {
  alertasFaixa,
  circuloAtravessaFaixa,
  FAIXA_PADRAO,
  faixaParaMelhoria,
  fsComFaixa,
  pesDoTalude,
  razaoAreas,
} from '../argilaMole/faixaColunas'
import type { Layer, SlopeGeometry } from '../types'

const fill = { c: 8, phi: 25, gamma: 18 }
const cov = { type: 'grass' as const, depth: 1.5 }
const geo: SlopeGeometry = {
  bench_height: 3.5,
  slope_ratio: 1.5,
  berm_width: 0,
  berm_slope_pct: 0,
  total_height: 3.5,
  water_table_depth: 0.2,
  gamma_water: 9.81,
  analysis_condition: 'undrained',
  surcharge_q: 20,
}
const layers = (su: number): Layer[] => [
  { name: 'Argila', y_top: 0, y_base: -15, c: su, phi: 0, gamma: 15 },
  { name: 'Areia', y_top: -15, y_base: -18, c: 0, phi: 35, gamma: 19 },
]

describe('razão de áreas', () => {
  test('malha quadrada: m = π d² / 4 / s²', () => {
    expect(razaoAreas({ diametro: 0.8, malha: 2.5, arranjo: 'quadrado' })).toBeCloseTo((Math.PI * 0.64) / 4 / 6.25, 10)
    expect(razaoAreas({ diametro: 0.4, malha: 2, arranjo: 'quadrado' })).toBeCloseTo(0.0314, 3)
  })
  test('malha triangular tem célula menor (m maior) que a quadrada', () => {
    const q = razaoAreas({ diametro: 0.8, malha: 2.5, arranjo: 'quadrado' })
    const t = razaoAreas({ diametro: 0.8, malha: 2.5, arranjo: 'triangular' })
    expect(t).toBeGreaterThan(q)
  })
})

describe('solo composto no motor de fatias', () => {
  const circulo = { xc: 2, yc: 12, R: 22 }
  test('faixa de brita aumenta o FS do mesmo círculo', () => {
    const sem = bishopFS(circulo, geo, layers(14), fill, cov)!
    const f = { ...FAIXA_PADRAO, largura: 20 }
    const com = bishopFS(circulo, { ...geo, improvement: [faixaParaMelhoria(f)] }, layers(14), fill, cov)!
    expect(com.FS).toBeGreaterThan(sem.FS)
  })
  test('faixa fora do arco não muda nada', () => {
    const sem = bishopFS(circulo, geo, layers(14), fill, cov)!
    const longe = { ...FAIXA_PADRAO, frente: -200, largura: 5 } // x de 200 a 205
    const com = bishopFS(circulo, { ...geo, improvement: [faixaParaMelhoria(longe)] }, layers(14), fill, cov)!
    expect(com.FS).toBeCloseTo(sem.FS, 10)
  })
  test('razão de área zero equivale a sem tratamento', () => {
    const sem = bishopFS(circulo, geo, layers(14), fill, cov)!
    const z = { ...faixaParaMelhoria({ ...FAIXA_PADRAO, largura: 20 }), area_ratio: 0 }
    const com = bishopFS(circulo, { ...geo, improvement: [z] }, layers(14), fill, cov)!
    expect(com.FS).toBeCloseTo(sem.FS, 10)
  })
  test('mais colunas (m maior) dão mais resistência (CMC e brita)', () => {
    for (const tipo of ['brita', 'cmc'] as const) {
      const a = faixaParaMelhoria({ ...FAIXA_PADRAO, tipo, largura: 20, malha: 3 })
      const b = faixaParaMelhoria({ ...FAIXA_PADRAO, tipo, largura: 20, malha: 1.8 })
      const fa = bishopFS(circulo, { ...geo, improvement: [a] }, layers(14), fill, cov)!.FS
      const fb = bishopFS(circulo, { ...geo, improvement: [b] }, layers(14), fill, cov)!.FS
      expect(fb).toBeGreaterThan(fa)
    }
  })
})

describe('geogrelha (reforço horizontal)', () => {
  // círculo que cruza o nível do reforço dentro do trecho reforçado
  const circulo = { xc: 2, yc: 12, R: 22 }
  test('aumenta o FS quando cruzada, limitada pelo arrancamento', () => {
    const sem = bishopFS(circulo, geo, layers(14), fill, cov)!.FS
    const com = bishopFS(
      circulo,
      { ...geo, reinforcement: [{ y: 0.2, x_start: -3, x_end: 40, T: 200 }] },
      layers(14),
      fill,
      cov
    )!.FS
    expect(com).toBeGreaterThan(sem)
    const fraco = bishopFS(
      circulo,
      { ...geo, reinforcement: [{ y: 0.2, x_start: -3, x_end: 40, T: 20 }] },
      layers(14),
      fill,
      cov
    )!.FS
    expect(fraco).toBeLessThan(com)
    expect(fraco).toBeGreaterThan(sem)
  })
  test('reforço que não alcança o cruzamento não contribui', () => {
    const sem = bishopFS(circulo, geo, layers(14), fill, cov)!.FS
    const curto = bishopFS(
      circulo,
      { ...geo, reinforcement: [{ y: 0.2, x_start: -3, x_end: 5, T: 200 }] },
      layers(14),
      fill,
      cov
    )!.FS
    expect(curto).toBeCloseTo(sem, 10)
  })
})

describe('busca com a faixa', () => {
  test('FS com faixa larga ≥ FS sem tratamento, e alerta de recalque sempre presente', async () => {
    const sem = await fsComFaixa(geo, layers(14), fill, cov, undefined, null, null)
    const com = await fsComFaixa(geo, layers(14), fill, cov, undefined, { ...FAIXA_PADRAO, largura: 20 }, null)
    expect(com.FS).toBeGreaterThan(sem.FS)
    expect(alertasFaixa(layers(14), FAIXA_PADRAO).some((a) => /Recalque/.test(a.texto))).toBe(true)
  }, 120_000)
  test('alerta de su baixo para brita', () => {
    expect(alertasFaixa(layers(10), FAIXA_PADRAO).some((a) => /su mínimo/.test(a.texto))).toBe(true)
    expect(alertasFaixa(layers(25), FAIXA_PADRAO).some((a) => /su mínimo/.test(a.texto))).toBe(false)
  })
})

describe('posição da faixa em geometria com berma', () => {
  const geoBerma: SlopeGeometry = {
    bench_height: 1.75,
    slope_ratio: 5,
    berm_width: 30,
    total_height: 3.5,
    water_table_depth: 0.5,
    analysis_condition: 'undrained',
    surcharge_q: 20,
  }
  const camadas: Layer[] = [
    { name: 'Argila', y_top: 0, y_base: -15, c: 12, phi: 0, gamma: 15 },
    { name: 'Areia', y_top: -15, y_base: -18, c: 0, phi: 35, gamma: 19 },
  ]
  const local = { xc: 44.75, yc: 1.54, R: 11.51 } // mecanismo sob a bancada superior

  test('pés do talude: inferior e pé da bancada superior', () => {
    const pes = pesDoTalude(geoBerma)
    expect(pes[0]).toBeCloseTo(0, 6)
    expect(pes[1]).toBeCloseTo(1.75 * 5 + 30, 6)
  })
  test('faixa no pé inferior não altera o FS do mecanismo da bancada superior', () => {
    const sem = bishopFS(local, geoBerma, camadas, fill, cov)!.FS
    const f = { ...FAIXA_PADRAO, xRef: 0, largura: 10 }
    const com = bishopFS(local, { ...geoBerma, improvement: [faixaParaMelhoria(f)] }, camadas, fill, cov)!.FS
    expect(com).toBeCloseTo(sem, 10)
  })
  test('faixa no pé da bancada superior aumenta o FS desse mecanismo; malha mais fechada, mais ainda', () => {
    const pe2 = pesDoTalude(geoBerma)[1]
    const sem = bishopFS(local, geoBerma, camadas, fill, cov)!.FS
    const a = { ...FAIXA_PADRAO, xRef: pe2, largura: 12, malha: 3 }
    const b = { ...a, malha: 2 }
    const fa = bishopFS(local, { ...geoBerma, improvement: [faixaParaMelhoria(a)] }, camadas, fill, cov)!.FS
    const fb = bishopFS(local, { ...geoBerma, improvement: [faixaParaMelhoria(b)] }, camadas, fill, cov)!.FS
    expect(fa).toBeGreaterThan(sem)
    expect(fb).toBeGreaterThan(fa)
  })
  test('circuloAtravessaFaixa compara o arco com a faixa', () => {
    const r = bishopFS(local, geoBerma, camadas, fill, cov)!
    expect(circuloAtravessaFaixa(r, { ...FAIXA_PADRAO, xRef: 0 })).toBe(false)
    expect(circuloAtravessaFaixa(r, { ...FAIXA_PADRAO, xRef: pesDoTalude(geoBerma)[1] })).toBe(true)
  })
})
