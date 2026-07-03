import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { SLICE_COLUMNS } from '../components/slope/SlicesTable'
import type {
  AnalysisMode,
  AnalysisResult,
  CompactionReference,
  FaceCoverage,
  FillMaterial,
  FillZone,
  Layer,
  SlopeGeometry,
  StabilityMethod,
} from '../engine/types'

export interface ReportHeader {
  projeto: string
  secao: string
  responsavel: string
}

export interface ReportData {
  header: ReportHeader
  mode: AnalysisMode
  method: StabilityMethod
  geometry: SlopeGeometry
  layers: Layer[]
  fill: FillMaterial
  coverage: FaceCoverage
  fillZones: FillZone[]
  fillReference: CompactionReference | null
  result: AnalysisResult
  svgElement: SVGSVGElement | null
}

const METHOD_LABELS: Record<StabilityMethod, string> = {
  bishop: 'Bishop Simplificado',
  fellenius: 'Fellenius (Método Comum das Fatias)',
}

/**
 * As fontes padrão do PDF (Helvetica etc.) só cobrem WinAnsiEncoding —
 * não têm glifos gregos. φ/γ/α saem corrompidos ou em branco sem embutir
 * uma fonte Unicode (o que infla bastante o arquivo). Mais simples e
 * confiável: escrever por extenso só nesses três símbolos — o resto do
 * alfabeto Latin-1 estendido (°, ³, á/ã/ç etc.) já é suportado nativamente.
 */
function pdfSafe(text: string): string {
  return text.replace(/φ/g, 'phi').replace(/γ/g, 'gamma').replace(/α/g, 'alpha')
}

const fmt = (n: number | undefined, digits = 2) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(digits))

/**
 * Serializa o SVG do desenho do talude para um JPEG em memória, num canvas
 * offscreen — sem depender de html2canvas, já que o desenho já é um SVG
 * puro. Duas pegadinhas resolvidas aqui:
 *
 * 1. O viewBox do desenho está em metros (dezenas, não milhares) — rasterizar
 *    multiplicando essas dimensões por um fator pequeno resulta num raster
 *    minúsculo esticado pra largura da página (daí o borrão). A resolução
 *    de saída é fixada em pixels, independente da escala do desenho.
 * 2. O desenho usa var(--color-*) para cores (talude, arco crítico, N.A.,
 *    hachuras) — variáveis que só existem no documento principal. Um clone
 *    serializado como SVG standalone não tem acesso a elas: qualquer
 *    stroke/fill baseado em var() vira inválido e cai no valor inicial
 *    (stroke: none), e o traço some silenciosamente. Os valores atuais são
 *    resolvidos e gravados no próprio clone antes de serializar.
 *
 * JPEG (não PNG) porque o raster tem muita borda anti-aliased (linhas
 * finas, texto) que infla bastante um PNG sem ganho visual real — em
 * qualidade alta o JPEG fica visualmente idêntico com uma fração do peso.
 */
async function svgToJpegDataUrl(
  svg: SVGSVGElement,
  targetWidthPx = 1400
): Promise<{ dataUrl: string; width: number; height: number }> {
  const viewBox = svg.viewBox.baseVal
  const width = viewBox.width || svg.clientWidth
  const height = viewBox.height || svg.clientHeight

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.style.maxHeight = ''

  const computed = getComputedStyle(svg)
  for (const name of [
    '--color-text-primary',
    '--color-text-secondary',
    '--color-accent-blue',
    '--color-accent-red',
    '--color-accent-green',
    '--color-accent-amber',
    '--color-border',
    '--color-bg-elevated',
    '--color-bg-surface',
    '--color-brand',
  ]) {
    const value = computed.getPropertyValue(name).trim()
    if (value) clone.style.setProperty(name, value)
  }

  const xml = new XMLSerializer().serializeToString(clone)
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })

    const canvasWidth = targetWidthPx
    const canvasHeight = Math.round((targetWidthPx * height) / width)

    const canvas = document.createElement('canvas')
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)
    ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight)

    return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Painel lateral com os dados de cada camada (nome, profundidade adotada no
 * limite superior/inferior, c'/φ'/γ) — ao lado do desenho, no estilo de uma
 * coluna de sondagem/perfil geotécnico. Texto puro (não autoTable) porque a
 * coluna é estreita (1/3 da página) e o layout vertical por camada
 * aproveita melhor o espaço do que uma tabela larga.
 */
function drawLayerPanel(doc: jsPDF, layers: Layer[], x: number, y: number, width: number, mode: AnalysisMode): number {
  let cy = y

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text(mode === 'corte' ? 'Camadas (corte)' : 'Camadas (fundação)', x, cy)
  cy += 5.5

  layers.forEach((l, i) => {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    const nameLines: string[] = doc.splitTextToSize(pdfSafe(l.name), width)
    doc.text(nameLines, x, cy)
    cy += nameLines.length * 3.2 + 0.8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    const top = l.depth_top != null ? `prof. ${fmt(l.depth_top)} m` : l.y_top != null ? `cota ${fmt(l.y_top)} m` : '—'
    const base = l.depth_base != null ? `prof. ${fmt(l.depth_base)} m` : l.y_base != null ? `cota ${fmt(l.y_base)} m` : '—'
    const lines = [`Limite sup.: ${top}`, `Limite inf.: ${base}`, `c' = ${fmt(l.c)} kPa`, `phi' = ${fmt(l.phi)}°`, `gamma = ${fmt(l.gamma)} kN/m³`]
    for (const line of lines) {
      doc.text(line, x, cy)
      cy += 3.4
    }
    cy += 1.5

    if (i < layers.length - 1) {
      doc.setDrawColor(220, 220, 220)
      doc.line(x, cy - 1, x + width, cy - 1)
      cy += 1.5
    }
  })

  return cy
}

export async function exportReportToPdf(data: ReportData, fileName = 'miso4slope-relatorio.pdf'): Promise<void> {
  const { header, mode, method, geometry, layers, fill, fillZones, result, svgElement } = data

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = margin

  // cabeçalho
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Relatório de Estabilidade de Talude', margin, y)
  y += 7

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Projeto: ${header.projeto || '—'}`, margin, y)
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - margin, y, { align: 'right' })
  y += 5
  doc.text(`Seção: ${header.secao || '—'}`, margin, y)
  y += 5
  doc.text(`Responsável técnico: ${header.responsavel || '—'}`, margin, y)
  y += 5
  doc.text(`Método: ${METHOD_LABELS[method]} · Modo: ${mode === 'corte' ? 'Corte' : 'Aterro'}`, margin, y)
  y += 8

  // resultado em destaque
  const fsColor: [number, number, number] = result.is_adequate ? [22, 163, 74] : [220, 38, 38]
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...fsColor)
  doc.text(`FS = ${result.FS.toFixed(3)}`, margin, y + 6)
  doc.setFontSize(10)
  doc.text(
    `${result.is_adequate ? 'ADEQUADO' : 'INADEQUADO'} (NBR 11682, FSmín = ${result.fs_min_nbr})`,
    margin,
    y + 12
  )
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `Círculo crítico: xc=${fmt(result.circle.xc)} m · yc=${fmt(result.circle.yc)} m · R=${fmt(result.circle.R)} m`,
    margin,
    y + 18
  )
  y += 26

  // imagem do talude (2/3 da largura) + dados das camadas ao lado (1/3)
  if (svgElement) {
    try {
      const { dataUrl, width, height } = await svgToJpegDataUrl(svgElement)
      const gutter = 4
      const imgWidth = (pageWidth - margin * 2) * (2 / 3)
      const imgHeight = (imgWidth * height) / width
      const panelX = margin + imgWidth + gutter
      const panelWidth = pageWidth - margin - panelX

      if (y + imgHeight > 270) {
        doc.addPage()
        y = margin
      }

      doc.addImage(dataUrl, 'JPEG', margin, y, imgWidth, imgHeight)
      const panelBottom = drawLayerPanel(doc, layers, panelX, y + 4, panelWidth, mode)
      y = Math.max(y + imgHeight, panelBottom) + 8
    } catch {
      // se a rasterização falhar por qualquer motivo, o relatório segue sem a imagem
    }
  }

  // dados de entrada — geometria (camadas já aparecem no painel ao lado da imagem)
  doc.addPage()
  y = margin
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Dados de entrada', margin, y)
  y += 7

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Geometria', margin, y)
  y += 2
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5 },
    head: [['Parâmetro', 'Valor']],
    body: [
      ['Altura total', `${fmt(geometry.total_height)} m`],
      ['Altura por bancada', `${fmt(geometry.bench_height)} m`],
      ['Fator do talude (H:V)', fmt(geometry.slope_ratio)],
      ['Largura da berma', `${fmt(geometry.berm_width)} m`],
      ['Profundidade do N.A.', `${fmt(geometry.water_table_depth)} m`],
      ['Peso específico da água', `${fmt(geometry.gamma_water ?? 9.81)} kN/m³`],
      ['Cota do pé (opcional)', geometry.toe_elevation != null ? `${fmt(geometry.toe_elevation)} m` : '—'],
      ['Número de fatias', String(result.slices.length)],
    ],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8

  if (mode === 'aterro') {
    doc.setFont('helvetica', 'bold')
    doc.text('Material de aterro', margin, y)
    y += 2
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.5 },
      head: [["c' (kPa)", "phi' (°)", 'gamma (kN/m³)']],
      body: [[fmt(fill.c), fmt(fill.phi), fmt(fill.gamma)]],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8

    if (fillZones.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.text('Zonas de compactação diferenciada', margin, y)
      y += 2
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.5 },
        head: [['Zona', 'Espessura (m)', 'GC (%)', "c' (kPa)", "phi' (°)", 'gamma (kN/m³)']],
        body: fillZones.map((z) => [z.name, fmt(z.thickness), fmt(z.compaction_degree), fmt(z.c), fmt(z.phi), fmt(z.gamma)]),
      })
    }
  }

  // tabela de fatias
  doc.addPage()
  y = margin
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(`Tabela de Fatias (${result.slices.length})`, margin, y)
  y += 6

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 1 },
    headStyles: { fillColor: [240, 102, 26] },
    head: [SLICE_COLUMNS.map((c) => pdfSafe(c.label))],
    body: result.slices.map((s) =>
      SLICE_COLUMNS.map((c) => (c.key === 'index' ? String(s.index) : (s[c.key] as number).toFixed(c.digits ?? 3)))
    ),
  })

  doc.save(fileName)
}
