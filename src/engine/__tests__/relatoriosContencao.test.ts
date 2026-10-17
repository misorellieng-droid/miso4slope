import { describe, expect, test } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { bishopFS } from '../bishop'
import { FAIXA_PADRAO } from '../argilaMole/faixaColunas'
import { avisosCortina, CORTINA_PADRAO, dimensionarCortina, type AnaliseCortina } from '../argilaMole/cortina'
import { montarPdfContencao, relatorioCortina, relatorioFaixa, seguro } from '../../lib/relatoriosContencao'
import type { Layer, SlopeGeometry } from '../types'

const fill = { c: 8, phi: 25, gamma: 18 }
const cov = { type: 'grass' as const, depth: 1.5 }
const geo: SlopeGeometry = {
  bench_height: 3.5,
  slope_ratio: 1.5,
  berm_width: 0,
  total_height: 3.5,
  water_table_depth: 0.5,
  analysis_condition: 'undrained',
  surcharge_q: 20,
}
const layers: Layer[] = [
  { name: 'Argila mole 1', y_top: 0, y_base: -15, c: 12, phi: 0, gamma: 15 },
  { name: 'Areia', y_top: -15, y_base: -18, c: 0, phi: 35, gamma: 19 },
]

async function textoDoPdf(buf: ArrayBuffer): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise
  let t = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i)
    const tc = await pg.getTextContent()
    t += (tc.items as { str: string }[]).map((it) => it.str).join(' ') + '\n'
  }
  return t.replace(/\s+/g, ' ')
}

describe('relatório PDF das contenções', () => {
  test('seguro troca símbolos fora da fonte padrão', () => {
    expect(seguro('φ ≈ 30° ≥ τ × γ')).toBe("phi ~ 30° >= tau x gamma")
  })

  test('faixa de colunas: conclusão, dados do estudo, camadas e sequência', async () => {
    const circ = bishopFS({ xc: 2, yc: 12, R: 24 }, geo, layers, fill, cov)!
    const com = { FS: 1.2, result: circ, m: 0.08 }
    const sem = { FS: 0.7, result: circ, m: 0 }
    const r = relatorioFaixa({
      geo, layers, fill, f: FAIXA_PADRAO, colchao: { espessura: 0.8, T: 0 }, sem, com,
      varredura: null, projeto: 'Obra Teste', responsavel: 'Eng. Fulano',
    })
    expect(r.conclusao.ok).toBe(false)
    const doc = await montarPdfContencao(r, null)
    const t = await textoDoPdf(doc.output('arraybuffer'))
    expect(t).toContain('Pré-dimensionamento: faixa de colunas')
    expect(t).toContain('Responsável técnico: Eng. Fulano')
    expect(t).toContain('Argila mole 1')
    expect(t).toContain('NÃO ATENDE')
    expect(t).toContain('Sequência executiva típica')
    expect(t).toContain('Recalque total e diferencial NÃO foram calculados')
  })

  test('cortina: ficha insuficiente aparece como não atende, sem texto espaçado', async () => {
    const circ = bishopFS({ xc: 2, yc: 12, R: 24 }, { ...geo, slope_ratio: 0.02 }, layers, fill, cov)!
    const e = dimensionarCortina(3.5, 20, fill, layers, CORTINA_PADRAO, 600, -15, -11)
    const forca = { fs0: 0.66, T: 600, fsFinal: 1.5, atingiu: true, circulo: circ, yCruz: -15, historico: [] }
    const res: AnaliseCortina = { forca, esforcos: e, avisos: avisosCortina(e, CORTINA_PADRAO, forca), yPonta: -18 }
    const r = relatorioCortina({ geo, layers, fill, p: CORTINA_PADRAO, res, projeto: 'Obra', responsavel: '' })
    expect(r.conclusao.ok).toBe(false)
    const t = await textoDoPdf((await montarPdfContencao(r, null)).output('arraybuffer'))
    expect(t).toContain('NÃO ATENDE como informado') // texto contíguo: sem caractere fora da fonte
    expect(t).toContain('Ficha necessária')
    expect(t).toContain('Cargas por estaca')
    expect(t).toMatch(/Ficha de 3,0 m insuficiente/) // decimal com vírgula
  })
})
