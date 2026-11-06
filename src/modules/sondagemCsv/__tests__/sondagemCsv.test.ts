import { describe, expect, it } from 'vitest'
import {
  conferirFuros, cotasDoFuro, furoVazio, linhasCsv, PARAMETROS_PADRAO, sugerirSuporte, textoCsv, type FuroSpt,
} from '../calc'
import { furosDeTexto, identificarCampo, lerSpt } from '../entrada'

// Gabarito: valores da planilha "261013 - Avaliação Sondagem" e dos CSVs gerados a partir dela.
const f = (nome: string, e: number, n: number, boca: number, p: Partial<FuroSpt>): FuroSpt => ({
  ...furoVazio(nome), e, n, cotaBoca: boca, ...p,
})

const SP01 = f('1', 270334.808, 7480218.597, 626.022, { profNA: 8.68, espTopSoil: 0.4, profSuporte: 6.5, profFimSpt: 15.1 })
const SP07 = f('7', 270210.048, 7480593.508, 635.4, { profNA: 6.78, espTopSoil: null, profSuporte: 5, profFimSpt: 15.1 })
const SP65 = f('65', 270173.78, 7481517.669, 575.667, { profNA: 5.08, espTopSoil: 0.2, profSuporte: 4, profFimSpt: 5.15 })
const SP65B = f('65B', 270173.78, 7481517.669, 575.667, { seco: true, espTopSoil: 0.3, profSuporte: 4, profFimSpt: 4.73 })
const SP70 = f('70', 270380.992, 7481636.126, 583.325, { seco: true, espTopSoil: 0.2, profSuporte: 3, profFimSpt: 4.05 })
const FUROS = [SP01, SP07, SP65, SP65B, SP70]

describe('cotas e CSVs', () => {
  it('calcula as cotas como a planilha', () => {
    const c = cotasDoFuro(SP01)
    expect(c.topsoil).toBeCloseTo(625.622, 3)
    expect(c.na).toBeCloseTo(617.342, 3)
    expect(c.suporte).toBeCloseTo(619.522, 3)
    expect(c.fimSpt).toBeCloseTo(610.922, 3)
  })

  it('CSV de Top Soil: omite n/d (SP-07) e repetições (65B)', () => {
    expect(linhasCsv(FUROS, 'topsoil')).toEqual([
      '1,270334.808,7480218.597,625.622,SP-01',
      '65,270173.780,7481517.669,575.467,SP-65',
      '70,270380.992,7481636.126,583.125,SP-70',
    ])
  })

  it('CSV de N.A.: omite furos secos', () => {
    expect(linhasCsv(FUROS, 'na')).toEqual([
      '1,270334.808,7480218.597,617.342,SP-01',
      '7,270210.048,7480593.508,628.620,SP-07',
      '65,270173.780,7481517.669,570.587,SP-65',
    ])
  })

  it('CSV de Suporte e FIM SPT', () => {
    expect(linhasCsv([SP07, SP70], 'suporte')).toEqual([
      '7,270210.048,7480593.508,630.400,SP-07',
      '70,270380.992,7481636.126,580.325,SP-70',
    ])
    expect(linhasCsv([SP07, SP70], 'fimSpt')).toEqual([
      '7,270210.048,7480593.508,620.300,SP-07',
      '70,270380.992,7481636.126,579.275,SP-70',
    ])
  })

  it('texto do CSV termina em quebra de linha e é vazio sem furos', () => {
    expect(textoCsv([SP01], 'na')).toBe('1,270334.808,7480218.597,617.342,SP-01\r\n')
  })
})

describe('sugerirSuporte', () => {
  it('primeira leitura de uma sequência contínua com N ≥ nMin', () => {
    const spt = [{ z: 1, n: 4 }, { z: 2, n: 5 }, { z: 3, n: 11 }, { z: 4, n: 8 }, { z: 5, n: 12 }, { z: 6, n: 14 }]
    expect(sugerirSuporte(spt, 10)).toBe(5)
  })
  it('null quando a última leitura está abaixo', () => {
    expect(sugerirSuporte([{ z: 1, n: 12 }, { z: 2, n: 6 }], 10)).toBeNull()
  })
  it('respeita o nMin do projeto', () => {
    const spt = [{ z: 1, n: 4 }, { z: 2, n: 8 }, { z: 3, n: 9 }]
    expect(sugerirSuporte(spt, 8)).toBe(2)
    expect(sugerirSuporte(spt, 10)).toBeNull()
  })
})

describe('conferirFuros', () => {
  it('sinaliza dados faltantes, repetição e inconsistências', () => {
    const av = conferirFuros([SP07, SP65B, f('9', 1, 1, 600, { profSuporte: 10, profFimSpt: 5 })], PARAMETROS_PADRAO)
    const textos = av.map((a) => `${a.nome}: ${a.texto}`)
    expect(textos).toContain('7: Top Soil n/d: fora do CSV de Top Soil.')
    expect(textos.some((t) => t.startsWith('65B') && t.includes('Repetição'))).toBe(true)
    expect(av.find((a) => a.nome === '9' && a.texto.includes('Suporte mais fundo'))?.nivel).toBe('erro')
  })
})

describe('entrada de tabela', () => {
  it('reconhece cabeçalhos da planilha de avaliação e ignora colunas calculadas', () => {
    expect(identificarCampo('SONDAGEM SPT')).toBe('nome')
    expect(identificarCampo('Easting')).toBe('e')
    expect(identificarCampo('Cota Boca')).toBe('cotaBoca')
    expect(identificarCampo('Cota NA')).toBeNull()
    expect(identificarCampo('Profundidade NA')).toBe('profNA')
    expect(identificarCampo('Espessura p/NA')).toBeNull()
    expect(identificarCampo('Espessura Top Soil')).toBe('espTopSoil')
    expect(identificarCampo('Cota Top Soil')).toBeNull()
    expect(identificarCampo('Profundidade Suporte')).toBe('profSuporte')
    expect(identificarCampo('Profundidade FIM SPT')).toBe('profFimSpt')
    expect(identificarCampo('Cota FIM SPT')).toBeNull()
    expect(identificarCampo('Observações')).toBeNull()
  })

  it('lê colunas coladas do Excel com vírgula decimal, Seco e n/d', () => {
    const txt = [
      'Nº\tEasting\tNorthing\tCota Boca\tProfundidade NA\tEspessura Top Soil\tProfundidade Suporte\tProfundidade FIM SPT',
      '1\t270334,808\t7480218,597\t626,022\t8,68\t0,4\t6,5\t15,1',
      '7\t270210,048\t7480593,508\t635,4\t6,78\tn/d\t5\t15,1',
      '70\t270380,992\t7481636,126\t583,325\tSeco\t0,2\t3\t4,05',
    ].join('\n')
    const r = furosDeTexto(txt)
    expect(r.comCabecalho).toBe(true)
    expect(r.furos).toHaveLength(3)
    expect(r.furos[0]).toMatchObject({ nome: '1', e: 270334.808, cotaBoca: 626.022, profNA: 8.68, espTopSoil: 0.4 })
    expect(r.furos[1].espTopSoil).toBeNull()
    expect(r.furos[2]).toMatchObject({ seco: true, profNA: null })
  })

  it('sem cabeçalho usa a ordem padrão e lê SPT', () => {
    const r = furosDeTexto('3\t1\t2\t600\t4\t0,3\t\t10\t1:4; 2:12; 3:15')
    expect(r.comCabecalho).toBe(false)
    expect(r.furos[0].spt).toEqual([{ z: 1, n: 4 }, { z: 2, n: 12 }, { z: 3, n: 15 }])
    expect(r.furos[0].profSuporte).toBeNull()
    expect(lerSpt('1=4; 2,5=5')).toEqual([{ z: 1, n: 4 }, { z: 2.5, n: 5 }])
  })
})
