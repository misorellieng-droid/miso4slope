import { describe, expect, test } from 'vitest'
import { analisarMSE, dimensionarMSE, MSE_PADRAO } from '../argilaMole/soloReforcado'
import type { Layer, SlopeGeometry } from '../types'

const fill = { c: 0, phi: 30, gamma: 18 }
const cov = undefined
const geo = (H: number, q: number): SlopeGeometry => ({
  bench_height: H,
  slope_ratio: 1,
  berm_width: 0,
  total_height: H,
  water_table_depth: 20,
  surcharge_q: q,
})
const areia: Layer[] = [{ name: 'Areia compacta', y_top: 0, y_base: -20, c: 0, phi: 35, gamma: 19 }]
const argilaMole = (su: number): Layer[] => [
  { name: 'Argila mole', y_top: 0, y_base: -12, c: su, phi: 0, gamma: 15 },
  { name: 'Areia', y_top: -12, y_base: -20, c: 0, phi: 35, gamma: 19 },
]

describe('estabilidade interna', () => {
  test('Tmax = Ka·σv·Sv na camada mais funda', () => {
    const r = dimensionarMSE(5, 10, fill, areia, { ...MSE_PADRAO, espacamento: 0.5 })
    const Ka = 1 / 3
    const fundo = r.camadas[0]
    expect(fundo.h).toBeCloseTo(0.25, 6)
    expect(fundo.sigmaV).toBeCloseTo(18 * 4.75 + 10, 6)
    expect(fundo.Tmax).toBeCloseTo(Ka * (18 * 4.75 + 10) * 0.5, 6)
    expect(r.camadas.length).toBe(10)
  })
  test('Tult automático cobre a necessidade e FS de ruptura ≥ 1', () => {
    const r = dimensionarMSE(5, 10, fill, areia, MSE_PADRAO)
    expect(r.tultAdotado).toBeGreaterThanOrEqual(r.tultNecessario)
    expect(Math.min(...r.camadas.map((c) => c.fsRup))).toBeGreaterThanOrEqual(1 - 1e-9)
  })
  test('comprimento maior aumenta o arrancamento; tult informado vale', () => {
    const curto = dimensionarMSE(5, 10, fill, areia, { ...MSE_PADRAO, comprimento: 2.5 })
    const longo = dimensionarMSE(5, 10, fill, areia, { ...MSE_PADRAO, comprimento: 5 })
    const f = (r: typeof curto) => Math.min(...r.camadas.map((c) => c.fsArranc))
    expect(f(longo)).toBeGreaterThan(f(curto))
    expect(dimensionarMSE(5, 10, fill, areia, { ...MSE_PADRAO, tult: 80 }).tultAdotado).toBe(80)
  })
  test('comprimento automático = 0,7 H (mín. 2 m)', () => {
    expect(dimensionarMSE(5, 0, fill, areia, MSE_PADRAO).L).toBeCloseTo(3.5, 6)
    expect(dimensionarMSE(2, 0, fill, areia, MSE_PADRAO).L).toBe(2)
  })
})

describe('estabilidade externa em qualquer fundação', () => {
  test('argila mole: capacidade de carga = 5,14 su + q0 e falha para muro alto', () => {
    const r = dimensionarMSE(5, 20, fill, argilaMole(14), MSE_PADRAO)
    expect(r.externa.fundacao.nome).toBe('Argila mole')
    expect(r.externa.qult).toBeCloseTo(5.14 * 14 + 15 * 0.5, 6)
    expect(r.externa.fsCap).toBeLessThan(3)
  })
  test('areia compacta: capacidade de carga alta e FS externos atendem', () => {
    const r = dimensionarMSE(5, 10, fill, areia, MSE_PADRAO)
    expect(r.externa.fundacao.phi).toBe(35)
    expect(r.externa.fsCap).toBeGreaterThan(3)
    expect(r.externa.fsDesl).toBeGreaterThan(1.5)
    expect(r.externa.fsTomb).toBeGreaterThan(2)
  })
  test('embutimento na camada certa: base abaixo do topo da areia usa a areia', () => {
    const r = dimensionarMSE(4, 0, fill, argilaMole(14), { ...MSE_PADRAO, embutimento: 13 })
    expect(r.externa.fundacao.nome).toBe('Areia')
  })
})

describe('estabilidade global com os reforços', () => {
  test('fundação competente: reforço não reduz o FS e o resultado é consistente', async () => {
    const r = await analisarMSE(geo(5, 10), areia, fill, cov, MSE_PADRAO)
    expect(r.fsGlobal).toBeGreaterThanOrEqual(r.fs0 - 1e-6)
    expect(r.camadas.length).toBeGreaterThan(5)
    expect(r.avisos.length).toBeGreaterThan(0)
  }, 300_000)
  test('fundação em argila mole: avisa que a fundação/global não atende', async () => {
    const r = await analisarMSE(geo(5, 20), argilaMole(14), fill, cov, MSE_PADRAO)
    expect(r.avisos.some((a) => a.nivel === 'erro')).toBe(true)
  }, 300_000)
})
