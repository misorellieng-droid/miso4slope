import { describe, expect, test } from 'vitest'
import csv from './fixtures/fixture_CPTu01_esperado.csv?raw'
import { calcularLinhas, gammaUsado } from '../linhas'
import { PARAMETROS_PADRAO, deltaSigma } from '../parametros'
import type { LeituraCptu, LinhaCptu } from '../tipos'
import { COLUNAS_CALCULADAS, REFERENCIA, cabecalhoDe, diferenca, leiturasDe } from './referencia'

// Reprodução da planilha CPTu_01a10_com_formulas.xlsx, coluna a coluna,
// para os 10 furos, com os parâmetros padrão.

describe('parâmetros padrão', () => {
  test('são os da aba Parametros da planilha', () => {
    for (const [k, v] of Object.entries(REFERENCIA.parametros)) {
      const atual = k === 'deltaSigma' ? deltaSigma(PARAMETROS_PADRAO) : PARAMETROS_PADRAO[k as keyof typeof PARAMETROS_PADRAO]
      expect(atual, k).toBe(v)
    }
  })
})

describe('linhas por profundidade: xlsx com precisão total (tolerância relativa 1e-6)', () => {
  for (const furo of REFERENCIA.furos) {
    test(furo.nome, () => {
      const linhas = calcularLinhas(leiturasDe(furo), cabecalhoDe(furo), PARAMETROS_PADRAO)
      expect(linhas).toHaveLength(furo.entrada.z.length)
      const erros: string[] = []
      for (const col of COLUNAS_CALCULADAS) {
        linhas.forEach((l, i) => {
          const d = diferenca(l[col], furo.esperado[col][i], 1e-6, 1e-12)
          if (d) erros.push(`z=${l.z} ${col}: ${d}`)
        })
      }
      expect(erros.slice(0, 20)).toEqual([])
    })
  }
})

// CSV enviado junto com o prompt: CPTu01 com 6 casas decimais. Como os
// valores estão arredondados, a folga é de meio dígito na 6ª casa.
describe('linhas por profundidade: CSV do CPTu01 (6 casas)', () => {
  const [cab, ...corpo] = csv.trim().split(/\r?\n/)
  const titulos = cab.split(';')
  const linhasCsv = corpo.map((l) => l.split(';'))
  const col = (titulo: string) => titulos.indexOf(titulo)
  const num = (s: string) => (s === '' ? null : Number(s))

  // Ordem das colunas do CSV = ordem da planilha (A a AJ)
  const MAPA: Record<string, keyof LinhaCptu> = {
    'qt (kPa)': 'qtKPa', 'fs (kPa)': 'fs', 'σv0 (kPa)': 'sigmaV0', 'u0 (kPa)': 'u0', "σ'v0 (kPa)": 'sigmaV0Ef',
    'qt−σv0 (kPa)': 'qnet', 'Fr (%)': 'Fr', Bq: 'Bq', 'Qtn (n=1)': 'Qtn1', 'Ic (1ª passada)': 'Ic1', n: 'n',
    Qtn: 'Qtn', 'Ic (Robertson 2009)': 'Ic', Material: 'material', 'Su (kPa)': 'Su', "σ'p (kPa)": 'sigmaP',
    OCR: 'OCR', "Su/σ'v0": 'SuSigmaV0', 'M (MPa)': 'M', 'γ pela fórmula (kN/m³)': 'gammaFormula',
    'Su meu ÷ Su relatório': 'SuRazaoRel', 'St = Su ÷ fs': 'St', 'St do relatório': 'StRel',
    'OCR necessário': 'OCRnec', 'Situação frente ao aterro': 'situacao', "σ'f = σ'v0 + Δσ (kPa)": 'sigmaF',
    'Recalque Cc/Cr da fatia (m)': 'recalqueCcCr', 'Recalque por M da fatia (m)': 'recalqueM',
  }

  test('todas as colunas do CSV estão mapeadas', () => {
    for (const t of Object.keys(MAPA)) expect(col(t), t).toBeGreaterThanOrEqual(0)
  })

  test('CPTu01 confere com o CSV', () => {
    const leituras: LeituraCptu[] = linhasCsv.map((c) => ({
      z: Number(c[0]), qt: num(c[1]), Rf: num(c[2]), u2: num(c[3]), gamma: num(c[4]),
      SuRel: num(c[col('Su do relatório (kPa)')]), OCRRel: num(c[col('OCR do relatório')]),
      SuAmolgRel: num(c[col('Su amolgado do relatório (kPa)')]),
    }))
    const linhas = calcularLinhas(leituras, { nome: 'CPTu01', NA: 0.86, profApoio: 11.1, espArgilaMole: 7.2 }, PARAMETROS_PADRAO)
    const erros: string[] = []
    for (const [titulo, chave] of Object.entries(MAPA)) {
      const j = col(titulo)
      linhas.forEach((l, i) => {
        const bruto = linhasCsv[i][j]
        const esp = bruto === '' ? null : isNaN(Number(bruto)) ? bruto : Number(bruto)
        const d = diferenca(l[chave], esp, 1e-6, 5.000001e-7)
        if (d) erros.push(`z=${l.z} ${chave}: ${d}`)
      })
    }
    expect(erros.slice(0, 20)).toEqual([])
  })
})

describe('regras de linha', () => {
  const cab = { nome: 'T', NA: 1, profApoio: 5, espArgilaMole: 3 }

  test('γ ausente usa o padrão e γ é limitado entre γmin e γmax', () => {
    expect(gammaUsado(null, PARAMETROS_PADRAO)).toBe(17)
    expect(gammaUsado(25, PARAMETROS_PADRAO)).toBe(21)
    expect(gammaUsado(10, PARAMETROS_PADRAO)).toBe(12)
  })

  test('linha sem qt fica vazia, mas soma σv0 e conta no dz da seguinte', () => {
    const [a, b, c] = calcularLinhas(
      [
        { z: 0, qt: 1, Rf: 2, u2: 0, gamma: 16 },
        { z: 0.1, qt: null, Rf: null, u2: null, gamma: 16 },
        { z: 0.2, qt: 1, Rf: 2, u2: 0, gamma: 16 },
      ],
      cab,
      PARAMETROS_PADRAO,
    )
    expect(a.Ic).not.toBeNull()
    expect([b.qtKPa, b.fs, b.qnet, b.Ic, b.Su]).toEqual([null, null, null, null, null])
    expect(b.sigmaV0).toBeCloseTo(1.6, 12)
    expect(c.sigmaV0).toBeCloseTo(3.2, 12)
    expect(c.dz).toBeCloseTo(0.1, 12)
  })

  test('Rf = 0 invalida a linha; areia não tem Su, σ\'p, M nem recalque', () => {
    const [semRf, areia] = calcularLinhas(
      [
        { z: 0, qt: 1, Rf: 0, u2: 0 },
        { z: 0.1, qt: 15, Rf: 0.4, u2: 0 },
      ],
      cab,
      PARAMETROS_PADRAO,
    )
    expect(semRf.fs).toBeNull()
    expect(semRf.Ic).toBeNull()
    expect(areia.material).toBe('Areia')
    expect([areia.Su, areia.sigmaP, areia.M, areia.recalqueCcCr, areia.recalqueM]).toEqual([null, null, null, null, null])
  })

  test('leituras fora de ordem são ordenadas por z', () => {
    const linhas = calcularLinhas(
      [
        { z: 0.2, qt: 0.5, Rf: 3, u2: 10 },
        { z: 0, qt: 0.5, Rf: 3, u2: 0 },
        { z: 0.1, qt: 0.5, Rf: 3, u2: 5 },
      ],
      cab,
      PARAMETROS_PADRAO,
    )
    expect(linhas.map((l) => l.z)).toEqual([0, 0.1, 0.2])
  })
})
