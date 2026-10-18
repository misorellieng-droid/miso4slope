import { supabase } from './supabase'

export type TipoEstudo = 'muros' | 'faixa_colunas' | 'cortina' | 'solo_reforcado'

export const TIPO_ESTUDO_LABEL: Record<TipoEstudo, string> = {
  muros: 'Verificação de muros',
  faixa_colunas: 'Faixa de colunas',
  cortina: 'Cortina de estacas',
  solo_reforcado: 'Solo reforçado',
}

export interface EstudoResumo {
  id: string
  projeto_id: string
  revisao_id: string | null
  tipo: TipoEstudo
  nome: string
  resumo: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function db() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export async function listEstudos(projetoId: string, revisaoId: string | null): Promise<EstudoResumo[]> {
  let q = db()
    .from('estudos_contencao')
    .select('id, projeto_id, revisao_id, tipo, nome, resumo, created_at, updated_at')
    .eq('projeto_id', projetoId)
    .order('updated_at', { ascending: false })
  if (revisaoId) q = q.eq('revisao_id', revisaoId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as EstudoResumo[]
}

export async function saveEstudo(input: {
  projetoId: string
  revisaoId: string
  tipo: TipoEstudo
  nome: string
  dados: unknown
  resumo?: Record<string, unknown> | null
}): Promise<string> {
  const { data, error } = await db()
    .from('estudos_contencao')
    .insert({
      projeto_id: input.projetoId,
      revisao_id: input.revisaoId,
      tipo: input.tipo,
      nome: input.nome,
      dados: input.dados,
      resumo: input.resumo ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/** Regrava um estudo já salvo (mesmo nome/projeto/revisão), atualizando entradas e resultado. */
export async function updateEstudo(id: string, dados: unknown, resumo?: Record<string, unknown> | null): Promise<void> {
  const { error } = await db()
    .from('estudos_contencao')
    .update({ dados, resumo: resumo ?? null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function loadEstudo(id: string): Promise<{ tipo: TipoEstudo; nome: string; dados: unknown }> {
  const { data, error } = await db().from('estudos_contencao').select('tipo, nome, dados').eq('id', id).single()
  if (error) throw error
  return data as { tipo: TipoEstudo; nome: string; dados: unknown }
}

export async function renameEstudo(id: string, nome: string): Promise<void> {
  const { error } = await db().from('estudos_contencao').update({ nome }).eq('id', id)
  if (error) throw error
}

export async function deleteEstudo(id: string): Promise<void> {
  const { error } = await db().from('estudos_contencao').delete().eq('id', id)
  if (error) throw error
}
