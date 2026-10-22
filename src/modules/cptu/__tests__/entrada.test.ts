import { describe, expect, test } from 'vitest'
import * as XLSX from 'xlsx'
import csv from '../calc/__tests__/fixtures/fixture_CPTu01_esperado.csv?raw'
import { PARAMETROS_PADRAO } from '../calc/parametros'
import type { FuroCptu } from '../calc/tipos'
import {
  colarNaGrade,
  conferirFuro,
  identificarColuna,
  lerTabelaTexto,
  leituraVazia,
  mapearColunas,
  blocoParaLeituras,
  numeroBR,
} from '../entrada'
import { importarPlanilha, importarTexto } from '../importacao'

describe('números', () => {
  test('vírgula decimal, milhar e ponto', () => {
    expect(numeroBR('0,4803')).toBe(0.4803)
    expect(numeroBR('1.234,5')).toBe(1234.5)
    expect(numeroBR('0.4803')).toBe(0.4803)
    expect(numeroBR(' -11,38 ')).toBe(-11.38)
    expect(numeroBR('9,4E-05')).toBe(9.4e-5)
    expect(numeroBR('')).toBeNull()
    expect(numeroBR('-')).toBeNull()
    expect(numeroBR('abc')).toBeNull()
  })
})

describe('colar do Excel', () => {
  test('uma coluna com vírgula decimal não é quebrada', () => {
    expect(lerTabelaTexto('0,48\n0,52\n')).toEqual([['0,48'], ['0,52']])
  })

  test('bloco sem cabeçalho cola a partir do cursor e cria linhas', () => {
    const base = [leituraVazia(0), leituraVazia(0.1)]
    const bloco = lerTabelaTexto('0,0678\t0,858\t0\r\n0,7159\t4,217\t1,9\r\n0,8927\t6,887\t-11,38\r\n')
    const r = colarNaGrade(base, bloco, 0, 1) // cursor em qt da 1ª linha
    expect(r).toHaveLength(3)
    expect(r[0]).toMatchObject({ z: 0, qt: 0.0678, Rf: 0.858, u2: 0 })
    expect(r[2]).toMatchObject({ qt: 0.8927, Rf: 6.887, u2: -11.38 })
    expect(Number.isNaN(r[2].z)).toBe(true) // linha nova ainda sem z
  })

  test('bloco com cabeçalho é lido pelo título das colunas', () => {
    const bloco = lerTabelaTexto('Prof. z (m)\tu2 (kPa)\tqt (MPa)\tRf (%)\n0\t0\t0,0678\t0,858\n0,1\t1,9\t0,7159\t4,217')
    const mapa = mapearColunas(bloco)
    expect(mapa.temCabecalho).toBe(true)
    const { leituras } = blocoParaLeituras(bloco, mapa)
    expect(leituras[1]).toMatchObject({ z: 0.1, qt: 0.7159, Rf: 4.217, u2: 1.9, gamma: null })
  })

  test('títulos da planilha de referência: lê as entradas e ignora os calculados', () => {
    const titulos = csv.split(/\r?\n/)[0].split(';')
    const achadas = titulos.map((t) => identificarColuna(t)?.chave ?? null)
    expect(achadas.slice(0, 5)).toEqual(['z', 'qt', 'Rf', 'u2', 'gamma'])
    expect(achadas[titulos.indexOf('Su do relatório (kPa)')]).toBe('SuRel')
    expect(achadas[titulos.indexOf('OCR do relatório')]).toBe('OCRRel')
    expect(achadas[titulos.indexOf('Su amolgado do relatório (kPa)')]).toBe('SuAmolgRel')
    for (const t of ['Su (kPa)', 'γ pela fórmula (kN/m³)', 'Su meu ÷ Su relatório', 'qt−σv0 (kPa)', 'OCR necessário', "σ'v0 (kPa)"]) {
      expect(identificarColuna(t), t).toBeNull()
    }
    // qt em kPa vira MPa
    expect(identificarColuna('qt (kPa)')).toEqual({ chave: 'qt', fator: 0.001 })
  })
})

describe('importar arquivo', () => {
  test('CSV da fixture (separador ;): 179 leituras do CPTu01', () => {
    const r = importarTexto(csv)
    if (r.tipo !== 'leituras') throw new Error('tipo')
    expect(r.leituras).toHaveLength(179)
    expect(r.leituras[0]).toMatchObject({ z: 0, qt: 0.0678, Rf: 0.858, u2: 0, gamma: 13.71 })
    expect(r.leituras[4]).toMatchObject({ z: 0.4, SuRel: 83.23 })
  })

  test('CSV sem cabeçalho usa a ordem da grade', () => {
    const r = importarTexto('0;0,0678;0,858;0;13,71\n0,1;0,7159;4,217;1,9;15,44\n')
    if (r.tipo !== 'leituras') throw new Error('tipo')
    expect(r.leituras[1]).toMatchObject({ z: 0.1, qt: 0.7159, Rf: 4.217, u2: 1.9, gamma: 15.44 })
  })

  test('planilha no formato da referência traz os furos com cabeçalho', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Parâmetro', 'Valor'],
        ['CPTu', 'N.A. (m)', 'Prof. final', 'Espessura', 'Prof. total'],
        ['CPTu01', 0.86, 11.1, 7.2, 17.88],
      ]),
      'Parametros',
    )
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CPTu', 'B', 'C', 'D', 'E', 'Guia'], ['CPTu01', 11.1, 0, 0, 0, 0.12]]), 'Resumo')
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['LIDO', 'LIDO', 'LIDO', 'LIDO', 'LIDO', 'CALC'],
        ['Prof. z (m)', 'qt (MPa)', 'Rf (%)', 'u2 (kPa)', 'γ do relatório (kN/m³)', 'qt (kPa)'],
        ['Profundidade do ponto', 'Resistência', 'Razão', 'Poropressão', 'Peso', 'Fórmula'],
        [0, 0.0678, 0.858, 0, 13.71, 67.8],
        [0.1, 0.7159, 4.217, 1.9, 15.44, 715.9],
      ]),
      'CPTu01 fórmulas',
    )
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const r = importarPlanilha(buf)
    if (r.tipo !== 'furos') throw new Error('tipo')
    expect(r.furos).toHaveLength(1)
    expect(r.furos[0].cabecalho).toMatchObject({ nome: 'CPTu01', NA: 0.86, profApoio: 11.1, espArgilaMole: 7.2, recalqueGuia: 0.12 })
    expect(r.furos[0].leituras).toHaveLength(2)
    expect(r.furos[0].leituras[1]).toMatchObject({ z: 0.1, qt: 0.7159 })
  })
})

describe('conferência do furo', () => {
  const base: FuroCptu = {
    id: null,
    cabecalho: { nome: 'CPTu01', NA: 0.86, profApoio: 11.1, espArgilaMole: 7.2 },
    t50: null,
    leituras: [],
    zonas: [],
  }

  test('acusa z fora de ordem, γ fora da faixa e apoio abaixo da última leitura', () => {
    const av = conferirFuro(
      {
        ...base,
        leituras: [
          { z: 0, qt: 0.5, Rf: 2, u2: 0, gamma: 25 },
          { z: 0.2, qt: 0.5, Rf: 2, u2: 0, gamma: 16 },
          { z: 0.1, qt: null, Rf: null, u2: null, gamma: null },
        ],
      },
      PARAMETROS_PADRAO,
    )
    const textos = av.map((a) => a.texto).join(' | ')
    expect(av.some((a) => a.nivel === 'erro' && a.linha === 2)).toBe(true)
    expect(textos).toMatch(/fora de 12 a 21/)
    expect(textos).toMatch(/sem qt/)
    expect(textos).toMatch(/sem γ/)
    expect(textos).toMatch(/abaixo da última leitura/)
  })
})
