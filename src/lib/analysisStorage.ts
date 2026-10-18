import { supabase } from './supabase'
import type {
  AnalysisMode,
  AnalysisResult,
  CompactionReference,
  FaceCoverage,
  FillMaterial,
  FillZone,
  Layer,
  SlopeGeometry,
  StabilityMethod,
} from '../engine/types'

export interface AnalysisSnapshot {
  geometry: SlopeGeometry
  layers: Layer[]
  fill: FillMaterial
  coverage: FaceCoverage
  fillReference: CompactionReference | null
  fillZones: FillZone[]
  nSlices: number
  method: StabilityMethod
  mode: AnalysisMode
  result: AnalysisResult | null
}

export interface SavedAnalysis {
  id: string
  nome_secao: string
  projeto_nome: string
  revisao_id: string | null
  revisao_nome: string | null
  created_at: string
}

// Sem login ainda: os "projetos" são identificados só pelo nome (não há
// user_id real). Reaproveita um projeto existente com o mesmo nome em vez
// de duplicar a cada salvamento. Exportado para reaproveitar em outros
// módulos que também vinculam dados a um projeto (ex.: sondagens).
export async function ensureProjeto(nome: string): Promise<string> {
  if (!supabase) throw new Error('Supabase não configurado.')

  const { data: existing, error: findError } = await supabase
    .from('projetos')
    .select('id')
    .eq('nome', nome)
    .maybeSingle()
  if (findError) throw findError
  if (existing) return existing.id

  const { data: created, error: insertError } = await supabase
    .from('projetos')
    .insert({ nome })
    .select('id')
    .single()
  if (insertError) throw insertError
  return created.id
}

/** Grava a análise no projeto e na revisão ativos. */
export async function saveAnalysis(
  projetoId: string,
  revisaoId: string,
  nomeSecao: string,
  snapshot: AnalysisSnapshot
): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')

  const { error } = await supabase.from('analises').insert({
    projeto_id: projetoId,
    revisao_id: revisaoId,
    nome_secao: nomeSecao,
    method: snapshot.method,
    mode: snapshot.mode,
    geometry: snapshot.geometry,
    layers: snapshot.layers,
    fill: snapshot.fill,
    coverage: snapshot.coverage,
    fill_reference: snapshot.fillReference,
    fill_zones: snapshot.fillZones,
    n_slices: snapshot.nSlices,
    result: snapshot.result,
  })
  if (error) throw error
}

/**
 * Lista análises salvas. Com `revisaoId`, só as dessa revisão; com `projetoId`
 * sem revisão, todas do projeto; sem nada, todas (inclui as soltas antigas).
 */
export async function listAnalyses(filtro: { projetoId?: string | null; revisaoId?: string | null } = {}): Promise<SavedAnalysis[]> {
  if (!supabase) return []

  let q = supabase
    .from('analises')
    .select('id, nome_secao, created_at, revisao_id, projetos(nome), revisoes(nome)')
    .order('created_at', { ascending: false })
  if (filtro.revisaoId) q = q.eq('revisao_id', filtro.revisaoId)
  else if (filtro.projetoId) q = q.eq('projeto_id', filtro.projetoId)
  const { data, error } = await q
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    nome_secao: row.nome_secao,
    projeto_nome: row.projetos?.nome ?? '—',
    revisao_id: row.revisao_id ?? null,
    revisao_nome: row.revisoes?.nome ?? null,
    created_at: row.created_at,
  }))
}

export async function deleteAnalysis(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase.from('analises').delete().eq('id', id)
  if (error) throw error
}

export async function renameAnalysis(id: string, nomeSecao: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase.from('analises').update({ nome_secao: nomeSecao }).eq('id', id)
  if (error) throw error
}

export async function loadAnalysis(id: string): Promise<AnalysisSnapshot> {
  if (!supabase) throw new Error('Supabase não configurado.')

  const { data, error } = await supabase.from('analises').select('*').eq('id', id).single()
  if (error) throw error

  return {
    geometry: data.geometry,
    layers: data.layers,
    fill: data.fill,
    coverage: data.coverage,
    fillReference: data.fill_reference,
    fillZones: data.fill_zones ?? [],
    nSlices: data.n_slices,
    method: data.method,
    mode: data.mode ?? 'aterro',
    result: data.result,
  }
}
