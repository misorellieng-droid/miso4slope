import { colchaoParaReforco, razaoAreas, tipoEfetivo, type ColchaoGeogrelha, type FaixaColunas } from './argilaMole/faixaColunas'
import type { Esforcos, ParamsCortina } from './argilaMole/cortina'
import type { ResultadoMSE, ParamsMSE } from './argilaMole/soloReforcado'
import type { DimConcreto, DimGabiao, DimGrampeado, MuroEntrada } from './muros/tipos'
import type { Layer, SlopeGeometry } from './types'

// Quantitativos por metro linear de cada solução, para pré-orçamento. Tudo é
// estimativa de pré-dimensionamento: as quantidades vêm da geometria adotada e
// das premissas abaixo (HIPÓTESE, editáveis); os preços unitários são do usuário.

export type Cod =
  | 'perf_col'
  | 'brita_col'
  | 'concreto_estaca'
  | 'geotextil'
  | 'brita_colchao'
  | 'geogrelha'
  | 'concreto'
  | 'aco'
  | 'forma'
  | 'lastro'
  | 'escavacao'
  | 'aterro'
  | 'fachada'
  | 'pedra'
  | 'tela_gabiao'
  | 'perf_grampo'
  | 'calda'
  | 'projetado'
  | 'tela_soldada'

export const CATALOGO: Record<Cod, { nome: string; un: string }> = {
  perf_col: { nome: 'Execução / perfuração de colunas e estacas', un: 'm' },
  brita_col: { nome: 'Brita das colunas', un: 'm³' },
  concreto_estaca: { nome: 'Concreto ou argamassa de estacas e colunas rígidas', un: 'm³' },
  geotextil: { nome: 'Geotêxtil (camisa da coluna ou filtro)', un: 'm²' },
  brita_colchao: { nome: 'Colchão de brita', un: 'm³' },
  geogrelha: { nome: 'Geogrelha / geossintético de reforço', un: 'm²' },
  concreto: { nome: 'Concreto estrutural (muro, vigas)', un: 'm³' },
  aco: { nome: 'Aço (armadura, barras, tirantes)', un: 'kg' },
  forma: { nome: 'Forma', un: 'm²' },
  lastro: { nome: 'Concreto magro (lastro)', un: 'm³' },
  escavacao: { nome: 'Escavação', un: 'm³' },
  aterro: { nome: 'Aterro compactado / reforçado', un: 'm³' },
  fachada: { nome: 'Face / paramento', un: 'm²' },
  pedra: { nome: 'Pedra de enchimento (gabião)', un: 'm³' },
  tela_gabiao: { nome: 'Tela dos gabiões', un: 'm²' },
  perf_grampo: { nome: 'Perfuração dos grampos', un: 'm' },
  calda: { nome: 'Calda de cimento dos grampos', un: 'm³' },
  projetado: { nome: 'Concreto projetado da face', un: 'm³' },
  tela_soldada: { nome: 'Tela soldada da face', un: 'm²' },
}

export type ClasseSolo = 'muito_mole' | 'mole' | 'firme' | 'granular'
export const NOME_CLASSE: Record<ClasseSolo, string> = {
  muito_mole: 'argila muito mole (su < 15 kPa)',
  mole: 'argila mole (su 15 a 30 kPa)',
  firme: 'solo coesivo firme (su ≥ 30 kPa)',
  granular: 'solo granular',
}

export interface Premissas {
  sobre: Record<ClasseSolo, number> // sobreconsumo do material de furos e colunas, por solo atravessado
  sobre_calda: number // sobreconsumo da calda do grampo
  aco_estaca: number // kg/m³ mínimo das estacas
  aco_viga: number // kg/m³ das vigas
  aco_muro: number // kg/m³ do muro de flexão (se o estudo não definir)
  viga_b: number // m
  viga_h: number // m
  traspasse: number // fração de geotêxtil e tela em emendas
  perda_geo: number // fração de perda da geogrelha
  dobra_mse: number // m de retorno do geossintético na face
  rebote: number // fração de rebote do concreto projetado
  perda_concreto: number // fração de perda do concreto do muro
  lastro_esp: number // m
  barra_grampo: number // kg/m (Ø25 = 3,85)
  furo_grampo: number // m, diâmetro do furo
}

export const PREMISSAS_PADRAO: Premissas = {
  sobre: { muito_mole: 0.3, mole: 0.2, firme: 0.1, granular: 0.05 },
  sobre_calda: 0.3,
  aco_estaca: 60,
  aco_viga: 100,
  aco_muro: 80,
  viga_b: 0.6,
  viga_h: 0.6,
  traspasse: 0.1,
  perda_geo: 0.05,
  dobra_mse: 1,
  rebote: 0.15,
  perda_concreto: 0.05,
  lastro_esp: 0.1,
  barra_grampo: 3.85,
  furo_grampo: 0.1,
}

export type Precos = Partial<Record<Cod, number>>

export interface ItemQtd {
  cod: Cod
  descricao: string // detalhe contextual
  un: string
  liquida: number // por metro linear, sem sobreconsumo
  sobre: number // fração
  qtd: number // por metro linear, com sobreconsumo
  nota?: string
}

export interface Quantitativo {
  itens: ItemQtd[]
  notas: string[]
}

const item = (cod: Cod, descricao: string, liquida: number, sobre = 0, nota?: string): ItemQtd => ({
  cod,
  descricao,
  un: CATALOGO[cod].un,
  liquida,
  sobre,
  qtd: liquida * (1 + sobre),
  nota,
})

export function classeDaCamada(l: Pick<Layer, 'c' | 'phi'>): ClasseSolo {
  if ((l.phi ?? 0) < 1) return l.c < 15 ? 'muito_mole' : l.c < 30 ? 'mole' : 'firme'
  return l.c >= 5 ? 'firme' : 'granular'
}

export interface TrechoSobre {
  nome: string
  classe: ClasseSolo
  metros: number
  fator: number
}

/** Sobreconsumo médio ponderado pelo comprimento da coluna em cada camada (de y = 0 até −profundidade). */
export function sobreNasCamadas(layers: Layer[], profundidade: number, prem: Premissas): { fator: number; trechos: TrechoSobre[] } {
  const trechos: TrechoSobre[] = []
  for (const l of layers) {
    const topo = Math.min(l.y_top ?? 0, 0)
    const base = l.y_base ?? -Infinity
    const m = Math.min(topo, 0) - Math.max(base, -profundidade)
    if (m <= 1e-9) continue
    const classe = classeDaCamada(l)
    trechos.push({ nome: l.name, classe, metros: m, fator: prem.sobre[classe] })
  }
  const soma = trechos.reduce((a, t) => a + t.metros, 0)
  if (soma <= 0) return { fator: prem.sobre.firme, trechos }
  return { fator: trechos.reduce((a, t) => a + t.metros * t.fator, 0) / soma, trechos }
}

const area = (d: number) => (Math.PI * d * d) / 4

// ---------------------------------------------------------------------------
// Faixa de colunas

export function quantFaixa(f: FaixaColunas, colchao: ColchaoGeogrelha, geo: SlopeGeometry, layers: Layer[], prem: Premissas): Quantitativo {
  const tipo = tipoEfetivo(f)
  const a = razaoAreas(f)
  const aCel = area(f.diametro) / a
  const nCol = f.largura / aCel // colunas por metro linear da faixa
  const { fator, trechos } = sobreNasCamadas(layers, f.comprimento, prem)
  const vol = nCol * area(f.diametro) * f.comprimento
  const itens: ItemQtd[] = [
    item('perf_col', `${nCol.toFixed(2)} colunas/m × ${f.comprimento} m`, nCol * f.comprimento),
    tipo === 'rigida'
      ? item('concreto_estaca', `colunas rígidas Ø ${f.diametro} m`, vol, fator, 'sobreconsumo pelo solo atravessado')
      : item('brita_col', `colunas Ø ${f.diametro} m`, vol, fator, 'sobreconsumo pelo solo atravessado'),
  ]
  if (tipo === 'gec') {
    itens.push(item('geotextil', 'camisa das colunas (π·d·L)', nCol * Math.PI * f.diametro * f.comprimento, prem.traspasse, 'inclui costura/traspasse'))
  }
  const comAreaGeo = colchao.T > 0
  const lReforco = comAreaGeo ? Math.max(0, colchaoParaReforco(colchao, f, geo).x_end - (f.xRef - f.frente)) : 0
  const larguraColchao = comAreaGeo ? lReforco : f.largura
  itens.push(item('brita_colchao', `esp. ${colchao.espessura} m × ${larguraColchao.toFixed(1)} m`, colchao.espessura * larguraColchao))
  if (comAreaGeo) itens.push(item('geogrelha', `${lReforco.toFixed(1)} m de reforço`, lReforco, prem.perda_geo, 'inclui perda/emenda'))
  const notas = [
    `Colunas por metro linear = largura da faixa ÷ área da célula = ${f.largura} ÷ ${aCel.toFixed(2)} m² = ${nCol.toFixed(2)}.`,
    'Sobreconsumo por camada: ' + trechos.map((t) => `${t.nome} ${t.metros.toFixed(1)} m (${(t.fator * 100).toFixed(0)}%)`).join('; ') + '.',
  ]
  if (!comAreaGeo) notas.push('Sem geogrelha (T = 0): o colchão foi dimensionado só sobre a largura da faixa.')
  return { itens, notas }
}

// ---------------------------------------------------------------------------
// Cortina de estacas atirantada

export function quantCortina(p: ParamsCortina, e: Esforcos, geo: SlopeGeometry, layers: Layer[], yPonta: number, prem: Premissas): Quantitativo {
  const n = 1 / p.espacamento // estacas por metro linear (cortina e reação)
  const Lc = geo.total_height - yPonta
  const Lr = p.comprimentoReacao
  const { fator, trechos } = sobreNasCamadas(layers, Math.max(-yPonta, Lr), prem)
  const volC = n * area(p.diametro) * Lc
  const volR = n * area(p.diametroReacao) * Lr
  const taxaC = Math.max(e.taxaAco * 7850, prem.aco_estaca)
  const kgEstacas = volC * taxaC + volR * prem.aco_estaca
  const kgTirante = n * e.AtirNec * 1e-4 * p.distReacao * 7850
  const volViga = 2 * prem.viga_b * prem.viga_h
  const itens: ItemQtd[] = [
    item('perf_col', `cortina ${Lc.toFixed(1)} m + reação ${Lr.toFixed(1)} m, ${n.toFixed(2)} estacas/m cada`, n * (Lc + Lr)),
    item('concreto_estaca', `estacas Ø ${p.diametro} m e Ø ${p.diametroReacao} m`, volC + volR, fator, 'sobreconsumo pelo solo atravessado'),
    item('aco', `estacas (${taxaC.toFixed(0)} kg/m³ na cortina), tirantes ${e.AtirNec.toFixed(1)} cm² e vigas`, kgEstacas + kgTirante + volViga * prem.aco_viga),
    item('concreto', `2 vigas de coroamento ${prem.viga_b}×${prem.viga_h} m`, volViga, prem.perda_concreto),
    item('forma', 'vigas de coroamento', 2 * (2 * prem.viga_h + prem.viga_b)),
  ]
  const notas = [
    `Estacas da cortina: ${Lc.toFixed(1)} m (do topo do aterro à ponta). Taxa de aço da cortina: máx(calculada, ${prem.aco_estaca} kg/m³).`,
    'Sobreconsumo por camada: ' + trechos.map((t) => `${t.nome} ${t.metros.toFixed(1)} m (${(t.fator * 100).toFixed(0)}%)`).join('; ') + '.',
    'Não incluídos: escavação e reaterro, fretes, mobilização do equipamento, ensaios de prova de carga.',
  ]
  return { itens, notas }
}

// ---------------------------------------------------------------------------
// Solo reforçado (MSE)

export function quantMSE(p: ParamsMSE, r: ResultadoMSE, prem: Premissas): Quantitativo {
  const nCam = r.camadas.length
  const lPorCamada = r.L + prem.dobra_mse
  const itens: ItemQtd[] = [
    item('geogrelha', `${nCam} camadas × (L ${r.L.toFixed(1)} m + retorno ${prem.dobra_mse} m)`, nCam * lPorCamada, prem.perda_geo, 'inclui perda/emenda'),
    item('aterro', `H ${r.H.toFixed(1)} m × L ${r.L.toFixed(1)} m`, r.H * r.L),
    item('fachada', 'face do muro', r.H),
    item('escavacao', `embutimento ${p.embutimento} m × L`, p.embutimento * r.L),
  ]
  return { itens, notas: ['Não incluídos: drenagem, fundação em solo mole, blocos ou face especial, aterro de reposição da escavação.'] }
}

// ---------------------------------------------------------------------------
// Muros (concreto, gabião, grampeado): por seção e ao longo do alinhamento

export function quantSecaoConcreto(d: Partial<DimConcreto>, prem: Premissas, taxaAco?: number): Quantitativo {
  const H = d.H ?? 0
  const emb = d.embutimento ?? 0
  const base = d.base ?? 0
  const sapata = d.sapata ?? 0
  const hEst = H + emb
  const vol = base * sapata + (((d.parede_topo ?? 0) + (d.parede_base ?? 0)) / 2) * Math.max(hEst - sapata, 0)
  const taxa = taxaAco ?? prem.aco_muro
  return {
    itens: [
      item('concreto', `sapata ${base.toFixed(2)}×${sapata.toFixed(2)} + fuste ${(d.parede_topo ?? 0).toFixed(2)} a ${(d.parede_base ?? 0).toFixed(2)} m`, vol, prem.perda_concreto),
      item('aco', `${taxa} kg/m³`, vol * taxa),
      item('forma', 'fuste (2 faces) e bordas da sapata', 2 * Math.max(hEst - sapata, 0) + 2 * sapata),
      item('lastro', `esp. ${prem.lastro_esp} m`, base * prem.lastro_esp),
      item('escavacao', `base × (embutimento + sapata)`, base * (emb + sapata)),
    ],
    notas: [],
  }
}

export function quantSecaoGabiao(d: Partial<DimGabiao>, prem: Premissas): Quantitativo {
  const H = d.H ?? 0
  const emb = d.embutimento ?? 0
  const base = d.base ?? 0
  const topo = d.topo ?? base
  const alt = H + emb
  const nCam = Math.max(d.camadas ?? 1, 1)
  const hc = alt / nCam
  let tela = 0
  for (let i = 0; i < nCam; i++) {
    const w = nCam > 1 ? base - ((base - topo) * i) / (nCam - 1) : base
    tela += 2 * (w + hc) + w * hc // perímetro por 1 m + 1 diafragma por metro
  }
  return {
    itens: [
      item('pedra', `seção trapezoidal ${base.toFixed(1)} a ${topo.toFixed(1)} m`, ((base + topo) / 2) * alt),
      item('tela_gabiao', `${nCam} camadas (perímetro + 1 diafragma/m)`, tela, prem.traspasse, 'inclui amarração/traspasse'),
      item('geotextil', 'filtro no tardoz', alt, prem.traspasse),
      item('escavacao', 'base × embutimento', base * emb),
    ],
    notas: [],
  }
}

export function quantSecaoGrampeado(d: Partial<DimGrampeado>, prem: Premissas): Quantitativo {
  const H = d.H ?? 0
  const linhas = d.linhas_grampos ?? 0
  const porM = linhas / Math.max(d.espacamento_h ?? 1, 0.1) // grampos por metro linear
  const L = d.grampo ?? 0
  const perf = porM * L
  return {
    itens: [
      item('perf_grampo', `${porM.toFixed(2)} grampos/m × ${L.toFixed(1)} m`, perf),
      item('aco', `barras ${prem.barra_grampo} kg/m`, perf * prem.barra_grampo),
      item('calda', `furo Ø ${prem.furo_grampo} m`, perf * area(prem.furo_grampo), prem.sobre_calda, 'sobreconsumo da calda no maciço'),
      item('projetado', `face esp. ${(d.face ?? 0).toFixed(2)} m`, H * (d.face ?? 0), prem.rebote, 'inclui rebote'),
      item('tela_soldada', 'face', H, prem.traspasse, 'inclui traspasse'),
    ],
    notas: [],
  }
}

export interface QuantMuro {
  media: Quantitativo // por metro linear (ponderada pelo comprimento)
  comprimento: number // m (da primeira à última seção)
  total: Partial<Record<Cod, number>> // quantidade total no alinhamento
}

/**
 * Quantidades de um muro a partir das seções (dimensões adotadas). Integra por
 * trapézios ao longo da progressiva s; com uma só seção, vale por metro.
 */
export function quantMuro(
  tipo: MuroEntrada['tipo'],
  secoes: { s: number; dim: Partial<DimConcreto & DimGabiao & DimGrampeado> }[],
  prem: Premissas,
  taxaAco?: number
): QuantMuro | null {
  const ord = [...secoes].sort((a, b) => a.s - b.s)
  if (ord.length === 0) return null
  const porSecao = ord.map((x) =>
    tipo === 'concreto' ? quantSecaoConcreto(x.dim, prem, taxaAco) : tipo === 'gabiao' ? quantSecaoGabiao(x.dim, prem) : quantSecaoGrampeado(x.dim, prem)
  )
  const comprimento = ord[ord.length - 1].s - ord[0].s
  const k = porSecao[0].itens.length
  const itens: ItemQtd[] = []
  const total: Partial<Record<Cod, number>> = {}
  for (let j = 0; j < k; j++) {
    const base = porSecao[0].itens[j]
    let integral = 0
    let integralLiq = 0
    if (ord.length === 1 || comprimento <= 0) {
      integral = porSecao.reduce((a, q) => a + q.itens[j].qtd, 0) / porSecao.length
      integralLiq = porSecao.reduce((a, q) => a + q.itens[j].liquida, 0) / porSecao.length
    } else {
      for (let i = 0; i < ord.length - 1; i++) {
        const dl = ord[i + 1].s - ord[i].s
        integral += ((porSecao[i].itens[j].qtd + porSecao[i + 1].itens[j].qtd) / 2) * dl
        integralLiq += ((porSecao[i].itens[j].liquida + porSecao[i + 1].itens[j].liquida) / 2) * dl
      }
      integral /= comprimento
      integralLiq /= comprimento
    }
    itens.push({ ...base, liquida: integralLiq, qtd: integral, descricao: ord.length > 1 ? `média de ${ord.length} seções` : base.descricao })
    total[base.cod] = integral * (comprimento > 0 ? comprimento : 1)
  }
  const notas = [
    ord.length > 1
      ? `Média ponderada de ${ord.length} seções ao longo de ${comprimento.toFixed(1)} m de muro (integração por trapézios).`
      : 'Uma única seção: valores por metro linear.',
    'Não incluídos: drenagem, reaterro, fundação especial, fretes, mobilização.',
  ]
  return { media: { itens, notas }, comprimento, total }
}

// ---------------------------------------------------------------------------
// Custos

export interface LinhaCusto extends ItemQtd {
  preco: number | null
  custo: number | null
}

export interface CustoPorMetro {
  linhas: LinhaCusto[]
  total: number | null // soma dos itens com preço; null se nenhum tem preço
  completo: boolean // todos os itens têm preço
  faltam: Cod[]
}

export function custoPorMetro(q: Quantitativo, precos: Precos): CustoPorMetro {
  const linhas: LinhaCusto[] = q.itens.map((i) => {
    const p = precos[i.cod]
    const tem = p != null && Number.isFinite(p) && p > 0
    return { ...i, preco: tem ? p! : null, custo: tem ? p! * i.qtd : null }
  })
  const comPreco = linhas.filter((l) => l.custo != null)
  return {
    linhas,
    total: comPreco.length ? comPreco.reduce((a, l) => a + (l.custo as number), 0) : null,
    completo: comPreco.length === linhas.length,
    faltam: linhas.filter((l) => l.custo == null).map((l) => l.cod),
  }
}
