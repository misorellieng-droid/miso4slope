import * as XLSX from 'xlsx'
import type { FuroCptu, LeituraCptu } from './calc/tipos'
import { blocoParaLeituras, lerTabelaTexto, mapearColunas, numeroBR, type ChaveLeitura } from './entrada'

// Importação de leituras de arquivo:
// - CSV/TXT: lido como texto (vírgula decimal brasileira, separador ; tab ou ,)
// - XLSX/XLS: primeira aba com cabeçalho reconhecível
// - Planilha de referência (abas "CPTuXX fórmulas" + "Parametros"): traz todos
//   os furos com o cabeçalho de cada um (N.A., apoio, argila mole, guia)

export type ResultadoImportacao =
  | { tipo: 'leituras'; leituras: LeituraCptu[]; ignoradas: number; colunas: ChaveLeitura[]; aba?: string }
  | { tipo: 'furos'; furos: FuroCptu[] }

type Celula = string | number | null
type Grade = Celula[][]

/** Procura o cabeçalho nas 12 primeiras linhas: a que reconhece z e qt. */
function lerGrade(grade: Grade): { leituras: LeituraCptu[]; ignoradas: number; colunas: ChaveLeitura[] } | null {
  for (let i = 0; i < Math.min(12, grade.length); i++) {
    const bloco = grade.slice(i).map((l) => l.map((c) => (c == null ? '' : String(c))))
    const mapa = mapearColunas(bloco)
    const colunas = mapa.porIndice.filter((x) => x).map((x) => x!.chave)
    if (mapa.temCabecalho && colunas.includes('z') && colunas.includes('qt')) {
      // usa os valores originais (números do Excel não passam por texto)
      const r = blocoParaLeituras(grade.slice(i), mapa)
      return { ...r, colunas }
    }
  }
  return null
}

const gradeDaAba = (ws: XLSX.WorkSheet): Grade =>
  XLSX.utils.sheet_to_json<Celula[]>(ws, { header: 1, raw: true, defval: null, blankrows: false })

const RE_ABA_FURO = /^(CPTu\s*\d+)\s+f[oó]rmulas$/i

/** Lê o cabeçalho de cada furo nas abas Parametros e Resumo da planilha de referência. */
function cabecalhosReferencia(wb: XLSX.WorkBook) {
  const cab = new Map<string, { NA: number; profApoio: number; espArgilaMole: number; profTotal: number | null; recalqueGuia: number | null }>()
  const par = wb.Sheets['Parametros']
  if (par) {
    for (const l of gradeDaAba(par)) {
      const nome = typeof l[0] === 'string' ? l[0].trim() : ''
      const NA = numeroBR(l[1])
      if (/^CPTu\s*\d+$/i.test(nome) && NA != null) {
        cab.set(nome.toUpperCase(), {
          NA, profApoio: numeroBR(l[2]) ?? 0, espArgilaMole: numeroBR(l[3]) ?? 0,
          profTotal: numeroBR(l[4]), recalqueGuia: null,
        })
      }
    }
  }
  const res = wb.Sheets['Resumo']
  if (res) {
    for (const l of gradeDaAba(res)) {
      const nome = typeof l[0] === 'string' ? l[0].trim().toUpperCase() : ''
      const c = cab.get(nome)
      if (c) c.recalqueGuia = numeroBR(l[5])
    }
  }
  return cab
}

export function importarPlanilha(dados: ArrayBuffer): ResultadoImportacao {
  const wb = XLSX.read(dados, { type: 'array' })
  const abasFuro = wb.SheetNames.filter((n) => RE_ABA_FURO.test(n))

  if (abasFuro.length) {
    const cabs = cabecalhosReferencia(wb)
    const furos: FuroCptu[] = []
    for (const aba of abasFuro) {
      const nome = RE_ABA_FURO.exec(aba)![1].replace(/\s+/g, '')
      const r = lerGrade(gradeDaAba(wb.Sheets[aba]))
      if (!r) continue
      const c = cabs.get(nome.toUpperCase())
      furos.push({
        id: null,
        cabecalho: {
          nome,
          NA: c?.NA ?? 0,
          profApoio: c?.profApoio ?? 0,
          espArgilaMole: c?.espArgilaMole ?? 0,
          profTotal: c?.profTotal ?? null,
          recalqueGuia: c?.recalqueGuia ?? null,
        },
        t50: null,
        leituras: r.leituras,
        zonas: [],
      })
    }
    if (furos.length) return { tipo: 'furos', furos }
  }

  for (const aba of wb.SheetNames) {
    const r = lerGrade(gradeDaAba(wb.Sheets[aba]))
    if (r) return { tipo: 'leituras', ...r, aba }
  }
  throw new Error('Não achei as colunas de profundidade (z) e qt em nenhuma aba.')
}

export function importarTexto(texto: string): ResultadoImportacao {
  const r = lerGrade(lerTabelaTexto(texto, 'csv'))
  if (r) return { tipo: 'leituras', ...r }
  // sem cabeçalho: colunas na ordem da grade (z, qt, Rf, u2, γ, Su rel, OCR rel, Su amolg rel)
  const bloco = lerTabelaTexto(texto, 'csv')
  const mapa = mapearColunas(bloco)
  if (mapa.temCabecalho) throw new Error('Não achei as colunas de profundidade (z) e qt no cabeçalho do arquivo.')
  const r2 = blocoParaLeituras(bloco, mapa)
  return { tipo: 'leituras', ...r2, colunas: mapa.porIndice.filter((x) => x).map((x) => x!.chave) }
}

/** Escolhe o leitor pela extensão do arquivo. */
export async function importarArquivo(arquivo: File): Promise<ResultadoImportacao> {
  if (/\.(csv|txt|tsv)$/i.test(arquivo.name)) return importarTexto(await arquivo.text())
  return importarPlanilha(await arquivo.arrayBuffer())
}
