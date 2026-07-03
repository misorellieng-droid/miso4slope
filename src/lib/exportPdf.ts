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
 * Serializa o SVG do desenho do talude (com viewBox mas sem width/height
 * intrínsecos no DOM, já que o layout usa CSS) para um PNG em memória, num
 * canvas offscreen — sem depender de html2canvas, já que o desenho já é um
 * SVG puro. O viewBox do desenho está em metros (dezenas, não milhares), então
 * rasterizar multiplicando essas dimensões por um fator pequeno resulta num
 * PNG minúsculo (ex.: 90×30px) esticado pra largura da página — daí o
 * borrão. A resolução do raster tem que ser fixada em pixels de saída
 * (independente da escala do desenho), com a altura derivada só pela razão
 * de aspecto do viewBox.
 */
async function svgToPngDataUrl(
  svg: SVGSVGElement,
  targetWidthPx = 2000
): Promise<{ dataUrl: string; width: number; height: number }> {
  const viewBox = svg.viewBox.baseVal
  const width = viewBox.width || svg.clientWidth
  const height = viewBox.height || svg.clientHeight

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.style.maxHeight = ''

  // o desenho usa var(--color-*) para cores (talude, arco crítico, N.A.,
  // hachuras) — essas variáveis só existem no documento principal. Um
  // clone serializado como SVG standalone (para virar imagem) não tem
  // acesso a elas, então qualquer stroke/fill baseado em var() vira
  // inválido e cai no valor inicial (stroke: none) — o traço some
  // silenciosamente. Resolve os valores atuais e grava no próprio clone
  // antes de serializar, para que os var() continuem resolvendo.
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

    return { dataUrl: canvas.toDataURL('image/png'), width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

const fmt = (n: number | undefined, digits = 2) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(digits))

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

  // imagem do talude
  if (svgElement) {
    try {
      const { dataUrl, width, height } = await svgToPngDataUrl(svgElement)
      const imgWidth = pageWidth - margin * 2
      const imgHeight = (imgWidth * height) / width
      if (y + imgHeight > 270) {
        doc.addPage()
        y = margin
      }
      doc.addImage(dataUrl, 'PNG', margin, y, imgWidth, imgHeight)
      y += imgHeight + 8
    } catch {
      // se a rasterização falhar por qualquer motivo, o relatório segue sem a imagem
    }
  }

  // dados de entrada — geometria
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

  doc.setFont('helvetica', 'bold')
  doc.text(mode === 'corte' ? 'Camadas de solo (material natural exposto pelo corte)' : 'Camadas de solo (fundação)', margin, y)
  y += 2
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5 },
    head: [['Camada', "c' (kPa)", "φ' (°)", 'γ (kN/m³)', 'Topo', 'Base']],
    body: layers.map((l) => [
      l.name,
      fmt(l.c),
      fmt(l.phi),
      fmt(l.gamma),
      l.depth_top != null ? `prof. ${fmt(l.depth_top)} m` : l.y_top != null ? `${fmt(l.y_top)} m` : '—',
      l.depth_base != null ? `prof. ${fmt(l.depth_base)} m` : l.y_base != null ? `${fmt(l.y_base)} m` : '—',
    ]),
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
      head: [["c' (kPa)", "φ' (°)", 'γ (kN/m³)']],
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
        head: [['Zona', 'Espessura (m)', 'GC (%)', "c' (kPa)", "φ' (°)", 'γ (kN/m³)']],
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
    head: [SLICE_COLUMNS.map((c) => c.label)],
    body: result.slices.map((s) =>
      SLICE_COLUMNS.map((c) => (c.key === 'index' ? String(s.index) : (s[c.key] as number).toFixed(c.digits ?? 3)))
    ),
  })

  doc.save(fileName)
}
