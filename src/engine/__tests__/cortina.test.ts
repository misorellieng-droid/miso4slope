import { describe, expect, test } from 'vitest'
import { bishopFS } from '../bishop'
import {
  analisarCortina,
  CORTINA_PADRAO,
  dimensionarCortina,
  geometriaFaceVertical,
} from '../argilaMole/cortina'
import type { Layer, SlopeGeometry } from '../types'

const fill = { c: 8, phi: 25, gamma: 18 }
const cov = { type: 'grass' as const, depth: 1.5 }
const geo: SlopeGeometry = {
  bench_height: 3.5,
  slope_ratio: 1.5,
  berm_width: 0,
  total_height: 3.5,
  water_table_depth: 0.2,
  analysis_condition: 'undrained',
  surcharge_q: 20,
}
const layers = (su: number): Layer[] => [
  { name: 'Argila', y_top: 0, y_base: -15, c: su, phi: 0, gamma: 15 },
  { name: 'Areia', y_top: -15, y_base: -18, c: 0, phi: 35, gamma: 19 },
]

describe('força da cortina no motor', () => {
  const g = geometriaFaceVertical(geo)
  const circulo = { xc: 2, yc: 12, R: 24 }
  test('aumenta o FS quando cruzada acima da ponta', () => {
    const sem = bishopFS(circulo, g, layers(14), fill, cov)!.FS
    const com = bishopFS(circulo, { ...g, curtains: [{ x: 0, T: 100, y_top: 3.5, y_tip: -18 }] }, layers(14), fill, cov)!.FS
    expect(com).toBeGreaterThan(sem)
  })
  test('não contribui se a ruptura passa abaixo da ponta', () => {
    const sem = bishopFS(circulo, g, layers(14), fill, cov)!.FS
    const com = bishopFS(circulo, { ...g, curtains: [{ x: 0, T: 100, y_top: 3.5, y_tip: -2 }] }, layers(14), fill, cov)!.FS
    expect(com).toBeCloseTo(sem, 10)
  })
})

describe('estática da estaca (viga apoiada no tirante e engastada)', () => {
  test('carga a meio vão: reação no tirante 5P/16 e momento de engaste 3PL/16', () => {
    // aterro sem empuxo (H=0, q=0), T = 100 kN/m aplicado a meio da viga
    const p = { ...CORTINA_PADRAO, espacamento: 1, ficha: 3, diametro: 0.5 }
    const baseArgila = -15
    const cotaEngaste = baseArgila - Math.min(2 * p.diametro, p.ficha)
    const L = p.cotaTirante - cotaEngaste
    const yCruz = p.cotaTirante - L / 2
    const e = dimensionarCortina(0, 0, fill, layers(14), p, 100, yCruz, -16)
    expect(e.Ftirante).toBeCloseTo((5 / 16) * 100, 6)
    expect(e.Mmax).toBeGreaterThanOrEqual((3 / 16) * 100 * L - 1e-6)
  })
  test('empuxo K0 > Ka', () => {
    const base = { ...CORTINA_PADRAO }
    const k0 = dimensionarCortina(3.5, 20, fill, layers(14), { ...base, empuxo: 'k0' }, 0, null, null)
    const ka = dimensionarCortina(3.5, 20, fill, layers(14), { ...base, empuxo: 'ka' }, 0, null, null)
    expect(k0.Ptotal).toBeGreaterThan(ka.Ptotal)
  })
})

describe('face contida', () => {
  const g = geometriaFaceVertical(geo)
  test('círculo que sai pela face acima do terreno é descartado quando há cortina', () => {
    const raso = { xc: 4, yc: 6, R: 5.5 } // sai pela face vertical, no aterro
    const sem = bishopFS(raso, g, layers(14), fill, cov)
    const com = bishopFS(raso, { ...g, curtains: [{ x: 0, T: 0, y_top: 3.5, y_tip: -18 }] }, layers(14), fill, cov)
    expect(sem).not.toBeNull()
    expect(com).toBeNull()
  })
})

describe('ficha necessária', () => {
  test('cresce com o esforço e satisfaz FS ≥ 2', () => {
    const p = { ...CORTINA_PADRAO }
    const e1 = dimensionarCortina(3.5, 20, fill, layers(14), p, 200, -15, -16)
    const e2 = dimensionarCortina(3.5, 20, fill, layers(14), p, 600, -15, -16)
    expect(e2.fichaNecessaria!).toBeGreaterThan(e1.fichaNecessaria!)
    const conf = dimensionarCortina(3.5, 20, fill, layers(14), { ...p, ficha: e2.fichaNecessaria! }, 600, -15, -16, false)
    expect(conf.fsFicha).toBeGreaterThanOrEqual(2)
  })
})

describe('fluxo completo', () => {
  test('T necessário leva o FS ao alvo; a cortina só é exigida quando o FS sem ela é menor', async () => {
    const r = await analisarCortina(geo, layers(14), fill, cov, CORTINA_PADRAO)
    expect(r.forca.fs0).toBeLessThan(CORTINA_PADRAO.fsAlvo)
    expect(r.forca.T).toBeGreaterThan(0)
    expect(r.forca.atingiu).toBe(true)
    expect(r.forca.fsFinal).toBeGreaterThanOrEqual(CORTINA_PADRAO.fsAlvo - 0.02)
    expect(r.avisos.length).toBeGreaterThan(0)
  }, 300_000)
  test('argila mais resistente pede menos T', async () => {
    const mole = await analisarCortina(geo, layers(14), fill, cov, CORTINA_PADRAO)
    const rija = await analisarCortina(geo, layers(20), fill, cov, CORTINA_PADRAO)
    expect(rija.forca.T).toBeLessThan(mole.forca.T)
  }, 300_000)
})
