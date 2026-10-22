import { describe, expect, test } from 'vitest'
import { calcularLinhas } from '../linhas'
import { PARAMETROS_PADRAO } from '../parametros'
import { resumoFuro } from '../resumo'
import { REFERENCIA, cabecalhoDe, leiturasDe } from './referencia'

const CV = REFERENCIA.tempo.cv

function resumoDe(nome: string) {
  const furo = REFERENCIA.furos.find((f) => f.nome === nome)!
  return resumoFuro(calcularLinhas(leiturasDe(furo), cabecalhoDe(furo), PARAMETROS_PADRAO), cabecalhoDe(furo), CV)
}

describe('resumo por furo: aba Resumo com precisão total', () => {
  for (const furo of REFERENCIA.furos) {
    test(furo.nome, () => {
      const r = resumoDe(furo.nome)
      for (const [k, esp] of Object.entries(furo.resumo)) {
        const calc = r[k as keyof typeof r] as number
        expect(Math.abs(calc - esp), `${k}: esperado ${esp}, veio ${calc}`).toBeLessThanOrEqual(1e-6 * Math.abs(esp) + 1e-12)
      }
    })
  }
})

// Valores da tabela do prompt (arredondados como foram escritos)
describe('resumo do CPTu01: tabela do prompt', () => {
  const r = resumoDe('CPTu01')
  const casos: [string, number, number, number][] = [
    ['Recalque Cc/Cr até o apoio (m)', r.recalqueCcCrApoio, 0.093, 3],
    ['Recalque por M até o apoio (m)', r.recalqueMApoio, 0.138, 3],
    ['Recalque Cc/Cr no furo todo (m)', r.recalqueCcCrTotal, 0.13, 3],
    ['Su médio até o apoio (kPa)', r.suMedio!, 37.91, 2],
    ['Su mínimo (kPa)', r.suMin!, 4.843, 3],
    ['OCR mínimo', r.ocrMin!, 1.945, 3],
    ['Espessura que passa da memória (m)', r.espessuraPassa, 1.2, 1],
    ['Hdr (m)', r.Hdr, 3.6, 1],
    ['t90 sem drenos, cv = 2 (anos)', r.t90, 5.495, 3],
    ['St médio', r.stMedio!, 4.0, 2],
  ]
  for (const [nome, calc, esp, casas] of casos) {
    test(nome, () => expect(Number(calc.toFixed(casas))).toBe(esp))
  }
})

// Tabela de regressão dos outros furos (prompt, seção 11)
describe('resumo dos outros furos: tabela do prompt', () => {
  const tabela: [string, number, number, number, number, number, number, number, number][] = [
    // furo, Cc/Cr apoio, por M, Su méd, Su mín, OCR mín, passa, t90
    ['CPTu02', 16.0, 0.635, 0.99, 17.09, 4.68, 0.808, 12.9, 25.14],
    ['CPTu03', 16.3, 0.239, 0.38, 25.38, 12.16, 0.821, 5.3, 16.04],
    ['CPTu04', 16.2, 0.276, 0.499, 27.22, 4.48, 0.752, 6.8, 13.78],
    ['CPTu05', 15.3, 0.089, 0.092, 50.38, 30.9, 2.634, 0.0, 9.57],
    ['CPTu06', 16.5, 0.147, 0.241, 34.6, 10.11, 1.026, 3.0, 11.91],
    ['CPTu07', 15.4, 0.565, 1.076, 18.07, 3.63, 0.689, 11.2, 20.19],
    ['CPTu08', 13.9, 0.267, 0.389, 23.27, 9.13, 1.247, 7.5, 11.91],
    ['CPTu09', 16.7, 0.5, 1.113, 18.81, 2.46, 0.598, 9.7, 17.91],
    ['CPTu10', 16.4, 0.264, 0.364, 32.08, 3.99, 1.324, 5.3, 13.06],
  ]
  for (const [nome, apoio, cc, m, suMed, suMin, ocrMin, passa, t90] of tabela) {
    test(nome, () => {
      const r = resumoDe(nome)
      expect(r.profApoio).toBe(apoio)
      expect(Number(r.recalqueCcCrApoio.toFixed(3))).toBe(cc)
      expect(Number(r.recalqueMApoio.toFixed(3))).toBe(m)
      expect(Number(r.suMedio!.toFixed(2))).toBe(suMed)
      expect(Number(r.suMin!.toFixed(2))).toBe(suMin)
      expect(Number(r.ocrMin!.toFixed(3))).toBe(ocrMin)
      expect(Number(r.espessuraPassa.toFixed(1))).toBe(passa)
      expect(Number(r.t90.toFixed(2))).toBe(t90)
    })
  }
})
