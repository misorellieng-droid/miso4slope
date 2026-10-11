import { describe, expect, test } from 'vitest'
import { lerMurosSecoes, modelarSecao, secaoCritica } from '../entrada'
import { buscarCirculoCritico, fsGlobalCirculo, type ResultadoGlobal } from '../global'
import { verificarGrampeado } from '../grampeado'
import { soloDeAnalise, soloParaSecao, type SoloMuro } from '../solo'
import { PARAMETROS_PADRAO, type MuroEntrada, type SecaoEntrada } from '../tipos'
import exemplo from './fixtures/EXEMPLO_muros_secoes.json'

const AREIA: SoloMuro = {
  fonte: 'areia',
  layers: [{ name: 'Areia', depth_top: 0, depth_base: 50, c: 0, phi: 30, gamma: 18 }],
  refCota: null,
  naProfundidade: null,
  naCota: null,
  fill: null,
  gammaWater: 9.81,
  avisos: [],
}

describe('arrancamento por linha de grampos — conta à mão', () => {
  // Corte vertical de 6 m em areia (φ 30°), terreno horizontal no topo (β = 0),
  // lado aberto para x < 0 (corte: não espelha). 4 linhas de grampos de 5 m.
  const grampos = [0.75, 2.25, 3.75, 5.25].map((z) => [[0, z], [5, z]] as [[number, number], [number, number]])
  const secao: SecaoEntrada = {
    s: 0,
    H: 6,
    talude: [[0, 0], [0.001, 0], [0.002, 6], [20, 6]],
    terreno: [[-20, 6], [40, 6]],
    corpo: [[[0, 0], [0, 6], [-0.1, 6], [-0.1, 0]]],
    grampos,
    dim: { H: 6, espacamento_h: 1.5, espacamento_v: 1.5 },
    pe_face: [0.001, 0],
  }
  const muro: MuroEntrada = {
    id: 'G',
    tipo: 'grampeado',
    condicao: 'corte',
    posicao: 'pe',
    junto: 'plato',
    talude_h_por_v: 1,
    face_h_por_v: 0,
    espessura: 0.1,
    lado_aberto: 'plato',
    secoes: [secao],
  }
  const modelo = modelarSecao(muro, secao)
  const solo = soloParaSecao(AREIA, modelo, 'corte', secao.pe_face)

  // superfície crítica fictícia: os 4 grampos ficam com Le = 4, 3, 2 e 0 m
  const critico = {
    circle: { xc: 0, yc: 0, R: 1000 }, // contém as cabeças: grampo que não cruza fica inteiro dentro da massa
    grampos: [
      { cruza: true, Le: 4, T: 0, ponto: null },
      { cruza: true, Le: 3, T: 0, ponto: null },
      { cruza: true, Le: 2, T: 0, ponto: null },
      { cruza: false, Le: 0, T: 0, ponto: null },
    ],
  } as unknown as ResultadoGlobal

  // T_max = 0,75 · (1/3) · 18 · 6 · 1,5 · 1,5 = 60,75 kN por grampo
  // R_p = 30 · Le → FS = 120/60,75 = 1,975; 90/60,75 = 1,481; 60/60,75 = 0,988; 0
  const r = verificarGrampeado(secao, modelo, solo, PARAMETROS_PADRAO, critico)

  test('Ka e T_max', () => {
    expect(r.Ka).toBeCloseTo(1 / 3, 6)
    expect(r.linhas[0].Tmax).toBeCloseTo(60.75, 6)
  })
  test('FS de arrancamento por linha (linha 1 = a mais baixa)', () => {
    expect(r.linhas.map((l) => +l.fs_arrancamento.toFixed(3))).toEqual([1.975, 1.481, 0.988, 0])
    expect(r.linhas.map((l) => l.ok)).toEqual([false, false, false, false])
    expect(r.fs_arrancamento_min).toBe(0)
    expect(r.linhas[0].zCabeca).toBeCloseTo(0.75, 9)
  })
})

describe('grampeado M3 do exemplo', () => {
  test(
    'arrancamento com a superfície crítica global real',
    () => {
      const arq = lerMurosSecoes(exemplo).arquivo!
      const m = arq.muros.find((x) => x.id === 'M3')!
      const sec = secaoCritica(m)
      const modelo = modelarSecao(m, sec)
      const solo = soloDeAnalise('t', {
        geometry: { toe_elevation: 100, water_table_depth: 20 },
        layers: [{ name: 'Argila', depth_top: 0, depth_base: 40, c: 15, phi: 27, gamma: 18 }],
        fill: { c: 10, phi: 28, gamma: 18 },
      })
      const ss = soloParaSecao(solo, modelo, 'corte', sec.pe_face)
      const op = { corpoRigido: false, gamaCorpo: 25, n_fatias: 30, qs: 30, tBarra: 120, sh: 1.5 }
      const g = buscarCirculoCritico(modelo, (c) => fsGlobalCirculo(c, modelo, ss, op), { alturaMuro: sec.H })!
      const r = verificarGrampeado(sec, modelo, ss, PARAMETROS_PADRAO, g)
      expect(r.linhas.length).toBe(5)
      // grampos de baixo ancoram mais (a superfície sai no pé e sobe para trás)
      expect(r.linhas[0].Le).toBeGreaterThan(r.linhas[4].Le)
      expect(r.beta).toBeGreaterThan(20) // talude 1:1 acima
    },
    60_000
  )
})
