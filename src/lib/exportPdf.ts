import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { SLICE_COLUMNS } from '../components/slope/SlicesTable'
import { FILL_COLOR, LAYER_COLORS, LAYER_FILL_OPACITY, ZONE_COLORS, type CanvasBounds } from '../components/slope/SlopeCanvas'
import { effectiveNaturalTerrain, groundY } from '../engine/geometry'
import type { PartialFS } from '../engine/fsDecomposition'
import { resolveFillZones } from '../engine/soil'
import type {
  AnalysisMode,
  AnalysisResult,
  CompactionReference,
  FaceCoverage,
  FillMaterial,
  FillZone,
  Layer,
  Point,
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
  partialFS: PartialFS | null
  svgElement: SVGSVGElement | null
  bounds: CanvasBounds | null
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

/** Topo/base de uma camada num x de referência — mesma lógica usada no desenho (SlopeCanvas), incl. sondagem_x. */
function layerBoundaryY(layer: Layer, x: number, terrain: Point[] | undefined): { top: number; base: number } {
  const g = terrain && terrain.length ? groundY(layer.sondagem_x ?? x, terrain) : 0
  return {
    top: layer.depth_top != null ? g - layer.depth_top : layer.y_top ?? g,
    base: layer.depth_base != null ? g - layer.depth_base : layer.y_base ?? g,
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Mistura uma cor com fundo branco numa opacidade dada — reproduz em RGB
 * sólido (PDF não tem canvas com transparência real por trás fácil de
 * controlar aqui) a mesma aparência pastel que a camada tem no croqui
 * (preenchida a LAYER_FILL_OPACITY sobre o fundo branco da página), pra a
 * cor da legenda bater com a cor da faixa, em vez de uma cor sólida vívida
 * sem relação com o que aparece no desenho.
 */
function blendWithWhite(hex: string, alpha: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  return [Math.round(r * alpha + 255 * (1 - alpha)), Math.round(g * alpha + 255 * (1 - alpha)), Math.round(b * alpha + 255 * (1 - alpha))]
}

/** Um item do painel lateral — camada de fundação, corpo do aterro, ou zona de compactação — já com o topo/base resolvidos em elevação absoluta. */
interface PanelItem {
  name: string
  c: number
  phi: number
  gamma: number
  top: number
  base: number
  color: string // mesma cor usada para esta camada/aterro no desenho — liga visualmente painel e figura
}

/**
 * Monta a lista de materiais do painel lateral, na ordem em que aparecem no
 * desenho de cima pra baixo: no aterro, primeiro as zonas de compactação
 * diferenciada (se houver, empilhadas a partir da crista) e o corpo do
 * aterro logo abaixo delas até o terreno natural; depois, em qualquer modo,
 * as camadas de fundação/corte. Sem isso o painel mostrava só a fundação —
 * o próprio material do aterro (a faixa hachurada, normalmente a maior do
 * desenho) nunca aparecia.
 *
 * Avaliado no pé (x=0) — mesma referência usada pelas etiquetas de limite de
 * camada no desenho (SlopeCanvas) — não em xMin do canvas (que fica fora do
 * trecho onde o talude de fato existe); com terreno natural inclinado, usar
 * xMin pegaria um valor sem relação com a elevação real da camada onde ela
 * aparece desenhada.
 */
function buildPanelItems(
  mode: AnalysisMode,
  layers: Layer[],
  fill: FillMaterial,
  fillZones: FillZone[],
  geometry: SlopeGeometry,
  terrain: Point[] | undefined
): PanelItem[] {
  const refX = 0
  const items: PanelItem[] = []

  if (mode === 'aterro') {
    const resolvedZones = fillZones.length ? resolveFillZones(fillZones, geometry.total_height) : []
    resolvedZones.forEach((z, i) => {
      items.push({
        name: z.name,
        c: z.c,
        phi: z.phi,
        gamma: z.gamma,
        top: z.y_top!,
        base: z.y_base!,
        color: ZONE_COLORS[i % ZONE_COLORS.length],
      })
    })
    const fillTop = resolvedZones.length ? resolvedZones[resolvedZones.length - 1].y_base! : geometry.total_height
    const fillBase = terrain && terrain.length ? groundY(refX, terrain) : 0
    items.push({
      name: 'Aterro (corpo)',
      c: fill.c,
      phi: fill.phi,
      gamma: fill.gamma,
      top: fillTop,
      base: fillBase,
      color: FILL_COLOR,
    })
  }

  layers.forEach((l, i) => {
    const { top, base } = layerBoundaryY(l, refX, terrain)
    items.push({ name: l.name, c: l.c, phi: l.phi, gamma: l.gamma, top, base, color: LAYER_COLORS[i % LAYER_COLORS.length] })
  })

  return items
}

interface LayerPanelAlign {
  bounds: CanvasBounds
  imgTop: number // mm, topo da imagem na página
  imgHeight: number // mm
}

/**
 * Painel lateral com um resumo de cada material (nome curto + c'/φ'/γ) — ao
 * lado do desenho. Nome do material, profundidade e limites já aparecem
 * diretamente na figura (junto de cada linha de limite de camada), então o
 * painel fica enxuto: só o essencial pra conferir os parâmetros numéricos,
 * com um retângulo colorido igual à cor da camada/aterro no desenho, pra
 * ligar visualmente painel e figura sem repetir texto.
 *
 * Quando `align` está disponível, cada linha é posicionada à altura (em mm)
 * correspondente à posição vertical real do item no desenho — não
 * simplesmente empilhada em sequência. Nunca sobrepõe a linha anterior: se
 * o alvo alinhado cair antes do fim da linha anterior, cai de volta no
 * empilhamento sequencial normal.
 */
function drawLayerPanel(doc: jsPDF, items: PanelItem[], x: number, y: number, width: number, title: string, align: LayerPanelAlign | null): number {
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text(title, x, y)

  let cy = y + 5.5
  const swatchSize = 3
  const textX = x + swatchSize + 1.5

  items.forEach((item, i) => {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    const nameLines: string[] = doc.splitTextToSize(pdfSafe(item.name), width - swatchSize - 1.5)
    const blockHeight = nameLines.length * 3.2 + 3.4 + 1.5

    let startY = cy
    if (align) {
      const midData = (item.top + item.base) / 2
      const frac = (align.bounds.yMax - midData) / (align.bounds.yMax - align.bounds.yMin)
      const targetCenter = align.imgTop + frac * align.imgHeight
      startY = Math.max(cy, targetCenter - blockHeight / 2)
    }

    doc.setFillColor(...blendWithWhite(item.color, LAYER_FILL_OPACITY))
    doc.setDrawColor(...hexToRgb(item.color))
    doc.setLineWidth(0.15)
    doc.rect(x, startY - swatchSize + 1, swatchSize, swatchSize, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text(nameLines, textX, startY)
    const ly = startY + nameLines.length * 3.2

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(`c'=${fmt(item.c)} kPa  phi'=${fmt(item.phi)}°  gamma=${fmt(item.gamma)} kN/m³`, textX, ly)

    cy = startY + blockHeight
    if (i < items.length - 1) {
      doc.setDrawColor(220, 220, 220)
      doc.line(x, cy - 1, x + width, cy - 1)
      cy += 1.5
    }
  })

  return cy
}

export async function exportReportToPdf(data: ReportData, fileName = 'miso4slope-relatorio.pdf'): Promise<void> {
  const { header, mode, method, geometry, layers, fill, fillZones, result, partialFS, svgElement, bounds } = data
  const terrain = effectiveNaturalTerrain(geometry, mode)

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
  y += 24

  if (partialFS && (partialFS.fsCoesao != null || partialFS.fsAtrito != null)) {
    doc.setFontSize(8.5)
    doc.setTextColor(90, 90, 90)
    doc.text(
      `FS isolado por parcela (recálculo independente para o mesmo círculo, não soma ao FS acima): ` +
        `só coesão = ${partialFS.fsCoesao != null ? partialFS.fsCoesao.toFixed(3) : '—'} · ` +
        `só atrito = ${partialFS.fsAtrito != null ? partialFS.fsAtrito.toFixed(3) : '—'}`,
      margin,
      y
    )
    doc.setTextColor(0, 0, 0)
    y += 8
  }

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
      const panelItems = buildPanelItems(mode, layers, fill, fillZones, geometry, terrain)
      const panelTitle = mode === 'corte' ? 'Camadas (corte)' : 'Materiais (aterro + fundação)'
      const panelAlign: LayerPanelAlign | null = bounds ? { bounds, imgTop: y, imgHeight } : null
      const panelBottom = drawLayerPanel(doc, panelItems, panelX, y + 4, panelWidth, panelTitle, panelAlign)
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
