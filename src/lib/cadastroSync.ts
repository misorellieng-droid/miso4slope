import { supabase } from './supabase'

export interface DispatchCadastroResult {
  cadastro_record_id?: string
  results?: { app: string; status: string; reason?: string }[]
  error?: string
}

/**
 * Sends a saved cadastro record (e.g. Cliente) to the miso4apps hub via the
 * dispatch-cadastro-relay Edge Function, which fans it out to the apps
 * selected in the "Replicar para" checkboxes.
 */
export async function dispatchCadastro(input: {
  sourceRecordId: string
  tipo: string
  payload: Record<string, unknown>
  targetAppSlugs: string[]
}): Promise<DispatchCadastroResult> {
  if (!supabase) return { error: 'Supabase não configurado.' }

  const { data, error } = await supabase.functions.invoke('dispatch-cadastro-relay', {
    body: {
      source_record_id: input.sourceRecordId,
      tipo: input.tipo,
      payload: input.payload,
      target_app_slugs: input.targetAppSlugs,
    },
  })

  if (error) return { error: error.message }
  return data as DispatchCadastroResult
}
