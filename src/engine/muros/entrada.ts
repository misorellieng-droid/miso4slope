import type { Point } from '../types'
import { topoPoligono, zEmX } from './geometria2d'
import type { MuroEntrada, MurosSecoesArquivo, SecaoEntrada, TipoMuro, XZ } from './tipos'

// Leitura do <nome>_muros_secoes.json e conversão de cada seção para o
// referencial do motor de estabilidade.
//
// O motor (slices.ts/bishop.ts) supõe que o talude SOBE para a direita: a
// massa escorrega para a esquerda e α > 0 à direita do centro do círculo.
// No arquivo do ME-DYN-TALUDE o x cresce "para fora" do platô, então:
// - aterro (lado aberto "fora"): o platô (alto) fica em x pequeno → espelha
//   (x' = −x) para o alto ficar à direita;
// - corte (lado aberto "plato"): o terreno natural (alto) fica em x grande →
//   não espelha.
// A cota vira y = z − zDatum (zDatum = menor cota da seção), para os números
// do motor ficarem pequenos, como no talude paramétrico.

const TIPOS: TipoMuro[] = ['concreto', 'gabiao', 'grampeado']
const EPS_X = 1e-6

export interface LeituraMuros {
  arquivo: MurosSecoesArquivo | null
  erros: string[]
  avisos: string[]
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isXZ = (v: unknown): v is XZ => Array.isArray(v) && v.length >= 2 && isNum(v[0]) && isNum(v[1])
const isLinha = (v: unknown): v is XZ[] => Array.isArray(v) && v.every(isXZ)

/** Valida o JSON do ME-DYN-TALUDE. Erros impedem o cálculo daquele muro; avisos não. */
export function lerMurosSecoes(json: unknown): LeituraMuros {
  const erros: string[] = []
  const avisos: string[] = []
  if (!json || typeof json !== 'object') return { arquivo: null, erros: ['Arquivo vazio ou não é um JSON de objeto.'], avisos }

  const obj = json as Record<string, unknown>
  if (obj.versao !== 1) avisos.push(`Versão do arquivo ${String(obj.versao)} — esperado 1; lido mesmo assim.`)
  if (!Array.isArray(obj.muros)) return { arquivo: null, erros: ['Campo "muros" ausente ou não é uma lista.'], avisos }

  const muros: MuroEntrada[] = []
  for (const [i, m] of (obj.muros as Record<string, unknown>[]).entries()) {
    const id = typeof m?.id === 'string' ? m.id : `#${i + 1}`
    if (!TIPOS.includes(m?.tipo as TipoMuro)) {
      erros.push(`Muro ${id}: tipo "${String(m?.tipo)}" desconhecido (esperado concreto, gabiao ou grampeado).`)
      continue
    }
    if (!Array.isArray(m.secoes) || m.secoes.length === 0) {
      erros.push(`Muro ${id}: sem seções.`)
      continue
    }
    const secoes: SecaoEntrada[] = []
    for (const s of m.secoes as Record<string, unknown>[]) {
      const rot = `Muro ${id}, seção s=${String(s?.s)}`
      if (!isNum(s?.s) || !isNum(s?.H)) {
        erros.push(`${rot}: "s" ou "H" ausente.`)
        continue
      }
      if (!isLinha(s.talude) || s.talude.length < 2 || !isLinha(s.terreno) || s.terreno.length < 2) {
        erros.push(`${rot}: "talude" ou "terreno" inválido (precisa de pelo menos 2 pontos [x, z]).`)
        continue
      }
      const corpo = Array.isArray(s.corpo) ? (s.corpo as unknown[]).filter(isLinha) : []
      if (m.tipo !== 'grampeado' && corpo.length === 0) {
        erros.push(`${rot}: muro de ${m.tipo} sem polígonos de "corpo".`)
        continue
      }
      const grampos = Array.isArray(s.grampos)
        ? (s.grampos as unknown[]).filter((g): g is [XZ, XZ] => Array.isArray(g) && g.length === 2 && isXZ(g[0]) && isXZ(g[1]))
        : []
      if (m.tipo === 'grampeado' && grampos.length === 0) avisos.push(`${rot}: grampeado sem grampos — FS global sem reforço.`)
      if (!isXZ(s.pe_face)) {
        erros.push(`${rot}: "pe_face" ausente.`)
        continue
      }
      secoes.push({
        s: s.s,
        H: s.H,
        talude: s.talude,
        terreno: s.terreno,
        corpo,
        grampos,
        dim: (s.dim as SecaoEntrada['dim']) ?? {},
        pe_face: s.pe_face,
        x_divisa: isNum(s.x_divisa) ? s.x_divisa : null,
      })
    }
    if (secoes.length === 0) continue
    muros.push({
      id,
      tipo: m.tipo as TipoMuro,
      condicao: m.condicao === 'corte' ? 'corte' : 'aterro',
      posicao: m.posicao === 'crista' ? 'crista' : 'pe',
      junto: m.junto === 'divisa' ? 'divisa' : 'plato',
      talude_h_por_v: isNum(m.talude_h_por_v) ? m.talude_h_por_v : 1.5,
      face_h_por_v: isNum(m.face_h_por_v) ? m.face_h_por_v : 0,
      espessura: isNum(m.espessura) ? m.espessura : 0.3,
      recuo: isNum(m.recuo) ? m.recuo : undefined,
      lado_aberto: m.lado_aberto === 'plato' ? 'plato' : 'fora',
      secoes,
    })
  }

  return {
    arquivo: {
      versao: 1,
      plato: typeof obj.plato === 'string' ? obj.plato : 'PLATO',
      convencao: typeof obj.convencao === 'string' ? obj.convencao : undefined,
      muros_tipos: (obj.muros_tipos as MurosSecoesArquivo['muros_tipos']) ?? {},
      muros,
    },
    erros,
    avisos,
  }
}

/** Seção crítica de um muro: a de maior H (as demais também são calculadas). */
export function secaoCritica(muro: MuroEntrada): SecaoEntrada {
  return muro.secoes.reduce((a, b) => (b.H > a.H ? b : a))
}

// ---------------------------------------------------------------------------

/** Seção no referencial do motor (x' crescente para o lado alto, y = z − zDatum). */
export interface ModeloSecao {
  espelhado: boolean
  zDatum: number
  superficie: Point[] // talude + terreno + topo do corpo do muro (envoltória superior)
  terreno: Point[]    // terreno natural, estendido nas pontas
  linhaProjeto: Point[] // só talude + terreno, sem o muro (para empuxo e movimento de terra)
  corpos: Point[][]
  grampos: [Point, Point][]
  peFace: Point
  yMin: number
  yMax: number
  avisos: string[]
}

export function paraMotor(m: Pick<ModeloSecao, 'espelhado' | 'zDatum'>, [x, z]: XZ): Point {
  return { x: m.espelhado ? -x : x, y: z - m.zDatum }
}

export function doMotor(m: Pick<ModeloSecao, 'espelhado' | 'zDatum'>, p: Point): XZ {
  return [m.espelhado ? -p.x : p.x, p.y + m.zDatum]
}

function ordenarPorX(pts: Point[]): Point[] {
  return pts.slice().sort((a, b) => a.x - b.x)
}

/**
 * Linha de projeto completa no sistema do arquivo: platô estendido para
 * dentro + talude + terreno além do fim do talude, estendido para fora.
 */
export function linhaProjetoArquivo(secao: SecaoEntrada, ext: number): XZ[] {
  const tal = secao.talude
  const t0 = tal[0]
  const tN = tal[tal.length - 1]
  const terr = secao.terreno.slice().sort((a, b) => a[0] - b[0])
  const alem = terr.filter(([x]) => x > tN[0] + EPS_X)
  const ultimo = alem.length ? alem[alem.length - 1] : tN
  return [[t0[0] - ext, t0[1]], ...tal, ...alem, [ultimo[0] + ext, ultimo[1]]]
}

/**
 * Monta o modelo da seção no referencial do motor. Decide o espelhamento
 * pela geometria (lado alto à direita) e confere com lado_aberto.
 */
export function modelarSecao(muro: MuroEntrada, secao: SecaoEntrada): ModeloSecao {
  const avisos: string[] = []
  const zs = [...secao.talude, ...secao.terreno].map(([, z]) => z)
  const zMin = Math.min(...zs)
  const zMax = Math.max(...zs)
  const ext = Math.max(30, 3 * (zMax - zMin))

  const linhaArq = linhaProjetoArquivo(secao, ext)
  const espelhado = linhaArq[0][1] > linhaArq[linhaArq.length - 1][1]
  const esperado = muro.lado_aberto === 'fora'
  if (espelhado !== esperado) {
    avisos.push(
      `Seção s=${secao.s}: lado_aberto="${muro.lado_aberto}" não bate com a geometria (lado alto do outro lado) — usada a geometria.`
    )
  }

  const ref = { espelhado, zDatum: zMin }
  const linhaProjeto = ordenarPorX(linhaArq.map((p) => paraMotor(ref, p)))
  const corpos = secao.corpo.map((poly) => poly.map((p) => paraMotor(ref, p)))
  const grampos = secao.grampos.map(([a, b]) => [paraMotor(ref, a), paraMotor(ref, b)] as [Point, Point])

  const terrArq = secao.terreno.slice().sort((a, b) => a[0] - b[0])
  const terreno = ordenarPorX(
    [[terrArq[0][0] - 1000, terrArq[0][1]] as XZ, ...terrArq, [terrArq[terrArq.length - 1][0] + 1000, terrArq[terrArq.length - 1][1]] as XZ].map(
      (p) => paraMotor(ref, p)
    )
  )

  // envoltória superior: onde o corpo do muro sobe acima da linha de projeto
  // (ex.: última caixa de gabião acima do terrapleno), a superfície é o muro
  const xs = new Set<number>()
  for (const p of linhaProjeto) [p.x - EPS_X, p.x, p.x + EPS_X].forEach((x) => xs.add(x))
  for (const poly of corpos) for (const p of poly) [p.x - EPS_X, p.x, p.x + EPS_X].forEach((x) => xs.add(x))
  const superficie = [...xs]
    .sort((a, b) => a - b)
    .map((x) => {
      let y = zEmX(x, linhaProjeto)
      for (const poly of corpos) y = Math.max(y, topoPoligono(x, poly))
      return { x, y }
    })

  return {
    espelhado,
    zDatum: zMin,
    superficie,
    terreno,
    linhaProjeto,
    corpos,
    grampos,
    peFace: paraMotor(ref, secao.pe_face),
    yMin: 0,
    yMax: zMax - zMin,
    avisos,
  }
}
