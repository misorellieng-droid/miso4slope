import { describe, expect, it } from 'vitest'
import { detectSondagemGroups } from '../sondagemDetection'

describe('detectSondagemGroups', () => {
  it('agrupa cada página com cabeçalho reconhecido como uma sondagem própria', () => {
    const groups = detectSondagemGroups([
      'RELATÓRIO DE SONDAGEM SP-01 profundidade 0.00 a 1.00 argila',
      'RELATÓRIO DE SONDAGEM SP-02 profundidade 0.00 a 1.00 areia',
    ])
    expect(groups).toEqual([
      { identifier: 'SP-01', pageStart: 1, pageEnd: 1, autoDetected: true },
      { identifier: 'SP-02', pageStart: 2, pageEnd: 2, autoDetected: true },
    ])
  })

  it('trata página sem cabeçalho reconhecido como continuação da sondagem anterior (dividida em duas folhas)', () => {
    const groups = detectSondagemGroups([
      'FURO SP-01 continuação da tabela abaixo',
      'continuação profundidade 10.00 a 12.00 argila dura',
      'FURO SP-02 início',
    ])
    expect(groups).toEqual([
      { identifier: 'SP-01', pageStart: 1, pageEnd: 2, autoDetected: true },
      { identifier: 'SP-02', pageStart: 3, pageEnd: 3, autoDetected: true },
    ])
  })

  it('quando nenhuma página tem cabeçalho reconhecido, trata tudo como uma única sondagem não identificada', () => {
    // sem nenhum cabeçalho pra guiar o agrupamento, assume que é tudo a mesma sondagem
    // (mesma regra de "continuação" usada quando falta o cabeçalho só numa folha) — o
    // usuário revisa e separa manualmente se for o caso
    const groups = detectSondagemGroups(['texto qualquer sem identificação', 'outro texto qualquer'])
    expect(groups).toEqual([{ identifier: 'Sondagem 1', pageStart: 1, pageEnd: 2, autoDetected: false }])
  })
})
