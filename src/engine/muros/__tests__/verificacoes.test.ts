import { describe, expect, test } from 'vitest'
import { empuxoNoPlano, kaCoulomb, kaRankine, kpRankine } from '../empuxo'
import { modelarSecao } from '../entrada'
import { soloParaSecao, type SoloMuro } from '../solo'
import { PARAMETROS_PADRAO, type MuroEntrada, type SecaoEntrada, type XZ } from '../tipos'
import { verificarGravidade } from '../verificacoes'

// Areia φ' = 30°, c' = 0, γ = 18 kN/m³ — aterro e fundação iguais, sem N.A.
const AREIA: SoloMuro = {
  fonte: 'areia de teste',
  layers: [{ name: 'Areia', depth_top: 0, depth_base: 50, c: 0, phi: 30, gamma: 18 }],
  refCota: null,
  naProfundidade: null,
  naCota: null,
  fill: { c: 0, phi: 30, gamma: 18 },
  gammaWater: 9.81,
  avisos: [],
}

function muroDeTeste(tipo: 'concreto' | 'gabiao', secao: SecaoEntrada): MuroEntrada {
  return {
    id: 'T',
    tipo,
    condicao: 'aterro',
    posicao: 'pe',
    junto: 'plato',
    talude_h_por_v: 1.5,
    face_h_por_v: 0,
    espessura: 0.2,
    lado_aberto: 'fora',
    secoes: [secao],
  }
}

function rodar(tipo: 'concreto' | 'gabiao', secao: SecaoEntrada, params = PARAMETROS_PADRAO) {
  const muro = muroDeTeste(tipo, secao)
  const modelo = modelarSecao(muro, secao)
  const solo = soloParaSecao(AREIA, modelo, 'aterro', secao.pe_face)
  return verificarGravidade(tipo, secao, modelo, solo, params)
}

const terrenoPlano: XZ[] = [[-20, 0], [20, 0]]

describe('coeficientes de empuxo (valores de tabela)', () => {
  test('Rankine, terrapleno horizontal: Ka = tg²(45 − φ/2) = 1/3 para φ = 30°', () => {
    expect(kaRankine(30, 0)).toBeCloseTo(1 / 3, 10)
  })
  test('Rankine, β = 20°, φ = 30°: Ka = 0,4142 (Das, tabela 13.2)', () => {
    expect(kaRankine(30, 20)).toBeCloseTo(0.4142, 4)
  })
  test('Rankine indefinido para β > φ', () => {
    expect(kaRankine(30, 35)).toBeNaN()
  })
  test('Coulomb com δ = 0 e β = 0 coincide com Rankine', () => {
    expect(kaCoulomb(30, 0, 0, 0)).toBeCloseTo(1 / 3, 10)
  })
  test('Coulomb φ = 30°, δ = 20°, β = 0, paramento vertical: Ka = 0,2973 (Das, tabela 13.5)', () => {
    expect(kaCoulomb(30, 0, 20, 0)).toBeCloseTo(0.2973, 4)
  })
  test('Kp = 3 para φ = 30°', () => {
    expect(kpRankine(30)).toBeCloseTo(3, 10)
  })
  test('empuxo no plano: γ constante e sem água dá ½·K·γ·H² a H/3', () => {
    const r = empuxoNoPlano(3, 1 / 3, () => 18)
    expect(r.E).toBeCloseTo(27, 6)
    expect(r.zE).toBeCloseTo(1, 4) // integração por trechos (400): erro ~3e-6 m
  })
  test('empuxo no plano com N.A. na metade: γ\' abaixo do N.A. + água', () => {
    // H = 4, N.A. a 2 m da base, K = 1/3, γ = 18, γw = 10
    // σ'v(2) = 36; σ'v(4) = 36 + 8·2 = 52
    // E = K·[½·36·2 + (36 + 52)/2·2] = (36 + 88)/3 = 41,333; Uw = ½·10·2² = 20
    const r = empuxoNoPlano(4, 1 / 3, () => 18, 0, 2, 10)
    expect(r.E).toBeCloseTo(124 / 3, 6)
    expect(r.Uw).toBeCloseTo(20, 9)
  })
})

describe('muro de flexão de 3 m em areia (φ 30°, c 0) — Rankine conferido à mão', () => {
  // Geometria (lado aberto em +x): platô em z = 2,6; terreno em z = 0.
  // Sapata B = 2,0 × 0,4 (z −0,4 a 0), de x = −1,4 (fim do talão) a x = 0,6 (ponta).
  // Parede 0,2 × 2,6 (x −0,2 a 0). Altura total do plano virtual: Hv = 2,6 + 0,4 = 3,0 m.
  const secao: SecaoEntrada = {
    s: 0,
    H: 2.6,
    talude: [[-0.2, 2.6], [0, 2.6], [0.001, 0], [5, 0]],
    terreno: terrenoPlano,
    corpo: [[[0.6, -0.4], [0.6, 0], [0, 0], [0, 2.6], [-0.2, 2.6], [-0.2, 0], [-1.4, 0], [-1.4, -0.4]]],
    grampos: [],
    dim: {},
    pe_face: [0.001, 0],
  }
  const r = rodar('concreto', secao)

  // À mão (por metro), momentos em relação à ponta (x = 0,6):
  //   Ka = 1/3;  Ea = ½ · (1/3) · 18 · 3,0² = 27,00 kN/m, horizontal, a 1,00 m da base
  //   sapata 2,0·0,4·25 = 20,00 kN, braço 1,00 → 20,00 kN·m
  //   parede 0,2·2,6·25 = 13,00 kN, braço 0,70 →  9,10 kN·m
  //   solo sobre o talão 1,2·2,6·18 = 56,16 kN, braço 1,40 → 78,62 kN·m
  //   M_estab = 107,72;  M_instab = 27,00 · 1,00 = 27,00
  //   FS_tomb = 3,990
  //   ΣV = 89,16;  FS_desl = 89,16·tg(20°)/27 = 1,202
  //   d = (107,72 − 27,00)/89,16 = 0,9054;  e = 1,0 − 0,9054 = 0,0946 < B/6 = 0,333
  //   σmáx = 89,16/2 · (1 + 6·0,0946/2) = 57,23 kPa;  σmín = 31,93 kPa
  test('empuxo ativo', () => {
    expect(r.K).toBeCloseTo(1 / 3, 6)
    expect(r.Hv).toBeCloseTo(3.0, 6)
    expect(r.Ea).toBeCloseTo(27.0, 3)
    expect(r.Eh).toBeCloseTo(27.0, 3)
    expect(r.Ev).toBeCloseTo(0, 6)
    expect(r.zE).toBeCloseTo(1.0, 3)
  })
  test('pesos e momentos', () => {
    expect(r.B).toBeCloseTo(2.0, 9)
    expect(r.W_corpo).toBeCloseTo(33.0, 6)
    expect(r.W_solo).toBeCloseTo(56.16, 1)
    expect(r.M_estab).toBeCloseTo(107.72, 0)
  })
  test('tombamento, deslizamento e tensões na base', () => {
    expect(r.fs_tombamento).toBeCloseTo(3.99, 1)
    expect(r.fs_deslizamento).toBeCloseTo(1.202, 2)
    expect(r.excentricidade).toBeCloseTo(0.0946, 2)
    expect(r.sigma_max).toBeCloseTo(57.23, 0)
    expect(r.sigma_min).toBeCloseTo(31.93, 0)
    expect(r.sem_tracao).toBe(true)
    expect(r.ok_tombamento).toBe(true)
    expect(r.ok_deslizamento).toBe(false) // 1,20 < 1,5
    expect(r.ok).toBe(false)
  })
  test('passivo do embutimento (opcional) melhora o deslizamento', () => {
    // embutimento 0,4 m (topo da sapata no terreno): Ep = ½·3·18·0,4² = 4,32 kN/m
    const comPassivo = rodar('concreto', secao, { ...PARAMETROS_PADRAO, considerar_passivo: true })
    expect(comPassivo.Ep).toBeCloseTo(4.32, 6)
    expect(comPassivo.fs_deslizamento).toBeCloseTo((89.16 * Math.tan((20 * Math.PI) / 180) + 4.32) / 27, 2)
  })
  test('Coulomb (δ = 2/3·φ) no mesmo muro: Ka = 0,2973, empuxo inclinado de 20°', () => {
    const c = rodar('concreto', secao, { ...PARAMETROS_PADRAO, metodo_empuxo: 'coulomb' })
    expect(c.K).toBeCloseTo(0.2973, 4)
    expect(c.Ea).toBeCloseTo(0.5 * 0.2973 * 18 * 9, 1)
    expect(c.inclinacaoEmpuxo).toBeCloseTo(20, 9)
    expect(c.fs_tombamento).toBeGreaterThan(r.fs_tombamento)
  })
})

describe('gabião de 4 m em areia (φ 30°, c 0)', () => {
  // 4 caixas de 1 m, face vertical em x = 0 (lado aberto em +x), larguras
  // 2,5 / 2,0 / 1,5 / 1,0 m recuando do lado retido; platô em z = 4.
  const caixa = (x0: number, z0: number): XZ[] => [[0, z0], [x0, z0], [x0, z0 + 1], [0, z0 + 1]]
  const secao: SecaoEntrada = {
    s: 0,
    H: 4,
    talude: [[-2.5, 4], [0, 4], [0.001, 0], [5, 0]],
    terreno: terrenoPlano,
    corpo: [caixa(-2.5, 0), caixa(-2.0, 1), caixa(-1.5, 2), caixa(-1.0, 3)],
    grampos: [],
    dim: {},
    pe_face: [0.001, 0],
  }
  const r = rodar('gabiao', secao)

  // À mão, γ_gabião = 17, momentos em relação à ponta (x = 0):
  //   caixas: áreas 2,5 / 2,0 / 1,5 / 1,0 = 7,0 m² → W = 119,0 kN
  //           Σ A·u = 2,5·1,25 + 2,0·1,0 + 1,5·0,75 + 1,0·0,5 = 6,75 → 114,75 kN·m
  //   solo sobre os degraus (γ 18): 0,5·3 + 0,5·2 + 0,5·1 = 3,0 m² → 54,0 kN
  //           Σ A·u = 1,5·2,25 + 1,0·1,75 + 0,5·1,25 = 5,75 → 103,50 kN·m
  //   plano virtual em x = −2,5, Hv = 4: Ea = ½·(1/3)·18·16 = 48,0 kN/m a 4/3 m
  //   M_estab = 218,25; M_instab = 64,00 → FS_tomb = 3,410
  //   ΣV = 173,0 → FS_desl = 173·tg(20°)/48 = 1,312
  //   d = 154,25/173 = 0,8916; e = 1,25 − 0,8916 = 0,3584 < B/6 = 0,4167
  //   σmáx = 69,2·(1 + 6·0,3584/2,5) = 128,72 kPa; σmín = 9,68 kPa
  test('pesos, empuxo e verificações', () => {
    expect(r.B).toBeCloseTo(2.5, 9)
    expect(r.W_corpo).toBeCloseTo(119.0, 6)
    expect(r.W_solo).toBeCloseTo(54.0, 1)
    expect(r.Ea).toBeCloseTo(48.0, 3)
    expect(r.zE).toBeCloseTo(4 / 3, 3)
    expect(r.fs_tombamento).toBeCloseTo(3.41, 1)
    expect(r.fs_deslizamento).toBeCloseTo(1.312, 2)
    expect(r.excentricidade).toBeCloseTo(0.3584, 2)
    expect(r.sigma_max).toBeCloseTo(128.72, 0)
    expect(r.sigma_min).toBeCloseTo(9.68, 0)
    expect(r.sem_tracao).toBe(true)
  })

  test('terrapleno inclinado acima do gabião aumenta o empuxo', () => {
    // talude 1:2 subindo a partir do topo do muro (β ≈ 26,6°... limitado pela cunha)
    const inclinado: SecaoEntrada = { ...secao, talude: [[-20, 4 + 20 / 2], [-1.0, 4 + 1.0 / 2], [-0.0, 4], [0.001, 0], [5, 0]] }
    // talude fica em x crescente; a linha [-20, 14] → [-1, 4,5] → [0, 4] tem inclinação 1:2
    const ri = rodar('gabiao', inclinado)
    expect(ri.beta).toBeGreaterThan(10)
    expect(ri.Ea).toBeGreaterThan(r.Ea)
  })
})
