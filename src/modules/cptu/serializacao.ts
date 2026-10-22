import { PREMISSAS_TEMPO_PADRAO, type PremissasTempo } from './calc/adensamento'
import { OPCOES_PADRAO, PARAMETROS_PADRAO } from './calc/parametros'
import type { FuroCptu, LeituraCptu, OpcoesCptu, ParametrosCptu, ZonaCptu } from './calc/tipos'

// Conversão entre as linhas do banco (slope.cptu_analises / slope.cptu_furos)
// e os tipos do motor. Funções puras, testadas sem Supabase. O que vem do
// banco é conferido campo a campo: número inválido vira null, e parâmetro que
// faltar (ex.: criado depois da análise ser salva) recebe o valor padrão.

export interface LinhaFuroDb {
  id?: string
  analise_id: string
  ordem: number
  nome: string
  na: number | string
  prof_apoio: number | string
  esp_argila_mole: number | string
  prof_total: number | string | null
  recalque_guia: number | string | null
  coord_e: number | string | null
  coord_n: number | string | null
  cota_boca: number | string | null
  t50: number | string | null
  leituras: unknown
  zonas: unknown
}

/** Número ou null (aceita o texto que o Postgres devolve para numeric). */
export function numOuNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

const CAMPOS_LEITURA = ['qt', 'Rf', 'u2', 'gamma', 'SuRel', 'OCRRel', 'SuAmolgRel'] as const

/** Leitura em formato compacto para o jsonb: campos vazios não são gravados. */
export function leituraParaJson(l: LeituraCptu): Record<string, number> {
  const o: Record<string, number> = { z: l.z }
  for (const k of CAMPOS_LEITURA) {
    const v = l[k]
    if (v != null && Number.isFinite(v)) o[k] = v
  }
  return o
}

export function leituraDeJson(o: unknown): LeituraCptu | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const z = numOuNull(r.z)
  if (z == null) return null
  return {
    z,
    qt: numOuNull(r.qt), Rf: numOuNull(r.Rf), u2: numOuNull(r.u2), gamma: numOuNull(r.gamma),
    SuRel: numOuNull(r.SuRel), OCRRel: numOuNull(r.OCRRel), SuAmolgRel: numOuNull(r.SuAmolgRel),
  }
}

export function zonaDeJson(o: unknown): ZonaCptu | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const de = numOuNull(r.de)
  const ate = numOuNull(r.ate)
  if (de == null || ate == null) return null
  return {
    nome: String(r.nome ?? ''), de, ate,
    material: String(r.material ?? ''), comentario: String(r.comentario ?? ''),
  }
}

export function furoParaDb(furo: FuroCptu, analiseId: string, ordem: number): LinhaFuroDb {
  const c = furo.cabecalho
  return {
    ...(furo.id ? { id: furo.id } : {}),
    analise_id: analiseId,
    ordem,
    nome: c.nome,
    na: c.NA,
    prof_apoio: c.profApoio,
    esp_argila_mole: c.espArgilaMole,
    prof_total: c.profTotal ?? null,
    recalque_guia: c.recalqueGuia ?? null,
    coord_e: c.E ?? null,
    coord_n: c.N ?? null,
    cota_boca: c.cotaBoca ?? null,
    t50: furo.t50,
    leituras: [...furo.leituras].sort((a, b) => a.z - b.z).map(leituraParaJson),
    zonas: furo.zonas,
  }
}

export function furoDeDb(r: LinhaFuroDb): FuroCptu {
  const lista = (v: unknown) => (Array.isArray(v) ? v : [])
  return {
    id: r.id ?? null,
    cabecalho: {
      nome: r.nome,
      NA: numOuNull(r.na) ?? 0,
      profApoio: numOuNull(r.prof_apoio) ?? 0,
      espArgilaMole: numOuNull(r.esp_argila_mole) ?? 0,
      profTotal: numOuNull(r.prof_total),
      recalqueGuia: numOuNull(r.recalque_guia),
      E: numOuNull(r.coord_e),
      N: numOuNull(r.coord_n),
      cotaBoca: numOuNull(r.cota_boca),
    },
    t50: numOuNull(r.t50),
    leituras: lista(r.leituras).map(leituraDeJson).filter((l): l is LeituraCptu => l != null).sort((a, b) => a.z - b.z),
    zonas: lista(r.zonas).map(zonaDeJson).filter((z): z is ZonaCptu => z != null),
  }
}

/** Mescla um objeto salvo com os padrões, mantendo só números válidos. */
function mesclarNumeros<T extends object>(padrao: T, salvo: unknown): T {
  const out = { ...padrao } as Record<string, unknown>
  if (salvo && typeof salvo === 'object') {
    for (const [k, v] of Object.entries(salvo as Record<string, unknown>)) {
      if (k in out && typeof out[k] === 'number') {
        const n = numOuNull(v)
        if (n != null) out[k] = n
      }
    }
  }
  return out as T
}

export function parametrosDeDb(salvo: unknown): ParametrosCptu {
  return mesclarNumeros(PARAMETROS_PADRAO, salvo)
}

export function premissasTempoDeDb(salvo: unknown): PremissasTempo {
  const base = mesclarNumeros(PREMISSAS_TEMPO_PADRAO, salvo)
  const s = (salvo && typeof salvo === 'object' ? salvo : {}) as Record<string, unknown>
  const listaNum = (v: unknown, padrao: number[]) => {
    if (!Array.isArray(v)) return padrao
    const nums = v.map(numOuNull).filter((n): n is number => n != null && n > 0)
    return nums.length ? nums : padrao
  }
  return {
    ...base,
    drenagemDupla: typeof s.drenagemDupla === 'boolean' ? s.drenagemDupla : PREMISSAS_TEMPO_PADRAO.drenagemDupla,
    t50: numOuNull(s.t50),
    espacamentos: listaNum(s.espacamentos, PREMISSAS_TEMPO_PADRAO.espacamentos),
    chDrenos: listaNum(s.chDrenos, PREMISSAS_TEMPO_PADRAO.chDrenos),
  }
}

export function opcoesDeDb(salvo: unknown): OpcoesCptu {
  const s = (salvo && typeof salvo === 'object' ? salvo : {}) as Record<string, unknown>
  const raso = (s.ignorarRaso && typeof s.ignorarRaso === 'object' ? s.ignorarRaso : {}) as Record<string, unknown>
  const bool = (v: unknown, padrao: boolean) => (typeof v === 'boolean' ? v : padrao)
  const p = OPCOES_PADRAO
  return {
    ignorarRaso: {
      ativo: bool(raso.ativo, p.ignorarRaso.ativo),
      zMin: numOuNull(raso.zMin) ?? p.ignorarRaso.zMin,
      acimaNA: bool(raso.acimaNA, p.ignorarRaso.acimaNA),
    },
    icIterativo: bool(s.icIterativo, p.icIterativo),
    deltaSigmaVariavel: bool(s.deltaSigmaVariavel, p.deltaSigmaVariavel),
  }
}
