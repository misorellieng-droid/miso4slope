import { lerTabelaTexto, numeroBR } from '../cptu/entrada'
import { furoVazio, type FuroSpt } from './calc'

// Entrada da tabela de sondagens: colar do Excel (tab, vírgula decimal) ou
// ler CSV. Aceita a planilha de avaliação inteira (colunas extras são
// ignoradas) ou só as colunas de entrada, na ordem abaixo.

export type CampoSpt = 'nome' | 'e' | 'n' | 'cotaBoca' | 'profNA' | 'espTopSoil' | 'profSuporte' | 'profFimSpt' | 'spt'

export const ORDEM_PADRAO: CampoSpt[] = ['nome', 'e', 'n', 'cotaBoca', 'profNA', 'espTopSoil', 'profSuporte', 'profFimSpt', 'spt']

export const TITULOS: Record<CampoSpt, string> = {
  nome: 'Nº',
  e: 'Easting',
  n: 'Northing',
  cotaBoca: 'Cota boca',
  profNA: 'Prof. N.A.',
  espTopSoil: 'Esp. Top Soil',
  profSuporte: 'Prof. Suporte',
  profFimSpt: 'Prof. FIM SPT',
  spt: 'SPT (z:N; …)',
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

/** Reconhece o campo pelo título da coluna; null = coluna que não é de entrada. */
export function identificarCampo(titulo: string): CampoSpt | null {
  const t = norm(titulo)
  if (!t) return null
  if (/^(n[º°o.]?|numero|sondagem|sondagem spt|furo|id)$/.test(t) && t !== 'n') return 'nome'
  if (/^(e|easting|leste|x)$/.test(t)) return 'e'
  if (/^(n|northing|norte|y)$/.test(t)) return 'n'
  if (/cota/.test(t)) return /boca/.test(t) || t === 'cota' ? 'cotaBoca' : null
  if (/espessura|esp\./.test(t) && !/top ?soil|vegetal/.test(t)) return null
  if (/top ?soil|vegetal/.test(t)) return 'espTopSoil'
  if (/suporte/.test(t)) return 'profSuporte'
  if (/fim/.test(t)) return /argila/.test(t) ? null : 'profFimSpt'
  if (/(^|\W)n\.?a\.?(\W|$)|nivel d/.test(t)) return 'profNA'
  if (/^(spt|n ?spt|golpes)/.test(t)) return 'spt'
  return null
}

/** "1:4; 2:5; 3:11" ou "1=4; 2,5=5" (separador ";", vírgula é decimal) → leituras (z em m, N). */
export function lerSpt(texto: string): { z: number; n: number }[] {
  const saida: { z: number; n: number }[] = []
  for (const parte of texto.split(/[;\n]/)) {
    const m = /^\s*([\d.,]+)\s*[:=]\s*([\d.,]+)\s*$/.exec(parte)
    if (!m) continue
    const z = numeroBR(m[1])
    const n = numeroBR(m[2])
    if (z != null && n != null) saida.push({ z, n })
  }
  return saida
}

export const sptParaTexto = (spt: { z: number; n: number }[]) => spt.map((l) => `${l.z}:${l.n}`).join('; ')

const ehSeco = (s: string) => /^seco/i.test(s.trim())

export interface ResultadoTabela {
  furos: FuroSpt[]
  comCabecalho: boolean
  ignoradas: number
}

/** Converte a grade (linhas × células) em furos. */
export function furosDeGrade(grade: string[][]): ResultadoTabela {
  let campos: (CampoSpt | null)[] = ORDEM_PADRAO
  let comCabecalho = false
  let inicio = 0

  const achados = grade.length ? grade[0].map(identificarCampo) : []
  if (achados.filter((c) => c).length >= 3) {
    campos = achados
    comCabecalho = true
    inicio = 1
  }

  const furos: FuroSpt[] = []
  let ignoradas = 0
  for (const linha of grade.slice(inicio)) {
    const celulas = linha.map((c) => (c ?? '').trim())
    const f = furoVazio()
    let achou = false
    campos.forEach((campo, i) => {
      const c = celulas[i] ?? ''
      if (!campo || c === '') return
      if (campo === 'nome') {
        f.nome = c
        achou = true
      } else if (campo === 'spt') {
        f.spt = lerSpt(c)
      } else if (campo === 'profNA') {
        if (ehSeco(c)) f.seco = true
        else f.profNA = numeroBR(c)
      } else {
        f[campo] = numeroBR(c)
      }
    })
    if (!achou) {
      ignoradas++
      continue
    }
    furos.push(f)
  }
  return { furos, comCabecalho, ignoradas }
}

export const furosDeTexto = (texto: string, origem: 'colar' | 'csv' = 'colar') => furosDeGrade(lerTabelaTexto(texto, origem))
