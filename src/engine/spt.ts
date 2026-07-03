import type { SoilClass } from './types'

export interface SPTEstimate {
  c: number
  phi: number
  gamma: number
  classification: string
}

interface Band {
  max: number // limite superior de N (inclusive) para esta faixa
  label: string
  c: number
  gamma: number
}

// Faixas de compacidade para solos granulares (NBR 6484) e valores típicos de
// peso específico. Areia/silte arenoso: coesão efetiva considerada nula
// (ver discussão do app — resistência vem do atrito entre grãos).
const GRANULAR_BANDS: Band[] = [
  { max: 4, label: 'fofa', c: 0, gamma: 17.0 },
  { max: 8, label: 'pouco compacta', c: 0, gamma: 17.5 },
  { max: 18, label: 'medianamente compacta', c: 0, gamma: 18.5 },
  { max: 40, label: 'compacta', c: 0, gamma: 19.5 },
  { max: Infinity, label: 'muito compacta', c: 0, gamma: 20.5 },
]

// Faixas de consistência para solos coesivos (NBR 6484) e valores típicos de
// c' e γ. São valores de referência de bibliografia geotécnica corrente —
// não substituem ensaio de laboratório quando disponível.
const COESIVO_BANDS: (Band & { phi: number })[] = [
  { max: 2, label: 'muito mole', c: 3, phi: 18, gamma: 14.0 },
  { max: 5, label: 'mole', c: 5, phi: 20, gamma: 15.0 },
  { max: 10, label: 'média', c: 10, phi: 22, gamma: 16.5 },
  { max: 19, label: 'rija', c: 18, phi: 25, gamma: 18.0 },
  { max: 30, label: 'muito rija', c: 28, phi: 27, gamma: 19.0 },
  { max: Infinity, label: 'dura', c: 40, phi: 30, gamma: 20.0 },
]

function pickBand<T extends Band>(bands: T[], n: number): T {
  return bands.find((b) => n <= b.max) ?? bands[bands.length - 1]
}

/**
 * Estima c'/φ'/γ a partir do N_SPT, seguindo correlações usuais da prática
 * brasileira: φ' de Teixeira (1996) para solos granulares, e faixas de
 * consistência da NBR 6484 para solos coesivos. Uso como ponto de partida
 * auditável — sempre editável, e substituível por ensaio quando disponível.
 */
export function estimateFromSPT(n: number, soilClass: SoilClass): SPTEstimate {
  const nClamped = Math.max(0, n)

  if (soilClass === 'granular') {
    const band = pickBand(GRANULAR_BANDS, nClamped)
    const phi = Math.sqrt(20 * nClamped) + 15 // Teixeira (1996)
    return {
      c: band.c,
      phi,
      gamma: band.gamma,
      classification: `Granular — compacidade: ${band.label} (N=${nClamped})`,
    }
  }

  const band = pickBand(COESIVO_BANDS, nClamped)
  return {
    c: band.c,
    phi: band.phi,
    gamma: band.gamma,
    classification: `Coesivo — consistência: ${band.label} (N=${nClamped})`,
  }
}
