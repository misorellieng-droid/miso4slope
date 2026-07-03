import type { Layer, SoilClass, SondagemExtractionResult, SondagemLayer } from './types'
import { estimateFromSPT } from './spt'

/**
 * Infere se a camada é predominantemente granular ou coesiva a partir da
 * descrição textual do boletim, seguindo a convenção usual de boletins
 * brasileiros: o substantivo principal ("argila", "areia", "silte") indica
 * a classificação; adjetivos ("arenosa", "siltosa") indicam a fração
 * secundária. Ex.: "argila arenosa" → coesivo; "areia argilosa" → granular.
 * Sempre revisável manualmente — é um ponto de partida, não uma classificação
 * geotécnica formal (SUCS).
 */
export function classifySoilFromDescription(description: string): SoilClass {
  const text = description.toLowerCase()
  const idxAreia = text.indexOf('areia')
  const idxArgila = text.indexOf('argila')
  const idxSilte = text.indexOf('silte')

  const idxCoesivo = [idxArgila, idxSilte].filter((i) => i >= 0)
  const firstCoesivo = idxCoesivo.length ? Math.min(...idxCoesivo) : -1

  if (idxAreia < 0) return 'coesivo'
  if (firstCoesivo < 0) return 'granular'
  return idxAreia < firstCoesivo ? 'granular' : 'coesivo'
}

/**
 * Extração simulada (mock), para desenvolver e testar o fluxo de importação
 * de boletim de sondagem sem depender ainda da Edge Function + IA com visão
 * computacional (infraestrutura pendente — ver conversa do projeto).
 * Os dados retornados seguem o padrão do boletim de exemplo compartilhado
 * no projeto (SPT com profundidades, descrição e N por trecho).
 */
export async function mockExtractSondagem(): Promise<SondagemExtractionResult> {
  await new Promise((resolve) => setTimeout(resolve, 1200))

  const raw: { depth_top: number; depth_base: number; description: string; n_spt: number }[] = [
    { depth_top: 0, depth_base: 0.35, description: 'Solo superficial – argila arenosa (areia fina), pouco siltosa, mole. Marrom.', n_spt: 4 },
    { depth_top: 0.35, depth_base: 7.0, description: 'Solo residual – argila arenosa (areia fina), pouco siltosa, mole à média. Vermelha.', n_spt: 7 },
    { depth_top: 7.0, depth_base: 11.62, description: 'Solo residual – argila siltosa, pouco arenosa, rija a dura. Vermelha e cinza escura.', n_spt: 15 },
    { depth_top: 11.62, depth_base: 12.15, description: 'Solo residual – areia média siltosa, pouco argilosa. Vermelha e cinza.', n_spt: 20 },
    { depth_top: 12.15, depth_base: 14.0, description: 'Solo residual – argila siltosa, pouco arenosa, dura. Vermelha e cinza escura.', n_spt: 24 },
    { depth_top: 14.0, depth_base: 17.56, description: 'Solo residual – argila arenosa (areia fina), pouco siltosa, dura. Cinza e vermelha clara.', n_spt: 25 },
  ]

  return {
    layers: raw.map((r) => ({ ...r, soil_class: classifySoilFromDescription(r.description) })),
    water_table_depth: 9.61,
    source_note: 'Extração simulada (mock) — infraestrutura de IA com visão computacional ainda não conectada.',
  }
}

/**
 * Converte as camadas extraídas (profundidade a partir da boca do furo)
 * para o sistema de coordenadas do motor (y relativo ao pé do talude=0),
 * usando a cota da boca do furo e a cota do pé como datum, e calcula
 * c'/φ'/γ pela correlação com N_SPT.
 */
export function convertSondagemToLayers(
  sondagemLayers: SondagemLayer[],
  collarElevation: number,
  toeElevation: number
): Layer[] {
  return sondagemLayers.map((sl) => {
    const est = estimateFromSPT(sl.n_spt, sl.soil_class)
    return {
      name: sl.description,
      y_top: collarElevation - sl.depth_top - toeElevation,
      y_base: collarElevation - sl.depth_base - toeElevation,
      c: est.c,
      phi: est.phi,
      gamma: est.gamma,
      n_spt: sl.n_spt,
      soil_class: sl.soil_class,
    }
  })
}
