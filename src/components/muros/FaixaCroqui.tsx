import { useRef } from 'react'
import { Download } from 'lucide-react'
import {
  circuloAtravessaFaixa,
  razaoAreas,
  tauColuna,
  tipoEfetivo,
  type ColchaoGeogrelha,
  type FaixaColunas,
  type ResultadoFaixa,
} from '../../engine/argilaMole/faixaColunas'
import { resolverApoio } from '../../engine/argilaMole/cortina'
import { buildProfile } from '../../engine/geometry'
import type { FillMaterial, Layer, SlopeGeometry } from '../../engine/types'

// Croqui da faixa de colunas (brita, brita encamisada ou rígida) com colchão de brita e geogrelha,
// desenhado com os dados reais do estudo e do pré-dimensionamento. Medidas em
// m; cotas relativas ao terreno natural (0,00).

interface Props {
  geo: SlopeGeometry
  layers: Layer[]
  fill: FillMaterial
  f: FaixaColunas
  colchao: ColchaoGeogrelha
  sem: ResultadoFaixa | null
  com: ResultadoFaixa
}

const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',')
const W = 1100

export function FaixaCroqui({ geo, layers, fill, f, colchao, sem, com }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const H = geo.total_height
  const q = geo.surcharge_q ?? 0
  const prof = buildProfile(geo, 'aterro')
  const xCrest = prof[prof.length - 2].x
  const xs0 = f.xRef - f.frente
  const xs1 = xs0 + f.largura
  const m = razaoAreas(f)
  const apoioTopo = resolverApoio(layers, { camadaApoio: -1 }).cotaTopo
  const yPonta = -f.comprimento
  const embut = f.comprimento + apoioTopo // > 0: ponta embutida na camada resistente
  const temGeo = colchao.T > 0
  const xGeoEnd = xCrest + (colchao.alem_crista ?? 10)

  const xmin = Math.min(xs0, 0) - 9
  const xmax = Math.max(xCrest, xs1) + 10
  const yFundo = Math.min(yPonta, apoioTopo) - 3
  const ytop = H + 5.8
  const sc = W / (xmax - xmin)
  const Ht = (ytop - yFundo) * sc + 175
  const sx = (v: number) => (v - xmin) * sc
  const sy = (v: number) => (ytop - v) * sc
  const rect = (x0: number, x1: number, y0: number, y1: number) => ({
    x: sx(Math.min(x0, x1)),
    y: sy(Math.max(y0, y1)),
    width: Math.abs(x1 - x0) * sc,
    height: Math.abs(y1 - y0) * sc,
  })

  const camadas = layers
    .map((l, i) => ({ l, i, top: Math.min(l.y_top ?? 0, 0), base: l.y_base ?? yFundo }))
    .filter((c) => c.base < c.top && c.top > yFundo)
    .sort((a, b) => b.top - a.top)
    .map((c, k, arr) => ({ ...c, base: k === arr.length - 1 ? Math.min(c.base, yFundo) : c.base }))

  const polAterro = [
    ...prof.filter((p) => p.x >= -1e-9 && p.x < xmax),
    { x: xmax, y: prof[prof.length - 1].y },
    { x: xmax, y: 0 },
    { x: 0, y: 0 },
  ]
    .map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
    .join(' ')

  const { xc, yc, R } = com.result.circle
  const arc: string[] = []
  for (let i = 0; i <= 140; i++) {
    const xx = com.result.x_left + ((com.result.x_right - com.result.x_left) * i) / 140
    const inside = R * R - (xx - xc) ** 2
    if (inside < 0 || xx < xmin || xx > xmax) continue
    const yy = yc - Math.sqrt(inside)
    if (yy < yFundo || yy > ytop) continue
    arc.push(`${sx(xx).toFixed(1)},${sy(yy).toFixed(1)}`)
  }

  // colunas: uma a cada malha, centradas na faixa
  const nCol = Math.max(1, Math.floor(f.largura / f.malha + 1e-9))
  const x0Col = xs0 + (f.largura - (nCol - 1) * f.malha) / 2
  const colunas = Array.from({ length: Math.min(nCol, 60) }, (_, i) => x0Col + i * f.malha)

  const tick = (a: number, b: number) => <line x1={a - 5} y1={b + 5} x2={a + 5} y2={b - 5} stroke="#6b7280" strokeWidth={1} />
  const dimH = (x0: number, x1: number, y: number, texto: string, negrito = false) => (
    <g>
      <line x1={sx(x0)} y1={sy(y)} x2={sx(x1)} y2={sy(y)} stroke="#6b7280" strokeWidth={1} />
      {tick(sx(x0), sy(y))}
      {tick(sx(x1), sy(y))}
      <text x={sx((x0 + x1) / 2)} y={sy(y) - 6} fontSize={13} textAnchor="middle" fontWeight={negrito ? 700 : 400} fill="#1f2937">
        {texto}
      </text>
    </g>
  )
  const dimV = (x: number, y0: number, y1: number, texto: string, lado: 'esq' | 'dir', negrito = false) => {
    const X = sx(x)
    const a = sy(y0)
    const b = sy(y1)
    return (
      <g>
        <line x1={X} y1={a} x2={X} y2={b} stroke="#6b7280" strokeWidth={1} />
        {tick(X, a)}
        {tick(X, b)}
        <text x={lado === 'dir' ? X + 8 : X - 8} y={(a + b) / 2} fontSize={13} textAnchor={lado === 'dir' ? 'start' : 'end'} dominantBaseline="middle" fontWeight={negrito ? 700 : 400} fill="#1f2937">
          {texto}
        </text>
      </g>
    )
  }

  const atravessa = circuloAtravessaFaixa(com.result, f)
  const tipoTxt = { brita: 'brita', gec: 'brita encamisada (GEC)', rigida: 'coluna rígida' }[tipoEfetivo(f)]
  const boxH = 142
  const plantaY = (ytop - yFundo) * sc + 18

  const baixar = () => {
    const svg = svgRef.current
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'croqui_faixa_colunas.svg'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">Croqui do pré-dimensionamento</div>
        <button onClick={baixar} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-primary">
          <Download size={14} /> Baixar SVG
        </button>
      </div>
      <svg id="croqui-faixa" ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${Ht}`} className="h-auto w-full rounded bg-white" fontFamily="'JetBrains Mono', ui-monospace, monospace">
        <defs>
          <pattern id="hatf" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#c9a227" strokeWidth="1" opacity="0.5" />
          </pattern>
          <pattern id="dotsf" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.9" fill="#9ca3af" opacity="0.6" />
          </pattern>
          <pattern id="brita" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.1" fill="#8b8b8b" />
            <circle cx="5" cy="5" r="0.8" fill="#8b8b8b" />
          </pattern>
          <marker id="setaqf" markerWidth="8" markerHeight="8" refX="4" refY="7" orient="auto">
            <path d="M0,0 L8,0 L4,8 Z" fill="#111827" />
          </marker>
        </defs>

        <text x={20} y={26} fontSize={12} fill="#6b7280" letterSpacing={1}>
          DETALHE PRELIMINAR
        </text>
        <text x={20} y={50} fontSize={20} fontWeight={700} fill="#111827" fontFamily="ui-sans-serif, system-ui, sans-serif">
          Faixa de colunas ({tipoTxt}) sob o pé do aterro
        </text>

        {/* camadas */}
        {camadas.map((c, k) => {
          const mole = (c.l.phi ?? 0) === 0
          return (
            <g key={c.i}>
              <rect {...rect(xmin, xmax, Math.max(c.base, yFundo), c.top)} fill={mole ? (k % 2 ? '#d3e2f4' : '#e4eefa') : '#f1ecdd'} />
              {!mole && <rect {...rect(xmin, xmax, Math.max(c.base, yFundo), c.top)} fill="url(#dotsf)" />}
              <line x1={sx(xmin)} y1={sy(c.base)} x2={sx(xmax)} y2={sy(c.base)} stroke="#9ca3af" strokeWidth={0.8} />
            </g>
          )
        })}
        <line x1={sx(xmin)} y1={sy(apoioTopo)} x2={sx(xmax)} y2={sy(apoioTopo)} stroke="#6b7280" strokeWidth={1.6} />

        {/* aterro */}
        <polygon points={polAterro} fill="#f0e2a0" />
        <polygon points={polAterro} fill="url(#hatf)" />
        <polyline points={prof.filter((p) => p.x >= xmin).map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')} fill="none" stroke="#1f2937" strokeWidth={2.2} />
        <line x1={sx(xCrest)} y1={sy(H)} x2={sx(xmax)} y2={sy(H)} stroke="#1f2937" strokeWidth={2.2} />
        <line x1={sx(xmin)} y1={sy(0)} x2={sx(0)} y2={sy(0)} stroke="#4b5563" strokeWidth={2} />
        <line x1={sx(xmin)} y1={sy(-geo.water_table_depth)} x2={sx(xmax)} y2={sy(-geo.water_table_depth)} stroke="#3b82f6" strokeWidth={1.4} strokeDasharray="7 5" />
        <text x={sx(xmin) + 6} y={sy(0) - 6} fontSize={12} fill="#6b7280">
          terreno natural
        </text>
        <text x={sx(xmin) + 6} y={sy(-geo.water_table_depth) + 14} fontSize={12} fill="#3b82f6">
          N.A. a {fmt(geo.water_table_depth, 1)} m do terreno
        </text>

        {/* sobrecarga */}
        {q > 0 && (
          <g stroke="#111827" strokeWidth={1.3}>
            <line x1={sx(xCrest + 0.5)} y1={sy(H + 1.5)} x2={sx(xmax - 1)} y2={sy(H + 1.5)} />
            {Array.from({ length: 8 }).map((_, i) => {
              const xv = sx(xCrest + 0.5 + ((xmax - 1 - xCrest - 0.5) * i) / 7)
              return <line key={i} x1={xv} y1={sy(H + 1.5)} x2={xv} y2={sy(H + 0.1)} markerEnd="url(#setaqf)" />
            })}
          </g>
        )}
        {q > 0 && (
          <text x={sx((xCrest + xmax) / 2)} y={sy(H + 1.5) - 8} fontSize={14} textAnchor="middle" fill="#111827">
            q = {fmt(q, 0)} kPa
          </text>
        )}

        {/* colunas */}
        {colunas.map((xcol, i) => (
          <rect key={i} {...rect(xcol - f.diametro / 2, xcol + f.diametro / 2, yPonta, 0)} fill={tipoEfetivo(f) === 'rigida' ? '#4b5563' : '#9ca3af'} stroke="#374151" strokeWidth={1} />
        ))}

        {/* colchão de brita e geogrelha */}
        <rect {...rect(xs0, xs1, 0, colchao.espessura)} fill="#e7e2d6" stroke="#6b7280" strokeWidth={1} />
        <rect {...rect(xs0, xs1, 0, colchao.espessura)} fill="url(#brita)" opacity={0.7} />
        {temGeo && <line x1={sx(xs0)} y1={sy(Math.min(colchao.espessura * 0.25, 0.3))} x2={sx(Math.min(xGeoEnd, xmax - 0.5))} y2={sy(Math.min(colchao.espessura * 0.25, 0.3))} stroke="#7e22ce" strokeWidth={2.4} strokeDasharray="3 3" />}

        {/* superfície de ruptura crítica */}
        {arc.length > 1 && <polyline points={arc.join(' ')} fill="none" stroke="#dc2626" strokeWidth={2.2} strokeDasharray="8 6" />}
        <text x={sx(xmin) + 6} y={sy(-2.4)} fontSize={12} fill="#dc2626">
          superfície de ruptura crítica
        </text>

        {/* rótulos de material */}
        {camadas.map((c) => {
          const base = Math.max(c.base, yFundo)
          const esp = c.top - c.base
          const mole = (c.l.phi ?? 0) === 0
          const meio = (c.top + base) / 2
          const dados = mole ? `su ${fmt(c.l.c, 0)} kPa · γ ${fmt(c.l.gamma, 1)}` : `c' ${fmt(c.l.c, 0)} kPa · φ' ${fmt(c.l.phi ?? 0, 0)}° · γ ${fmt(c.l.gamma, 1)}`
          const xa = Math.max(xs1 + 3, 0)
          const xt = sx((xa + (xmax - 5.5)) / 2)
          return (
            <g key={c.i} fill={mole ? '#3b556f' : '#6b7280'} textAnchor="middle">
              {esp >= 1.4 ? (
                <>
                  <text x={xt} y={sy(meio) - 4} fontSize={14} fontWeight={700}>
                    {c.l.name.toUpperCase()}
                  </text>
                  <text x={xt} y={sy(meio) + 14} fontSize={12}>
                    {dados} · {fmt(esp, 1)} m
                  </text>
                </>
              ) : (
                <text x={xt} y={sy(meio) + 4} fontSize={12}>
                  {c.l.name} · {dados} · {fmt(esp, 1)} m
                </text>
              )}
            </g>
          )
        })}
        <text x={sx(xCrest + 1.2)} y={sy(H / 2)} fontSize={14} fontWeight={700} fill="#7a6212">
          ATERRO COMPACTADO
        </text>
        <text x={sx(xCrest + 1.2)} y={sy(H / 2) + 17} fontSize={12} fill="#7a6212">
          c' {fmt(fill.c, 0)} kPa · φ' {fmt(fill.phi, 0)}° · γ {fmt(fill.gamma, 1)} kN/m³
        </text>

        {/* dimensões horizontais, no alto */}
        {dimH(xs0, xCrest, H + 3.2, `${fmt(xCrest - xs0)} m da borda da faixa até a crista`, true)}
        {xs0 < f.xRef && f.xRef < xCrest && (
          <g>
            {dimH(xs0, f.xRef, H + 2.3, `${fmt(f.xRef - xs0)} m`)}
            {dimH(f.xRef, xCrest, H + 2.3, `${fmt(xCrest - f.xRef)} m (talude 1:${fmt(geo.slope_ratio, 1)})`)}
          </g>
        )}
        {/* dimensões da faixa, embaixo */}
        {dimH(xs0, xs1, yPonta - 1.6, `faixa de ${fmt(f.largura)} m`, true)}
        {xs0 < f.xRef && f.xRef < xs1 && (
          <g>
            {dimH(xs0, f.xRef, yPonta - 0.7, `${fmt(f.xRef - xs0)} m à frente do pé`)}
            {dimH(f.xRef, xs1, yPonta - 0.7, `${fmt(xs1 - f.xRef)} m sob o aterro`)}
          </g>
        )}
        {colunas.length > 1 && dimH(colunas[0], colunas[1], yPonta / 2, `${fmt(f.malha)} m`)}

        {/* dimensões verticais */}
        {dimV(xs0 - 1.6, yPonta, 0, `L = ${fmt(f.comprimento)} m`, 'esq', true)}
        {embut > 0 && dimV(xs1 + 1.2, yPonta, apoioTopo, `embutimento ${fmt(embut)} m`, 'dir')}
        {dimV(xmax - 1.2, 0, H, `aterro ${fmt(H)} m`, 'esq')}
        {apoioTopo < -0.05 && dimV(xmax - 1.2, apoioTopo, 0, `até o apoio ${fmt(-apoioTopo)} m`, 'esq')}

        {/* legendas */}
        <text x={12} y={sy(colchao.espessura) - 34} fontSize={13} fill="#1f2937">
          colchão de brita
        </text>
        <text x={12} y={sy(colchao.espessura) - 18} fontSize={13} fill="#1f2937">
          e = {fmt(colchao.espessura)} m, L = {fmt(f.largura)} m
        </text>
        <text x={12} y={sy(colchao.espessura) - 2} fontSize={13} fill={temGeo ? '#7e22ce' : '#6b7280'}>
          {temGeo ? `geogrelha T = ${fmt(colchao.T, 0)} kN/m (até x = ${fmt(xGeoEnd, 1)} m)` : 'sem geogrelha (T = 0)'}
        </text>
        <text x={12} y={sy(yPonta * 0.8) - 26} fontSize={13} fill="#1f2937">
          colunas de {tipoTxt} Ø {fmt(f.diametro)} m
        </text>
        <text x={12} y={sy(yPonta * 0.8) - 10} fontSize={13} fill="#1f2937">
          malha {fmt(f.malha)} x {fmt(f.malha)} m ({f.arranjo})
        </text>
        <text x={12} y={sy(yPonta * 0.8) + 6} fontSize={12} fill="#4b5563">
          razão de substituição m = {fmt(m * 100, 1)}%
        </text>
        <text x={12} y={sy(yPonta * 0.8) + 21} fontSize={12} fill="#4b5563">
          {tipoEfetivo(f) !== 'rigida' ? `φ coluna ${fmt(f.phi_col, 0)}° · n = ${fmt(f.n_stress, 1)}` : `τ coluna ${fmt(tauColuna(f), 0)} kPa · η = ${fmt(f.eta, 2)} · n = ${fmt(f.n_stress, 1)}`}
        </text>

        {/* caixa de resultado */}
        <g transform={`translate(${W - 352} 14)`}>
          <rect width={340} height={boxH} rx={8} fill="#fff" stroke="#d1d5db" />
          <text x={14} y={24} fontSize={14} fontWeight={700} fill="#b45309">
            SEÇÃO PRELIMINAR
          </text>
          <text x={14} y={44} fontSize={12} fill="#1f2937">
            FS sem tratamento: {sem ? fmt(sem.FS, 3) : '—'}
          </text>
          <text x={14} y={62} fontSize={12} fill={com.FS >= 1.5 ? '#15803d' : '#dc2626'}>
            FS com a faixa{temGeo ? ' + geogrelha' : ''}: {fmt(com.FS, 3)} (alvo ≥ 1,50)
          </text>
          <text x={14} y={80} fontSize={12} fill="#1f2937">
            arco crítico: x de {fmt(com.result.x_left, 1)} a {fmt(com.result.x_right, 1)} m
          </text>
          <text x={14} y={98} fontSize={12} fill={atravessa ? '#15803d' : '#dc2626'}>
            {atravessa ? 'o arco crítico atravessa a faixa' : 'o arco crítico NÃO passa pela faixa'}
          </text>
          <text x={14} y={116} fontSize={12} fill={embut >= 0.5 ? '#15803d' : '#dc2626'}>
            {embut >= 0.5 ? `ponta embutida ${fmt(embut)} m no apoio` : 'ponta sem embutimento no apoio'}
          </text>
          <text x={14} y={134} fontSize={12} fill="#6b7280">
            recalque e arqueamento não calculados
          </text>
        </g>

        {/* planta */}
        <g transform={`translate(20 ${plantaY})`}>
          <rect width={250} height={118} rx={4} fill="#fff" stroke="#d1d5db" />
          <text x={14} y={20} fontSize={12} fill="#6b7280" letterSpacing={1}>
            PLANTA {tipoTxt.toUpperCase()}
          </text>
          {[0, 1, 2].flatMap((r) =>
            [0, 1, 2].map((c) => {
              const rr = Math.min(f.diametro * 14, 14)
              const passo = Math.max(f.malha * 24, rr * 2 + 4)
              const dx = f.arranjo === 'triangular' && r % 2 ? passo / 2 : 0
              return <circle key={`${r}${c}`} cx={30 + rr + c * passo + dx} cy={44 + r * Math.min(passo, 22)} r={rr} fill={tipoEfetivo(f) === 'rigida' ? '#4b5563' : '#9ca3af'} stroke="#374151" />
            })
          )}
          <text x={14} y={110} fontSize={12} fill="#1f2937">
            Ø {fmt(f.diametro)} m · malha {fmt(f.malha)} m
          </text>
        </g>

        <text x={20} y={Ht - 12} fontSize={12} fill="#6b7280">
          Pré-dimensionamento. Medidas em metros, cotas relativas ao terreno natural (0,00). Não usar para execução.
        </text>
      </svg>
    </div>
  )
}
