// Tipos do módulo de interpretação de CPTu. Reproduz a planilha de referência
// CPTu_01a10_com_formulas.xlsx (Misorelli Engenharia, 26.22.2 EREA Meli
// Biguaçu). As letras nos comentários são as colunas da aba "CPTuXX fórmulas".

/** Origem de cada parâmetro: deixa claro o que é medida e o que é suposição. */
export type OrigemCptu = 'CONSTANTE' | 'EMPÍRICO' | 'HIPÓTESE' | 'CALCULADO' | 'CRITÉRIO'

/** Parâmetros do projeto (um conjunto por análise). Aba Parametros. */
export interface ParametrosCptu {
  gammaW: number        // γ água (kN/m³)
  pa: number            // pressão atmosférica (kPa)
  Nkt: number           // fator de cone para Su
  kSigmaP: number       // k para σ'p = k × qnet
  hAterro: number       // altura do aterro (m)
  gammaAterro: number   // γ do aterro (kN/m³)
  q: number             // sobrecarga (kPa)
  CcN: number           // Cc/(1+e0)
  CrN: number           // Cr/(1+e0)
  gammaPadrao: number   // γ quando o relatório não traz (kN/m³)
  gammaMin: number      // limite inferior de γ
  gammaMax: number      // limite superior de γ
  IcArgilaMin: number   // faixa de Ic onde vale Su (inclusivo)
  IcArgilaMax: number   // (exclusivo)
  MqtnMax: number       // teto do Qtn no módulo M
}

/** Cabeçalho de cada furo. */
export interface CabecalhoFuro {
  nome: string
  NA: number             // nível d'água (m)
  profApoio: number      // topo da areia de apoio = limite da soma do recalque (m)
  espArgilaMole: number  // espessura de argila mole (m)
  profTotal?: number | null
  recalqueGuia?: number | null  // valor de referência do guia, só para comparar (m)
  E?: number | null
  N?: number | null
  cotaBoca?: number | null
}

/** Uma leitura do ensaio (entrada do usuário). */
export interface LeituraCptu {
  z: number                     // profundidade (m)
  qt: number | null             // resistência de ponta corrigida (MPa)
  Rf: number | null             // razão de atrito (%)
  u2: number | null             // poropressão (kPa)
  gamma?: number | null         // γ do relatório (kN/m³)
  SuRel?: number | null         // Su do relatório (kPa), conferência
  OCRRel?: number | null        // OCR do relatório, conferência
  SuAmolgRel?: number | null    // Su amolgado do relatório (kPa), conferência
}

export type Material =
  | 'Areia'
  | 'Areia com silte'
  | 'Silte argiloso / argila siltosa'
  | 'Argila'
  | 'Orgânico'

export type Situacao = 'Dentro da memória do solo' | 'Passa da memória do solo'

/** Resultado por profundidade. null = célula vazia na planilha (não se aplica). */
export interface LinhaCptu {
  z: number
  entrada: LeituraCptu
  gamma: number               // γ usado (relatório ou padrão, limitado)
  dz: number                  // espessura da fatia (m)
  qtKPa: number | null        // F
  fs: number | null           // G
  sigmaV0: number             // H
  u0: number                  // I
  sigmaV0Ef: number           // J  σ'v0
  qnet: number | null         // K  qt − σv0
  Fr: number | null           // L  (%)
  Bq: number | null           // M
  Qtn1: number | null         // N  Qtn com n = 1
  Ic1: number | null          // O  Ic da 1ª passada
  n: number | null            // P
  Qtn: number | null          // Q
  Ic: number | null           // R  Robertson 2009
  material: Material | null   // S
  Su: number | null           // T
  sigmaP: number | null       // U  σ'p
  OCR: number | null          // V
  SuSigmaV0: number | null    // W  Su/σ'v0
  M: number | null            // X  (MPa)
  gammaFormula: number | null // Y  conferência
  SuRazaoRel: number | null   // AB Su ÷ Su do relatório
  St: number | null           // AD Su ÷ fs
  StRel: number | null        // AE Su rel ÷ Su amolgado rel
  OCRnec: number | null       // AF
  situacao: Situacao | null   // AG
  sigmaF: number | null       // AH σ'f = σ'v0 + Δσ
  recalqueCcCr: number | null // AI (m)
  recalqueM: number | null    // AJ (m)
}

/** Resumo por furo (aba Resumo). */
export interface ResumoFuro {
  nome: string
  profApoio: number
  recalqueCcCrApoio: number
  recalqueMApoio: number
  recalqueCcCrTotal: number
  recalqueGuia: number | null
  suMedio: number | null
  suMin: number | null
  ocrMin: number | null
  espessuraPassa: number
  espArgilaMole: number
  Hdr: number
  t90: number
  stMedio: number | null
}
