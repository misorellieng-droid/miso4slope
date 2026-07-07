import { supabase } from './supabase'
import type { Layer, SoilClass } from '../engine/types'

export interface Cliente {
  id: string
  nome: string
  documento: string | null
  email: string | null
  telefone: string | null
}

export interface ProjetoSummary {
  id: string
  nome: string
  descricao: string | null
  created_at: string
  cliente_id: string | null
  cliente_nome: string | null
  analisesCount: number
  sondagensCount: number
}

export interface ProjetoAnalise {
  id: string
  nome_secao: string
  method: string
  mode: string
  fs: number | null
  is_adequate: boolean | null
  created_at: string
}

export interface ProjetoSondagem {
  id: string
  nome: string
  cota_terreno: number | null
  na_profundidade: number | null
  file_name: string | null
  file_path: string | null
  page_start: number | null
  page_end: number | null
  created_at: string
  camadasCount: number
}

export interface ProjetoDetail {
  id: string
  nome: string
  descricao: string | null
  cliente_id: string | null
  cliente_nome: string | null
  analises: ProjetoAnalise[]
  sondagens: ProjetoSondagem[]
}

export interface SondagemSummary extends ProjetoSondagem {
  projeto_id: string
  projeto_nome: string
}

export interface CamadaRow {
  id: string
  sondagem_id: string
  nome: string
  y_top: number | null
  y_base: number | null
  depth_top: number | null
  depth_base: number | null
  c: number
  phi: number
  gamma: number
  n_spt: number | null
  soil_class: string | null
  ordem: number
}

export async function listProjetos(): Promise<ProjetoSummary[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('projetos')
    .select('id, nome, descricao, created_at, cliente_id, clientes(nome), analises(count), sondagens(count)')
    .order('created_at', { ascending: false })
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((p: any) => ({
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    created_at: p.created_at,
    cliente_id: p.cliente_id ?? null,
    cliente_nome: p.clientes?.nome ?? null,
    analisesCount: p.analises?.[0]?.count ?? 0,
    sondagensCount: p.sondagens?.[0]?.count ?? 0,
  }))
}

export async function listClientes(): Promise<Cliente[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nome, documento, email, telefone')
    .order('nome', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createCliente(input: { nome: string; documento?: string | null; email?: string | null; telefone?: string | null }): Promise<Cliente> {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      nome: input.nome,
      documento: input.documento || null,
      email: input.email || null,
      telefone: input.telefone || null,
    })
    .select('id, nome, documento, email, telefone')
    .single()
  if (error) throw error
  return data
}

export async function createProjeto(nome: string, descricao?: string, clienteId?: string | null): Promise<string> {
  if (!supabase) throw new Error('Supabase não configurado.')

  const { data, error } = await supabase
    .from('projetos')
    .insert({ nome, descricao: descricao || null, cliente_id: clienteId || null })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function deleteProjeto(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase.from('projetos').delete().eq('id', id)
  if (error) throw error
}

export async function updateProjeto(id: string, patch: { nome?: string; descricao?: string | null; cliente_id?: string | null }): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase.from('projetos').update(patch).eq('id', id)
  if (error) throw error
}

export async function getProjetoDetail(id: string): Promise<ProjetoDetail> {
  if (!supabase) throw new Error('Supabase não configurado.')

  const { data: projeto, error: projetoError } = await supabase
    .from('projetos')
    .select('id, nome, descricao, cliente_id, clientes(nome)')
    .eq('id', id)
    .single()
  if (projetoError) throw projetoError

  const { data: analises, error: analisesError } = await supabase
    .from('analises')
    .select('id, nome_secao, method, mode, result, created_at')
    .eq('projeto_id', id)
    .order('created_at', { ascending: false })
  if (analisesError) throw analisesError

  const { data: sondagens, error: sondagensError } = await supabase
    .from('sondagens')
    .select('id, nome, cota_terreno, na_profundidade, file_name, file_path, page_start, page_end, created_at, camadas(count)')
    .eq('projeto_id', id)
    .order('created_at', { ascending: false })
  if (sondagensError) throw sondagensError

  return {
    id: projeto.id,
    nome: projeto.nome,
    descricao: projeto.descricao,
    cliente_id: projeto.cliente_id ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cliente_nome: (projeto as any).clientes?.nome ?? null,
    analises: (analises ?? []).map((a) => ({
      id: a.id,
      nome_secao: a.nome_secao,
      method: a.method,
      mode: a.mode,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fs: (a.result as any)?.FS ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      is_adequate: (a.result as any)?.is_adequate ?? null,
      created_at: a.created_at,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sondagens: (sondagens ?? []).map((s: any) => ({
      id: s.id,
      nome: s.nome,
      cota_terreno: s.cota_terreno,
      na_profundidade: s.na_profundidade,
      file_name: s.file_name,
      file_path: s.file_path,
      page_start: s.page_start,
      page_end: s.page_end,
      created_at: s.created_at,
      camadasCount: s.camadas?.[0]?.count ?? 0,
    })),
  }
}

/** Todas as sondagens salvas, de todos os projetos — visão geral usada na página Sondagens do menu. */
export async function listAllSondagens(): Promise<SondagemSummary[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('sondagens')
    .select(
      'id, nome, cota_terreno, na_profundidade, file_name, file_path, page_start, page_end, created_at, camadas(count), projetos(id, nome)'
    )
    .order('created_at', { ascending: false })
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((s: any) => ({
    id: s.id,
    nome: s.nome,
    cota_terreno: s.cota_terreno,
    na_profundidade: s.na_profundidade,
    file_name: s.file_name,
    file_path: s.file_path,
    page_start: s.page_start,
    page_end: s.page_end,
    created_at: s.created_at,
    camadasCount: s.camadas?.[0]?.count ?? 0,
    projeto_id: s.projetos?.id ?? '',
    projeto_nome: s.projetos?.nome ?? '—',
  }))
}

export async function getSondagemCamadas(sondagemId: string): Promise<CamadaRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('camadas')
    .select('*')
    .eq('sondagem_id', sondagemId)
    .order('ordem')
  if (error) throw error
  return data ?? []
}

export function sondagemFileUrl(filePath: string): string | null {
  if (!supabase) return null
  const { data } = supabase.storage.from('sondagens').getPublicUrl(filePath)
  return data.publicUrl
}

/**
 * Converte as camadas salvas de uma sondagem direto em camadas de solo por
 * profundidade (depth_top/depth_base), sem nenhuma conversão de cota — c'/φ'/γ
 * já foram calculados e possivelmente ajustados manualmente ao salvar a
 * sondagem, então são reaproveitados tal qual, não recalculados de novo.
 * Assume que a boca do furo coincide com o terreno local da análise de
 * destino (mesma referência que "profundidade do terreno" já usa em
 * qualquer camada) — ajustável manualmente depois, como qualquer camada.
 */
export function camadasToLayers(camadas: CamadaRow[]): Layer[] {
  return camadas.map((row) => ({
    name: row.nome,
    depth_top: row.depth_top ?? undefined,
    depth_base: row.depth_base ?? undefined,
    c: row.c,
    phi: row.phi,
    gamma: row.gamma,
    n_spt: row.n_spt ?? undefined,
    soil_class: (row.soil_class as SoilClass) ?? undefined,
  }))
}
