// Ruptura translacional pelo modelo de talude infinito.
//
// Uma camada rasa de espessura vertical z escorrega paralela à superfície
// sobre um plano de inclinação β. Com fluxo paralelo à encosta ocupando a
// fração m da espessura, a poropressão no plano é u = m·γw·z·cos²β e
//
//   FS = [c' + c_ap + (γ·z·cos²β − u)·tan φ'] / (γ·z·sen β·cos β)
//
// onde c_ap = (ua − uw)·tan φᵇ é a coesão aparente da sucção (Fredlund).
// Funções puras, sem React. Verificação independente da análise de conjunto:
// a superfície é imposta pela estratigrafia (casca, base de camada ou contato
// aterro/terreno), não procurada.

import { buildProfile, effectiveNaturalTerrain, groundY } from './geometry'
import { effectiveBounds, soilAt } from './soil'
import type {
  AnalysisMode,
  CenarioTranslacional,
  ConfigTranslacional,
  FillMaterial,
  Layer,
  Point,
  PontoTranslacional,
  ResultadoTranslacional,
  SlopeGeometry,
  TrechoTranslacional,
} from './types'

const RAD = Math.PI / 180
const N_PONTOS = 10          // pontos de avaliação por trecho do perfil
const Z_MIN = 0.05           // m: abaixo disso o plano é considerado na superfície (sem camada)
const TOL_PARALELO = 5       // graus: diferença entre superfície e plano acima da qual o modelo é aproximado
const Z_RASO_MAX = 5         // m: talude infinito é pensado para camadas rasas
const DX_INCLINACAO = 0.25   // m: passo da derivada numérica da inclinação do plano

export const CONFIG_TRANSLACIONAL_PADRAO: ConfigTranslacional = {
  ativa: false,
  plano: { tipo: 'casca', espessura: 1.5 },
  usar_parametros_proprios: false,
  c_plano: 5,
  phi_plano: 30,
  gamma: 18,
  succao: 0,
  phi_b: 15,
  m_parcial: 0.5,
  m_projeto: 1,
  beta_min: 5,
  fs_min: 1.5,
}

export interface EntradaTalude {
  beta: number   // graus
  z: number      // m, espessura vertical
  gamma: number  // kN/m³
  gamma_w: number
  c: number      // kPa
  phi: number    // graus
  m: number      // 0 a 1
  succao?: number // kPa
  phi_b?: number  // graus
}

export interface ParcelasFS {
  FS: number
  coesao: number
  succao: number
  atrito: number
}

/** FS do talude infinito, separado nas parcelas de coesão, sucção e atrito. */
export function fsTaludeInfinito(e: EntradaTalude): ParcelasFS {
  const b = e.beta * RAD
  const sen = Math.sin(b)
  const cos = Math.cos(b)
  const t = e.gamma * e.z * sen * cos
  if (!(t > 0) || !(e.z > 0)) return { FS: Infinity, coesao: Infinity, succao: 0, atrito: Infinity }
  const coesao = e.c / t
  const succao = (Math.max(0, e.succao ?? 0) * Math.tan((e.phi_b ?? 0) * RAD)) / t
  const atrito = ((1 - (e.m * e.gamma_w) / e.gamma) * Math.tan(e.phi * RAD)) / Math.tan(b)
  return { FS: coesao + succao + atrito, coesao, succao, atrito }
}

/**
 * Fração m da espessura com água que leva o FS a 1,0 (sem sucção).
 * > 1: não rompe nem saturado até a superfície; < 0: rompe seco.
 */
export function mCritico(e: Omit<EntradaTalude, 'm' | 'succao' | 'phi_b'>): number {
  const b = e.beta * RAD
  const t = e.gamma * e.z * Math.sin(b) * Math.cos(b)
  const tanPhi = Math.tan(e.phi * RAD)
  if (!(tanPhi > 0)) return -Infinity // sem atrito a água não muda o FS: só a coesão segura
  const coesao = e.c / t
  return (e.gamma / e.gamma_w) * (1 - ((1 - coesao) * Math.tan(b)) / tanPhi)
}

/**
 * Espessura vertical acima da qual a camada seca e sem sucção rompe:
 * z = c' / [γ·cos²β·(tan β − tan φ')]. null quando β ≤ φ' (não há limite).
 */
export function zLimite(e: { beta: number; gamma: number; c: number; phi: number }): number | null {
  const b = e.beta * RAD
  const dif = Math.tan(b) - Math.tan(e.phi * RAD)
  if (!(dif > 0)) return null
  const cos = Math.cos(b)
  return e.c / (e.gamma * cos * cos * dif)
}

/**
 * Maior inclinação (graus, passo de 0,1°) com FS ≥ alvo, varrendo a partir
 * de 0,5°. Retorna a última inclinação aprovada antes da primeira reprovada
 * (o FS não é monótono em β quando há coesão). null se já reprova a 0,5°.
 */
export function betaMaximo(e: Omit<EntradaTalude, 'beta'>, fsAlvo: number): number | null {
  let ultimo: number | null = null
  for (let i = 5; i <= 895; i++) {
    const beta = i / 10
    if (fsTaludeInfinito({ ...e, beta }).FS >= fsAlvo) ultimo = beta
    else break
  }
  return ultimo
}

const graus = (dy: number, dx: number) => Math.atan(Math.abs(dy / dx)) / RAD

interface Contexto {
  profile: Point[]
  refTerrain: Point[] | undefined
  layers: Layer[]
  fill: FillMaterial | null
  fillZones?: Layer[]
}

/** Cota do terreno natural (separação aterro/fundação) em x. */
function terrenoEm(x: number, ctx: Contexto): number {
  return ctx.refTerrain && ctx.refTerrain.length ? groundY(x, ctx.refTerrain) : 0
}

/** Cota do plano de ruptura em x, ou null se indefinida ali. */
function yPlano(x: number, cfg: ConfigTranslacional, ctx: Contexto): number | null {
  const plano = cfg.plano
  if (plano.tipo === 'casca') return groundY(x, ctx.profile) - plano.espessura
  if (plano.tipo === 'terreno_natural') return terrenoEm(x, ctx)
  const camada = ctx.layers[plano.indice]
  if (!camada) return null
  const base = effectiveBounds(camada, x, ctx.refTerrain).base
  return Number.isFinite(base) ? base : null
}

/** Material, c', φ' e γ médio da camada que desliza sobre o plano em x. */
function materialEm(x: number, ySup: number, yPl: number, cfg: ConfigTranslacional, ctx: Contexto) {
  const acima = soilAt(x, yPl + 1e-3, ctx.layers, ctx.fill, ctx.fillZones, ctx.refTerrain)
  if (cfg.usar_parametros_proprios) {
    return { nome: acima.sourceName, c: cfg.c_plano, phi: cfg.phi_plano, gamma: cfg.gamma }
  }
  // γ médio pela espessura: 6 pontos entre o plano e a superfície
  let soma = 0
  const n = 6
  for (let k = 0; k < n; k++) {
    const y = yPl + ((k + 0.5) / n) * (ySup - yPl)
    soma += soilAt(x, y, ctx.layers, ctx.fill, ctx.fillZones, ctx.refTerrain).gamma
  }
  return { nome: acima.sourceName, c: acima.c, phi: acima.phi, gamma: soma / n }
}

/**
 * Verificação translacional de uma seção: percorre os trechos inclinados do
 * perfil (faces de bancada e encosta natural), avalia N_PONTOS em cada um e
 * devolve o FS por cenário de água, o m crítico e a inclinação máxima.
 */
export function analisarTranslacional(
  geo: SlopeGeometry,
  mode: AnalysisMode,
  layers: Layer[],
  fill: FillMaterial | null,
  fillZones: Layer[] | undefined,
  cfg: ConfigTranslacional
): ResultadoTranslacional {
  const gamma_w = geo.gamma_water ?? 9.81
  const m_projeto = Math.min(1, Math.max(0, cfg.m_projeto))
  const m_parcial = Math.min(1, Math.max(0, cfg.m_parcial))
  const avisos: string[] = []
  const vazio = (): ResultadoTranslacional => ({ trechos: [], critico: null, fs_min: cfg.fs_min, m_projeto, gamma_w, avisos })

  const ctx: Contexto = {
    profile: buildProfile(geo, mode),
    refTerrain: effectiveNaturalTerrain(geo, mode),
    layers,
    fill,
    fillZones,
  }

  if (cfg.plano.tipo === 'casca' && !(cfg.plano.espessura > 0)) {
    avisos.push('Informe a espessura da casca (maior que zero).')
    return vazio()
  }
  if (cfg.plano.tipo === 'camada' && !layers[cfg.plano.indice]) {
    avisos.push('A camada escolhida para o plano de ruptura não existe mais. Escolha outra.')
    return vazio()
  }
  if (cfg.plano.tipo === 'terreno_natural' && mode !== 'aterro') {
    avisos.push('O contato aterro/terreno natural só existe no modo aterro.')
    return vazio()
  }

  const cenariosBase: { nome: string; m: number; succao: number }[] = []
  if (cfg.succao > 0) cenariosBase.push({ nome: 'Seco, com sucção', m: 0, succao: cfg.succao })
  cenariosBase.push({ nome: 'Sem sucção (m = 0)', m: 0, succao: 0 })
  cenariosBase.push({ nome: `Lençol parcial (m = ${m_parcial.toLocaleString('pt-BR')})`, m: m_parcial, succao: 0 })
  cenariosBase.push({ nome: 'Lençol pleno (m = 1)', m: 1, succao: 0 })

  const trechos: TrechoTranslacional[] = []
  let semBase = false
  let foraDoAterro = false
  const p = ctx.profile
  for (let s = 0; s < p.length - 1; s++) {
    const a = p[s]
    const b = p[s + 1]
    const dx = b.x - a.x
    if (!(dx > 1e-6)) continue
    const betaSup = graus(b.y - a.y, dx)
    if (betaSup < cfg.beta_min) continue

    const pontos: (PontoTranslacional & { mat: ReturnType<typeof materialEm>; fsCen: number[] })[] = []
    for (let k = 0; k < N_PONTOS; k++) {
      const x = a.x + ((k + 0.5) / N_PONTOS) * dx
      const ySup = a.y + ((x - a.x) / dx) * (b.y - a.y)
      const yPl = yPlano(x, cfg, ctx)
      if (yPl == null) {
        semBase = true
        continue
      }
      const z = ySup - yPl
      if (z < Z_MIN) continue
      // casca de aterro: é a saia do próprio aterro. Junto ao pé, onde o plano
      // desceria para dentro da fundação, o ponto sai da verificação
      if (cfg.plano.tipo === 'casca' && fill && ySup > terrenoEm(x, ctx) + Z_MIN && yPl < terrenoEm(x, ctx) - 1e-6) {
        foraDoAterro = true
        continue
      }
      // casca: o plano é a própria superfície rebaixada, mesma inclinação. Nos demais,
      // derivada numérica com passo menor que a distância até a ponta do trecho, pra
      // não misturar a inclinação da berma vizinha
      let betaPl = betaSup
      if (cfg.plano.tipo !== 'casca') {
        const h = Math.min(DX_INCLINACAO, (0.45 * dx) / N_PONTOS)
        const y1 = yPlano(x - h, cfg, ctx)
        const y2 = yPlano(x + h, cfg, ctx)
        if (y1 != null && y2 != null) betaPl = graus(y2 - y1, 2 * h)
      }
      if (betaPl < 0.5) continue // plano horizontal: não há componente que faça a camada deslizar
      const mat = materialEm(x, ySup, yPl, cfg, ctx)
      const base = { beta: betaPl, z, gamma: mat.gamma, gamma_w, c: mat.c, phi: mat.phi, phi_b: cfg.phi_b }
      const fsCen = cenariosBase.map((c) => fsTaludeInfinito({ ...base, m: c.m, succao: c.succao }).FS)
      const fsProj = fsTaludeInfinito({ ...base, m: m_projeto, succao: 0 }).FS
      pontos.push({ x, y_sup: ySup, y_plano: yPl, z, beta_plano: betaPl, fs_projeto: fsProj, mat, fsCen })
    }
    if (pontos.length === 0) continue

    const crit = pontos.reduce((m, q) => (q.fs_projeto < m.fs_projeto ? q : m))
    const entradaCrit = { beta: crit.beta_plano, z: crit.z, gamma: crit.mat.gamma, gamma_w, c: crit.mat.c, phi: crit.mat.phi }
    const cenarios: CenarioTranslacional[] = cenariosBase.map((c, i) => ({
      ...c,
      FS: Math.min(...pontos.map((q) => q.fsCen[i])),
    }))
    const betaPlMedio = pontos.reduce((sum, q) => sum + q.beta_plano, 0) / pontos.length
    const naoParalelo = pontos.some((q) => Math.abs(q.beta_plano - betaSup) > TOL_PARALELO)

    trechos.push({
      indice: trechos.length,
      x0: a.x,
      x1: b.x,
      beta_sup: betaSup,
      beta_plano: betaPlMedio,
      z_min: Math.min(...pontos.map((q) => q.z)),
      z_max: Math.max(...pontos.map((q) => q.z)),
      material: crit.mat.nome,
      c: crit.mat.c,
      phi: crit.mat.phi,
      gamma: crit.mat.gamma,
      cenarios,
      fs_projeto: crit.fs_projeto,
      x_critico: crit.x,
      z_critico: crit.z,
      m_critico: mCritico(entradaCrit),
      z_limite: zLimite(entradaCrit),
      beta_max: betaMaximo({ ...entradaCrit, m: m_projeto }, cfg.fs_min),
      adequado: crit.fs_projeto >= cfg.fs_min,
      nao_paralelo: naoParalelo,
      pontos: pontos.map(({ x, y_sup, y_plano, z, beta_plano, fs_projeto }) => ({ x, y_sup, y_plano, z, beta_plano, fs_projeto })),
    })
  }

  if (foraDoAterro) {
    avisos.push('Junto ao pé, onde a casca entraria na fundação, os pontos ficaram de fora: a casca é verificada só dentro do aterro.')
  }
  if (semBase) avisos.push('A camada escolhida não tem base definida em parte do perfil: esses pontos ficaram de fora.')
  if (trechos.length === 0) {
    avisos.push('Nenhum trecho inclinado tem camada acima do plano escolhido. Confira o plano e a inclinação mínima.')
  }
  if (trechos.some((t) => t.nao_paralelo)) {
    avisos.push(
      `Em algum trecho, a superfície e o plano diferem mais de ${TOL_PARALELO}°: o talude infinito fica aproximado. Confira com a análise de conjunto.`
    )
  }
  if (trechos.some((t) => t.z_max > Z_RASO_MAX)) {
    avisos.push(`Há trecho com espessura acima de ${Z_RASO_MAX} m: o talude infinito é pensado para camadas rasas.`)
  }

  const critico = trechos.length ? trechos.reduce((m, t) => (t.fs_projeto < m.fs_projeto ? t : m)) : null
  return { trechos, critico, fs_min: cfg.fs_min, m_projeto, gamma_w, avisos }
}
