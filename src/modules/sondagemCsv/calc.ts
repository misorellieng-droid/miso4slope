// Superfícies de sondagem SPT: converte profundidades do boletim em cotas e
// gera os CSVs (Top Soil, N.A., Suporte, FIM SPT) para importar no Civil 3D.
// Funções puras, sem React. Cota = cota da boca − profundidade.

export interface FuroSpt {
  /** Identificação como no boletim: "1", "65", "65A"… */
  nome: string
  e: number | null
  n: number | null
  cotaBoca: number | null
  /** Profundidade do N.A. (m); null = não informado */
  profNA: number | null
  /** true = furo seco: sem N.A. */
  seco: boolean
  /** Espessura da camada vegetal (m); null = n/d */
  espTopSoil: number | null
  profSuporte: number | null
  profFimSpt: number | null
  /** Leituras de SPT (z em m, N). Só serve para sugerir o Suporte. */
  spt: { z: number; n: number }[]
}

export interface ParametrosSpt {
  /** N mínimo (contínuo até o fim do ensaio) que define o Suporte */
  nMinSuporte: number
  /** Cota da plataforma, só para conferência (opcional) */
  cotaPlataforma: number | null
}

export const PARAMETROS_PADRAO: ParametrosSpt = { nMinSuporte: 10, cotaPlataforma: 615.8 }

export type CategoriaSpt = 'topsoil' | 'na' | 'suporte' | 'fimSpt'

export const CATEGORIAS: { id: CategoriaSpt; rotulo: string; arquivo: string }[] = [
  { id: 'topsoil', rotulo: 'Top Soil', arquivo: 'SP_Cota_TopSoil.csv' },
  { id: 'na', rotulo: 'N.A.', arquivo: 'SP_Cota_NA.csv' },
  { id: 'suporte', rotulo: 'Suporte', arquivo: 'SP_Cota_Suporte.csv' },
  { id: 'fimSpt', rotulo: 'FIM SPT', arquivo: 'SP_Cota_Fim_SPT.csv' },
]

export const furoVazio = (nome = ''): FuroSpt => ({
  nome, e: null, n: null, cotaBoca: null, profNA: null, seco: false,
  espTopSoil: null, profSuporte: null, profFimSpt: null, spt: [],
})

/** Furo principal = nome só com número. "65A"/"65B" são repetições e não entram nos CSVs. */
export const numeroDoFuro = (nome: string): number | null => (/^\d+$/.test(nome.trim()) ? Number(nome.trim()) : null)
export const rotuloFuro = (numero: number) => `SP-${String(numero).padStart(2, '0')}`

const cota = (boca: number | null, prof: number | null): number | null =>
  boca == null || prof == null ? null : boca - prof

export interface CotasFuro {
  topsoil: number | null
  na: number | null
  suporte: number | null
  fimSpt: number | null
}

export function cotasDoFuro(f: FuroSpt): CotasFuro {
  return {
    topsoil: cota(f.cotaBoca, f.espTopSoil),
    na: f.seco ? null : cota(f.cotaBoca, f.profNA),
    suporte: cota(f.cotaBoca, f.profSuporte),
    fimSpt: cota(f.cotaBoca, f.profFimSpt),
  }
}

/**
 * Sugere a profundidade do Suporte: primeira leitura a partir da qual o N se
 * mantém ≥ nMin até a última leitura. Se a última leitura já está abaixo de
 * nMin, não há Suporte (null).
 */
export function sugerirSuporte(spt: { z: number; n: number }[], nMin: number): number | null {
  const ord = [...spt].sort((a, b) => a.z - b.z)
  let inicio: number | null = null
  for (const l of ord) {
    if (l.n >= nMin) {
      if (inicio == null) inicio = l.z
    } else {
      inicio = null
    }
  }
  return inicio
}

export interface Aviso {
  nome: string
  nivel: 'erro' | 'aviso'
  texto: string
}

export function conferirFuros(furos: FuroSpt[], p: ParametrosSpt): Aviso[] {
  const av: Aviso[] = []
  const vistos = new Set<string>()
  for (const f of furos) {
    const nome = f.nome || '(sem nome)'
    const add = (nivel: Aviso['nivel'], texto: string) => av.push({ nome, nivel, texto })
    const chave = f.nome.trim().toUpperCase()
    if (!chave) add('erro', 'Furo sem identificação.')
    else if (vistos.has(chave)) add('erro', 'Identificação repetida.')
    vistos.add(chave)
    if (numeroDoFuro(f.nome) == null) {
      if (f.nome.trim()) add('aviso', 'Repetição (A/B) ou nome não numérico: fica fora dos CSVs.')
      continue
    }
    if (f.e == null || f.n == null) add('erro', 'Sem coordenadas E/N.')
    if (f.cotaBoca == null) add('erro', 'Sem cota da boca.')
    if (f.profSuporte == null) add('aviso', `Sem Suporte${f.spt.length ? ' (dá para sugerir pelo SPT)' : ''}.`)
    if (f.profFimSpt == null) add('aviso', 'Sem profundidade do FIM SPT.')
    if (f.espTopSoil == null) add('aviso', 'Top Soil n/d: fora do CSV de Top Soil.')
    if (!f.seco && f.profNA == null) add('aviso', 'N.A. não informado: fora do CSV de N.A.')
    const neg = [f.profNA, f.espTopSoil, f.profSuporte, f.profFimSpt].some((v) => v != null && v < 0)
    if (neg) add('erro', 'Profundidade negativa.')
    if (f.profSuporte != null && f.profFimSpt != null && f.profSuporte > f.profFimSpt)
      add('erro', 'Suporte mais fundo que o FIM SPT.')
    if (f.espTopSoil != null && f.profSuporte != null && f.espTopSoil > f.profSuporte)
      add('erro', 'Top Soil mais espesso que a profundidade do Suporte.')
    if (f.profNA != null && f.profFimSpt != null && f.profNA > f.profFimSpt)
      add('aviso', 'N.A. abaixo do FIM SPT (conferir).')
    if (f.spt.length && f.profSuporte != null) {
      const sug = sugerirSuporte(f.spt, p.nMinSuporte)
      if (sug != null && Math.abs(sug - f.profSuporte) > 0.5)
        add('aviso', `Suporte informado ${f.profSuporte} m; pelo SPT (N ≥ ${p.nMinSuporte}) seria ${sug} m.`)
    }
  }
  return av
}

const fmt = (v: number) => v.toFixed(3)

/** Linhas do CSV de uma categoria: `n,E,N,cota,SP-xx`. Furos sem dado ficam de fora. */
export function linhasCsv(furos: FuroSpt[], cat: CategoriaSpt): string[] {
  const linhas: string[] = []
  for (const f of furos) {
    const numero = numeroDoFuro(f.nome)
    if (numero == null || f.e == null || f.n == null) continue
    const c = cotasDoFuro(f)[cat]
    if (c == null) continue
    linhas.push(`${numero},${fmt(f.e)},${fmt(f.n)},${fmt(c)},${rotuloFuro(numero)}`)
  }
  return linhas
}

export const textoCsv = (furos: FuroSpt[], cat: CategoriaSpt): string => linhasCsv(furos, cat).join('\r\n') + '\r\n'
