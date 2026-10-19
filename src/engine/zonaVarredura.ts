import { findCriticalCircle } from './search'
import { camadaTratada, contornaZona, espessuraCamada, paramsZonaB, xCristaMotor, xLimUsuario } from './zonaFundacao'
import type {
  AnalysisResult,
  FaceCoverage,
  FillMaterial,
  FillZone,
  Layer,
  SlopeGeometry,
  StabilityMethod,
  ZonaFundacao,
} from './types'

// Comparação "sem x com tratamento" e varreduras de sensibilidade da Zona A.
// Cada ponto é uma busca completa do círculo crítico (modo rápido nas varreduras,
// que usa grade mais grossa; o resultado final do su necessário é reconferido
// com a busca completa).

export interface EntradaAnalise {
  geo: SlopeGeometry
  layers: Layer[]
  fill: FillMaterial | null
  coverage?: FaceCoverage
  fillZones?: FillZone[]
  nSlices: number
  method: StabilityMethod
}

export type Progresso = (texto: string, feito: number, total: number) => void

async function buscar(
  e: EntradaAnalise,
  zf: ZonaFundacao,
  rapido: boolean
): Promise<AnalysisResult> {
  const geo: SlopeGeometry = { ...e.geo, zona_fundacao: { ...zf, ativa: true } }
  return findCriticalCircle(geo, e.layers, e.fill, e.coverage, e.fillZones, e.nSlices, e.method, undefined, {
    rapido,
  })
}

export interface Comparacao {
  sem: AnalysisResult
  com: AnalysisResult
  ganho: number
  ganhoPct: number
  contorna: boolean
  xLim: number
  aviso: string | null
}

export const AVISO_CONTORNA = 'o círculo crítico contorna a zona tratada'

export async function comparar(e: EntradaAnalise, zf: ZonaFundacao, onProgress?: Progresso): Promise<Comparacao> {
  onProgress?.('Sem tratamento…', 0, 2)
  const sem = await buscar(e, { ...zf, sem_tratamento: true }, false)
  onProgress?.('Com tratamento…', 1, 2)
  const com = await buscar(e, { ...zf, sem_tratamento: false }, false)
  onProgress?.('Concluído', 2, 2)
  const geo = { ...e.geo, zona_fundacao: { ...zf, ativa: true } }
  const contorna = contornaZona(zf, geo, com)
  return {
    sem,
    com,
    ganho: com.FS - sem.FS,
    ganhoPct: (100 * (com.FS - sem.FS)) / sem.FS,
    contorna,
    xLim: xLimUsuario(zf, xCristaMotor(geo)),
    aviso: contorna ? AVISO_CONTORNA : null,
  }
}

export interface PontoVarredura {
  x: number
  FS: number
  x_saida: number
  pct_zona_a: number
  referencia?: boolean // ponto de referência (ex.: su 10× o natural)
}

export interface Varredura {
  id: 'su' | 'dtr' | 'dist'
  titulo: string
  eixoX: string
  pontos: PontoVarredura[]
}

const ponto = (x: number, r: AnalysisResult, referencia = false): PontoVarredura => ({
  x,
  FS: r.FS,
  x_saida: r.x_saida ?? NaN,
  pct_zona_a: r.pct_zona_a ?? NaN,
  referencia,
})

/** su natural (topo da Zona B) da camada tratada. */
export function suNatural(zf: ZonaFundacao, layers: Layer[]): number {
  const alvo = camadaTratada(zf, layers)
  return alvo ? paramsZonaB(zf, alvo.layer, 0).c : 0
}

/** Zona A em modo direto (su equivalente), usada nas varreduras de su. */
const modoSu = (zf: ZonaFundacao, su: number): ZonaFundacao => ({
  ...zf,
  modo: 'su',
  su_topo: su,
  k: zf.modo === 'su' ? zf.k : 0,
  sem_tratamento: false,
})

export const FATORES_SU = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]
export const FATOR_TETO = 10
export const DISTANCIAS = [0, 5, 10, 20]

/** a) FS contra su da Zona A (do natural a 3×) + ponto de referência 10×. */
export async function varreduraSu(e: EntradaAnalise, zf: ZonaFundacao, onProgress?: Progresso): Promise<Varredura> {
  const suNat = suNatural(zf, e.layers)
  const pontos: PontoVarredura[] = []
  const total = FATORES_SU.length + 1
  for (let i = 0; i < FATORES_SU.length; i++) {
    onProgress?.(`su da Zona A = ${(FATORES_SU[i] * suNat).toFixed(1)} kPa`, i, total)
    const su = FATORES_SU[i] * suNat
    pontos.push(ponto(su, await buscar(e, modoSu(zf, su), true)))
  }
  onProgress?.(`su da Zona A = ${FATOR_TETO}× o natural`, total - 1, total)
  const suTeto = FATOR_TETO * suNat
  pontos.push(ponto(suTeto, await buscar(e, modoSu(zf, suTeto), true), true))
  onProgress?.('Concluído', total, total)
  return { id: 'su', titulo: 'FS × su da Zona A', eixoX: 'su da Zona A (kPa)', pontos }
}

/** b) FS contra a profundidade tratada, de 0 até a espessura da argila. */
export async function varreduraDtr(e: EntradaAnalise, zf: ZonaFundacao, onProgress?: Progresso): Promise<Varredura> {
  const alvo = camadaTratada(zf, e.layers)
  const esp = alvo ? espessuraCamada(alvo.layer) : 0
  const n = 6
  const pontos: PontoVarredura[] = []
  for (let i = 0; i <= n; i++) {
    const d = (esp * i) / n
    onProgress?.(`d_tr = ${d.toFixed(1)} m`, i, n + 1)
    pontos.push(ponto(d, await buscar(e, { ...zf, d_tr: d, sem_tratamento: false }, true)))
  }
  onProgress?.('Concluído', n + 1, n + 1)
  return { id: 'dtr', titulo: 'FS × profundidade tratada', eixoX: 'd_tr (m)', pontos }
}

/** c) FS contra a distância tratável além do pé (0, 5, 10, 20 m). */
export async function varreduraDist(e: EntradaAnalise, zf: ZonaFundacao, onProgress?: Progresso): Promise<Varredura> {
  const pontos: PontoVarredura[] = []
  for (let i = 0; i < DISTANCIAS.length; i++) {
    const d = DISTANCIAS[i]
    onProgress?.(`${d} m além do pé`, i, DISTANCIAS.length)
    pontos.push(
      ponto(d, await buscar(e, { ...zf, limite_modo: 'alem_pe', alem_pe: d, sem_tratamento: false }, true))
    )
  }
  onProgress?.('Concluído', DISTANCIAS.length, DISTANCIAS.length)
  return { id: 'dist', titulo: 'FS × distância tratável além do pé', eixoX: 'distância além do pé (m)', pontos }
}

export interface SuNecessario {
  fsAlvo: number
  suNatural: number
  suTeto: number // 10× o natural
  fsNatural: number
  fsTeto: number // teto de ganho com tratamento só dentro do terreno
  atingido: boolean
  suNecessario: number | null
  fsFinal: number | null
  aviso: string | null
}

/** d) su necessário na Zona A para atingir o FS alvo, por bisseção. */
export async function suParaFsAlvo(
  e: EntradaAnalise,
  zf: ZonaFundacao,
  fsAlvo: number,
  onProgress?: Progresso
): Promise<SuNecessario> {
  const suNat = suNatural(zf, e.layers)
  const suTeto = FATOR_TETO * suNat
  const fsDe = async (su: number, rapido = true) => (await buscar(e, modoSu(zf, su), rapido)).FS

  const passos = 12
  onProgress?.('FS com su natural', 0, passos)
  const fsNatural = await fsDe(suNat)
  onProgress?.(`FS com su ${FATOR_TETO}× o natural`, 1, passos)
  const fsTeto = await fsDe(suTeto)
  const base = { fsAlvo, suNatural: suNat, suTeto, fsNatural, fsTeto }

  if (fsNatural >= fsAlvo) {
    return { ...base, atingido: true, suNecessario: suNat, fsFinal: fsNatural, aviso: 'O FS alvo já é atingido sem tratamento.' }
  }
  if (fsTeto < fsAlvo) {
    return {
      ...base,
      atingido: false,
      suNecessario: null,
      fsFinal: null,
      aviso: `FS alvo ${fsAlvo.toFixed(2)} não é atingido nem com su ${FATOR_TETO}× o natural (FS = ${fsTeto.toFixed(2)}): o limite é imposto pela Zona B, onde o círculo crítico sai.`,
    }
  }
  let lo = suNat
  let hi = suTeto
  for (let i = 0; i < passos - 2 && hi - lo > 0.25; i++) {
    const mid = (lo + hi) / 2
    onProgress?.(`bisseção: su = ${mid.toFixed(1)} kPa`, i + 2, passos)
    if ((await fsDe(mid)) >= fsAlvo) hi = mid
    else lo = mid
  }
  onProgress?.('Conferindo com a busca completa', passos - 1, passos)
  let fsFinal = await fsDe(hi, false)
  // a grade rápida pode errar para cima: sobe o su até a busca completa confirmar o alvo
  for (let t = 0; t < 6 && fsFinal < fsAlvo; t++) {
    hi *= 1.03
    fsFinal = await fsDe(hi, false)
  }
  onProgress?.('Concluído', passos, passos)
  return { ...base, atingido: true, suNecessario: hi, fsFinal, aviso: null }
}
