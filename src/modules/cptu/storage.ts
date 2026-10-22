import { supabase } from '../../lib/supabase'
import { PREMISSAS_TEMPO_PADRAO, type PremissasTempo } from './calc/adensamento'
import { OPCOES_PADRAO, PARAMETROS_PADRAO } from './calc/parametros'
import type { FuroCptu, OpcoesCptu, ParametrosCptu } from './calc/tipos'
import {
  furoDeDb,
  furoParaDb,
  opcoesDeDb,
  parametrosDeDb,
  premissasTempoDeDb,
  type LinhaFuroDb,
} from './serializacao'

// Persistência do módulo CPTu (migration 009): slope.cptu_analises e
// slope.cptu_furos. Cada análise pertence ao projeto e à revisão ativos.

export interface AnaliseCptuResumo {
  id: string
  projeto_id: string
  revisao_id: string | null
  nome: string
  created_at: string
  updated_at: string
}

export interface AnaliseCptu extends AnaliseCptuResumo {
  parametros: ParametrosCptu
  premissasTempo: PremissasTempo
  opcoes: OpcoesCptu
  furos: FuroCptu[]
}

const COLUNAS_RESUMO = 'id, projeto_id, revisao_id, nome, created_at, updated_at'

function db() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export async function listAnalisesCptu(projetoId: string, revisaoId: string | null): Promise<AnaliseCptuResumo[]> {
  let q = db().from('cptu_analises').select(COLUNAS_RESUMO).eq('projeto_id', projetoId).order('updated_at', { ascending: false })
  if (revisaoId) q = q.eq('revisao_id', revisaoId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as AnaliseCptuResumo[]
}

/** Cria uma análise com os parâmetros padrão (os da planilha de referência). */
export async function criarAnaliseCptu(projetoId: string, revisaoId: string, nome: string): Promise<string> {
  const { data, error } = await db()
    .from('cptu_analises')
    .insert({
      projeto_id: projetoId,
      revisao_id: revisaoId,
      nome,
      parametros: PARAMETROS_PADRAO,
      premissas_tempo: PREMISSAS_TEMPO_PADRAO,
      opcoes: OPCOES_PADRAO,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function carregarAnaliseCptu(id: string): Promise<AnaliseCptu> {
  const [a, f] = await Promise.all([
    db().from('cptu_analises').select(`${COLUNAS_RESUMO}, parametros, premissas_tempo, opcoes`).eq('id', id).single(),
    db().from('cptu_furos').select('*').eq('analise_id', id).order('ordem', { ascending: true }),
  ])
  if (a.error) throw a.error
  if (f.error) throw f.error
  const r = a.data as AnaliseCptuResumo & { parametros: unknown; premissas_tempo: unknown; opcoes: unknown }
  return {
    id: r.id,
    projeto_id: r.projeto_id,
    revisao_id: r.revisao_id,
    nome: r.nome,
    created_at: r.created_at,
    updated_at: r.updated_at,
    parametros: parametrosDeDb(r.parametros),
    premissasTempo: premissasTempoDeDb(r.premissas_tempo),
    opcoes: opcoesDeDb(r.opcoes),
    furos: ((f.data ?? []) as LinhaFuroDb[]).map(furoDeDb),
  }
}

/** Grava parâmetros, premissas de tempo e opções da análise. */
export async function salvarConfigAnaliseCptu(
  id: string,
  cfg: { parametros: ParametrosCptu; premissasTempo: PremissasTempo; opcoes: OpcoesCptu },
): Promise<void> {
  const { error } = await db()
    .from('cptu_analises')
    .update({
      parametros: cfg.parametros,
      premissas_tempo: cfg.premissasTempo,
      opcoes: cfg.opcoes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function renomearAnaliseCptu(id: string, nome: string): Promise<void> {
  const { error } = await db().from('cptu_analises').update({ nome, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

/** Apaga a análise e todos os furos dela. */
export async function excluirAnaliseCptu(id: string): Promise<void> {
  const { error } = await db().from('cptu_analises').delete().eq('id', id)
  if (error) throw error
}

/** Cria ou atualiza um furo (cabeçalho, leituras e zonas de uma vez). Devolve o id. */
export async function salvarFuroCptu(analiseId: string, furo: FuroCptu, ordem: number): Promise<string> {
  const linha = { ...furoParaDb(furo, analiseId, ordem), updated_at: new Date().toISOString() }
  const q = furo.id
    ? db().from('cptu_furos').update(linha).eq('id', furo.id).select('id').single()
    : db().from('cptu_furos').insert(linha).select('id').single()
  const { data, error } = await q
  if (error) {
    if (error.code === '23505') throw new Error(`Já existe um furo chamado "${furo.cabecalho.nome}" nesta análise.`)
    throw error
  }
  // a análise sobe na lista de "recentes"
  await db().from('cptu_analises').update({ updated_at: new Date().toISOString() }).eq('id', analiseId)
  return data.id
}

export async function excluirFuroCptu(id: string): Promise<void> {
  const { error } = await db().from('cptu_furos').delete().eq('id', id)
  if (error) throw error
}

/** true quando a migration 009 ainda não foi rodada no Supabase. */
export function erroMigracaoCptuPendente(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err)
  return /cptu_analises|cptu_furos|schema cache|does not exist/i.test(msg)
}
