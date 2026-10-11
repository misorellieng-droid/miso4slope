import { soloDeAnalise, soloDeSondagem, type SoloMuro } from '../engine/muros/solo'
import type { FillMaterial } from '../engine/types'
import { loadAnalysis } from './analysisStorage'
import { camadasToLayers, getSondagemCamadas, type ProjetoDetail } from './projetosStorage'

// Fonte do solo de um muro, escolhida na tela de muros: uma análise salva do
// projeto ("a:<id>") ou uma sondagem ("s:<id>"). Por enquanto não há cadastro
// de solo por projeto — fica para depois de validar o fluxo.

export type FonteSolo = string // '' | `a:${string}` | `s:${string}`

export function rotuloFonte(fonte: FonteSolo, projeto: ProjetoDetail | null): string {
  if (!fonte || !projeto) return '—'
  const [tipo, id] = [fonte.slice(0, 1), fonte.slice(2)]
  if (tipo === 'a') return `Análise "${projeto.analises.find((a) => a.id === id)?.nome_secao ?? id}"`
  return `Sondagem "${projeto.sondagens.find((s) => s.id === id)?.nome ?? id}"`
}

/** Carrega a fonte do banco e converte para o formato da verificação de muros. */
export async function carregarSolo(
  fonte: FonteSolo,
  projeto: ProjetoDetail,
  aterroParaSondagem: FillMaterial
): Promise<SoloMuro | null> {
  if (!fonte) return null
  const tipo = fonte.slice(0, 1)
  const id = fonte.slice(2)
  const nome = `${rotuloFonte(fonte, projeto)} — projeto ${projeto.nome}`
  if (tipo === 'a') {
    const snap = await loadAnalysis(id)
    return soloDeAnalise(nome, snap)
  }
  const sond = projeto.sondagens.find((s) => s.id === id)
  if (!sond) return null
  const camadas = await getSondagemCamadas(id)
  const solo = soloDeSondagem(nome, sond, camadasToLayers(camadas), aterroParaSondagem)
  solo.avisos.push(
    `Aterro (sondagem não traz): c' = ${aterroParaSondagem.c} kPa, φ' = ${aterroParaSondagem.phi}°, γ = ${aterroParaSondagem.gamma} kN/m³ (parâmetro da tela de muros).`
  )
  return solo
}
