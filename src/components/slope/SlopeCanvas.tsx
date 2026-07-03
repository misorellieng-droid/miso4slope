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
const MARGIN_Y = 6
const LAYER_COLORS = ['#3498DB', '#9B59B6', '#1ABC9C', '#F39C12', '#95A5A6', '#E67E22']
const LAYER_SAMPLES = 40

function fsColor(fs: number): string {
  if (fs >= 1.5) return 'var(--color-accent-green)'
  if (fs >= 1.3) return 'var(--color-accent-amber)'
  return 'var(--color-accent-red)'
}

/**
 * Contorno de uma camada de fundação entre xMin/xMax. Camadas com
 * depth_top/depth_base acompanham a superfície do terreno local (ondulam
 * com ela); camadas com y_top/y_base absolutos formam uma faixa horizontal
 * reta, como antes — os dois casos usam o mesmo polígono, só a fórmula do
 * topo/base muda.
 */
function layerOutline(
  layer: Layer,
  xMin: number,
  xMax: number,
  terrain: Point[] | undefined
): Point[] {
  const xs = Array.from({ length: LAYER_SAMPLES }, (_, i) => xMin + ((xMax - xMin) * i) / (LAYER_SAMPLES - 1))
  const groundAt = (x: number) => (terrain && terrain.length ? groundY(x, terrain) : 0)

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
 * layerOutline, mas só para um ponto, não o polígono inteiro).
 */
function layerBoundaryY(layer: Layer, x: number, terrain: Point[] | undefined): { top: number; base: number } {
  const g = terrain && terrain.length ? groundY(x, terrain) : 0
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

  const toeIndex = 1
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

    return {
      xMin: xMin - MARGIN_X,
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

  const layerBoundaryElevations = useMemo(() => {
    const EPS = 1e-6
    const ys: number[] = []
    for (const layer of layers) {
      const { top, base } = layerBoundaryY(layer, xMin, refTerrain)
      for (const y of [top, base]) {
        if (Number.isFinite(y) && !ys.some((existing) => Math.abs(existing - y) < EPS)) ys.push(y)
      }
    }
    return ys.sort((a, b) => b - a)
  }, [layers, xMin, refTerrain])

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
              opacity={highlightLayer === i ? 0.35 : 0.12}
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

          {/* terreno natural original por baixo do aterro (auditoria: onde o solo realmente estava) */}
          {geometry.natural_terrain && geometry.natural_terrain.length > 0 && (
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

          {/* fatias */}
          {showSlices &&
            result &&
            result.slices.map((s) => (
              <rect
                key={s.index}
                x={s.xm - s.b / 2}
                y={s.y_base}
                width={s.b}
                height={s.h}
                fill="#F1C40F"
                opacity={0.18}
                stroke="#F1C40F"
                strokeOpacity={0.4}
                strokeWidth={0.06}
              />
            ))}

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
            gêmeo da berma que fica na mesma cota, para não sobrepor os rótulos. */}
        {showGrid && (
          <g fontSize={2.4} fill="var(--color-text-secondary)" fontFamily="'JetBrains Mono', monospace">
            {profile
              .slice(toeIndex, crestIndex + 1)
              .filter((p, i, arr) => i === 0 || p.y !== arr[i - 1].y)
              .map((p, i) => (
                <text key={i} x={p.x - xMin + 0.5} y={yMax - p.y - 0.5}>
                  {p.y.toFixed(2)}m
                </text>
              ))}
          </g>
        )}

        {/* profundidade adotada em cada limite de camada — no canto esquerdo,
            como uma régua de perfil (mesma referência que layerOutline usa
            para desenhar as camadas, avaliada num único x). */}
        {showGrid && layers.length > 0 && (
          <g fontSize={2.2} fill="var(--color-text-secondary)" fontFamily="'JetBrains Mono', monospace">
            {layerBoundaryElevations.map((y, i) => (
              <g key={i}>
                <line
                  x1={0.5}
                  y1={yMax - y}
                  x2={2.5}
                  y2={yMax - y}
                  stroke="var(--color-text-secondary)"
                  strokeWidth={0.15}
                />
                <text x={3} y={yMax - y + 0.8}>
                  {y.toFixed(2)}m
                </text>
              </g>
            ))}
          </g>
        )}
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
