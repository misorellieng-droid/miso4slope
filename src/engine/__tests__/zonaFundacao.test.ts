import { describe, expect, test } from 'vitest'
import { findCriticalCircle } from '../search'
import { bishopFS } from '../bishop'
import { ZONA_PADRAO, paramsNoPonto, contornaZona } from '../zonaFundacao'
import { comparar, suParaFsAlvo, varreduraDist } from '../zonaVarredura'
import type { EntradaAnalise } from '../zonaVarredura'
import type { FaceCoverage, FillMaterial, Layer, SlopeGeometry, ZonaFundacao } from '../types'

// Condição não drenada: aterro 3,5 m, talude 1:3 (pé em x = 10,5 m), q = 20 kPa na
// plataforma, aterro γ 18 / c' 8 / φ' 25, argila 15 m, γ 17, su 15 kPa, φ = 0.
// Valores esperados vêm de um código independente; tolerância de 3%.
const TOL = 0.03

const fill: FillMaterial = { c: 8, phi: 25, gamma: 18 }
const grass: FaceCoverage = { type: 'grass', depth: 1.5 }
const layers: Layer[] = [{ name: 'Argila mole', y_top: 0, y_base: -15, c: 15, phi: 0, gamma: 17 }]
const geo: SlopeGeometry = {
  bench_height: 3.5,
  slope_ratio: 3,
  berm_width: 0,
  total_height: 3.5,
  water_table_depth: 0.5,
  gamma_water: 9.81,
  analysis_condition: 'undrained',
  surcharge_q: 20,
}
const entrada: EntradaAnalise = { geo, layers, fill, coverage: grass, nSlices: 40, method: 'bishop' }
const zona = (p: Partial<ZonaFundacao>): ZonaFundacao => ({ ...ZONA_PADRAO, ativa: true, ...p })
const buscar = (z: ZonaFundacao) => findCriticalCircle({ ...geo, zona_fundacao: z }, layers, fill, grass)

const casos: { n: number; nome: string; esperado: number; z: Partial<ZonaFundacao> }[] = [
  { n: 1, nome: 'uniforme (sem tratamento)', esperado: 0.98, z: { sem_tratamento: true } },
  { n: 2, nome: 'A su 25, até o pé, 15 m', esperado: 1.35, z: { su_topo: 25 } },
  { n: 3, nome: 'A su 25, até o pé, 5 m', esperado: 1.04, z: { su_topo: 25, d_tr: 5 } },
  { n: 4, nome: 'A su 25, 10 m além do pé, 15 m', esperado: 1.46, z: { su_topo: 25, alem_pe: 10 } },
  { n: 5, nome: 'A su 40, até o pé, 15 m', esperado: 1.87, z: { su_topo: 40 } },
]

describe('fundação em duas zonas — casos de referência', () => {
  for (const c of casos) {
    test(`caso ${c.n}: ${c.nome} → FS ${c.esperado}`, async () => {
      const r = await buscar(zona(c.z))
      expect(Math.abs(r.FS - c.esperado) / c.esperado).toBeLessThanOrEqual(TOL)
      if (c.n >= 2) expect(r.x_saida!).toBeGreaterThan(10.5) // sai além da zona tratada
    }, 120_000)
  }
})

describe('regra de aplicação nas fatias', () => {
  const layer = layers[0]
  test('abrupta: A só em x ≤ x_lim e z ≤ d_tr', () => {
    const z = zona({ su_topo: 25, d_tr: 5 })
    expect(paramsNoPonto(z, layer, 10, 10.5, 3)).toMatchObject({ c: 25, wA: 1 })
    expect(paramsNoPonto(z, layer, 11, 10.5, 3)).toMatchObject({ c: 15, wA: 0 })
    expect(paramsNoPonto(z, layer, 10, 10.5, 6)).toMatchObject({ c: 15, wA: 0 })
  })
  test('gradual: interpola de x_lim a x_lim + L', () => {
    const z = zona({ su_topo: 25, transicao: 'gradual', L_trans: 10 })
    expect(paramsNoPonto(z, layer, 15.5, 10.5, 3).c).toBeCloseTo(20, 6)
    expect(paramsNoPonto(z, layer, 20.5, 10.5, 3).c).toBeCloseTo(15, 6)
  })
  test('pré-carga: su0 + r·q·B/(B+z)·U', () => {
    const z = zona({ modo: 'precarga', r: 0.25, U: 1, q_pre: 40, B: 20 })
    expect(paramsNoPonto(z, layer, 0, 10.5, 5).c).toBeCloseTo(15 + 0.25 * 40 * (20 / 25), 6)
  })
  test('gradiente na Zona A: su_topo + k·z', () => {
    const z = zona({ su_topo: 20, k: 2 })
    expect(paramsNoPonto(z, layer, 0, 10.5, 5).c).toBeCloseTo(30, 6)
  })
  test('sem tratamento, Zona A = Zona B', () => {
    const c = { xc: 4.5, yc: 12, R: 27 }
    const a = bishopFS(c, geo, layers, fill, grass)!
    const b = bishopFS(c, { ...geo, zona_fundacao: zona({ sem_tratamento: true, su_topo: 99 }) }, layers, fill, grass)!
    expect(b.FS).toBeCloseTo(a.FS, 9)
  })
})

describe('comparação e varreduras', () => {
  test('Comparar: ganho, saída e aviso de contorno', async () => {
    const z = zona({ su_topo: 25 })
    const r = await comparar(entrada, z)
    expect(r.com.FS).toBeGreaterThan(r.sem.FS)
    expect(r.ganho).toBeCloseTo(r.com.FS - r.sem.FS, 9)
    expect(r.contorna).toBe(true)
    expect(r.aviso).toMatch(/contorna a zona tratada/)
    expect(contornaZona(z, { ...geo, zona_fundacao: z }, { x_saida: 5, pct_zona_a: 80 })).toBe(false)
  }, 120_000)

  test('FS cresce com a distância além do pé', async () => {
    const v = await varreduraDist(entrada, zona({ su_topo: 25 }))
    expect(v.pontos.map((p) => p.x)).toEqual([0, 5, 10, 20])
    for (let i = 1; i < v.pontos.length; i++) expect(v.pontos[i].FS).toBeGreaterThanOrEqual(v.pontos[i - 1].FS - 0.02)
  }, 180_000)

  test('su necessário: alvo alcançável é confirmado; inalcançável avisa', async () => {
    const z = zona({ su_topo: 25 })
    const ok = await suParaFsAlvo(entrada, z, 1.3)
    expect(ok.atingido).toBe(true)
    expect(ok.fsFinal!).toBeGreaterThanOrEqual(1.3)
    const no = await suParaFsAlvo(entrada, z, 5)
    expect(no.atingido).toBe(false)
    expect(no.aviso).toMatch(/Zona B/)
  }, 300_000)
})
