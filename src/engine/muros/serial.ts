import type { AvaliacaoSecao, DetalheMuro } from './verificar'

// O resultado da verificação sai do Web Worker para a tela por postMessage,
// que só copia dados (structured clone) — não funções. O solo da seção tem
// materialEm(), então é retirado; o resto (modelo, círculo, fatias,
// verificações) é dado puro.

export type AvaliacaoSerial = Omit<AvaliacaoSecao, 'solo'>

export interface DetalheSerial extends Omit<DetalheMuro, 'avaliacoes' | 'governante' | 'sugerida'> {
  avaliacoes: AvaliacaoSerial[]
  governante: AvaliacaoSerial | null
  sugerida: AvaliacaoSerial | null
}

function semSolo(a: AvaliacaoSecao): AvaliacaoSerial {
  const { solo: _solo, ...resto } = a
  return resto
}

export function paraSerial(d: DetalheMuro): DetalheSerial {
  return {
    ...d,
    avaliacoes: d.avaliacoes.map(semSolo),
    governante: d.governante ? semSolo(d.governante) : null,
    sugerida: d.sugerida ? semSolo(d.sugerida) : null,
  }
}
