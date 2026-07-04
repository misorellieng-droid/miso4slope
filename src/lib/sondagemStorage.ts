import { supabase } from './supabase'
import { ensureProjeto } from './analysisStorage'
import { estimateFromSPT } from '../engine/spt'
import type { SondagemExtractionResult } from '../engine/types'

export interface SondagemUpload {
  path: string
  url: string
}

/**
 * Envia o arquivo do boletim (PDF/imagem) para o bucket "sondagens" no
 * Supabase Storage. A extração dos dados continua simulada (mock) — isto só
 * garante que o arquivo original enviado não se perde, ficando disponível
 * para conferência e para quando a extração por IA for conectada de fato.
 */
export async function uploadSondagemFile(file: File): Promise<SondagemUpload> {
  if (!supabase) throw new Error('Supabase não configurado.')

  const path = `${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from('sondagens').upload(path, file)
  if (error) throw error

  const { data } = supabase.storage.from('sondagens').getPublicUrl(path)
  return { path, url: data.publicUrl }
}

/**
 * Persiste a sondagem (vinculada a um projeto, criado/reaproveitado pelo
 * nome) e suas camadas extraídas — para virar um recurso reutilizável entre
 * análises do mesmo projeto, não só um import avulso na análise atual.
 * c'/φ'/γ são calculados aqui pela correlação com N_SPT (mesma usada ao
 * importar direto pra uma análise), para a camada já ficar pronta pra uso.
 *
 * pageRange identifica o trecho do arquivo original (quando o mesmo PDF tem
 * várias sondagens — ver módulo Sondagens/import de relatório completo) que
 * corresponde a esta sondagem específica, pra facilitar conferir contra o
 * boletim depois. Sondagens salvas a partir do fluxo avulso (uma por vez,
 * sem detecção automática) não têm isso definido.
 */
export async function saveSondagem(
  projetoNome: string,
  nomeSondagem: string,
  cotaTerreno: number | null,
  file: SondagemUpload | null,
  fileName: string | null,
  extraction: SondagemExtractionResult,
  pageRange?: { start: number; end: number }
): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.')

  const projetoId = await ensureProjeto(projetoNome)

  const { data: sondagem, error } = await supabase
    .from('sondagens')
    .insert({
      projeto_id: projetoId,
      nome: nomeSondagem,
      cota_terreno: cotaTerreno,
      na_profundidade: extraction.water_table_depth ?? null,
      file_path: file?.path ?? null,
      file_name: fileName,
      page_start: pageRange?.start ?? null,
      page_end: pageRange?.end ?? null,
    })
    .select('id')
    .single()
  if (error) throw error

  const camadas = extraction.layers.map((l, i) => {
    const est = estimateFromSPT(l.n_spt, l.soil_class)
    return {
      sondagem_id: sondagem.id,
      nome: l.description,
      depth_top: l.depth_top,
      depth_base: l.depth_base,
      c: est.c,
      phi: est.phi,
      gamma: est.gamma,
      n_spt: l.n_spt,
      soil_class: l.soil_class,
      ordem: i,
    }
  })

  const { error: camadasError } = await supabase.from('camadas').insert(camadas)
  if (camadasError) throw camadasError
}

export async function deleteSondagem(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase.from('sondagens').delete().eq('id', id)
  if (error) throw error
}

export async function renameSondagem(id: string, nome: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase.from('sondagens').update({ nome }).eq('id', id)
  if (error) throw error
}
