import { T90 } from './adensamento'
import type { CabecalhoFuro, LinhaCptu, ResumoFuro } from './tipos'

// Resumo por furo (aba Resumo). As somas e estatísticas usam só as linhas com
// z ≤ profundidade de apoio, como o SUMIFS/AVERAGEIFS da planilha.

/** Folga para comparar profundidades digitadas (evita erro de ponto flutuante). */
const EPS = 1e-9

/** Espessura de cada linha "Passa…" na contagem: fixa em 0,1 m, como na planilha. */
const PASSO_CONTAGEM = 0.1

const soma = (v: number[]) => v.reduce((a, b) => a + b, 0)
const media = (v: number[]) => (v.length ? soma(v) / v.length : null)
const minimo = (v: number[]) => (v.length ? Math.min(...v) : null)
const valores = (linhas: LinhaCptu[], f: (l: LinhaCptu) => number | null) =>
  linhas.map(f).filter((x): x is number => x != null)

export function resumoFuro(linhas: LinhaCptu[], cab: CabecalhoFuro, cv: number): ResumoFuro {
  const ateApoio = linhas.filter((l) => l.z <= cab.profApoio + EPS)
  // Hdr: a aba Resumo sempre considera drenagem pelos dois lados
  const Hdr = cab.espArgilaMole / 2
  return {
    nome: cab.nome,
    profApoio: cab.profApoio,
    recalqueCcCrApoio: soma(valores(ateApoio, (l) => l.recalqueCcCr)),
    recalqueMApoio: soma(valores(ateApoio, (l) => l.recalqueM)),
    recalqueCcCrTotal: soma(valores(linhas, (l) => l.recalqueCcCr)),
    recalqueGuia: cab.recalqueGuia ?? null,
    suMedio: media(valores(ateApoio, (l) => l.Su)),
    suMin: minimo(valores(ateApoio, (l) => l.Su)),
    ocrMin: minimo(valores(ateApoio, (l) => l.OCR)),
    espessuraPassa: ateApoio.filter((l) => l.situacao === 'Passa da memória do solo').length * PASSO_CONTAGEM,
    espArgilaMole: cab.espArgilaMole,
    Hdr,
    t90: (T90 * Hdr ** 2) / cv,
    stMedio: media(valores(ateApoio, (l) => l.St)),
  }
}
