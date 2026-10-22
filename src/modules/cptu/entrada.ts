import type { CabecalhoFuro, FuroCptu, LeituraCptu, ParametrosCptu } from './calc/tipos'

// Entrada de leituras: colar do Excel (Ctrl+V, tab e vírgula decimal),
// importar CSV/XLSX e conferir o furo. Funções puras, sem React.

/** Colunas da grade de leituras, na ordem em que aparecem e em que se cola. */
export const COLUNAS_LEITURA = [
  { chave: 'z', rotulo: 'z', unidade: 'm', obrigatoria: true },
  { chave: 'qt', rotulo: 'qt', unidade: 'MPa', obrigatoria: true },
  { chave: 'Rf', rotulo: 'Rf', unidade: '%', obrigatoria: true },
  { chave: 'u2', rotulo: 'u2', unidade: 'kPa', obrigatoria: true },
  { chave: 'gamma', rotulo: 'γ', unidade: 'kN/m³', obrigatoria: false },
  { chave: 'SuRel', rotulo: 'Su rel.', unidade: 'kPa', obrigatoria: false },
  { chave: 'OCRRel', rotulo: 'OCR rel.', unidade: '', obrigatoria: false },
  { chave: 'SuAmolgRel', rotulo: 'Su amolg. rel.', unidade: 'kPa', obrigatoria: false },
] as const

export type ChaveLeitura = (typeof COLUNAS_LEITURA)[number]['chave']

/**
 * Número escrito em português ou em inglês: "0,4803", "1.234,5", "0.4803".
 * Vazio, "-" ou texto que não é número → null.
 */
export function numeroBR(texto: string | number | null | undefined): number | null {
  if (texto == null) return null
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null
  let s = texto.trim().replace(/\s/g, '')
  if (s === '' || s === '-' || s === '—') return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Texto em linhas e células. Colado do Excel: separador tab (uma coluna só
 * não tem separador, e a vírgula é decimal). Arquivo CSV: tab, ";" ou ",".
 */
export function lerTabelaTexto(texto: string, origem: 'colar' | 'csv' = 'colar'): string[][] {
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n')
  while (linhas.length && linhas[linhas.length - 1].trim() === '') linhas.pop()
  let sep = '\t'
  if (origem === 'csv' && !texto.includes('\t')) sep = texto.includes(';') ? ';' : ','
  return linhas.map((l) => l.split(sep))
}

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Identifica a coluna pelo título. Devolve a chave e, para qt, o fator que
 * leva para MPa (título em kPa → ÷ 1000). Títulos calculados (fórmula,
 * σv0, St…) não são reconhecidos, para não importar resultado como leitura.
 */
export function identificarColuna(titulo: string): { chave: ChaveLeitura; fator: number } | null {
  const t = normalizar(titulo)
  if (!t) return null
  if (/^prof|^z\b|^z \(|profundidade/.test(t)) return { chave: 'z', fator: 1 }
  if (/^qt\b/.test(t) && !/sigma|σ|−|-/.test(t)) return { chave: 'qt', fator: /kpa/.test(t) ? 0.001 : 1 }
  if (/^rf\b/.test(t)) return { chave: 'Rf', fator: 1 }
  if (/^u2\b/.test(t)) return { chave: 'u2', fator: 1 }
  if (/amolg/.test(t) && /su/.test(t)) return { chave: 'SuAmolgRel', fator: 1 }
  if (/^su\b/.test(t) && /rel/.test(t) && !/÷|\/|meu/.test(t)) return { chave: 'SuRel', fator: 1 }
  if (/^ocr\b/.test(t) && /rel/.test(t)) return { chave: 'OCRRel', fator: 1 }
  if (/^(γ|gamma|peso)/.test(t) && !/formula|agua|aterro/.test(t)) return { chave: 'gamma', fator: 1 }
  return null
}

export interface MapaColunas {
  /** índice da coluna no bloco → chave e fator */
  porIndice: ({ chave: ChaveLeitura; fator: number } | null)[]
  /** true quando a primeira linha era cabeçalho */
  temCabecalho: boolean
}

/**
 * Decide como ler um bloco: se a primeira linha tem texto que não é número,
 * é cabeçalho e as colunas são achadas pelo título; senão, as colunas seguem
 * a ordem da grade a partir de `colunaInicial`.
 */
export function mapearColunas(bloco: string[][], colunaInicial = 0): MapaColunas {
  const primeira = bloco[0] ?? []
  const temCabecalho = primeira.some((c) => c.trim() !== '' && numeroBR(c) == null)
  if (temCabecalho) {
    const vistas = new Set<ChaveLeitura>()
    const porIndice = primeira.map((c) => {
      const id = identificarColuna(c)
      if (!id || vistas.has(id.chave)) return null
      vistas.add(id.chave)
      return id
    })
    return { porIndice, temCabecalho }
  }
  const largura = Math.max(0, ...bloco.map((l) => l.length))
  const porIndice = Array.from({ length: largura }, (_, j) => {
    const col = COLUNAS_LEITURA[colunaInicial + j]
    return col ? { chave: col.chave as ChaveLeitura, fator: 1 } : null
  })
  return { porIndice, temCabecalho }
}

export const leituraVazia = (z: number): LeituraCptu => ({
  z, qt: null, Rf: null, u2: null, gamma: null, SuRel: null, OCRRel: null, SuAmolgRel: null,
})

/** Bloco com cabeçalho (ou CSV/XLSX importado) → leituras novas. Linhas sem z são ignoradas. */
export function blocoParaLeituras(bloco: (string | number | null)[][], mapa: MapaColunas): { leituras: LeituraCptu[]; ignoradas: number } {
  const corpo = mapa.temCabecalho ? bloco.slice(1) : bloco
  const leituras: LeituraCptu[] = []
  let ignoradas = 0
  for (const linha of corpo) {
    if (linha.every((c) => c == null || String(c).trim() === '')) continue
    const l = leituraVazia(NaN)
    mapa.porIndice.forEach((id, j) => {
      if (!id) return
      const v = numeroBR(linha[j] as string | number | null)
      ;(l as unknown as Record<string, number | null>)[id.chave] = v == null ? null : v * id.fator
    })
    if (!Number.isFinite(l.z)) {
      ignoradas++
      continue
    }
    leituras.push(l)
  }
  return { leituras: leituras.sort((a, b) => a.z - b.z), ignoradas }
}

/**
 * Cola um bloco de números sobre a grade, a partir da linha e da coluna
 * onde está o cursor (como no Excel). Linhas que passarem do fim são
 * criadas. Célula vazia no bloco apaga o valor.
 */
export function colarNaGrade(
  leituras: LeituraCptu[],
  bloco: string[][],
  linhaInicial: number,
  colunaInicial: number,
): LeituraCptu[] {
  const out = leituras.map((l) => ({ ...l }))
  bloco.forEach((cels, i) => {
    const r = linhaInicial + i
    while (out.length <= r) out.push(leituraVazia(NaN))
    cels.forEach((txt, j) => {
      const col = COLUNAS_LEITURA[colunaInicial + j]
      if (!col) return
      ;(out[r] as unknown as Record<string, number | null>)[col.chave] = numeroBR(txt)
    })
  })
  return out
}

/** Aviso de conferência de um furo. `linha` é o índice na grade, quando houver. */
export interface AvisoEntrada {
  nivel: 'erro' | 'aviso'
  texto: string
  linha?: number
}

export function conferirFuro(furo: FuroCptu, p: ParametrosCptu): AvisoEntrada[] {
  const av: AvisoEntrada[] = []
  const c: CabecalhoFuro = furo.cabecalho
  const L = furo.leituras
  if (!c.nome.trim()) av.push({ nivel: 'erro', texto: 'Furo sem nome.' })
  if (L.length === 0) {
    av.push({ nivel: 'aviso', texto: 'Nenhuma leitura ainda.' })
    return av
  }

  let semQt = 0
  let semRf = 0
  let gammaFora = 0
  let semGamma = 0
  L.forEach((l, i) => {
    if (!Number.isFinite(l.z)) av.push({ nivel: 'erro', texto: 'Linha sem profundidade z.', linha: i })
    else if (i > 0 && Number.isFinite(L[i - 1].z) && l.z <= L[i - 1].z)
      av.push({ nivel: 'erro', texto: `Profundidade fora de ordem ou repetida (z = ${String(l.z).replace('.', ',')} m).`, linha: i })
    if (l.qt == null) semQt++
    else if (l.Rf == null || l.Rf <= 0) semRf++
    if (l.gamma == null) semGamma++
    else if (l.gamma < p.gammaMin || l.gamma > p.gammaMax) gammaFora++
  })
  if (semQt) av.push({ nivel: 'aviso', texto: `${semQt} linha(s) sem qt: ficam vazias, mas somam σv0.` })
  if (semRf) av.push({ nivel: 'aviso', texto: `${semRf} linha(s) com Rf vazio ou ≤ 0: ficam vazias, mas somam σv0.` })
  if (semGamma) av.push({ nivel: 'aviso', texto: `${semGamma} linha(s) sem γ: usado ${p.gammaPadrao} kN/m³.` })
  if (gammaFora) av.push({ nivel: 'aviso', texto: `${gammaFora} linha(s) com γ fora de ${p.gammaMin} a ${p.gammaMax}: valor limitado.` })

  const zMax = Math.max(...L.map((l) => l.z).filter(Number.isFinite))
  const br = (v: number) => String(v).replace('.', ',')
  if (c.profApoio > zMax) av.push({ nivel: 'aviso', texto: `Profundidade de apoio (${br(c.profApoio)} m) abaixo da última leitura (${br(zMax)} m).` })
  if (c.espArgilaMole <= 0) av.push({ nivel: 'aviso', texto: 'Espessura de argila mole não informada: o t90 sai zero.' })
  return av
}
