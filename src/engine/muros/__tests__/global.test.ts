import { describe, expect, test } from 'vitest'
import { bishopFS } from '../../bishop'
import { buildProfile } from '../../geometry'
import { soilAt } from '../../soil'
import type { FillMaterial, Layer, Point, SlopeGeometry } from '../../types'
import { lerMurosSecoes, modelarSecao, secaoCritica, type ModeloSecao } from '../entrada'
import { areaCentroide } from '../geometria2d'
import { buscarCirculoCritico, fsGlobalCirculo, grampoNoCirculo } from '../global'
import { soloDeAnalise, soloParaSecao, type SoloSecao } from '../solo'
import exemplo from './fixtures/EXEMPLO_muros_secoes.json'

// Mesmo talude da planilha (ver planilhaReferencia.test.ts)
const geo: SlopeGeometry = { bench_height: 8, slope_ratio: 1.5, berm_width: 2.5, total_height: 18.011, water_table_depth: 14.25 }
const layers: Layer[] = [
  { name: 'L1', y_top: 0, y_base: -1.5, c: 5, phi: 22, gamma: 15.0 },
  { name: 'L2', y_top: -1.5, y_base: -6.0, c: 6, phi: 23, gamma: 15.5 },
  { name: 'L3', y_top: -6.0, y_base: -13.0, c: 18, phi: 35, gamma: 19.0 },
  { name: 'L4', y_top: -13.0, y_base: -25, c: 0, phi: 39, gamma: 19.5 },
]
const fill: FillMaterial = { c: 8, phi: 25, gamma: 18 }

function modeloParametrico(corpos: Point[][] = [], grampos: [Point, Point][] = []): { modelo: ModeloSecao; solo: SoloSecao } {
  const sup = buildProfile(geo, 'aterro')
  return {
    modelo: {
      espelhado: false,
      zDatum: 0,
      superficie: sup,
      terreno: [{ x: -1000, y: 0 }, { x: 1000, y: 0 }],
      linhaProjeto: sup,
      corpos,
      grampos,
      peFace: { x: 0, y: 0 },
      yMin: 0,
      yMax: geo.total_height,
      avisos: [],
    },
    solo: {
      layers,
      fill,
      refTerrain: [{ x: -1000, y: 0 }, { x: 1000, y: 0 }],
      waterY: -geo.water_table_depth,
      gammaWater: 9.81,
      materialEm: (x, y) => soilAt(x, y, layers, fill, undefined, [{ x: -1000, y: 0 }, { x: 1000, y: 0 }]),
    },
  }
}

const CIRCULO = { xc: 2.5, yc: 34.5, R: 35.5 }

describe('Bishop em perfil livre', () => {
  test('sem muro, o perfil livre dá exatamente o FS do talude paramétrico', () => {
    const { modelo, solo } = modeloParametrico()
    const livre = fsGlobalCirculo(CIRCULO, modelo, solo, { corpoRigido: true, gamaCorpo: 25, n_fatias: 30 })
    const param = bishopFS(CIRCULO, geo, layers, fill, undefined, undefined, 30)
    expect(livre).not.toBeNull()
    expect(livre!.FS).toBeCloseTo(param!.FS, 10)
  })

  test('corpo do muro soma (γ_corpo − γ_solo) × área ao peso das fatias', () => {
    // bloco 2 × 2 m dentro da massa, no aterro (γ 18), trocado por concreto (γ 25)
    const bloco = [{ x: 14, y: 6 }, { x: 16, y: 6 }, { x: 16, y: 8 }, { x: 14, y: 8 }]
    const sem = modeloParametrico()
    const com = modeloParametrico([bloco])
    const op = { corpoRigido: false, gamaCorpo: 25, n_fatias: 30 }
    const r0 = fsGlobalCirculo(CIRCULO, sem.modelo, sem.solo, op)!
    const r1 = fsGlobalCirculo(CIRCULO, com.modelo, com.solo, op)!
    const dW = r1.slices.reduce((a, s) => a + s.W, 0) - r0.slices.reduce((a, s) => a + s.W, 0)
    // fatias de 1,32 m não coincidem com as bordas do bloco: tolerância de uma faixa de fatia
    expect(dW).toBeGreaterThan((25 - 18) * areaCentroide(bloco).area * 0.6)
    expect(dW).toBeLessThan((25 - 18) * areaCentroide(bloco).area * 1.4)
  })

  test('corpo rígido: círculo que atravessa o muro é descartado', () => {
    // bloco atravessado pelo arco do CIRCULO (arco passa por y≈0,3 em x=12)
    const bloco = [{ x: 11, y: -1 }, { x: 13, y: -1 }, { x: 13, y: 3 }, { x: 11, y: 3 }]
    const { modelo, solo } = modeloParametrico([bloco])
    expect(fsGlobalCirculo(CIRCULO, modelo, solo, { corpoRigido: true, gamaCorpo: 25, n_fatias: 30 })).toBeNull()
    expect(fsGlobalCirculo(CIRCULO, modelo, solo, { corpoRigido: false, gamaCorpo: 25, n_fatias: 30 })).not.toBeNull()
  })

  test('círculo que não passa sob o pé da face não conta como global do muro', () => {
    const { modelo, solo } = modeloParametrico()
    modelo.peFace = { x: 26.5, y: 16 } // pé da face na 2ª berma; o CIRCULO passa por cima dela? não — passa por baixo
    expect(fsGlobalCirculo(CIRCULO, modelo, solo, { corpoRigido: true, gamaCorpo: 25, n_fatias: 30 })).not.toBeNull()
    modelo.peFace = { x: -20, y: 0 } // fora do arco
    expect(fsGlobalCirculo(CIRCULO, modelo, solo, { corpoRigido: true, gamaCorpo: 25, n_fatias: 30 })).toBeNull()
  })
})

describe('grampos', () => {
  // círculo centro (0, 10), R = 10; grampo horizontal em y = 2, da face (x=−3) até x=8
  const circulo = { xc: 0, yc: 10, R: 10 }
  const grampo: [Point, Point] = [{ x: -3, y: 2 }, { x: 8, y: 2 }]

  test('comprimento além da superfície e força ancorada (conta à mão)', () => {
    // cruzamento: x² + (2−10)² = 100 → x = 6; Le = 8 − 6 = 2 m
    const r = grampoNoCirculo(grampo, circulo, { qs: 30, tBarra: 120, sh: 1.5 })
    expect(r.cruza).toBe(true)
    expect(r.ponto!.x).toBeCloseTo(6, 9)
    expect(r.Le).toBeCloseTo(2, 9)
    expect(r.T).toBeCloseTo((30 * 2) / 1.5, 9) // 40 kN/m
  })

  test('a força do grampo é limitada pela barra', () => {
    const r = grampoNoCirculo(grampo, circulo, { qs: 100, tBarra: 120, sh: 1.5 })
    expect(r.T).toBeCloseTo(120 / 1.5, 9)
  })

  test('grampo inteiro dentro da massa não ancora nada', () => {
    const r = grampoNoCirculo([{ x: -3, y: 2 }, { x: 4, y: 2 }], circulo, { qs: 30, tBarra: 120, sh: 1.5 })
    expect(r.cruza).toBe(false)
    expect(r.T).toBe(0)
  })

  test('grampos aumentam o FS (momento resistente T × braço / R)', () => {
    // talude da planilha com 3 grampos horizontais longos atravessando o círculo
    const grampos: [Point, Point][] = [4, 8, 12].map((y) => [{ x: 1.5 * y, y }, { x: 1.5 * y + 30, y }] as [Point, Point])
    const sem = modeloParametrico()
    const com = modeloParametrico([], grampos)
    const op = { corpoRigido: false, gamaCorpo: 25, n_fatias: 30, qs: 30, tBarra: 1e9, sh: 1.5 }
    const r0 = fsGlobalCirculo(CIRCULO, sem.modelo, sem.solo, op)!
    const r1 = fsGlobalCirculo(CIRCULO, com.modelo, com.solo, op)!
    expect(r1.grampos.every((g) => g.cruza)).toBe(true)
    // Bishop com termo extra: FS₁ = (Σnum(FS₁) + ΣT·braço/R)/ΣWsenα — conferido pela própria equação
    const sumWsin = r1.slices.reduce((a, s) => a + s.W * Math.sin(s.alpha_rad), 0)
    const extra = r1.grampos.reduce((a, g) => a + g.T * (CIRCULO.yc - g.ponto!.y), 0) / CIRCULO.R
    const num = r1.slices.reduce((a, s) => {
      const m = Math.cos(s.alpha_rad) + (Math.sin(s.alpha_rad) * Math.tan(s.phi_rad)) / r1.FS
      return a + (s.c * r1.b + (s.W - s.u * r1.b) * Math.tan(s.phi_rad)) / m
    }, 0)
    expect(r1.FS).toBeCloseTo((num + extra) / sumWsin, 5)
    expect(r1.FS).toBeGreaterThan(r0.FS)
  })
})

describe('busca do círculo crítico nos muros do exemplo', () => {
  const arq = lerMurosSecoes(exemplo).arquivo!
  const solo = soloDeAnalise('teste', {
    geometry: { toe_elevation: 87.5, water_table_depth: 10 },
    layers: [{ name: 'Argila siltosa', depth_top: 0, depth_base: 30, c: 15, phi: 27, gamma: 18 }],
    fill: { c: 10, phi: 28, gamma: 18 },
  })

  for (const id of ['M1', 'M2', 'M3']) {
    test(
      `${id}: acha um círculo crítico que envolve o muro, sem atravessar o corpo`,
      () => {
        const m = arq.muros.find((x) => x.id === id)!
        const sec = secaoCritica(m)
        const modelo = modelarSecao(m, sec)
        const ss = soloParaSecao(solo, modelo, m.condicao, sec.pe_face)
        const op = {
          corpoRigido: m.tipo !== 'grampeado',
          gamaCorpo: m.tipo === 'gabiao' ? 17 : 25,
          n_fatias: 30,
          qs: 30,
          tBarra: 120,
          sh: sec.dim.espacamento_h ?? 1.5,
        }
        const r = buscarCirculoCritico(modelo, (c) => fsGlobalCirculo(c, modelo, ss, op), { alturaMuro: sec.H })
        expect(r).not.toBeNull()
        expect(r!.FS).toBeGreaterThan(0.5)
        expect(r!.FS).toBeLessThan(5)
        expect(r!.x_left).toBeLessThanOrEqual(modelo.peFace.x)
        expect(r!.x_right).toBeGreaterThanOrEqual(modelo.peFace.x)
        // o crítico não pode ser pior que um círculo qualquer válido da busca
        expect(fsGlobalCirculo(r!.circle, modelo, ss, op)!.FS).toBeCloseTo(r!.FS, 9)
      },
      60_000
    )
  }
})
