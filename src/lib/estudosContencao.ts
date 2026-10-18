import type { TipoEstudo } from './estudosStorage'

// Ponte entre os painéis de contenção (que guardam as entradas no
// localStorage do navegador) e o estudo gravado no projeto/revisão: o
// snapshot leva as entradas da Nova Análise + os parâmetros do painel + o
// resultado calculado, e ao reabrir tudo volta para o localStorage.

const PREFIXO_ANALISE = 'miso4slope:analise:'
const CHAVES_ANALISE = ['geometry', 'layers', 'fill', 'coverage'] as const

/** Chave do localStorage onde cada painel guarda seus parâmetros. */
export const CHAVES_PARAMS: Record<Exclude<TipoEstudo, 'muros'>, string[]> = {
  faixa_colunas: ['miso4slope.argila.faixa', 'miso4slope.argila.colchao'],
  cortina: ['miso4slope.argila.cortina'],
  solo_reforcado: ['miso4slope.argila.mse'],
}

export interface DadosContencao {
  versao: 1
  /** entradas da Nova Análise (geometria, camadas, aterro, revestimento) */
  analise: Record<string, unknown>
  /** parâmetros do painel, por chave do localStorage */
  params: Record<string, unknown>
  /** resultado calculado (null se o estudo foi salvo antes de calcular) */
  resultado: unknown
}

function lerLocal(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

function gravarLocal(key: string, v: unknown) {
  try {
    if (v === undefined || v === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(v))
  } catch {
    // localStorage indisponível — o painel abre com os valores padrão
  }
}

// JSON não guarda Infinity/NaN (viram null); os resultados de contenção usam
// Infinity (ex.: "FS > 99"), então são marcados para voltarem iguais.
export function codificarJson<T>(valor: T): unknown {
  return JSON.parse(
    JSON.stringify(valor, (_k, v) =>
      typeof v === 'number' && !Number.isFinite(v) ? { __num: String(v) } : v
    )
  )
}

export function decodificarJson<T>(valor: unknown): T {
  return JSON.parse(JSON.stringify(valor), (_k, v) =>
    v && typeof v === 'object' && '__num' in v && Object.keys(v).length === 1 ? Number((v as { __num: string }).__num) : v
  ) as T
}

export function montarDadosContencao(tipo: Exclude<TipoEstudo, 'muros'>, resultado: unknown): DadosContencao {
  const analise: Record<string, unknown> = {}
  for (const c of CHAVES_ANALISE) {
    const v = lerLocal(PREFIXO_ANALISE + c)
    if (v !== undefined) analise[c] = v
  }
  const params: Record<string, unknown> = {}
  for (const k of CHAVES_PARAMS[tipo]) {
    const v = lerLocal(k)
    if (v !== undefined) params[k] = v
  }
  return { versao: 1, analise, params, resultado: resultado === undefined ? null : codificarJson(resultado) }
}

/** Devolve as entradas ao localStorage (os painéis leem de lá ao montar) e entrega o resultado salvo. */
export function aplicarDadosContencao<R>(tipo: Exclude<TipoEstudo, 'muros'>, bruto: unknown): R | null {
  const dados = bruto as DadosContencao
  for (const c of CHAVES_ANALISE) {
    if (dados.analise && c in dados.analise) gravarLocal(PREFIXO_ANALISE + c, dados.analise[c])
  }
  for (const k of CHAVES_PARAMS[tipo]) {
    if (dados.params && k in dados.params) gravarLocal(k, dados.params[k])
  }
  return dados.resultado == null ? null : decodificarJson<R>(dados.resultado)
}
