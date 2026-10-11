import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { DetalheSerial } from '../engine/muros/serial'
import type { ParametrosMuros, TipoMuro } from '../engine/muros/tipos'
import { svgToJpegDataUrl } from './exportPdf'

// Relatório em PDF de UM muro, para anexar ao memorial: identificação,
// critérios, desenho da seção crítica com a superfície de ruptura, FS de
// todas as seções, detalhamento das verificações do muro, sugestões e avisos.

export interface CabecalhoMuro {
  projeto: string
  plato: string
  responsavel: string
  fonteSolo: string
}

const TIPO_LABEL: Record<TipoMuro, string> = {
  concreto: 'Muro de flexão em concreto armado',
  gabiao: 'Muro de gabião',
  grampeado: 'Solo grampeado',
}

// fontes padrão do PDF (WinAnsi) não têm letras gregas nem alguns símbolos
function seguro(t: string): string {
  return t
    .replace(/φ/g, 'phi')
    .replace(/γ/g, 'gamma')
    .replace(/δ/g, 'delta')
    .replace(/β/g, 'beta')
    .replace(/σ/g, 'sigma')
    .replace(/Σ/g, 'Soma ')
    .replace(/λ/g, 'lambda')
    .replace(/α/g, 'alpha')
    .replace(/ρ/g, 'rho')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/→/g, '->')
    .replace(/−/g, '-')
    .replace(/′/g, "'")
}

const n = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? (v === Infinity ? '>99' : '—') : v.toFixed(d).replace('.', ',')

export async function exportarPdfMuro(
  det: DetalheSerial,
  cab: CabecalhoMuro,
  params: ParametrosMuros,
  svg: SVGSVGElement | null
): Promise<void> {
  const doc = await montarPdfMuro(det, cab, params, svg)
  doc.save(`${cab.plato}_${det.muro.id}_verificacao.pdf`)
}

/** Monta o documento (sem salvar) — separado para poder testar fora do navegador. */
export async function montarPdfMuro(
  det: DetalheSerial,
  cab: CabecalhoMuro,
  params: ParametrosMuros,
  svg: SVGSVGElement | null
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 14
  let y = M
  const muro = det.muro
  const gov = det.governante
  const fimTabela = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const titulo = (t: string) => {
    if (y > 260) {
      doc.addPage()
      y = M
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(seguro(t), M, y)
    y += 2
  }
  const tabela = (head: string[], body: (string | number)[][], opts: Record<string, unknown> = {}) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.4 },
      headStyles: { fillColor: [240, 102, 26] },
      head: [head.map(seguro)],
      body: body.map((r) => r.map((c) => seguro(String(c)))),
      ...opts,
    })
    y = fimTabela() + 7
  }

  // cabeçalho
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(seguro(`Verificação de muro — ${muro.id}`), M, y)
  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(seguro(`${TIPO_LABEL[muro.tipo]} · ${muro.condicao} · ${muro.posicao === 'pe' ? 'no pé' : 'na crista'} · junto ${muro.junto === 'divisa' ? 'à divisa' : 'ao platô'}`), M, y)
  doc.text(new Date().toLocaleDateString('pt-BR'), W - M, y, { align: 'right' })
  y += 5
  doc.text(seguro(`Projeto: ${cab.projeto || '—'} · Platô: ${cab.plato}`), M, y)
  y += 5
  doc.text(seguro(`Responsável técnico: ${cab.responsavel || '—'}`), M, y)
  y += 5
  doc.text(seguro(`Solo: ${cab.fonteSolo}`), M, y)
  y += 7

  const ok = det.saida.ok
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...((ok ? [22, 163, 74] : [220, 38, 38]) as [number, number, number]))
  doc.text(ok ? 'ATENDE a todos os critérios em todas as seções' : 'NÃO ATENDE — ver sugestões', M, y)
  doc.setTextColor(0, 0, 0)
  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(seguro(`Seção crítica: s = ${det.saida.secao_critica} (H = ${n(gov?.secao.H)} m) · ${muro.secoes.length} seções verificadas`), M, y)
  y += 6

  // desenho
  if (svg) {
    try {
      const { dataUrl, width, height } = await svgToJpegDataUrl(svg)
      const iw = W - 2 * M
      const ih = Math.min((iw * height) / width, 110)
      const iw2 = (ih * width) / height
      doc.addImage(dataUrl, 'JPEG', M + (iw - iw2) / 2, y, iw2, ih)
      y += ih + 3
      doc.setFontSize(7.5)
      doc.setTextColor(90, 90, 90)
      doc.text(
        seguro('Linha cheia: projeto · tracejada cinza: terreno natural · vermelho: superfície de ruptura crítica (Bishop) · verde tracejado: seção sugerida · verde cheio: trecho ancorado dos grampos'),
        M,
        y
      )
      doc.setTextColor(0, 0, 0)
      y += 6
    } catch {
      // segue sem a imagem
    }
  }

  // critérios
  titulo('Critérios e parâmetros')
  const crit: (string | number)[][] = [
    ['Estabilidade global', `Bishop Simplificado, ${params.n_fatias} fatias; círculos que envolvem o muro`, `FS ≥ ${n(params.fs_global_min)} (NBR 11682)`],
  ]
  if (muro.tipo !== 'grampeado') {
    crit.push(
      ['Empuxo ativo', params.metodo_empuxo === 'rankine' ? 'Rankine (β equivalente)' : `Coulomb por cunha de tentativa, δ = ${n(params.delta_coulomb_fator)}·φ'${params.coesao_no_empuxo ? ", com c'" : ''}`, `sobrecarga ${n(params.sobrecarga, 1)} kPa`],
      ['Tombamento', 'em torno da ponta', `FS ≥ ${n(params.fs_tombamento_min)}`],
      ['Deslizamento', `δb = ${n(params.atrito_base_fator)}·φ' fund.; adesão ${n(params.adesao_base_fator)}·c'; passivo ${params.considerar_passivo ? 'sim' : 'não'}`, `FS ≥ ${n(params.fs_deslizamento_min)}`],
      ['Tensão na base', 'sem tração (e ≤ B/6)', `σmáx ≤ ${n(params.tensao_admissivel, 0)} kPa`],
      ['Peso específico', muro.tipo === 'gabiao' ? 'gabião' : 'concreto', `${n(muro.tipo === 'gabiao' ? params.gama_gabiao : params.gama_concreto, 1)} kN/m³`]
    )
  } else {
    crit.push(
      ['Grampos no global', `T = mín(qs·Le; T_barra)/Sh, qs = ${n(params.qs_grampo, 1)} kN/m, T_barra = ${n(params.t_barra, 0)} kN`, '—'],
      ['Arrancamento', `T_max = λ·Ka·(γH + q)·Sh·Sv, λ = ${n(params.lambda_grampo)}`, `FS ≥ ${n(params.fs_arrancamento_min)}`]
    )
  }
  tabela(['Verificação', 'Método', 'Critério'], crit, { columnStyles: { 0: { cellWidth: 36 }, 2: { cellWidth: 40 } } })

  // FS por seção
  titulo('Fatores de segurança por seção')
  const cols = muro.tipo === 'grampeado' ? ['s', 'H (m)', 'FS global', 'FS arrancamento (mín.)', 'Situação'] : ['s', 'H (m)', 'FS global', 'FS tombamento', 'FS deslizamento', 'σmáx (kPa)', 'Situação']
  tabela(
    cols,
    det.avaliacoes.map((a) =>
      muro.tipo === 'grampeado'
        ? [a.secao.s, n(a.secao.H), n(a.fs.global, 3), n(a.fs.arrancamento, 2), a.ok ? 'ok' : 'não ok']
        : [a.secao.s, n(a.secao.H), n(a.fs.global, 3), n(a.fs.tombamento, 2), n(a.fs.deslizamento, 2), n(a.gravidade?.sigma_max, 0), a.ok ? 'ok' : 'não ok']
    )
  )

  // detalhamento da seção crítica
  if (gov?.gravidade) {
    const g = gov.gravidade
    titulo(`Muro — seção crítica s = ${gov.secao.s}`)
    tabela(
      ['Grandeza', 'Valor', 'Grandeza', 'Valor'],
      [
        ['Base B', `${n(g.B)} m`, 'Altura do plano virtual Hv', `${n(g.Hv)} m`],
        ["φ' / γ do maciço retido", `${n(g.phi, 1)}° / ${n(g.gama, 1)} kN/m³`, 'β equivalente', `${n(g.beta, 1)}°`],
        ['K (ativo)', n(g.K, 3), 'Inclinação do empuxo', `${n(g.inclinacaoEmpuxo, 1)}°`],
        ['Ea', `${n(g.Ea, 1)} kN/m`, 'Ea horizontal / vertical', `${n(g.Eh, 1)} / ${n(g.Ev, 1)} kN/m`],
        ['Ponto de aplicação', `${n(g.zE)} m acima da base`, 'Água no plano / subpressão', `${n(g.Uw, 1)} / ${n(g.U, 1)} kN/m`],
        ['Peso do corpo', `${n(g.W_corpo, 1)} kN/m`, 'Peso do solo sobre a base', `${n(g.W_solo, 1)} kN/m`],
        ['Σ V / Σ H', `${n(g.sumV, 1)} / ${n(g.sumH, 1)} kN/m`, 'M estab. / M instab.', `${n(g.M_estab, 1)} / ${n(g.M_instab, 1)} kN·m/m`],
        ['FS tombamento', n(g.fs_tombamento), 'FS deslizamento', n(g.fs_deslizamento)],
        ['Excentricidade e (B/6)', `${n(g.excentricidade, 3)} m (${n(g.B / 6, 3)})`, 'σmáx / σmín', `${n(g.sigma_max, 0)} / ${n(g.sigma_min, 0)} kPa`],
        ["Fundação φ' / c'", `${n(g.phi_fundacao, 1)}° / ${n(g.c_fundacao, 1)} kPa`, 'Passivo Ep', `${n(g.Ep, 1)} kN/m`],
      ]
    )
  }
  if (gov?.grampeado) {
    const g = gov.grampeado
    titulo(`Grampos — seção crítica s = ${gov.secao.s} (Ka = ${n(g.Ka, 3)}, β = ${n(g.beta, 1)}°, Sh = ${n(g.sh)} m, Sv = ${n(g.sv)} m)`)
    tabela(
      ['Linha', 'Cota cabeça', 'L (m)', 'Le (m)', 'T_max (kN)', 'R_p (kN)', 'FS arranc.', 'T_barra/T_max', 'Situação'],
      g.linhas.map((l) => [l.linha, n(l.zCabeca), n(l.L), n(l.Le), n(l.Tmax, 1), n(l.Rp, 1), n(l.fs_arrancamento), n(l.fs_barra), l.ok ? 'ok' : 'não ok'])
    )
  }

  // sugestões
  titulo('Inclinações testadas para o talude junto ao muro (seção crítica)')
  tabela(
    ['H:V', 'H muro (m)', 'Área de terra (m²/m)', 'FS global', muro.tipo === 'grampeado' ? 'FS arranc.' : 'FS tomb. / desl.', 'FS/FSmín', 'Ajuste de dimensões'],
    det.candidatos.map((c) => [
      `1:${n(c.r)}`,
      n(c.H),
      n(c.area, 1),
      n(c.fs.global, 3),
      muro.tipo === 'grampeado' ? n(c.fs.arrancamento) : `${n(c.fs.tombamento)} / ${n(c.fs.deslizamento)}`,
      n(c.razao),
      c.dimsAjustados ? Object.entries(c.dimsAjustados).map(([k, v]) => `${k} = ${v}`).join('; ') : '',
    ])
  )
  titulo('Sugestão para o ME-DYN-TALUDE')
  const sug = det.saida.sugestao
  const linhasSug: string[][] = []
  if (sug.talude_h_por_v != null) linhasSug.push(['talude_h_por_v', String(sug.talude_h_por_v)])
  for (const [tipo, campos] of Object.entries(sug.muros_tipos ?? {})) {
    for (const [k, v] of Object.entries(campos ?? {})) linhasSug.push([`muros_tipos.${tipo}.${k}`, String(v)])
  }
  if (linhasSug.length === 0) linhasSug.push(['—', 'sem sugestão (ver avisos)'])
  tabela(['Parâmetro', 'Valor'], linhasSug)
  if (det.sugerida) {
    const s = det.sugerida
    doc.setFontSize(8.5)
    doc.text(
      seguro(
        `Com a sugestão, na seção s = ${s.secao.s}: FS global = ${n(s.fs.global, 3)}` +
          (s.fs.tombamento != null ? ` · tombamento = ${n(s.fs.tombamento)} · deslizamento = ${n(s.fs.deslizamento)}` : '') +
          (s.fs.arrancamento != null ? ` · arrancamento = ${n(s.fs.arrancamento)}` : '') +
          ` · H = ${n(s.secao.H)} m`
      ),
      M,
      y
    )
    y += 7
  }

  // avisos
  if (det.saida.avisos.length) {
    titulo('Avisos')
    tabela(['#', 'Aviso'], det.saida.avisos.map((a, i) => [i + 1, a]), { columnStyles: { 0: { cellWidth: 8 } } })
  }

  return doc
}
