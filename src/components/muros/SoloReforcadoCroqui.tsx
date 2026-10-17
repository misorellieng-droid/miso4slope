import { useRef } from 'react'
import { Download } from 'lucide-react'
import type { ParamsMSE, ResultadoMSE } from '../../engine/argilaMole/soloReforcado'
import type { FillMaterial, Layer, SlopeGeometry } from '../../engine/types'

// Croqui do muro de solo reforçado com geossintético, a partir do
// pré-dimensionamento e dos dados reais do estudo (camadas, N.A., aterro,
// sobrecarga). Medidas em m; cotas relativas ao terreno natural (0,00).

interface Props {
  geo: SlopeGeometry
  layers: Layer[]
  fill: FillMaterial
  p: ParamsMSE
  res: ResultadoMSE
}

const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',')
const W = 1100

export function SoloReforcadoCroqui({ geo, layers, fill, p, res }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const H = res.H
  const L = res.L
  const q = res.q
  const x = res.externa
  const profFund = Math.max(6, Math.min(10, H * 1.5 + 3))
  const yFundo = -p.embutimento - profFund
  const xmin = -7
  const xmax = Math.max(L + 10, 1.8 * H + L)
  const ytop = H + 5.6
  const sc = W / (xmax - xmin)
  const Ht = (ytop - yFundo) * sc
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

  const { xc, yc, R } = res.circulo.circle
  const arc: string[] = []
  for (let i = 0; i <= 140; i++) {
    const xx = res.circulo.x_left + ((res.circulo.x_right - res.circulo.x_left) * i) / 140
    const inside = R * R - (xx - xc) ** 2
    if (inside < 0 || xx < xmin || xx > xmax) continue
    const yy = yc - Math.sqrt(inside)
    if (yy < yFundo || yy > ytop) continue
    arc.push(`${sx(xx).toFixed(1)},${sy(yy).toFixed(1)}`)
  }

  const tick = (a: number, b: number) => <line x1={a - 5} y1={b + 5} x2={a + 5} y2={b - 5} stroke="#6b7280" strokeWidth={1} />
  const dimV = (xv: number, y0: number, y1: number, texto: string, lado: 'esq' | 'dir') => {
    const X = sx(xv)
    const a = sy(y0)
    const b = sy(y1)
    return (
      <g>
        <line x1={X} y1={a} x2={X} y2={b} stroke="#6b7280" strokeWidth={1} />
        {tick(X, a)}
        {tick(X, b)}
        <text x={lado === 'dir' ? X + 8 : X - 8} y={(a + b) / 2} fontSize={13} textAnchor={lado === 'dir' ? 'start' : 'end'} dominantBaseline="middle" fill="#1f2937">
          {texto}
        </text>
      </g>
    )
  }
  const erros = res.avisos.filter((a) => a.nivel === 'erro')
  const caixaH = 128 + (erros.length ? 18 : 0)

  const baixar = () => {
    const svg = svgRef.current
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'croqui_solo_reforcado.svg'
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
      <svg id="croqui-mse" ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${Ht}`} className="h-auto w-full rounded bg-white" fontFamily="'JetBrains Mono', ui-monospace, monospace">
        <defs>
          <pattern id="hatm" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#c9a227" strokeWidth="1" opacity="0.5" />
          </pattern>
          <pattern id="dotsm" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.9" fill="#9ca3af" opacity="0.6" />
          </pattern>
          <marker id="setaqm" markerWidth="8" markerHeight="8" refX="4" refY="7" orient="auto">
            <path d="M0,0 L8,0 L4,8 Z" fill="#111827" />
          </marker>
        </defs>

        <text x={20} y={26} fontSize={12} fill="#6b7280" letterSpacing={1}>
          DETALHE PRELIMINAR
        </text>
        <text x={20} y={50} fontSize={20} fontWeight={700} fill="#111827" fontFamily="ui-sans-serif, system-ui, sans-serif">
          Muro de solo reforçado com geossintético
        </text>

        {/* camadas da fundação */}
        {camadas.map((c, k) => {
          const mole = (c.l.phi ?? 0) === 0
          return (
            <g key={c.i}>
              <rect {...rect(xmin, xmax, Math.max(c.base, yFundo), c.top)} fill={mole ? (k % 2 ? '#d3e2f4' : '#e4eefa') : '#f1ecdd'} />
              {!mole && <rect {...rect(xmin, xmax, Math.max(c.base, yFundo), c.top)} fill="url(#dotsm)" />}
              <line x1={sx(xmin)} y1={sy(c.base)} x2={sx(xmax)} y2={sy(c.base)} stroke="#9ca3af" strokeWidth={0.8} />
            </g>
          )
        })}
        {camadas.map((c) => {
          const base = Math.max(c.base, yFundo)
          const esp = c.top - c.base
          const mole = (c.l.phi ?? 0) === 0
          const meio = (c.top + base) / 2
          const dados = mole ? `su ${fmt(c.l.c, 0)} kPa · γ ${fmt(c.l.gamma, 1)}` : `c' ${fmt(c.l.c, 0)} kPa · φ' ${fmt(c.l.phi ?? 0, 0)}° · γ ${fmt(c.l.gamma, 1)}`
          const xt = sx(L + (xmax - L) / 2)
          return (
            <g key={c.i} fill={mole ? '#3b556f' : '#6b7280'} textAnchor="middle">
              {esp >= 1.4 ? (
                <>
                  <text x={xt} y={sy(meio) - 4} fontSize={14} fontWeight={700}>
                    {c.l.name.toUpperCase()}
                    {c.l.name === x.fundacao.nome ? ' · fundação do muro' : ''}
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

        {/* maciço retido e bloco reforçado */}
        <rect {...rect(0, xmax, 0, H)} fill="#f0e2a0" />
        <rect {...rect(0, xmax, 0, H)} fill="url(#hatm)" />
        <rect {...rect(0, L, 0, H)} fill="#e6c85a" opacity={0.45} />
        <line x1={sx(0)} y1={sy(H)} x2={sx(xmax)} y2={sy(H)} stroke="#1f2937" strokeWidth={2.2} />
        <line x1={sx(0)} y1={sy(-p.embutimento)} x2={sx(0)} y2={sy(H)} stroke="#1f2937" strokeWidth={4} />
        {p.embutimento > 0 && <rect {...rect(0, 0.5, -p.embutimento, 0)} fill="#9ca3af" stroke="#374151" />}
        <line x1={sx(xmin)} y1={sy(0)} x2={sx(0)} y2={sy(0)} stroke="#4b5563" strokeWidth={2} />
        <line x1={sx(xmin)} y1={sy(-geo.water_table_depth)} x2={sx(xmax)} y2={sy(-geo.water_table_depth)} stroke="#3b82f6" strokeWidth={1.4} strokeDasharray="7 5" />
        <text x={sx(xmin) + 6} y={sy(0) - 6} fontSize={12} fill="#6b7280">
          terreno natural
        </text>
        <text x={sx(xmin) + 6} y={sy(-geo.water_table_depth) + 14} fontSize={12} fill="#3b82f6">
          N.A. a {fmt(geo.water_table_depth, 1)} m do terreno
        </text>

        {/* geossintéticos */}
        {res.camadas.map((c, i) => (
          <line key={i} x1={sx(0)} y1={sy(c.h)} x2={sx(L)} y2={sy(c.h)} stroke="#15803d" strokeWidth={2} />
        ))}

        {/* sobrecarga */}
        {q > 0 && (
          <g stroke="#111827" strokeWidth={1.3}>
            <line x1={sx(0.3)} y1={sy(H + 1.5)} x2={sx(xmax - 1)} y2={sy(H + 1.5)} />
            {Array.from({ length: 10 }).map((_, i) => {
              const xv = sx(0.3 + ((xmax - 1.3) * i) / 9)
              return <line key={i} x1={xv} y1={sy(H + 1.5)} x2={xv} y2={sy(H + 0.1)} markerEnd="url(#setaqm)" />
            })}
          </g>
        )}
        {q > 0 && (
          <text x={sx(xmax / 2)} y={sy(H + 1.5) - 8} fontSize={14} textAnchor="middle" fill="#111827">
            q = {fmt(q, 0)} kPa
          </text>
        )}

        {/* superfície crítica global */}
        {arc.length > 1 && <polyline points={arc.join(' ')} fill="none" stroke="#dc2626" strokeWidth={2.2} strokeDasharray="8 6" />}

        <text x={sx(L + 0.4)} y={sy(H * 0.55)} fontSize={14} fontWeight={700} fill="#7a6212">
          ATERRO (solo reforçado e retido)
        </text>
        <text x={sx(L + 0.4)} y={sy(H * 0.55) + 17} fontSize={12} fill="#7a6212">
          c' {fmt(fill.c, 0)} kPa · φ' {fmt(fill.phi, 0)}° · γ {fmt(fill.gamma, 1)} kN/m³
        </text>
        <text x={sx(L + 0.4)} y={sy(H * 0.55) + 34} fontSize={12} fill="#14532d">
          geogrelha Tult {fmt(res.tultAdotado, 0)} kN/m (Tadm {fmt(res.tadm, 1)}) · linhas verdes
        </text>

        {/* dimensões */}
        {dimV(-1.6, 0, H, `H = ${fmt(H)} m`, 'esq')}
        {dimV(L + 0.6, 0, res.Sv, `Sv ${fmt(res.Sv)} m`, 'dir')}
        <g>
          <line x1={sx(0)} y1={sy(-0.9)} x2={sx(L)} y2={sy(-0.9)} stroke="#6b7280" strokeWidth={1} />
          {tick(sx(0), sy(-0.9))}
          {tick(sx(L), sy(-0.9))}
          <text x={sx(L / 2)} y={sy(-0.9) + 16} fontSize={13} textAnchor="middle" fill="#1f2937">
            L = {fmt(L)} m (reforço)
          </text>
        </g>
        {p.embutimento > 0 && dimV(-3.2, -p.embutimento, 0, `emb. ${fmt(p.embutimento)} m`, 'esq')}
        <text x={12} y={sy(H / 2)} fontSize={12} fill="#4b5563">
          face vertical
        </text>

        {/* caixa de resultados */}
        <g transform={`translate(${W - 352} 14)`}>
          <rect width={340} height={caixaH} rx={8} fill="#fff" stroke="#d1d5db" />
          <text x={14} y={24} fontSize={14} fontWeight={700} fill="#b45309">
            SEÇÃO PRELIMINAR
          </text>
          <text x={14} y={44} fontSize={12} fill="#1f2937">
            n = {res.camadas.length} camadas · Sv {fmt(res.Sv)} m · L {fmt(L)} m
          </text>
          <text x={14} y={62} fontSize={12} fill="#1f2937">
            tombamento {fmt(x.fsTomb, 1)} · deslizamento {fmt(x.fsDesl, 1)}
          </text>
          <text x={14} y={80} fontSize={12} fill={x.fsCap >= 3 ? '#15803d' : '#dc2626'}>
            capacidade de carga FS {fmt(x.fsCap, 1)} (mín. 3,0)
          </text>
          <text x={14} y={98} fontSize={12} fill={res.fsGlobal >= p.fsAlvoGlobal ? '#15803d' : '#dc2626'}>
            global: {fmt(res.fs0)} sem reforço → {fmt(res.fsGlobal)} com reforço
          </text>
          <text x={14} y={116} fontSize={12} fill="#1f2937">
            fundação: {x.fundacao.nome}
          </text>
          {erros.length > 0 && (
            <text x={14} y={134} fontSize={12} fontWeight={700} fill="#dc2626">
              ● há verificações não atendidas
            </text>
          )}
        </g>

        <text x={20} y={Ht - 12} fontSize={12} fill="#6b7280">
          Pré-dimensionamento. Medidas em metros, cotas relativas ao terreno natural (0,00). Não usar para execução.
        </text>
      </svg>
    </div>
  )
}
