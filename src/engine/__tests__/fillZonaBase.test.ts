import { describe, expect, it } from 'vitest'
import { avgSoil, resolveFillZones } from '../soil'
import type { FillMaterial, FillZone } from '../types'

const fill: FillMaterial = { c: 8, phi: 25, gamma: 18 }
const rachao: FillZone = { name: 'Rachão', anchor: 'base', thickness: 1, compaction_degree: 100, c: 0, phi: 40, gamma: 20 }
const topo: FillZone = { name: 'Topo', thickness: 0.9, compaction_degree: 100, c: 10, phi: 28, gamma: 19 }

describe('camada de base (rachão)', () => {
  it('não entra no empilhamento a partir da plataforma', () => {
    const r = resolveFillZones([rachao, topo], 3.5)
    expect(r[1].y_top).toBe(3.5)
    expect(r[1].y_base).toBeCloseTo(2.6)
  })

  it('resistência na base da fatia vem do rachão; acima dele, do corpo', () => {
    const z = resolveFillZones([rachao], 3.5)
    expect(avgSoil(0, 0.9, 0.5, [], fill, undefined, z)).toMatchObject({ c: 0, phi: 40 })
    expect(avgSoil(0, 2, 1.5, [], fill, undefined, z)).toMatchObject({ c: 8, phi: 25 })
  })
})
