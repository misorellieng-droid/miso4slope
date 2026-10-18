import { supabase } from './supabase'

export interface Revisao {
  id: string
  projeto_id: string
  nome: string
  descricao: string | null
  created_at: string
}

function db() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export async function listRevisoes(projetoId: string): Promise<Revisao[]> {
  const { data, error } = await db()
    .from('revisoes')
    .select('id, projeto_id, nome, descricao, created_at')
    .eq('projeto_id', projetoId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Revisao[]
}

export async function createRevisao(projetoId: string, nome: string, descricao?: string | null): Promise<Revisao> {
  const { data, error } = await db()
    .from('revisoes')
    .insert({ projeto_id: projetoId, nome, descricao: descricao || null })
    .select('id, projeto_id, nome, descricao, created_at')
    .single()
  if (error) throw error
  return data as Revisao
}

export async function renameRevisao(id: string, nome: string): Promise<void> {
  const { error } = await db().from('revisoes').update({ nome }).eq('id', id)
  if (error) throw error
}

/** Apaga a revisão e os estudos de contenção dela; as análises de talude ficam, sem revisão. */
export async function deleteRevisao(id: string): Promise<void> {
  const { error } = await db().from('revisoes').delete().eq('id', id)
  if (error) throw error
}

/** Próximo nome sugerido: "Rev. N" (N = maior número já usado + 1). */
export function proximoNomeRevisao(revisoes: Pick<Revisao, 'nome'>[]): string {
  let max = -1
  for (const r of revisoes) {
    const m = /^Rev\.?\s*(\d+)/i.exec(r.nome.trim())
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `Rev. ${max + 1}`
}

/** Mensagem amigável quando a migração 008 ainda não foi rodada no Supabase. */
export function erroMigracaoPendente(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err)
  return /revisoes|estudos_contencao|revisao_id|schema cache|does not exist/i.test(msg)
}
