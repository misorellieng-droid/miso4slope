import { describe, expect, test } from 'vitest'
import {
  CONFIG_TRANSLACIONAL_PADRAO,
  analisarTranslacional,
  betaMaximo,
  fsTaludeInfinito,
  mCritico,
  zLimite,
} from '../translacional'
import type { ConfigTranslacional, Layer, SlopeGeometry } from '../types'

// exemplo da nota técnica: β = 30°, z = 2 m, γ = 18, γw = 10, c' = 5, φ' = 30°, sucção 20 kPa com φᵇ = 15°
const EX = { beta: 30, z: 2, gamma: 18, gamma_w: 10, c: 5, phi: 30 }

describe('fsTaludeInfinito', () => {
  test('exemplo da nota: seco com sucção, sem sucção, m = 0,5 e m = 1', () => {
    expect(fsTaludeInfinito({ ...EX, m: 0, succao: 20, phi_b: 15 }).FS).toBeCloseTo(1.6646, 3)
    expect(fsTaludeInfinito({ ...EX, m: 0 }).FS).toBeCloseTo(1.3208, 3)
    expect(fsTaludeInfinito({ ...EX, m: 0.5 }).FS).toBeCloseTo(1.043, 3)
    expect(fsTaludeInfinito({ ...EX, m: 1 }).FS).toBeCloseTo(0.7652, 3)
  })

  test('parcelas somam o FS e a sucção aparece separada', () => {
    const r = fsTaludeInfinito({ ...EX, m: 0, succao: 20, phi_b: 15 })
    expect(r.coesao).toBeCloseTo(0.3208, 3)
    expect(r.succao).toBeCloseTo(0.3438, 3)
    expect(r.atrito).toBeCloseTo(1, 6)
    expect(r.coesao + r.succao + r.atrito).toBeCloseTo(r.FS, 9)
  })

  test('granular seco: FS = tan φ / tan β, independente de z', () => {
    for (const z of [0.5, 2, 10]) {
      const r = fsTaludeInfinito({ beta: 25, z, gamma: 18, gamma_w: 10, c: 0, phi: 32, m: 0 })
      expect(r.FS).toBeCloseTo(Math.tan((32 * Math.PI) / 180) / Math.tan((25 * Math.PI) / 180), 9)
    }
  })

  test('fluxo paralelo pleno, granular: FS = (γ − γw)/γ · tan φ / tan β', () => {
    const r = fsTaludeInfinito({ beta: 20, z: 3, gamma: 20, gamma_w: 10, c: 0, phi: 30, m: 1 })
    expect(r.FS).toBeCloseTo(0.5 * (Math.tan(Math.PI / 6) / Math.tan((20 * Math.PI) / 180)), 9)
  })

  test('quanto mais espessa a camada, menor o peso da coesão', () => {
    const fino = fsTaludeInfinito({ ...EX, z: 1, m: 0 }).FS
    const grosso = fsTaludeInfinito({ ...EX, z: 4, m: 0 }).FS
    expect(fino).toBeGreaterThan(grosso)
  })
})

describe('grandezas de projeto', () => {
  test('m crítico do exemplo ≈ 0,58 e leva o FS a 1,0', () => {
    const m = mCritico(EX)
    expect(m).toBeCloseTo(0.5774, 3)
    expect(fsTaludeInfinito({ ...EX, m }).FS).toBeCloseTo(1, 9)
  })

  test('m crítico > 1 quando nem saturado rompe; < 0 quando já rompe seco', () => {
    expect(mCritico({ ...EX, beta: 15 })).toBeGreaterThan(1)
    expect(mCritico({ ...EX, beta: 45, c: 0 })).toBeLessThan(0)
  })

  test('espessura limite: β = 35°, φ = 30°, c = 5, γ = 18 → ≈ 3,37 m, e FS = 1 nessa espessura', () => {
    const z = zLimite({ beta: 35, gamma: 18, c: 5, phi: 30 })!
    expect(z).toBeCloseTo(3.37, 2)
    expect(fsTaludeInfinito({ beta: 35, z, gamma: 18, gamma_w: 10, c: 5, phi: 30, m: 0 }).FS).toBeCloseTo(1, 9)
  })

  test('sem espessura limite quando β ≤ φ', () => {
    expect(zLimite({ beta: 30, gamma: 18, c: 5, phi: 30 })).toBeNull()
  })

  test('β máximo granular seco para FS 1,5: tan β = tan 30° / 1,5 → 21,0°', () => {
    const b = betaMaximo({ z: 2, gamma: 18, gamma_w: 10, c: 0, phi: 30, m: 0 }, 1.5)
    expect(b).toBeCloseTo(21.0, 1)
  })

  test('β máximo null quando reprova até quase plano', () => {
    expect(betaMaximo({ z: 2, gamma: 18, gamma_w: 10, c: 0, phi: 0.5, m: 1 }, 1.5)).toBeNull()
  })
})

const cfg = (over: Partial<ConfigTranslacional> = {}): ConfigTranslacional => ({
  ...CONFIG_TRANSLACIONAL_PADRAO,
  ativa: true,
  ...over,
})

const BASE_GEO: SlopeGeometry = {
  bench_height: 10,
  slope_ratio: 1.5,
  berm_width: 2,
  total_height: 10,
  water_table_depth: 50,
  gamma_water: 10,
}
const FILL = { c: 5, phi: 30, gamma: 18 }
const FUNDACAO: Layer[] = [{ name: 'Fundação', y_top: 0, y_base: -20, c: 20, phi: 30, gamma: 19 }]

describe('analisarTranslacional: casca da face', () => {
  test('aterro de uma bancada: um trecho, z = espessura, FS igual ao da fórmula', () => {
    const r = analisarTranslacional(BASE_GEO, 'aterro', FUNDACAO, FILL, undefined, cfg({ plano: { tipo: 'casca', espessura: 1.5 } }))
    expect(r.trechos).toHaveLength(1)
    const t = r.trechos[0]
    const beta = (Math.atan(1 / 1.5) * 180) / Math.PI
    expect(t.beta_sup).toBeCloseTo(beta, 6)
    expect(t.z_min).toBeCloseTo(1.5, 6)
    expect(t.z_max).toBeCloseTo(1.5, 6)
    expect(t.material).toBe('Aterro')
    const esperado = fsTaludeInfinito({ beta, z: 1.5, gamma: 18, gamma_w: 10, c: 5, phi: 30, m: 1 }).FS
    expect(t.fs_projeto).toBeCloseTo(esperado, 6)
    expect(t.adequado).toBe(esperado >= 1.5)
    expect(t.nao_paralelo).toBe(false)
    expect(r.critico).toBe(t)
  })

  test('junto ao pé a casca não entra na fundação: todos os pontos ficam dentro do aterro', () => {
    const mole: Layer[] = [{ name: 'Argila mole', y_top: 0, y_base: -5, c: 2, phi: 15, gamma: 15 }]
    const r = analisarTranslacional(BASE_GEO, 'aterro', mole, FILL, undefined, cfg({ plano: { tipo: 'casca', espessura: 1.5 } }))
    const t = r.trechos[0]
    expect(t.material).toBe('Aterro')
    for (const p of t.pontos) expect(p.y_plano).toBeGreaterThanOrEqual(-1e-9)
    expect(r.avisos.some((a) => a.includes('dentro do aterro'))).toBe(true)
  })

  test('duas bancadas: dois trechos de face; berma plana fica de fora', () => {
    const r = analisarTranslacional({ ...BASE_GEO, bench_height: 5 }, 'aterro', FUNDACAO, FILL, undefined, cfg())
    expect(r.trechos).toHaveLength(2)
    expect(r.trechos[1].x0).toBeGreaterThan(r.trechos[0].x1)
  })

  test('cenários em ordem: com sucção > sem sucção > m parcial > m pleno', () => {
    const r = analisarTranslacional(BASE_GEO, 'aterro', FUNDACAO, FILL, undefined, cfg({ succao: 20 }))
    const fs = r.trechos[0].cenarios.map((c) => c.FS)
    expect(fs).toHaveLength(4)
    for (let i = 1; i < fs.length; i++) expect(fs[i]).toBeLessThan(fs[i - 1])
  })

  test('parâmetros próprios do plano substituem os do material', () => {
    const r = analisarTranslacional(
      BASE_GEO,
      'aterro',
      FUNDACAO,
      FILL,
      undefined,
      cfg({ usar_parametros_proprios: true, c_plano: 0, phi_plano: 28, gamma: 16 })
    )
    const t = r.trechos[0]
    expect(t.c).toBe(0)
    expect(t.phi).toBe(28)
    expect(t.gamma).toBe(16)
  })

  test('corte: a casca da face do corte também é verificada', () => {
    const camadas: Layer[] = [{ name: 'Saprolito', depth_top: 0, depth_base: 30, c: 10, phi: 28, gamma: 18 }]
    const r = analisarTranslacional(BASE_GEO, 'corte', camadas, null, undefined, cfg({ plano: { tipo: 'casca', espessura: 1 } }))
    expect(r.trechos).toHaveLength(1)
    expect(r.trechos[0].material).toBe('Saprolito')
  })

  test('espessura inválida devolve aviso e nenhum trecho', () => {
    const r = analisarTranslacional(BASE_GEO, 'aterro', FUNDACAO, FILL, undefined, cfg({ plano: { tipo: 'casca', espessura: 0 } }))
    expect(r.trechos).toHaveLength(0)
    expect(r.avisos.length).toBeGreaterThan(0)
  })
})

describe('analisarTranslacional: encosta natural e contato aterro/terreno', () => {
  // encosta a 1V:2H (26,57°) antes do pé, que continua por baixo do aterro
  const terreno = [
    { x: -60, y: -30 },
    { x: 0, y: 0 },
    { x: 40, y: 20 },
  ]
  const coluvio: Layer[] = [
    { name: 'Colúvio', depth_top: 0, depth_base: 2, c: 5, phi: 30, gamma: 18 },
    { name: 'Residual', depth_top: 2, depth_base: 30, c: 25, phi: 32, gamma: 19 },
  ]

  test('plano na base do colúvio: trecho da encosta com z = 2 m e FS da fórmula', () => {
    const geo = { ...BASE_GEO, total_height: 2, natural_terrain: terreno }
    const r = analisarTranslacional(geo, 'aterro', coluvio, FILL, undefined, cfg({ plano: { tipo: 'camada', indice: 0 }, m_projeto: 1 }))
    const encosta = r.trechos.find((t) => t.x1 <= 0)!
    expect(encosta).toBeDefined()
    expect(encosta.z_min).toBeCloseTo(2, 6)
    const beta = (Math.atan(0.5) * 180) / Math.PI
    expect(encosta.beta_plano).toBeCloseTo(beta, 3)
    expect(encosta.material).toBe('Colúvio')
    const esperado = fsTaludeInfinito({ beta, z: 2, gamma: 18, gamma_w: 10, c: 5, phi: 30, m: 1 }).FS
    expect(encosta.fs_projeto).toBeCloseTo(esperado, 4)
  })

  test('contato aterro/terreno: trecho da face com plano mais suave é marcado como não paralelo', () => {
    const geo = { ...BASE_GEO, total_height: 6, natural_terrain: terreno }
    const r = analisarTranslacional(geo, 'aterro', coluvio, FILL, undefined, cfg({ plano: { tipo: 'terreno_natural' } }))
    const face = r.trechos.find((t) => t.x0 >= 0)!
    expect(face).toBeDefined()
    expect(face.material).toBe('Aterro')
    expect(face.nao_paralelo).toBe(true)
    expect(r.avisos.some((a) => a.includes('aproximado'))).toBe(true)
  })

  test('contato aterro/terreno não existe no corte', () => {
    const r = analisarTranslacional(BASE_GEO, 'corte', coluvio, null, undefined, cfg({ plano: { tipo: 'terreno_natural' } }))
    expect(r.trechos).toHaveLength(0)
    expect(r.avisos[0]).toContain('aterro')
  })

  test('camada inexistente devolve aviso', () => {
    const r = analisarTranslacional(BASE_GEO, 'aterro', coluvio, FILL, undefined, cfg({ plano: { tipo: 'camada', indice: 5 } }))
    expect(r.trechos).toHaveLength(0)
    expect(r.avisos[0]).toContain('camada')
  })
})
