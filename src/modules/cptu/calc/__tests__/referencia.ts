import bruto from './fixtures/referencia_cptu.json?raw'
import type { CabecalhoFuro, LeituraCptu, LinhaCptu, ResumoFuro } from '../tipos'

// Fixture tirada do xlsx de referência por scripts/extrair-referencia-cptu.cjs
// (valores com 15 algarismos, como o Excel guarda). Lida como texto para o
// TypeScript não inferir o tipo de um JSON de 768 kB.

type Coluna = (number | string | null)[]

export interface FuroReferencia {
  nome: string
  cabecalho: Required<Pick<CabecalhoFuro, 'NA' | 'profApoio' | 'espArgilaMole' | 'profTotal' | 'recalqueGuia'>>
  entrada: Record<'z' | 'qt' | 'Rf' | 'u2' | 'gamma' | 'SuRel' | 'OCRRel' | 'SuAmolgRel', (number | null)[]>
  esperado: Record<string, Coluna>
  resumo: Record<keyof Omit<ResumoFuro, 'nome' | 'profApoio' | 'recalqueGuia' | 'espArgilaMole'>, number>
}

export interface Referencia {
  fonte: string
  parametros: Record<string, number>
  tempo: {
    T90: number; cv: number; T50: number; r: number; Ir: number; dw: number; U: number
    chDrenos: number[]
    chPorT50: { t50: number; ch: number }[]
    drenos: { s: number; meses: number[] }[]
  }
  furos: FuroReferencia[]
}

export const REFERENCIA = JSON.parse(bruto) as Referencia

export function leiturasDe(f: FuroReferencia): LeituraCptu[] {
  const e = f.entrada
  return e.z.map((z, i) => ({
    z: z as number,
    qt: e.qt[i], Rf: e.Rf[i], u2: e.u2[i], gamma: e.gamma[i],
    SuRel: e.SuRel[i], OCRRel: e.OCRRel[i], SuAmolgRel: e.SuAmolgRel[i],
  }))
}

export function cabecalhoDe(f: FuroReferencia): CabecalhoFuro {
  return { nome: f.nome, ...f.cabecalho }
}

/** Colunas comparadas (todas as calculadas, F a AJ). */
export const COLUNAS_CALCULADAS: (keyof LinhaCptu)[] = [
  'qtKPa', 'fs', 'sigmaV0', 'u0', 'sigmaV0Ef', 'qnet', 'Fr', 'Bq', 'Qtn1', 'Ic1', 'n', 'Qtn', 'Ic',
  'material', 'Su', 'sigmaP', 'OCR', 'SuSigmaV0', 'M', 'gammaFormula', 'SuRazaoRel', 'St', 'StRel',
  'OCRnec', 'situacao', 'sigmaF', 'recalqueCcCr', 'recalqueM',
]

/**
 * Compara um valor calculado com o esperado. Número: tolerância relativa
 * `rel` mais uma folga absoluta `abs` (para valores perto de zero ou
 * arredondados). Texto e vazio: igualdade exata.
 * Devolve null se bate, ou a descrição da diferença.
 */
export function diferenca(calc: unknown, esp: unknown, rel: number, abs: number): string | null {
  if (esp == null || esp === '') return calc == null ? null : `esperado vazio, veio ${String(calc)}`
  if (typeof esp === 'string') return calc === esp ? null : `esperado "${esp}", veio "${String(calc)}"`
  if (typeof calc !== 'number' || typeof esp !== 'number') return `esperado ${String(esp)}, veio ${String(calc)}`
  const tol = abs + rel * Math.max(Math.abs(esp), Math.abs(calc))
  return Math.abs(calc - esp) <= tol ? null : `esperado ${esp}, veio ${calc}`
}
