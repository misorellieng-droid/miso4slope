import { classifySoilFromDescription } from './sondagem'
import type { SoilClass, SondagemExtractionResult } from './types'

/**
 * Importação de sondagens SPT no formato JSON "miso-spt/1" (gerado pelo
 * Claude Chat a partir do PDF do laudo). Esquema e prompt de extração:
 * miso-sondagem-civil3d-plugin/docs/spt-json-v1.md
 *
 * O JSON traz só dado medido (camadas, N_SPT por metro, N.A., cota); c'/φ'/γ
 * continuam sendo calculados pelo app (estimateFromSPT) ao salvar — os
 * "parametros" do JSON são ignorados de propósito (estimativa não revisada).
 */
export interface SondagemJsonFuro {
  identifier: string
  cotaBoca: number | null
  pagina: number | null
  extraction: SondagemExtractionResult
  avisos: string[]
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : null

/** N_SPT representativo da camada = média dos N medidos dentro dela (arredondada); se não houver, null. */
function nDaCamada(spt: { prof: number; n: number }[], topo: number, base: number): number | null {
  const dentro = spt.filter((s) => s.prof > topo && s.prof <= base + 1e-9)
  if (dentro.length === 0) return null
  return Math.round(dentro.reduce((a, s) => a + s.n, 0) / dentro.length)
}

export function parseSondagemJson(texto: string): { furos: SondagemJsonFuro[]; erros: string[] } {
  const erros: string[] = []
  let raw: unknown
  try {
    raw = JSON.parse(texto)
  } catch {
    return { furos: [], erros: ['Arquivo não é um JSON válido.'] }
  }
  if (!isRec(raw) || raw.schema !== 'miso-spt/1' || !Array.isArray(raw.furos)) {
    return { furos: [], erros: ['JSON fora do formato esperado (schema "miso-spt/1" com lista "furos").'] }
  }

  const furos: SondagemJsonFuro[] = []
  raw.furos.forEach((f, i) => {
    if (!isRec(f)) return
    const id = typeof f.id === 'string' && f.id.trim() ? f.id.trim() : `Sondagem ${i + 1}`
    const avisos: string[] = []
    const spt = (Array.isArray(f.spt) ? f.spt : [])
      .filter(isRec)
      .map((s) => ({ prof: num(s.prof_m), n: num(s.n_spt) }))
      .filter((s): s is { prof: number; n: number } => s.prof !== null && s.n !== null)

    const layers = (Array.isArray(f.camadas) ? f.camadas : []).filter(isRec).flatMap((c, j) => {
      const topo = num(c.topo_m)
      const base = num(c.base_m)
      const descricao = typeof c.descricao === 'string' ? c.descricao : ''
      if (topo === null || base === null || base <= topo) {
        avisos.push(`Camada ${j + 1} ignorada: profundidades inválidas.`)
        return []
      }
      let n = num(c.n_spt)
      if (n === null) n = nDaCamada(spt, topo, base)
      if (n === null) {
        n = 0
        avisos.push(`Camada ${topo}–${base} m sem N_SPT medido: preenchida com 0 — conferir.`)
      }
      const soil_class: SoilClass =
        c.tipo === 'granular' || c.tipo === 'coesivo' ? c.tipo : classifySoilFromDescription(descricao)
      return [{ depth_top: topo, depth_base: base, description: descricao, n_spt: n, soil_class }]
    })
    if (layers.length === 0) avisos.push('Nenhuma camada válida.')

    const na = num(f.nivel_agua_m)
    furos.push({
      identifier: id,
      cotaBoca: num(f.cota_boca),
      pagina: num(f.pagina_pdf),
      avisos,
      extraction: {
        layers,
        water_table_depth: na ?? undefined,
        source_note: 'Importado de JSON miso-spt/1 (extração por IA no Claude Chat) — conferir contra o laudo.',
      },
    })
  })
  if (furos.length === 0) erros.push('Nenhum furo encontrado no JSON.')
  return { furos, erros }
}
