import { describe, expect, test } from 'vitest'
import {
  PREMISSAS_TEMPO_PADRAO,
  T50,
  T90,
  RAIO_CONE,
  chPorDissipacao,
  tabelaDrenos,
  tempoSemDrenos,
} from '../adensamento'
import { REFERENCIA } from './referencia'

const ref = REFERENCIA.tempo
const perto = (calc: number, esp: number) =>
  expect(Math.abs(calc - esp), `esperado ${esp}, veio ${calc}`).toBeLessThanOrEqual(1e-9 * Math.abs(esp))

describe('tempo e drenos: aba "Tempo e drenos"', () => {
  test('constantes e premissas padrão são as da planilha', () => {
    expect([T90, T50, RAIO_CONE]).toEqual([ref.T90, ref.T50, ref.r])
    const p = PREMISSAS_TEMPO_PADRAO
    expect([p.cv, p.Ir, p.dw, p.U]).toEqual([ref.cv, ref.Ir, ref.dw, ref.U])
    expect(p.chDrenos).toEqual(ref.chDrenos)
    expect(p.espacamentos).toEqual(ref.drenos.map((d) => d.s))
  })

  test('t90 sem drenos do CPTu06 (H = 10,6 m, dois lados, cv = 2): 11,91 anos', () => {
    const { Hdr, t90 } = tempoSemDrenos(10.6, true, 2)
    expect(Hdr).toBeCloseTo(5.3, 12)
    perto(t90, 11.91016)
    expect(tempoSemDrenos(10.6, false, 2).Hdr).toBe(10.6)
  })

  test('ch pela dissipação (tabela ilustrativa)', () => {
    for (const { t50, ch } of ref.chPorT50) perto(chPorDissipacao(t50, ref.Ir), ch)
  })

  test('prazo dos drenos (Barron, U = 90%) e marcação do prazo de obra', () => {
    const tab = tabelaDrenos(PREMISSAS_TEMPO_PADRAO)
    ref.drenos.forEach((linha, i) => linha.meses.forEach((m, j) => perto(tab[i][j].meses, m)))
    // s = 2 m: ch 2 → 20,6 meses (não cabe em 12); ch 5 → 8,3 meses (cabe)
    expect(tab[4][0].cabeNoPrazo).toBe(false)
    expect(tab[4][1].cabeNoPrazo).toBe(true)
  })
})
