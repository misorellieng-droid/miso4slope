import { describe, expect, test } from 'vitest'
import { bishopFS, iterateBishop } from '../bishop'
import type { FillMaterial, Layer, SlopeGeometry } from '../types'

// Reprodução da planilha Estabilidade_Talude_Modelo_1.xlsx (MISORELLI SISTEMA /
// 11. MISO4SLOPE): talude 1:1,5 com bermas, 18,011 m, círculo de tentativa
// fixo (aba Circulo) e 30 fatias (aba Fatias). FS da planilha, já convergido:
// 1,18904. Diferente do teste de busca (bishop.test.ts), aqui o círculo é o
// mesmo da planilha — serve de trava para qualquer mudança no motor (perfil
// livre, muro, grampos).

const geo: SlopeGeometry = {
  bench_height: 8,
  slope_ratio: 1.5,
  berm_width: 2.5,
  total_height: 18.011,
  water_table_depth: 14.25,
  gamma_water: 9.81,
}

const layers: Layer[] = [
  { name: 'Argila siltosa/arenosa, muito mole a mole', y_top: 0, y_base: -1.5, c: 5, phi: 22, gamma: 15.0 },
  { name: 'Argila porosa arenosa, mole', y_top: -1.5, y_base: -6.0, c: 6, phi: 23, gamma: 15.5 },
  { name: 'Argila muito siltosa, rija a dura', y_top: -6.0, y_base: -13.0, c: 18, phi: 35, gamma: 19.0 },
  { name: 'Areia média, compacta', y_top: -13.0, y_base: -16.51, c: 0, phi: 39, gamma: 19.5 },
  { name: 'Argila siltosa, pouco arenosa', y_top: -16.51, y_base: -17.15, c: 10, phi: 32, gamma: 18.0 },
  { name: 'Areia média, med. compacta a compacta', y_top: -17.15, y_base: -25.0, c: 0, phi: 33, gamma: 18.5 },
]

const fill: FillMaterial = { c: 8, phi: 25, gamma: 18 }

const FS_PLANILHA = 1.18904

// Aba Fatias, linhas 6–35: [c', φ', W, α (rad), u] de cada uma das 30 fatias,
// largura b = (x_direita − x_esquerda)/30 = (33,9 + 5,8)/30.
const B_PLANILHA = 1.32333333333333
const FATIAS_PLANILHA: [number, number, number, number, number][] = [
  [5, 22, 3.345003, -0.21686, 0],
  [5, 22, 8.611042, -0.178839, 0],
  [5, 22, 12.849065, -0.141078, 0],
  [5, 22, 16.077722, -0.103518, 0],
  [5, 22, 20.362082, -0.066104, 0],
  [5, 22, 39.121394, -0.028783, 0],
  [5, 22, 56.899946, 0.008498, 0],
  [5, 22, 73.698854, 0.045791, 0],
  [5, 22, 89.515131, 0.083147, 0],
  [5, 22, 104.341633, 0.120621, 0],
  [5, 22, 118.166899, 0.158266, 0],
  [5, 22, 130.974908, 0.196138, 0],
  [5, 22, 142.744714, 0.234297, 0],
  [8, 25, 183.107756, 0.272808, 0],
  [8, 25, 173.623161, 0.311738, 0],
  [8, 25, 166.1363, 0.351164, 0],
  [8, 25, 174.882409, 0.391167, 0],
  [8, 25, 182.140159, 0.431842, 0],
  [8, 25, 187.827941, 0.473295, 0],
  [8, 25, 191.847637, 0.515648, 0],
  [8, 25, 194.080621, 0.559044, 0],
  [8, 25, 194.382298, 0.603652, 0],
  [8, 25, 192.574464, 0.649677, 0],
  [8, 25, 188.434333, 0.697373, 0],
  [8, 25, 179.746214, 0.747059, 0],
  [8, 25, 148.990227, 0.799146, 0],
  [8, 25, 119.014251, 0.854188, 0],
  [8, 25, 101.619446, 0.912956, 0],
  [8, 25, 79.037996, 0.976587, 0],
  [8, 25, 30.266679, 1.046884, 0],
]

describe('planilha Estabilidade_Talude_Modelo — círculo fixo, 30 fatias', () => {
  test('núcleo do Bishop: com as fatias da planilha, FS = 1,18904', () => {
    const raw = FATIAS_PLANILHA.map(([c, phi, W, alpha_rad, u]) => ({
      c,
      phi_rad: (phi * Math.PI) / 180,
      W,
      alpha_rad,
      u,
    }))
    const r = iterateBishop(raw, B_PLANILHA)
    expect(r).not.toBeNull()
    expect(r!.converged).toBe(true)
    expect(r!.FS).toBeCloseTo(FS_PLANILHA, 4)
  })

  // O motor completo dá um FS um pouco maior que a planilha com o mesmo
  // círculo, por dois refinamentos de método (não é erro):
  // 1. a planilha usa o γ do material da BASE da fatia na altura inteira
  //    (Fatias!M6); o motor integra o peso camada por camada — nas fatias
  //    perto do pé, com aterro (γ 18) sobre argila mole (γ 15), a planilha
  //    subestima o peso;
  // 2. a planilha usa x de entrada/saída digitados (−5,8 e 33,9); o motor acha
  //    o cruzamento exato do círculo com o perfil.
  test('motor completo: mesmo círculo fica a menos de 4% da planilha', () => {
    const r = bishopFS({ xc: 2.5, yc: 34.5, R: 35.5 }, geo, layers, fill, undefined, undefined, 30)
    expect(r).not.toBeNull()
    expect(r!.converged).toBe(true)
    expect(Math.abs(r!.FS - FS_PLANILHA) / FS_PLANILHA).toBeLessThan(0.04)
  })
})
