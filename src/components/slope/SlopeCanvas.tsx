import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { buildProfile, effectiveNaturalTerrain, groundY, type Point } from '../../engine/geometry'
import type { AnalysisMode, AnalysisResult, Layer, SlopeGeometry } from '../../engine/types'

interface SlopeCanvasProps {
  geometry: SlopeGeometry
  layers: Layer[]
  result: AnalysisResult | null
  mode?: AnalysisMode
  showSlices?: boolean
  showGrid?: boolean
  highlightLayer?: number
}

export interface CanvasBounds {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface SlopeCanvasHandle {
  svg: SVGSVGElement | null
  bounds: CanvasBounds
}

const MARGIN_X = 10
const MARGIN_X_WITH_LABELS = 16 // espaço extra à esquerda pra caber a cota de cada limite de camada
const MARGIN_Y = 6
// exportadas para o painel do relatório PDF usar exatamente as mesmas cores (e opacidade) do desenho
export const LAYER_COLORS = ['#3498DB', '#9B59B6', '#1ABC9C', '#F39C12', '#95A5A6', '#E67E22']
export const FILL_COLOR = '#D4AC0D' // corpo do aterro — fora da paleta de LAYER_COLORS, pra nunca coincidir com uma camada
export const ZONE_COLORS = ['#B7950B', '#9A7D0A', '#7D6608'] // zonas de compactação — tons da mesma família do aterro
export const LAYER_FILL_OPACITY = 0.12 // opacidade do preenchimento de cada camada no croqui — a legenda usa a mesma, pra bater visualmente
const LAYER_SAMPLES = 40
const BOUNDARY_LABEL_MIN_GAP = 3.2 // espaçamento vertical mínimo entre rótulos de limite de camada, pra não sobrepor
// limite dentro do qual um limite de camada é considerado "já coberto" pela cota de
// bancada mais próxima e não ganha um rótulo separado — sem isso, um limite bem perto
// de uma bancada (comum perto do pé/crista) cria um rótulo redundante que, ao ser
// empurrado pelo anti-colisão, arrasta em cascata todos os rótulos abaixo dele
const BOUNDARY_LABEL_BENCH_TOL = 1.2

/**
 * Cor de um trecho de material dentro de uma fatia (materialSegments),
 * combinando com a cor usada para a mesma camada no polígono geral do
 * desenho — assim o usuário associa visualmente a cor na fatia com a cor
 * da camada/aterro que ela representa.
 */
function colorForSegment(key: string): string {
  if (key === 'fill') return FILL_COLOR
  if (key.startsWith('zone:')) {
    const idx = Number.parseInt(key.slice(5), 10)
    return ZONE_COLORS[idx % ZONE_COLORS.length]
  }
  if (key.startsWith('layer:')) {
    const idx = Number.parseInt(key.slice(6), 10)
    return LAYER_COLORS[idx % LAYER_COLORS.length]
  }
  return '#95A5A6'
}

function fsColor(fs: number): string {
  if (fs >= 1.5) return 'var(--color-accent-green)'
  if (fs >= 1.3) return 'var(--color-accent-amber)'
  return 'var(--color-accent-red)'
}

/**
 * Contorno de uma camada de fundação entre xMin/xMax. Camadas com
 * depth_top/depth_base acompanham a superfície do terreno local (ondulam
 * com ela) — a menos que a camada tenha um sondagem_x fixo, caso em que o
 * terreno é medido sempre nesse x (a camada vira uma faixa reta na
 * elevação real do furo, não uma que ondula pelo perfil todo). Camadas com
 * y_top/y_base absolutos formam uma faixa horizontal reta, como sempre.
 */
function layerOutline(
  layer: Layer,
  xMin: number,
  xMax: number,
  terrain: Point[] | undefined
): Point[] {
  const xs = Array.from({ length: LAYER_SAMPLES }, (_, i) => xMin + ((xMax - xMin) * i) / (LAYER_SAMPLES - 1))
  const groundAt = (x: number) => (terrain && terrain.length ? groundY(layer.sondagem_x ?? x, terrain) : 0)

  const top = xs.map((x) => {
    const g = groundAt(x)
    return { x, y: layer.depth_top != null ? g - layer.depth_top : layer.y_top ?? g }
  })
  const base = xs.map((x) => {
    const g = groundAt(x)
    return { x, y: layer.depth_base != null ? g - layer.depth_base : layer.y_base ?? g }
  })

  return [...top, ...base.reverse()]
}

/**
 * Topo/base de uma camada num x de referência — usado para rotular a
 * profundidade adotada em cada limite de camada (mesma lógica de
 * layerOutline, mas só para um ponto, não o polígono inteiro). Respeita
 * sondagem_x pelo mesmo motivo.
 */
function layerBoundaryY(layer: Layer, x: number, terrain: Point[] | undefined): { top: number; base: number } {
  const g = terrain && terrain.length ? groundY(layer.sondagem_x ?? x, terrain) : 0
  return {
    top: layer.depth_top != null ? g - layer.depth_top : layer.y_top ?? g,
    base: layer.depth_base != null ? g - layer.depth_base : layer.y_base ?? g,
  }
}

export const SlopeCanvas = forwardRef<SlopeCanvasHandle, SlopeCanvasProps>(function SlopeCanvas(
  { geometry, layers, result, mode = 'aterro', showSlices = true, showGrid = true, highlightLayer },
  handleRef
) {
  const svgElRef = useRef<SVGSVGElement>(null)
  const profile = useMemo(() => buildProfile(geometry, mode), [geometry, mode])
  const refTerrain = useMemo(() => effectiveNaturalTerrain(geometry, mode), [geometry, mode])

  // o pé é sempre exatamente x=0 por construção (buildProfile), único ponto nessa posição —
  // não presumir um índice fixo (ex.: 1): o trecho de aproximação antes do pé pode ter mais de
  // um ponto quando o terreno natural informado tem vários pontos com x<=0, e um índice fixo
  // nesse caso cortava a linha grossa do talude num ponto que não é o pé real (parte do
  // terreno natural inclinado entrava como se fosse a face do talude — o efeito de "canaleta em V")
  const toeIndex = Math.max(1, profile.findIndex((p) => p.x === 0))
  const crestIndex = profile.length - 2 // último ponto antes do trecho plano da plataforma

  const waterY = -geometry.water_table_depth

  const bounds = useMemo(() => {
    let xMin = profile[toeIndex].x
    let xMax = profile[crestIndex].x
    const layerBottom = layers.length
      ? Math.min(
          ...layers.map((l) => Math.min(...layerOutline(l, xMin, xMax, refTerrain).map((p) => p.y)))
        )
      : -5
    let yMin = Math.min(0, layerBottom, waterY)
    let yMax = profile[crestIndex].y

    if (result) {
      xMin = Math.min(xMin, result.x_left, result.circle.xc - result.circle.R * 0.05)
      xMax = Math.max(xMax, result.x_right)
      yMax = Math.max(yMax, result.circle.yc)
    }

    const marginLeft = layers.length > 0 ? MARGIN_X_WITH_LABELS : MARGIN_X

    return {
      xMin: xMin - marginLeft,
      xMax: xMax + MARGIN_X,
      yMin: yMin - MARGIN_Y,
      yMax: yMax + MARGIN_Y,
    }
  }, [profile, layers, waterY, result, toeIndex, crestIndex, refTerrain])

  const { xMin, xMax, yMin, yMax } = bounds
  const width = xMax - xMin
  const height = yMax - yMin

  useImperativeHandle(handleRef, () => ({ svg: svgElRef.current, bounds }), [bounds])

  const toPath = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(' ')

  /**
   * Rótulo de cada limite de camada — só a cota (o nome do material vive na
   * legenda ao lado, colorida na mesma cor, pra não duplicar informação e
   * poluir o croqui). Dois cuidados:
   *
   * 1. Quando o limite de uma camada coincide com o de outra (a base de uma
   *    é o topo da seguinte), os dois são agrupados no mesmo rótulo em vez
   *    de gerar dois rótulos sobrepostos no mesmo ponto.
   * 2. Rótulos vizinhos demais (comum com camadas finas ou terreno natural
   *    inclinado) são empurrados verticalmente pra não se sobrepor — uma
   *    linha guia tracejada liga o rótulo deslocado até a altura real do
   *    limite que ele descreve.
   */
  const layerBoundaryLabels = useMemo(() => {
    const EPS = 1e-3
    // cotas de bancada já rotuladas pelo bloco "cotas" (ex.: o pé, y=0)
    const benchYs = profile.slice(toeIndex, crestIndex + 1).map((p) => p.y)

    // avaliado no pé (x=0), não em xMin (que agora é bem à esquerda, fora do
    // trecho onde o talude de fato existe) — com terreno natural inclinado,
    // usar xMin pegaria o valor no limite do perfil informado (ou além dele,
    // sujeito ao clamp de groundY), que pode não ter nada a ver com a
    // elevação real da camada onde ela aparece desenhada
    const groups: { y: number; colorIndex: number }[] = []
    layers.forEach((layer, layerIndex) => {
      const { top, base } = layerBoundaryY(layer, 0, refTerrain)
      for (const y of [top, base]) {
        if (!Number.isFinite(y) || benchYs.some((b) => Math.abs(b - y) < BOUNDARY_LABEL_BENCH_TOL)) continue
        const existing = groups.find((g) => Math.abs(g.y - y) < EPS)
        if (!existing) groups.push({ y, colorIndex: layerIndex })
      }
    })

    // as cotas de bancada (rotuladas por um bloco separado, presas à altura
    // do próprio terreno) entram nessa mesma passada de anti-colisão como
    // obstáculos fixos — sem isso, um limite de camada bem perto de uma
    // bancada (comum perto do pé/crista) acaba com o texto colado nela.
    //
    // processa em sequências de rótulos móveis entre dois obstáculos fixos
    // (ou os limites do desenho, se não houver). dentro de cada sequência,
    // tenta primeiro só empurrar pra baixo o mínimo necessário (mantém a
    // posição real sempre que possível); se mesmo assim não couber entre os
    // dois obstáculos fixos com o espaçamento mínimo, distribui os rótulos
    // uniformemente no espaço disponível — evita o rótulo colidir com uma
    // bancada fixa mais abaixo que um empurrão só-pra-baixo não enxergaria.
    type Group = (typeof groups)[number]
    const entries: { y: number; group?: Group }[] = [
      ...groups.map((g) => ({ y: g.y, group: g })),
      ...benchYs.map((y) => ({ y })),
    ]
    entries.sort((a, b) => b.y - a.y)

    const placed = new Array<number>(entries.length)
    let idx = 0
    while (idx < entries.length) {
      if (!entries[idx].group) {
        placed[idx] = entries[idx].y
        idx++
        continue
      }
      const start = idx
      while (idx < entries.length && entries[idx].group) idx++
      const end = idx
      const trueYs = entries.slice(start, end).map((e) => e.y)
      const n = trueYs.length
      const upperBound = start > 0 ? placed[start - 1] : Infinity

      const greedy: number[] = []
      let prev = upperBound
      for (const y of trueYs) {
        const p = Math.min(y, prev - BOUNDARY_LABEL_MIN_GAP)
        greedy.push(p)
        prev = p
      }

      const lowerBound = end < entries.length ? entries[end].y : -Infinity
      if (!Number.isFinite(lowerBound) || greedy[n - 1] >= lowerBound + BOUNDARY_LABEL_MIN_GAP) {
        for (let k = 0; k < n; k++) placed[start + k] = greedy[k]
      } else {
        const top = Number.isFinite(upperBound) ? upperBound : greedy[0] + BOUNDARY_LABEL_MIN_GAP
        const step = (top - lowerBound) / (n + 1)
        for (let k = 0; k < n; k++) placed[start + k] = top - step * (k + 1)
      }
    }

    const toeElevation = geometry.toe_elevation ?? 0
    const placedByGroup = new Map<Group, number>()
    entries.forEach((e, i) => {
      if (e.group) placedByGroup.set(e.group, placed[i])
    })

    return groups
      .slice()
      .sort((a, b) => b.y - a.y)
      .map((g) => ({
        trueY: g.y,
        placedY: placedByGroup.get(g)!,
        text: `${(g.y + toeElevation).toFixed(2)}m`,
        color: LAYER_COLORS[g.colorIndex % LAYER_COLORS.length],
      }))
  }, [layers, refTerrain, profile, toeIndex, crestIndex, geometry.toe_elevation])

  const arcPoints: Point[] = useMemo(() => {
    if (!result) return []
    const { xc, yc, R } = result.circle
    const n = 80
    const pts: Point[] = []
    for (let i = 0; i <= n; i++) {
      const x = result.x_left + ((result.x_right - result.x_left) * i) / n
      const inside = R * R - (x - xc) ** 2
      if (inside < 0) continue
      pts.push({ x, y: yc - Math.sqrt(inside) })
    }
    return pts
  }, [result])

  const aterroPolygon = useMemo(() => {
    const rise = profile.slice(toeIndex, crestIndex + 1)
    return [...rise, { x: rise[rise.length - 1].x, y: 0 }]
  }, [profile, toeIndex, crestIndex])

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-border bg-surface">
      <svg
        ref={svgElRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-auto w-full"
        style={{ maxHeight: 520 }}
      >
        <g transform={`translate(${-xMin} ${yMax}) scale(1,-1)`}>
          {/* fundação: camadas — acompanham o terreno natural quando definidas por profundidade */}
          {layers.map((layer, i) => (
            <polygon
              key={layer.id ?? i}
              points={toPath(layerOutline(layer, xMin, xMax, refTerrain))}
              fill={LAYER_COLORS[i % LAYER_COLORS.length]}
              opacity={highlightLayer === i ? 0.35 : LAYER_FILL_OPACITY}
              stroke={highlightLayer === i ? LAYER_COLORS[i % LAYER_COLORS.length] : 'none'}
              strokeWidth={0.15}
            />
          ))}

          {/* hachura do aterro — só faz sentido quando há material importado; no
              corte a face exposta já é mostrada pelas cores das próprias camadas */}
          {mode === 'aterro' && (
            <>
              <clipPath id="aterro-clip">
                <polygon points={toPath(aterroPolygon)} />
              </clipPath>
              <g clipPath="url(#aterro-clip)" opacity={0.5}>
                {Array.from({ length: Math.ceil((width + height) / 2) }).map((_, i) => {
                  const x0 = xMin - height + i * 2
                  return (
                    <line
                      key={i}
                      x1={x0}
                      y1={yMin}
                      x2={x0 + height}
                      y2={yMax}
                      stroke="var(--color-text-secondary)"
                      strokeWidth={0.15}
                    />
                  )
                })}
              </g>
            </>
          )}

          {/* terreno natural */}
          <polyline
            points={toPath(profile.slice(0, toeIndex + 1))}
            fill="none"
            stroke="var(--color-text-secondary)"
            strokeWidth={0.25}
          />

          {/* face do talude + bermas */}
          <polyline
            points={toPath(profile.slice(toeIndex, crestIndex + 1))}
            fill="none"
            stroke="var(--color-text-primary)"
            strokeWidth={0.4}
            strokeLinejoin="round"
          />

          {/* plataforma */}
          <polyline
            points={toPath(profile.slice(crestIndex))}
            fill="none"
            stroke="var(--color-text-secondary)"
            strokeWidth={0.25}
          />

          {/* terreno natural original por baixo do aterro (auditoria: onde o solo realmente estava) —
              só faz sentido no aterro (solo novo construído por cima do terreno original); no corte o
              terreno de referência já aparece pelo contorno das próprias camadas de fundação, e essa
              mesma linha, cruzando o talude e a plataforma numa inclinação diferente da face de corte,
              é o que parecia uma "canaleta em V" sem relação clara com o desenho */}
          {mode === 'aterro' && geometry.natural_terrain && geometry.natural_terrain.length > 0 && (
            <polyline
              points={toPath(
                Array.from({ length: LAYER_SAMPLES }, (_, i) => {
                  const x = xMin + ((xMax - xMin) * i) / (LAYER_SAMPLES - 1)
                  return { x, y: groundY(x, geometry.natural_terrain!) }
                })
              )}
              fill="none"
              stroke="var(--color-text-secondary)"
              strokeWidth={0.15}
              strokeDasharray="0.6 0.6"
            />
          )}

          {/* fatias — cada uma dividida pelos materiais que realmente atravessa
              (materialSegments), coloridas igual à camada/aterro correspondente
              no desenho geral, pra correlacionar visualmente com a coluna c'/φ'/γ
              de cada trecho na Tabela de Fatias */}
          {showSlices &&
            result &&
            result.slices.map((s) => {
              const segRects: { top: number; base: number; key: string }[] = []
              let cursorY = s.y_top
              for (const seg of s.materialSegments ?? []) {
                const base = cursorY - seg.height
                segRects.push({ top: cursorY, base, key: seg.key })
                cursorY = base
              }
              return (
                <g key={s.index}>
                  {segRects.map((r, i) => (
                    <rect
                      key={i}
                      x={s.xm - s.b / 2}
                      y={r.base}
                      width={s.b}
                      height={r.top - r.base}
                      fill={colorForSegment(r.key)}
                      opacity={0.45}
                    />
                  ))}
                  {/* faixa vertical da lamela — limite esquerdo/direito bem marcado,
                      pra deixar claro onde cada fatia da tabela está posicionada */}
                  <rect
                    x={s.xm - s.b / 2}
                    y={s.y_base}
                    width={s.b}
                    height={s.h}
                    fill="none"
                    stroke="var(--color-text-primary)"
                    strokeOpacity={0.55}
                    strokeWidth={0.12}
                  />
                </g>
              )
            })}

          {/* nível d'água */}
          <line
            x1={xMin}
            y1={waterY}
            x2={xMax}
            y2={waterY}
            stroke="var(--color-accent-blue)"
            strokeWidth={0.2}
            strokeDasharray="1.2 0.8"
          />

          {/* círculo crítico */}
          {result && (
            <>
              <polyline
                points={toPath(arcPoints)}
                fill="none"
                stroke="var(--color-accent-red)"
                strokeWidth={0.25}
                strokeDasharray="1 0.8"
              />
              <line
                x1={result.circle.xc}
                y1={result.circle.yc}
                x2={0}
                y2={0}
                stroke="var(--color-accent-red)"
                strokeWidth={0.1}
                strokeDasharray="0.5 0.5"
                opacity={0.6}
              />
              <g stroke="var(--color-accent-red)" strokeWidth={0.2}>
                <line
                  x1={result.circle.xc - 1}
                  y1={result.circle.yc}
                  x2={result.circle.xc + 1}
                  y2={result.circle.yc}
                />
                <line
                  x1={result.circle.xc}
                  y1={result.circle.yc - 1}
                  x2={result.circle.xc}
                  y2={result.circle.yc + 1}
                />
              </g>
            </>
          )}

        </g>

        {/* cotas — em coordenadas de tela (fora do grupo espelhado, texto não fica invertido).
            só rotula a primeira ocorrência de cada elevação (bancada), pulando o ponto
            gêmeo da berma que fica na mesma cota, para não sobrepor os rótulos. Quando a
            cota do pé/plataforma é informada, os rótulos passam a mostrar a cota real do
            projeto (pé + y) em vez da elevação relativa ao pé (y=0). */}
        {showGrid && (
          <g fontSize={2.4} fill="var(--color-text-secondary)" fontFamily="'JetBrains Mono', monospace">
            {profile
              .slice(toeIndex, crestIndex + 1)
              .filter((p, i, arr) => i === 0 || p.y !== arr[i - 1].y)
              .map((p, i) => (
                <text key={i} x={p.x - xMin + 0.5} y={yMax - p.y - 0.5}>
                  {(p.y + (geometry.toe_elevation ?? 0)).toFixed(2)}m
                </text>
              ))}
          </g>
        )}

        {/* cota de cada limite de camada — no canto esquerdo, como uma régua de
            perfil (mesma referência que layerOutline usa pra desenhar as
            camadas, avaliada num único x), colorida igual à camada (mesma cor
            da legenda ao lado, pra identificar qual é qual sem repetir o nome
            no croqui). Rótulos deslocados pra evitar sobreposição ganham uma
            linha guia tracejada até a altura real do limite. */}
        {showGrid &&
          layers.length > 0 &&
          layerBoundaryLabels.map((b, i) => {
            const displacedY = Math.abs(b.trueY - b.placedY) > 1e-6 ? yMax - b.placedY : null
            return (
              <g key={i} fontSize={2} fontFamily="'JetBrains Mono', monospace">
                <line x1={0.5} y1={yMax - b.trueY} x2={2} y2={yMax - b.trueY} stroke={b.color} strokeWidth={0.2} />
                {displacedY != null && (
                  <line x1={2} y1={yMax - b.trueY} x2={2.4} y2={displacedY} stroke={b.color} strokeWidth={0.1} strokeDasharray="0.3 0.3" />
                )}
                <text x={2.6} y={yMax - b.placedY + 0.7} fill={b.color}>
                  {b.text}
                </text>
              </g>
            )
          })}
      </svg>

      {result && (
        <div className="absolute right-3 top-3 rounded-md border border-border bg-surface/90 px-3 py-2 text-right backdrop-blur">
          <div className="font-mono text-2xl font-bold" style={{ color: fsColor(result.FS) }}>
            FS = {result.FS.toFixed(3).replace('.', ',')}
          </div>
          <div className="text-xs" style={{ color: fsColor(result.FS) }}>
            {result.is_adequate ? '● ADEQUADO' : '● INADEQUADO'} (NBR 11682)
          </div>
        </div>
      )}
    </div>
  )
})

// exporta para reaproveitar interpolação de terreno em overlays externos, se necessário
export { groundY }
