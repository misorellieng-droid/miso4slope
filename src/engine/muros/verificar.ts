import { modelarSecao, secaoCritica, type ModeloSecao } from './entrada'
import { diferencaCorpo, gerarCorpo } from './geradores'
import { buscarCirculoCritico, fsGlobalCirculo, type ResultadoGlobal } from './global'
import { verificarGrampeado, type ResultadoGrampeado } from './grampeado'
import { soloParaSecao, type SoloMuro, type SoloSecao } from './solo'
import { refazerTalude } from './talude'
import type {
  FsSaida,
  MuroEntrada,
  MuroSaida,
  MurosSecoesArquivo,
  MurosTipos,
  MurosVerificacaoArquivo,
  ParametrosMuros,
  SecaoEntrada,
  SugestaoSaida,
} from './tipos'
import { verificarGravidade, type ResultadoGravidade } from './verificacoes'

// Orquestra a verificação de um platô: todas as seções de todos os muros,
// a sugestão de inclinação do talude junto ao muro e, se nenhuma inclinação
// resolver, o ajuste do pré-dimensionamento. Monta o _muros_verificacao.json.

export interface AvaliacaoSecao {
  secao: SecaoEntrada
  modelo: ModeloSecao
  solo: SoloSecao
  waterY: number // N.A. no referencial do motor (−∞ sem N.A.), para o desenho
  global: ResultadoGlobal | null
  gravidade?: ResultadoGravidade
  grampeado?: ResultadoGrampeado
  fs: FsSaida
  razao: number // menor FS/FS_mín entre as verificações (≥ 1 → ok)
  ok: boolean
  avisos: string[]
}

export interface CandidatoTalude {
  r: number
  H: number
  area: number
  fs: FsSaida
  razao: number
  ok: boolean
  dimsAjustados?: Partial<Record<string, number>>
}

export interface DetalheMuro {
  muro: MuroEntrada
  semSolo: boolean
  avaliacoes: AvaliacaoSecao[]
  governante: AvaliacaoSecao | null
  candidatos: CandidatoTalude[]
  sugerida: AvaliacaoSecao | null // seção governante refeita com a sugestão
  saida: MuroSaida
}

export type Progresso = (mensagem: string, fracao: number) => void

const fsTxt = (n: number) => n.toFixed(2).replace('.', ',')

export function avaliarSecao(
  muro: MuroEntrada,
  secao: SecaoEntrada,
  solo: SoloMuro,
  p: ParametrosMuros,
  rapida = false
): AvaliacaoSecao {
  const modelo = modelarSecao(muro, secao)
  const ss = soloParaSecao(solo, modelo, muro.condicao, secao.pe_face)
  const avisos = [...modelo.avisos]
  const op = {
    corpoRigido: muro.tipo !== 'grampeado',
    gamaCorpo: muro.tipo === 'gabiao' ? p.gama_gabiao : p.gama_concreto,
    n_fatias: p.n_fatias,
    qs: p.qs_grampo,
    tBarra: p.t_barra,
    sh: secao.dim.espacamento_h ?? 1.5,
  }
  const global = buscarCirculoCritico(modelo, (c) => fsGlobalCirculo(c, modelo, ss, op), { alturaMuro: secao.H, rapida })
  if (!global) avisos.push(`s=${secao.s}: nenhum círculo válido envolvendo o muro foi encontrado.`)

  const fs: FsSaida = { global: global?.FS ?? null }
  const razoes: number[] = [global ? global.FS / p.fs_global_min : 0]
  let gravidade: ResultadoGravidade | undefined
  let grampeado: ResultadoGrampeado | undefined

  if (muro.tipo === 'grampeado') {
    grampeado = verificarGrampeado(secao, modelo, ss, p, global)
    fs.arrancamento = Number.isFinite(grampeado.fs_arrancamento_min) ? grampeado.fs_arrancamento_min : null
    razoes.push((grampeado.fs_arrancamento_min || 0) / p.fs_arrancamento_min)
    avisos.push(...grampeado.avisos.map((a) => `s=${secao.s}: ${a}`))
  } else {
    gravidade = verificarGravidade(muro.tipo, secao, modelo, ss, p)
    fs.tombamento = gravidade.fs_tombamento
    fs.deslizamento = gravidade.fs_deslizamento
    razoes.push(gravidade.fs_tombamento / p.fs_tombamento_min, gravidade.fs_deslizamento / p.fs_deslizamento_min)
    razoes.push(gravidade.sigma_max > 0 ? p.tensao_admissivel / gravidade.sigma_max : 1)
    if (!gravidade.sem_tracao) razoes.push(Math.min(0.99, gravidade.B / 6 / Math.abs(gravidade.excentricidade)))
    avisos.push(...gravidade.avisos.map((a) => `s=${secao.s}: ${a}`))
  }
  const razao = Math.min(...razoes)
  return { secao, modelo, solo: ss, waterY: ss.waterY, global, gravidade, grampeado, fs, razao, ok: razao >= 1 - 1e-9, avisos }
}

/** Seção com outra inclinação e/ou outros fatores de pré-dimensionamento. */
export function variante(muro: MuroEntrada, secao: SecaoEntrada, r: number, tipos: MurosTipos | null): SecaoEntrada | null {
  const t = refazerTalude(muro, secao, r)
  if (!t) return null
  const nova: SecaoEntrada = { ...secao, talude: t.talude, H: t.H }
  if (tipos) {
    // com os fatores do arquivo, o corpo refeito é o mesmo do Civil 3D (ver geradores.test.ts)
    const g = gerarCorpo(muro, nova, t.H, tipos)
    if (!g) return null
    nova.corpo = g.corpo
    nova.grampos = g.grampos
    nova.dim = g.dim
  } else if (Math.abs(t.H - secao.H) > 1e-6) {
    return null // a altura do muro mudou e não há regras para refazer o corpo
  }
  return nova
}

function clonarTipos(t: MurosTipos): MurosTipos {
  return JSON.parse(JSON.stringify(t))
}

// combinações de fatores a testar quando nenhuma inclinação resolve, da mais
// econômica para a mais pesada
function combinacoesDims(muro: MuroEntrada, tipos: MurosTipos, p: ParametrosMuros): MurosTipos[] {
  const out: { t: MurosTipos; custo: number }[] = []
  if (muro.tipo === 'concreto' && tipos.concreto) {
    const c0 = tipos.concreto
    const pontas = [...new Set([c0.ponta_fator, 0.15, 0.25, 0.33, 0.4, 0.5])]
    const embs = p.considerar_passivo ? [c0.embutimento, c0.embutimento + 0.5, c0.embutimento + 1.0] : [c0.embutimento]
    for (let bf = c0.base_fator; bf <= 1.6 + 1e-9; bf += 0.05)
      for (const pf of pontas)
        for (const em of embs) {
          const t = clonarTipos(tipos)
          t.concreto = { ...c0, base_fator: +bf.toFixed(2), ponta_fator: pf, embutimento: em }
          out.push({ t, custo: bf * 10 + em })
        }
  } else if (muro.tipo === 'gabiao' && tipos.gabiao) {
    const g0 = tipos.gabiao
    const recuos = [...new Set([g0.recuo_degrau, 0.25, 0])].filter((r) => r <= g0.recuo_degrau)
    for (let bf = g0.base_fator; bf <= 1.6 + 1e-9; bf += 0.1)
      for (const rc of recuos) {
        const t = clonarTipos(tipos)
        t.gabiao = { ...g0, base_fator: +bf.toFixed(2), recuo_degrau: rc }
        // custo ~ volume de caixas: base média
        out.push({ t, custo: bf * 10 - rc })
      }
  } else if (muro.tipo === 'grampeado' && tipos.grampeado) {
    const n0 = tipos.grampeado
    const esps = [...new Set([n0.espacamento_v, 1.25, 1.0])].filter((e) => e <= n0.espacamento_v)
    for (let cf = n0.comprimento_fator; cf <= 1.5 + 1e-9; cf += 0.1)
      for (const e of esps) {
        const t = clonarTipos(tipos)
        t.grampeado = { ...n0, comprimento_fator: +cf.toFixed(2), espacamento_h: e, espacamento_v: e }
        out.push({ t, custo: cf / (e * e) })
      }
  }
  return out.sort((a, b) => a.custo - b.custo).map((o) => o.t)
}

function diffTipos(muro: MuroEntrada, de: MurosTipos, para: MurosTipos): SugestaoSaida['muros_tipos'] | undefined {
  const k = muro.tipo
  const a = (de[k] ?? {}) as unknown as Record<string, number>
  const b = (para[k] ?? {}) as unknown as Record<string, number>
  const campos: Record<string, string[]> = {
    concreto: ['base_fator', 'ponta_fator', 'sapata_esp_fator', 'parede_base_fator', 'embutimento'],
    gabiao: ['base_fator', 'altura_camada', 'recuo_degrau'],
    grampeado: ['comprimento_fator', 'espacamento_h', 'espacamento_v'],
  }
  const mud: Record<string, number> = {}
  for (const c of campos[k]) if (b[c] != null && Math.abs(b[c] - (a[c] ?? NaN)) > 1e-9) mud[c] = +b[c].toFixed(3)
  return Object.keys(mud).length ? ({ [k]: mud } as SugestaoSaida['muros_tipos']) : undefined
}

export function verificarMuro(
  muro: MuroEntrada,
  solo: SoloMuro | null,
  p: ParametrosMuros,
  tiposArquivo: MurosTipos | undefined,
  progresso?: Progresso
): DetalheMuro {
  const vazio = (avisos: string[]): DetalheMuro => ({
    muro,
    semSolo: true,
    avaliacoes: [],
    governante: null,
    candidatos: [],
    sugerida: null,
    saida: { id: muro.id, ok: false, fs: { global: null }, sugestao: {}, secao_critica: secaoCritica(muro).s, avisos, secoes: [] },
  })
  if (!solo) return vazio(['Sem dados de solo: escolha uma análise salva ou uma sondagem do projeto para este muro.'])

  const avisos: string[] = [...solo.avisos]
  const tipos = tiposArquivo && tiposArquivo[muro.tipo] ? tiposArquivo : null
  if (!tipos) avisos.push(`Arquivo sem "muros_tipos.${muro.tipo}": não dá para testar outro pré-dimensionamento.`)

  // 1) todas as seções, busca completa
  const avaliacoes: AvaliacaoSecao[] = []
  muro.secoes.forEach((s, i) => {
    progresso?.(`${muro.id}: seção s=${s.s}`, (i / muro.secoes.length) * 0.4)
    avaliacoes.push(avaliarSecao(muro, s, solo, p))
    if (tipos) {
      const g = gerarCorpo(muro, s, s.H, tipos)
      if (g && diferencaCorpo(s, g) > 0.02) {
        avisos.push(`s=${s.s}: o corpo do arquivo difere do pré-dimensionamento refeito aqui (> 2 cm) — as sugestões usam as regras do ME-DYN-TALUDE v1.7.1.`)
      }
    }
  })
  for (const a of avaliacoes) avisos.push(...a.avisos)
  // a seção crítica é a de maior H; outra só governa se estiver pelo menos 2% pior
  const maiorH = secaoCritica(muro)
  const avMaiorH = avaliacoes.find((a) => a.secao === maiorH)!
  const pior = avaliacoes.reduce((a, b) => (b.razao < a.razao ? b : a))
  const governante = pior.razao < avMaiorH.razao - 0.02 ? pior : avMaiorH
  if (governante !== avMaiorH) {
    avisos.push(`A seção que governa é s=${governante.secao.s}, não a de maior H (s=${maiorH.s}).`)
  }
  const okTodas = avaliacoes.every((a) => a.ok)

  // 2) inclinações do talude junto ao muro, na seção governante (busca rápida)
  const sec = governante.secao
  const candidatos: CandidatoTalude[] = []
  p.inclinacoes_teste.forEach((r, i) => {
    progresso?.(`${muro.id}: talude 1:${fsTxt(r)}`, 0.4 + (i / p.inclinacoes_teste.length) * 0.3)
    const t = refazerTalude(muro, sec, r)
    const v = t ? variante(muro, sec, r, tipos) : null
    if (!t || !v) return
    if (t.H < 0.5) return // o muro deixaria de existir — fora do escopo da sugestão
    const av = avaliarSecao(muro, v, solo, p, true)
    candidatos.push({ r, H: t.H, area: t.area, fs: av.fs, razao: av.razao, ok: av.ok })
  })

  // uma sugestão só vale se passar também na busca completa
  let escolhido: { r: number; tipos: MurosTipos | null } | null = null
  let sugerida: AvaliacaoSecao | null = null
  const confirmar = (r: number, t: MurosTipos | null): boolean => {
    const v = variante(muro, sec, r, t ?? tipos)
    if (!v) return false
    const av = avaliarSecao(muro, v, solo, p)
    if (!av.ok) return false
    escolhido = { r, tipos: t }
    sugerida = av
    return true
  }

  progresso?.(`${muro.id}: conferindo inclinações`, 0.7)
  for (const c of candidatos.filter((c) => c.ok).sort((a, b) => a.area - b.area)) {
    if (confirmar(c.r, null)) break
  }

  // 3) nenhuma inclinação resolve: ajustar o pré-dimensionamento
  if (!escolhido && tipos) {
    const combos = combinacoesDims(muro, tipos, p)
    const porRazao = [...candidatos].sort((a, b) => b.razao - a.razao)
    const rs =
      muro.tipo === 'grampeado'
        ? [...new Set([muro.talude_h_por_v, porRazao[0]?.r, porRazao[1]?.r, p.inclinacoes_teste[p.inclinacoes_teste.length - 1]].filter((x): x is number => x != null))]
        : [...candidatos].sort((a, b) => a.area - b.area).map((c) => c.r)
    let k = 0
    for (const r of rs) {
      progresso?.(`${muro.id}: pré-dimensionamento com talude 1:${fsTxt(r)}`, 0.72 + (k++ / rs.length) * 0.25)
      let tentativas = 0
      for (const t of combos) {
        const v = variante(muro, sec, r, t)
        if (!v) continue
        if (muro.tipo !== 'grampeado') {
          // muro de gravidade: as verificações do muro são baratas — só confere o
          // global (caro) nos pré-dimensionamentos que já passam nelas
          const modelo = modelarSecao(muro, v)
          const ss = soloParaSecao(solo, modelo, muro.condicao, v.pe_face)
          if (!verificarGravidade(muro.tipo, v, modelo, ss, p).ok) continue
        }
        if (muro.tipo !== 'grampeado' && ++tentativas > 8) break // nesta inclinação o global não fecha — tenta outra
        if (!avaliarSecao(muro, v, solo, p, true).ok) continue
        if (confirmar(r, t)) {
          const c = candidatos.find((x) => x.r === r)
          if (c) c.dimsAjustados = (diffTipos(muro, tipos, t)?.[muro.tipo] ?? {}) as Partial<Record<string, number>>
          break
        }
      }
      if (escolhido) break
    }
  }

  // 4) sugestão final
  const sugestao: SugestaoSaida = {}
  const esc = escolhido as { r: number; tipos: MurosTipos | null } | null
  if (esc) {
    sugestao.talude_h_por_v = esc.r
    if (esc.tipos && tipos) {
      const d = diffTipos(muro, tipos, esc.tipos)
      if (d) sugestao.muros_tipos = d
    }
    if (sugestao.muros_tipos?.concreto?.base_fator != null && sugestao.muros_tipos.concreto.base_fator > 1.0) {
      avisos.push('Base do muro de concreto acima de 1,0·H: o deslizamento governa — considere dente (chave) de cisalhamento ou outra solução.')
    }
  } else {
    const melhor = [...candidatos].sort((a, b) => b.razao - a.razao)[0]
    if (melhor && !okTodas) {
      avisos.push(
        `Nenhuma inclinação de 1:${fsTxt(p.inclinacoes_teste[0])} a 1:${fsTxt(p.inclinacoes_teste[p.inclinacoes_teste.length - 1])} nem o ajuste do pré-dimensionamento atingiu todos os FS. A melhor tentativa foi 1:${fsTxt(melhor.r)} (FS/FS mín = ${fsTxt(melhor.razao)}): rever solução (tipo de muro, fundação, drenagem).`
      )
    }
  }
  if (muro.tipo !== 'grampeado') avisos.push('Dimensionamento estrutural (armaduras, espessuras da parede e da sapata) não verificado aqui.')

  const saida: MuroSaida = {
    id: muro.id,
    ok: okTodas,
    fs: arredFs(governante.fs),
    sugestao,
    secao_critica: governante.secao.s,
    avisos: [...new Set(avisos)],
    secoes: avaliacoes.map((a) => ({ s: a.secao.s, H: a.secao.H, ok: a.ok, fs: arredFs(a.fs) })),
  }
  progresso?.(`${muro.id}: pronto`, 1)
  return { muro, semSolo: false, avaliacoes, governante, candidatos, sugerida, saida }
}

function arredFs(fs: FsSaida): FsSaida {
  const r = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? (v === Infinity ? 99 : null) : +v.toFixed(3))
  const out: FsSaida = { global: r(fs.global) }
  if ('tombamento' in fs) out.tombamento = r(fs.tombamento)
  if ('deslizamento' in fs) out.deslizamento = r(fs.deslizamento)
  if ('arrancamento' in fs) out.arrancamento = r(fs.arrancamento)
  return out
}

export function montarSaida(arquivo: MurosSecoesArquivo, detalhes: DetalheMuro[]): MurosVerificacaoArquivo {
  return { versao: 1, plato: arquivo.plato, gerado_em: new Date().toISOString(), muros: detalhes.map((d) => d.saida) }
}
