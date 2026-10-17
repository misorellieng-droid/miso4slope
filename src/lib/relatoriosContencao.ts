import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  alertasFaixa,
  circuloAtravessaFaixa,
  razaoAreas,
  type ColchaoGeogrelha,
  type FaixaColunas,
  type LinhaVarredura,
  type ResultadoFaixa,
} from '../engine/argilaMole/faixaColunas'
import { resolverApoio, type AnaliseCortina, type ParamsCortina } from '../engine/argilaMole/cortina'
import type { ParamsMSE, ResultadoMSE } from '../engine/argilaMole/soloReforcado'
import type { FillMaterial, Layer, SlopeGeometry } from '../engine/types'
import { svgToJpegDataUrl } from './exportPdf'

// Relatório em PDF dos pré-dimensionamentos de contenção (faixa de colunas,
// cortina de estacas, solo reforçado): dados do estudo, hipóteses, resultados,
// croqui com as dimensões, verificações e limites, sequência executiva.

export interface Aviso {
  nivel: 'aviso' | 'erro'
  texto: string
}

export interface RelatorioContencao {
  titulo: string
  subtitulo: string
  projeto: string
  responsavel: string
  conclusao: { ok: boolean; texto: string }
  entradas: { titulo: string; linhas: [string, string][] }[]
  resultados: { titulo: string; linhas: [string, string][] }[]
  tabelas: { titulo: string; cabecalho: string[]; linhas: string[][] }[]
  avisos: Aviso[]
  sequencia: string[]
  nomeArquivo: string
}

// as fontes padrão do PDF (WinAnsi) não têm letras gregas nem alguns símbolos
export function seguro(t: string): string {
  return t
    .replace(/φ/g, 'phi')
    .replace(/γ/g, 'gamma')
    .replace(/δ/g, 'delta')
    .replace(/σ/g, 'sigma')
    .replace(/τ/g, 'tau')
    .replace(/Ø/g, 'D')
    .replace(/Σ/g, 'Soma ')
    .replace(/λ/g, 'lambda')
    .replace(/α/g, 'alpha')
    .replace(/ρ/g, 'rho')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/→/g, '->')
    .replace(/∞/g, 'inf.')
    .replace(/≈/g, '~')
    .replace(/×/g, 'x')
    .replace(/−/g, '-')
    .replace(/′/g, "'")
    .replace(/●/g, '-')
}

const n = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? (v === Infinity ? '>99' : '—') : v.toFixed(d).replace('.', ',')

// ---------------------------------------------------------------------------
// Dados comuns do estudo (vêm da Nova Análise)

function dadosDoEstudo(geo: SlopeGeometry, layers: Layer[], fill: FillMaterial) {
  const entradas: RelatorioContencao['entradas'] = [
    {
      titulo: 'Geometria e carregamento',
      linhas: [
        ['Altura do aterro', `${n(geo.total_height)} m`],
        ['Fator do talude (H:V)', n(geo.slope_ratio, 1)],
        ['Sobrecarga na plataforma', `${n(geo.surcharge_q ?? 0, 0)} kPa`],
        ['Profundidade do N.A. abaixo do pé', `${n(geo.water_table_depth, 1)} m`],
        ['Condição de análise', geo.analysis_condition === 'undrained' ? 'Não drenada (fim de construção)' : 'Drenada (longo prazo)'],
      ],
    },
    {
      titulo: 'Material do aterro',
      linhas: [
        ["Coesão c'", `${n(fill.c, 0)} kPa`],
        ["Ângulo de atrito phi'", `${n(fill.phi, 0)} graus`],
        ['Peso específico', `${n(fill.gamma, 1)} kN/m3`],
      ],
    },
  ]
  const tabela = {
    titulo: 'Perfil de solo da fundação (Nova Análise)',
    cabecalho: ['Camada', 'Topo (m)', 'Base (m)', 'c / su (kPa)', 'phi (graus)', 'gamma (kN/m3)'],
    linhas: layers.map((l) => [
      l.name,
      n(l.y_top ?? 0, 1),
      n(l.y_base ?? NaN, 1),
      n(l.c, 0),
      n(l.phi ?? 0, 0),
      n(l.gamma, 1),
    ]),
  }
  return { entradas, tabela }
}

const SEQ_CORTINA = [
  'Preparo e instrumentação: locação, limpeza, piezômetros, placas de recalque e inclinômetros instalados antes de qualquer carga.',
  'Plataforma de trabalho: sobre solo mole, aterro de trabalho leve (geotêxtil + brita) para o equipamento de estacas.',
  'Estacas de reação primeiro (atrás da cortina) e depois as estacas da cortina, até a ficha dimensionada; camisa ou lama em argila mole; concretagem contínua e ensaio de integridade.',
  'Vigas de coroamento da cortina e de cabeça da estaca de reação, com as cabeças de ancoragem do tirante embutidas.',
  'Aterro até a cota do tirante, em camadas compactadas, com velocidade de alteamento controlada pela poropressão. Nessa fase as estacas trabalham em balanço: verificar a altura máxima antes de o tirante entrar.',
  'Tirantes em bainha livre, protegidos contra corrosão, ligados às duas vigas; pré-tensão pequena conforme o projeto.',
  'Painel de fechamento e dreno entre as estacas, em etapas junto com o aterro, com barbacãs e dreno geocomposto atrás.',
  'Aterro até a cota final (GC conforme projeto), compactação leve perto da cortina; sobrecarga e pavimento só quando o monitoramento permitir.',
  'Monitoramento contínuo: deslocamento da cortina, recalque, poropressão e carga nos tirantes, com critérios de parada definidos.',
]

const SEQ_MSE = [
  'Locação, remoção do solo orgânico e preparo da fundação; instrumentação se a fundação for compressível.',
  'Camada de regularização da base (brita ou concreto magro), com o embutimento de projeto.',
  'Montagem da face e primeira camada de geossintético, ancorada e esticada, sem rugas.',
  'Aterro por camadas compactadas (espessura compatível com Sv), do reforço para a face, sem tráfego direto sobre o geossintético.',
  'Compactação leve junto à face (faixa de ~1 m), controle de GC e de umidade a cada camada.',
  'Drenagem do maciço: dreno na base, barbacãs e dreno junto à face e atrás do bloco.',
  'Repetição das camadas até a cota final; reforços no comprimento e posição de projeto, conferidos por camada.',
  'Coroamento, pavimento e sobrecarga somente depois da verificação de recalque e deslocamento da face.',
]

const SEQ_FAIXA = [
  'Levantamento, locação e instrumentação (piezômetros e placas de recalque) antes de qualquer carga.',
  'Plataforma de trabalho para o equipamento de execução das colunas sobre solo mole.',
  'Execução das colunas na malha de projeto, até o embutimento na camada resistente, com controle de comprimento e consumo de material.',
  'Corte das cabeças e regularização; colchão de brita com a geogrelha, em camadas compactadas.',
  'Aterro em etapas, com velocidade controlada pela poropressão e pelo recalque medidos.',
  'Sobrecarga e pavimento somente após o monitoramento indicar estabilização dos recalques.',
]

// ---------------------------------------------------------------------------
// Relatório de cada solução

export function relatorioFaixa(args: {
  geo: SlopeGeometry
  layers: Layer[]
  fill: FillMaterial
  f: FaixaColunas
  colchao: ColchaoGeogrelha
  sem: ResultadoFaixa | null
  com: ResultadoFaixa
  varredura: LinhaVarredura[] | null
  projeto: string
  responsavel: string
}): RelatorioContencao {
  const { geo, layers, fill, f, colchao, sem, com, varredura } = args
  const { entradas, tabela } = dadosDoEstudo(geo, layers, fill)
  const m = razaoAreas(f)
  const x0 = f.xRef - f.frente
  const atravessa = circuloAtravessaFaixa(com.result, f)
  const ok = com.FS >= 1.5 && atravessa
  const avisos: Aviso[] = alertasFaixa(layers, f).map((a) => ({ nivel: a.nivel, texto: a.texto }))
  if (!atravessa) {
    avisos.unshift({
      nivel: 'erro',
      texto: `O círculo crítico (x de ${n(com.result.x_left, 1)} a ${n(com.result.x_right, 1)} m) não passa pela faixa (x de ${n(x0, 1)} a ${n(x0 + f.largura, 1)} m): malha e largura não alteram o FS. Posicione a faixa sob esse mecanismo.`,
    })
  }
  if (com.FS < 1.5) avisos.unshift({ nivel: 'erro', texto: `FS com a faixa (${n(com.FS, 3)}) abaixo do exigido (1,50).` })
  return {
    titulo: 'Pré-dimensionamento: faixa de colunas',
    subtitulo: `Colunas de ${f.tipo === 'cmc' ? 'CMC' : 'brita'} com colchão de brita${colchao.T > 0 ? ' e geogrelha' : ''}`,
    projeto: args.projeto,
    responsavel: args.responsavel,
    conclusao: {
      ok,
      texto: ok
        ? `ATENDE ao FS exigido: ${n(com.FS, 3)} com a faixa (sem tratamento: ${n(sem?.FS, 3)})`
        : `NÃO ATENDE: ${n(com.FS, 3)} com a faixa (sem tratamento: ${n(sem?.FS, 3)}); exigido 1,50`,
    },
    entradas: [
      ...entradas,
      {
        titulo: 'Faixa de colunas adotada',
        linhas: [
          ['Tipo', f.tipo === 'cmc' ? 'CMC (coluna modulada)' : 'Colunas de brita'],
          ['Posição', `x de ${n(x0, 1)} a ${n(x0 + f.largura, 1)} m (pé de referência em x = ${n(f.xRef, 1)} m)`],
          ['À frente do pé de referência', `${n(f.frente)} m`],
          ['Largura da faixa', `${n(f.largura)} m`],
          ['Comprimento das colunas', `${n(f.comprimento)} m`],
          ['Diâmetro', `${n(f.diametro)} m`],
          ['Malha', `${n(f.malha)} m (${f.arranjo})`],
          ['Razão de substituição m', `${n(m * 100, 1)} %`],
          ...(f.tipo === 'brita'
            ? ([
                ['phi da brita', `${n(f.phi_col, 0)} graus`],
                ['n (concentração de tensão)', n(f.n_stress, 1)],
              ] as [string, string][])
            : ([['Resistência ao cisalhamento do CMC', `${n(f.tau_col, 0)} kPa`]] as [string, string][])),
          ['Peso específico da coluna', `${n(f.gamma_col, 1)} kN/m3`],
        ],
      },
      {
        titulo: 'Colchão de brita e geogrelha',
        linhas: [
          ['Espessura do colchão (informativa)', `${n(colchao.espessura)} m`],
          ['Geogrelha', colchao.T > 0 ? `T = ${n(colchao.T, 0)} kN/m, até ${n(colchao.alem_crista ?? 10, 0)} m além da crista` : 'Sem geogrelha (T = 0)'],
        ],
      },
    ],
    resultados: [
      {
        titulo: 'Estabilidade global (Bishop, busca do círculo crítico)',
        linhas: [
          ['FS sem tratamento', n(sem?.FS, 3)],
          ['FS com a faixa', n(com.FS, 3)],
          ['Ganho', sem ? n(com.FS - sem.FS, 3) : '—'],
          ['FS exigido', '1,50 (NBR 11682)'],
          ['Círculo crítico', `xc ${n(com.result.circle.xc)}, yc ${n(com.result.circle.yc)}, R ${n(com.result.circle.R)} m`],
          ['Arco crítico', `x de ${n(com.result.x_left, 1)} a ${n(com.result.x_right, 1)} m`],
          ['O arco atravessa a faixa?', atravessa ? 'Sim' : 'Não'],
        ],
      },
    ],
    tabelas: [
      tabela,
      ...(varredura
        ? [
            {
              titulo: 'FS por largura da faixa e malha',
              cabecalho: ['Largura (m)', 'Malha (m)', 'm (%)', 'FS', 'Atende'],
              linhas: varredura.map((l) => [n(l.largura, 0), n(l.malha), n(l.m * 100, 1), n(l.FS, 3), l.atende ? 'sim' : 'não']),
            },
          ]
        : []),
    ],
    avisos,
    sequencia: SEQ_FAIXA,
    nomeArquivo: 'predim_faixa_colunas',
  }
}

export function relatorioCortina(args: {
  geo: SlopeGeometry
  layers: Layer[]
  fill: FillMaterial
  p: ParamsCortina
  res: AnaliseCortina
  projeto: string
  responsavel: string
}): RelatorioContencao {
  const { geo, layers, fill, p, res } = args
  const { entradas, tabela } = dadosDoEstudo(geo, layers, fill)
  const e = res.esforcos
  const f = res.forca
  const apoio = resolverApoio(layers, p)
  const erros = res.avisos.filter((a) => a.nivel === 'erro')
  const ficha = e.fichaNecessaria != null ? e.fichaNecessaria : p.ficha
  const ok = erros.length === 0
  return {
    titulo: 'Pré-dimensionamento: cortina de estacas atirantada',
    subtitulo: 'Cortina com tirante e estaca de reação, ficha na camada de apoio',
    projeto: args.projeto,
    responsavel: args.responsavel,
    conclusao: {
      ok,
      texto: ok
        ? `ATENDE às verificações (T = ${n(f.T, 0)} kN/m, FS global ${n(f.fsFinal, 2)})`
        : `NÃO ATENDE como informado: ${erros.length} verificação(ões) pendente(s); ficha necessária ≈ ${e.fichaNecessaria != null ? n(e.fichaNecessaria, 1) + ' m' : 'acima de 25 m'}`,
    },
    entradas: [
      ...entradas,
      {
        titulo: 'Cortina e tirante adotados',
        linhas: [
          ['Estacas', `Diâmetro ${n(p.diametro)} m, c/c ${n(p.espacamento)} m`],
          ['Cota do tirante', `${n(p.cotaTirante)} m`],
          ['Camada de apoio da ficha', `${apoio.nome} (topo em ${n(apoio.cotaTopo, 1)} m; c ${n(apoio.c, 0)} kPa, phi ${n(apoio.phi, 0)} graus)`],
          ['Ficha informada', `${n(p.ficha)} m`],
          ['Estaca de reação', `Diâmetro ${n(p.diametroReacao)} m, comprimento ${n(p.comprimentoReacao)} m, a ${n(p.distReacao, 0)} m da cortina`],
          ['Empuxo do aterro', p.empuxo === 'k0' ? 'Repouso (K0)' : 'Ativo (Ka)'],
          ['Aço', `fyk ${n(p.fyk, 0)} MPa`],
          ['FS global alvo', n(p.fsAlvo, 2)],
        ],
      },
    ],
    resultados: [
      {
        titulo: 'Estabilidade global com a cortina',
        linhas: [
          ['FS sem cortina', n(f.fs0, 2)],
          ['Força T necessária', `${n(f.T, 0)} kN/m`],
          ['Cota onde a ruptura cruza a cortina', f.yCruz != null ? `${n(f.yCruz, 1)} m` : '—'],
          ['FS com T', n(f.fsFinal, 2)],
        ],
      },
      {
        titulo: 'Esforços e verificações por estaca',
        linhas: [
          ['Força no tirante', `${n(e.Ftirante, 0)} kN/estaca (aço ≥ ${n(e.AtirNec, 1)} cm2)`],
          ['Momento máximo', `${n(e.Mmax, 0)} kN.m`],
          ['Cortante no engaste', `${n(e.Vengaste, 0)} kN`],
          ['Armadura longitudinal', `${n(e.AsNec, 0)} cm2 (${n(e.taxaAco * 100, 1)} %)`],
          ['FS da ficha informada', Number.isFinite(e.fsFicha) ? n(e.fsFicha, 2) : '>99'],
          ['Ficha necessária (FS ≥ 2)', e.fichaNecessaria != null ? `${n(e.fichaNecessaria, 1)} m` : 'acima de 25 m'],
          ['Ficha usada no croqui', `${n(ficha, 1)} m`],
          ['Estaca de reação: FS lateral', Number.isFinite(e.fsReacao) ? n(e.fsReacao, 2) : '>99'],
          ['Ponta da reação x ruptura', `${n(e.cotaPontaReacao, 1)} m / ${e.cotaRupturaReacao != null ? n(e.cotaRupturaReacao, 1) + ' m' : '—'}`],
        ],
      },
    ],
    tabelas: [
      {
        titulo: 'Cargas por estaca',
        cabecalho: ['Carga', 'kN por estaca', 'Cota (m)'],
        linhas: e.cargas.map((c) => [c.nome, n(c.valor, 0), n(c.cota, 1)]),
      },
      tabela,
    ],
    avisos: res.avisos,
    sequencia: SEQ_CORTINA,
    nomeArquivo: 'predim_cortina_estacas',
  }
}

export function relatorioMSE(args: {
  geo: SlopeGeometry
  layers: Layer[]
  fill: FillMaterial
  p: ParamsMSE
  res: ResultadoMSE
  projeto: string
  responsavel: string
}): RelatorioContencao {
  const { geo, layers, fill, p, res } = args
  const { entradas, tabela } = dadosDoEstudo(geo, layers, fill)
  const x = res.externa
  const erros = res.avisos.filter((a) => a.nivel === 'erro')
  const ok = erros.length === 0
  return {
    titulo: 'Pré-dimensionamento: solo reforçado com geossintético',
    subtitulo: 'Muro de face vertical sobre a fundação do estudo',
    projeto: args.projeto,
    responsavel: args.responsavel,
    conclusao: {
      ok,
      texto: ok
        ? `ATENDE às verificações (FS global ${n(res.fsGlobal, 2)})`
        : `NÃO ATENDE: ${erros.length} verificação(ões) pendente(s); FS global ${n(res.fsGlobal, 2)} (sem reforço ${n(res.fs0, 2)})`,
    },
    entradas: [
      ...entradas,
      {
        titulo: 'Reforço adotado',
        linhas: [
          ['Embutimento da base', `${n(p.embutimento)} m`],
          ['Comprimento L', `${n(res.L)} m${p.comprimento > 0 ? '' : ' (automático: 0,7 H, mínimo 2 m)'}`],
          ['Espaçamento vertical', `${n(res.Sv)} m (${res.camadas.length} camadas)`],
          ['Tult necessário / adotado', `${n(res.tultNecessario, 1)} / ${n(res.tultAdotado, 0)} kN/m`],
          ['Fatores de redução', `fluência ${n(p.rfCr)} · instalação ${n(p.rfId)} · durabilidade ${n(p.rfD)}`],
          ['T admissível', `${n(res.tadm, 1)} kN/m`],
          ['Coef. de interação Ci / eficiência da conexão', `${n(p.ci)} / ${n(p.efConexao)}`],
          ['FS global alvo', n(p.fsAlvoGlobal, 2)],
        ],
      },
    ],
    resultados: [
      {
        titulo: 'Estabilidade externa (bloco reforçado como muro de gravidade)',
        linhas: [
          ['Fundação (cota da base)', `${x.fundacao.nome} (c ${n(x.fundacao.c, 0)} kPa, phi ${n(x.fundacao.phi, 0)} graus)`],
          ['Empuxo horizontal', `${n(x.Pa, 1)} kN/m`],
          ['Tombamento', `FS ${n(x.fsTomb, 2)} (mínimo 2,0)`],
          ['Deslizamento na base', `FS ${n(x.fsDesl, 2)} (mínimo 1,5)`],
          ['Excentricidade / largura efetiva', `${n(x.e)} m / ${n(x.Bef)} m`],
          ['Capacidade de carga', `FS ${n(x.fsCap, 2)} (mínimo 3,0); tensão ${n(x.qmax, 0)} / ${n(x.qult, 0)} kPa`],
        ],
      },
      {
        titulo: 'Estabilidade global',
        linhas: [
          ['FS sem reforço', n(res.fs0, 2)],
          ['FS com reforço', n(res.fsGlobal, 2)],
          ['Arco crítico', `x de ${n(res.circulo.x_left, 1)} a ${n(res.circulo.x_right, 1)} m`],
        ],
      },
    ],
    tabelas: [
      {
        titulo: 'Estabilidade interna por camada de reforço',
        cabecalho: ['h (m)', 'sigma v (kPa)', 'Tmax (kN/m)', 'Le (m)', 'FS ruptura', 'FS arranc.', 'FS conexão'],
        linhas: [...res.camadas].reverse().map((c) => [n(c.h), n(c.sigmaV, 1), n(c.Tmax, 1), n(c.Le), n(c.fsRup), n(c.fsArranc), n(c.fsConexao)]),
      },
      tabela,
    ],
    avisos: res.avisos,
    sequencia: SEQ_MSE,
    nomeArquivo: 'predim_solo_reforcado',
  }
}

// ---------------------------------------------------------------------------
// Montagem do PDF

/** Monta o documento (sem salvar) — separado para poder testar fora do navegador. */
export async function montarPdfContencao(r: RelatorioContencao, svg: SVGSVGElement | null): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const Hp = doc.internal.pageSize.getHeight()
  const M = 14
  let y = M
  const fim = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  const novaPaginaSe = (altura: number) => {
    if (y + altura > Hp - M) {
      doc.addPage()
      y = M
    }
  }
  const titulo = (t: string) => {
    novaPaginaSe(18)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.text(seguro(t), M, y)
    y += 2
  }
  const tabela = (head: string[], body: string[][], opts: Record<string, unknown> = {}) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.4 },
      headStyles: { fillColor: [240, 102, 26] },
      head: [head.map(seguro)],
      body: body.map((l) => l.map((c) => seguro(String(c)))),
      ...opts,
    })
    y = fim() + 6
  }
  const paragrafo = (t: string, tam = 9, cor: [number, number, number] = [0, 0, 0]) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(tam)
    doc.setTextColor(...cor)
    const linhas = doc.splitTextToSize(seguro(t), W - 2 * M) as string[]
    novaPaginaSe(linhas.length * (tam * 0.45) + 2)
    doc.text(linhas, M, y)
    y += linhas.length * (tam * 0.45) + 2
    doc.setTextColor(0, 0, 0)
  }

  // cabeçalho
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(seguro(r.titulo), M, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(seguro(r.subtitulo), M, y)
  doc.text(new Date().toLocaleDateString('pt-BR'), W - M, y, { align: 'right' })
  y += 5
  doc.text(seguro(`Projeto: ${r.projeto || '—'}`), M, y)
  y += 5
  doc.text(seguro(`Responsável técnico: ${r.responsavel || '—'}`), M, y)
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...((r.conclusao.ok ? [22, 163, 74] : [220, 38, 38]) as [number, number, number]))
  const linhasConc = doc.splitTextToSize(seguro(r.conclusao.texto), W - 2 * M) as string[]
  doc.text(linhasConc, M, y)
  y += linhasConc.length * 5.5 + 1
  doc.setTextColor(0, 0, 0)
  paragrafo('Pré-dimensionamento preliminar, a partir de hipóteses de cálculo simplificadas. Não é projeto executivo e não substitui o dimensionamento estrutural, geotécnico e de recalque do projetista.', 8, [90, 90, 90])
  y += 2

  // dados de entrada
  titulo('Dados do estudo e hipóteses adotadas')
  y += 1
  for (const s of r.entradas) {
    novaPaginaSe(14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(seguro(s.titulo), M, y)
    y += 1.5
    tabela(['Parâmetro', 'Valor'], s.linhas.map(([a, b]) => [a, b]), { columnStyles: { 0: { cellWidth: 70 } } })
  }

  // resultados
  titulo('Resultados')
  y += 1
  for (const s of r.resultados) {
    novaPaginaSe(14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(seguro(s.titulo), M, y)
    y += 1.5
    tabela(['Item', 'Valor'], s.linhas.map(([a, b]) => [a, b]), { columnStyles: { 0: { cellWidth: 70 } } })
  }

  // croqui, em página própria
  if (svg) {
    try {
      const { dataUrl, width, height } = await svgToJpegDataUrl(svg)
      doc.addPage()
      y = M
      titulo('Croqui do pré-dimensionamento')
      y += 3
      const maxW = W - 2 * M
      const maxH = Hp - y - M - 8
      let iw = maxW
      let ih = (iw * height) / width
      if (ih > maxH) {
        ih = maxH
        iw = (ih * width) / height
      }
      doc.addImage(dataUrl, 'JPEG', M + (maxW - iw) / 2, y, iw, ih)
      y += ih + 3
      doc.setFontSize(7.5)
      doc.setTextColor(90, 90, 90)
      doc.text(seguro('Medidas em metros; cotas relativas ao terreno natural (0,00). Croqui gerado com os dados e resultados deste relatório.'), M, y)
      doc.setTextColor(0, 0, 0)
      y = Hp // o que vier depois começa em página nova
    } catch {
      paragrafo('(Não foi possível incluir o croqui neste relatório.)', 8, [150, 0, 0])
    }
  }

  // tabelas complementares
  for (const t of r.tabelas) {
    novaPaginaSe(30)
    titulo(t.titulo)
    tabela(t.cabecalho, t.linhas)
  }
  novaPaginaSe(40)

  // verificações e limites
  titulo('Verificações e limites')
  y += 2
  for (const a of r.avisos) {
    paragrafo(`${a.nivel === 'erro' ? '[NÃO ATENDE] ' : '- '}${a.texto.replace(/(\d)\.(\d)/g, '$1,$2')}`, 8.5, a.nivel === 'erro' ? [200, 30, 30] : [60, 60, 60])
  }
  y += 3

  titulo('Sequência executiva típica')
  y += 2
  r.sequencia.forEach((s, i) => paragrafo(`${i + 1}. ${s}`, 8.5))
  paragrafo('Sequência típica de referência. O detalhamento é do projetista e do executor.', 7.5, [90, 90, 90])

  // rodapé com numeração
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(120, 120, 120)
    doc.text(seguro(`${r.titulo} · página ${i} de ${total}`), W / 2, Hp - 6, { align: 'center' })
  }
  return doc
}

function nomeProjetoSalvo(): string {
  try {
    return localStorage.getItem('miso4slope.argila.projetoNome') ?? ''
  } catch {
    return ''
  }
}

function responsavelSalvo(): string {
  try {
    const raw = localStorage.getItem('miso4slope.muros.responsavel')
    return raw ? (JSON.parse(raw) as string) : ''
  } catch {
    return ''
  }
}

/** Pergunta o nome do projeto (lembrado), monta e baixa o PDF. */
export async function baixarRelatorioContencao(
  montar: (projeto: string, responsavel: string) => RelatorioContencao,
  svgId: string
): Promise<void> {
  const nome = window.prompt('Nome do projeto/obra para o relatório:', nomeProjetoSalvo())
  if (nome === null) return
  try {
    localStorage.setItem('miso4slope.argila.projetoNome', nome)
  } catch {
    // sem localStorage: segue sem lembrar
  }
  const r = montar(nome, responsavelSalvo())
  const svg = document.getElementById(svgId) as SVGSVGElement | null
  const doc = await montarPdfContencao(r, svg)
  doc.save(`${r.nomeArquivo}${nome ? '_' + nome.replace(/[^\w-]+/g, '_') : ''}.pdf`)
}
