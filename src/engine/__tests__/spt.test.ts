import { describe, expect, test } from 'vitest'
import { estimateFromSPT } from '../spt'

describe('estimateFromSPT', () => {
  test('granular: coesão sempre zero, φ\' cresce com N (Teixeira)', () => {
    const low = estimateFromSPT(5, 'granular')
    const high = estimateFromSPT(30, 'granular')
    expect(low.c).toBe(0)
    expect(high.c).toBe(0)
    expect(high.phi).toBeGreaterThan(low.phi)
    // Teixeira: φ' = √(20×30) + 15 ≈ 39.49°
    expect(high.phi).toBeCloseTo(Math.sqrt(20 * 30) + 15, 2)
  })

  test('coesivo: c\', φ\' e γ crescem com a consistência (N maior)', () => {
    const mole = estimateFromSPT(4, 'coesivo')
    const rija = estimateFromSPT(15, 'coesivo')
    const dura = estimateFromSPT(35, 'coesivo')
    expect(rija.c).toBeGreaterThan(mole.c)
    expect(dura.c).toBeGreaterThan(rija.c)
    expect(rija.phi).toBeGreaterThan(mole.phi)
    expect(dura.gamma).toBeGreaterThan(mole.gamma)
  })

  test('classification reflete o rótulo de consistência/compacidade correto', () => {
    expect(estimateFromSPT(1, 'coesivo').classification).toContain('muito mole')
    expect(estimateFromSPT(25, 'coesivo').classification).toContain('muito rija')
    expect(estimateFromSPT(2, 'granular').classification).toContain('fofa')
    expect(estimateFromSPT(50, 'granular').classification).toContain('muito compacta')
  })

  test('N negativo é tratado como zero (sem crash)', () => {
    expect(() => estimateFromSPT(-3, 'granular')).not.toThrow()
    expect(estimateFromSPT(-3, 'coesivo').classification).toContain('muito mole')
  })
})
