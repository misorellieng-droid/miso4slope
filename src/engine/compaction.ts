import type { CompactionReference } from './types'

export interface CompactionEstimate {
  c: number
  phi: number
  gamma: number
  derivation: string
}

/**
 * Estima c'/φ'/γ efetivos de uma zona do aterro a partir do material de
 * referência (ensaiado a 100% do grau de compactação) e do GC realmente
 * especificado para essa zona.
 *
 * Não existe uma relação única e citável entre GC% e resistência — depende
 * da curva de compactação específica do material. Esta é uma aproximação
 * simplificada e deliberadamente transparente, para servir de ponto de
 * partida auditável (sempre editável, e substituível por ensaio na
 * densidade de campo quando disponível):
 *   - γ escala quase diretamente com o GC, porque GC é por definição a
 *     razão entre a massa específica seca alcançada e a máxima do Proctor.
 *   - c' é aproximado como proporcional ao GC — compactação menor implica
 *     maior índice de vazios e, em geral, menor coesão mobilizável.
 *   - φ' é mantido igual ao de referência — o ângulo de atrito é
 *     considerado pouco sensível ao GC dentro da faixa usual de
 *     especificação de obra (90–100%).
 */
export function estimateFromCompaction(
  reference: CompactionReference,
  compactionDegree: number
): CompactionEstimate {
  const ratio = compactionDegree / 100

  return {
    c: reference.c * ratio,
    phi: reference.phi,
    gamma: reference.gamma * ratio,
    derivation: `GC=${compactionDegree}% × material de referência (c'=${reference.c}kPa, φ'=${reference.phi}°, γ=${reference.gamma}kN/m³) → c'=${(reference.c * ratio).toFixed(1)}kPa, γ=${(reference.gamma * ratio).toFixed(1)}kN/m³ (φ' mantido)`,
  }
}
