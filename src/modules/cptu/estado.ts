import { PREMISSAS_TEMPO_PADRAO, type PremissasTempo } from './calc/adensamento'
import { OPCOES_PADRAO, PARAMETROS_PADRAO } from './calc/parametros'
import type { FuroCptu, OpcoesCptu, ParametrosCptu } from './calc/tipos'

// Estado da análise aberta na tela. Fica no navegador (rascunho) enquanto o
// usuário edita; "Salvar" grava no Supabase (storage.ts).

export interface EstadoAnaliseCptu {
  id: string | null          // null = ainda não salva
  nome: string
  parametros: ParametrosCptu
  premissasTempo: PremissasTempo
  opcoes: OpcoesCptu
  furos: FuroCptu[]
  /** ids de furos já salvos que foram removidos na tela (apagar ao salvar) */
  removidos: string[]
}

export function analiseNova(nome = 'Análise CPTu'): EstadoAnaliseCptu {
  return {
    id: null,
    nome,
    parametros: { ...PARAMETROS_PADRAO },
    premissasTempo: { ...PREMISSAS_TEMPO_PADRAO },
    opcoes: structuredClone(OPCOES_PADRAO),
    furos: [],
    removidos: [],
  }
}

/** Próximo nome livre: CPTu01, CPTu02… */
export function proximoNomeFuro(furos: FuroCptu[]): string {
  const usados = new Set(furos.map((f) => f.cabecalho.nome.toUpperCase()))
  for (let i = 1; ; i++) {
    const nome = 'CPTu' + String(i).padStart(2, '0')
    if (!usados.has(nome.toUpperCase())) return nome
  }
}

export function furoNovo(nome: string): FuroCptu {
  return {
    id: null,
    cabecalho: { nome, NA: 0, profApoio: 0, espArgilaMole: 0, profTotal: null, recalqueGuia: null },
    t50: null,
    leituras: [],
    zonas: [],
  }
}

/**
 * Junta furos importados aos atuais: furo com o mesmo nome é substituído
 * (mantém o id, para regravar no banco); os outros entram no fim.
 */
export function mesclarFuros(atuais: FuroCptu[], novos: FuroCptu[]): { furos: FuroCptu[]; substituidos: string[] } {
  const furos = [...atuais]
  const substituidos: string[] = []
  for (const n of novos) {
    const i = furos.findIndex((f) => f.cabecalho.nome.toUpperCase() === n.cabecalho.nome.toUpperCase())
    if (i >= 0) {
      furos[i] = { ...n, id: furos[i].id, zonas: furos[i].zonas }
      substituidos.push(n.cabecalho.nome)
    } else furos.push(n)
  }
  return { furos, substituidos }
}
