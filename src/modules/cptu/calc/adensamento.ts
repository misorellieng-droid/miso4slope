// Tempo de adensamento e drenos verticais (aba "Tempo e drenos"). Nada aqui
// vem do ensaio: são hipóteses. Atenção: a fórmula de Barron usa ln
// (logaritmo natural), diferente do resto do módulo.

export const T90 = 0.848          // fator de tempo para 90% (Terzaghi)
export const T50 = 0.245          // cone com filtro em u2
export const RAIO_CONE = 0.01785  // m, cone de 10 cm²
export const SEGUNDOS_POR_ANO = 31_557_600

export interface PremissasTempo {
  cv: number              // m²/ano (HIPÓTESE, faixa 1 a 3)
  drenagemDupla: boolean  // drena pelos dois lados (HIPÓTESE)
  Ir: number              // índice de rigidez G/Su (HIPÓTESE, 50 a 200)
  t50: number | null      // s, do ensaio de dissipação (quando houver)
  dw: number              // diâmetro equivalente do dreno (m)
  U: number               // grau de adensamento alvo
  espacamentos: number[]  // m
  chDrenos: number[]      // m²/ano
  prazoObraMeses: number
}

export const PREMISSAS_TEMPO_PADRAO: PremissasTempo = {
  cv: 2,
  drenagemDupla: true,
  Ir: 100,
  t50: null,
  dw: 0.066,
  U: 0.9,
  espacamentos: [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4],
  chDrenos: [2, 5, 10],
  prazoObraMeses: 12,
}

/** Valores de t50 da tabela ilustrativa (quando não há ensaio de dissipação). */
export const T50_ILUSTRATIVOS = [300, 1000, 3000, 10000]

/** Tempo para 90% sem drenos: t90 = T90 × Hdr² / cv (anos). */
export function tempoSemDrenos(H: number, drenagemDupla: boolean, cv: number): { Hdr: number; t90: number } {
  const Hdr = drenagemDupla ? H / 2 : H
  return { Hdr, t90: (T90 * Hdr ** 2) / cv }
}

/** ch (m²/ano) a partir do t50 da dissipação: T50 × r² × √Ir / t50. */
export function chPorDissipacao(t50: number, Ir: number): number {
  return ((T50 * RAIO_CONE ** 2 * Math.sqrt(Ir)) / t50) * SEGUNDOS_POR_ANO
}

/** Prazo (meses) para o grau U com drenos em malha triangular (Barron). */
export function prazoDrenoMeses(s: number, ch: number, dw: number, U: number): number {
  const de = 1.05 * s
  return (de ** 2 / (8 * ch)) * (Math.log(de / dw) - 0.75) * Math.log(1 / (1 - U)) * 12
}

export interface CelulaDreno {
  s: number
  ch: number
  meses: number
  cabeNoPrazo: boolean
}

/** Tabela espaçamento × ch, marcando as células que cabem no prazo de obra. */
export function tabelaDrenos(pr: PremissasTempo): CelulaDreno[][] {
  return pr.espacamentos.map((s) =>
    pr.chDrenos.map((ch) => {
      const meses = prazoDrenoMeses(s, ch, pr.dw, pr.U)
      return { s, ch, meses, cabeNoPrazo: meses <= pr.prazoObraMeses }
    }),
  )
}
