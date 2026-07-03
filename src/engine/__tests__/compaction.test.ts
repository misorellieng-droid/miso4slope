import { describe, expect, test } from 'vitest'
import { estimateFromCompaction } from '../compaction'
import type { CompactionReference } from '../types'

const reference: CompactionReference = { c: 15, phi: 28, gamma: 19 }

describe('estimateFromCompaction', () => {
  test('GC=100% reproduz exatamente o material de referência', () => {
    const est = estimateFromCompaction(reference, 100)
    expect(est.c).toBeCloseTo(15)
    expect(est.phi).toBeCloseTo(28)
    expect(est.gamma).toBeCloseTo(19)
  })

  test('GC=95% reduz c\' e γ proporcionalmente, mantém φ\'', () => {
    const est = estimateFromCompaction(reference, 95)
    expect(est.c).toBeCloseTo(15 * 0.95)
    expect(est.gamma).toBeCloseTo(19 * 0.95)
    expect(est.phi).toBeCloseTo(28)
  })

  test('GC menor produz c\' e γ menores, de forma monotônica', () => {
    const gc90 = estimateFromCompaction(reference, 90)
    const gc95 = estimateFromCompaction(reference, 95)
    const gc100 = estimateFromCompaction(reference, 100)
    expect(gc90.c).toBeLessThan(gc95.c)
    expect(gc95.c).toBeLessThan(gc100.c)
  })

  test('derivation documenta a fórmula usada', () => {
    const est = estimateFromCompaction(reference, 95)
    expect(est.derivation).toContain('GC=95%')
    expect(est.derivation).toContain('φ\' mantido')
  })
})
