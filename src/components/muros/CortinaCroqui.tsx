import { useRef } from 'react'
import { Download } from 'lucide-react'
import type { AnaliseCortina, ParamsCortina } from '../../engine/argilaMole/cortina'
import type { FillMaterial, Layer, SlopeGeometry } from '../../engine/types'

// Croqui da cortina de estacas atirantada, desenhado a partir do
// pré-dimensionamento. A estaca é desenhada com a ficha DIMENSIONADA (a
// necessária para o FS da ficha ≥ 2), não a informada no campo. Medidas em m;
// cotas relativas ao terreno natural (0,00).

interface Props {
  geo: SlopeGeometry
  layers: Layer[]
  fill: FillMaterial
  p: ParamsCortina
  res: AnaliseCortina
}

const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',')
const W = 1100

export function CortinaCroqui({ geo, layers, fill, p, res }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { forca, esforcos: e } = res
  const H = geo.total_height
  const q = geo.surcharge_q ?? 0
  const baseArgila = e.apoio.cotaTopo // topo da camada de apoio da ficha

  // ficha do desenho: a dimensionada; se não há solução até 25 m, a informada (com aviso)
  const fichaInviavel = e.fichaNecessaria == null && e.fsFicha < 2
  const fichaDes = e.fichaNecessaria != null ? Math.max(e.fichaNecessaria, 0) : p.ficha
  const yPonta = baseArgila - fichaDes
  const yFundo = Math.min(yPonta, -p.comprimentoReacao) - 2.5
  // camadas abaixo do terreno, com topo/base em cota (a mais funda vai até o fundo do desenho)
  const camadas = layers
    .map((l, i) => ({ l, i, top: Math.min(l.y_top ?? 0, 0), base: l.y_base ?? yFundo }))
    .filter((c) => c.base < c.top)
    .sort((a, b) => b.top - a.top)
    .map((c, k, arr) => ({ ...c, base: k === arr.length - 1 ? Math.min(c.base, yFundo) : c.base }))

  const xr = p.x + p.distReacao
  const xmin = p.x - 9
  const xmax = xr + 9
  const ytop = H + 5.6
  const sc = W / (xmax - xmin)
  const Ht = (ytop - yFundo) * sc
  const sx = (x: number) => (x - xmin) * sc
  const sy = (y: number) => (ytop - y) * sc

  const yTie = p.cotaTirante
  const yTieEnd = yTie - 0.6
  const yBeamTop = yTie + 0.8
  const rect = (x0: number, x1: number, y0: number, y1: number) => ({
    x: sx(Math.min(x0, x1)),
    y: sy(Math.max(y0, y1)),
    width: Math.abs(x1 - x0) * sc,
    height: Math.abs(y1 - y0) * sc,
  })

  // superfície de ruptura crítica (arco inferior), recortada à janela
  const { xc, yc, R } = forca.circulo.circle
  const arc: string[] = []
  for (let i = 0; i <= 120; i++) {
    const x = forca.circulo.x_left + ((forca.circulo.x_right - forca.circulo.x_left) * i) / 120
    const inside = R * R - (x - xc) ** 2
    if (inside < 0 || x < xmin || x > xmax) continue
    const y = yc - Math.sqrt(inside)
    if (y < yFundo || y > ytop) continue
    arc.push(`${sx(x).toFixed(1)},${sy(y).toFixed(1)}`)
  }

  const tick = (x: number, y: number) => <line x1={x - 5} y1={y + 5} x2={x + 5} y2={y - 5} stroke="#6b7280" strokeWidth={1} />
  const dimV = (x: number, y0: number, y1: number, texto: string, lado: 'esq' | 'dir', negrito = false) => {
    const X = sx(x)
    const a = sy(y0)
    const b = sy(y1)
    return (
      <g>
        <line x1={X} y1={a} x2={X} y2={b} stroke="#6b7280" strokeWidth={1} />
        {tick(X, a)}
        {tick(X, b)}
        <text
          x={lado === 'dir' ? X + 8 : X - 8}
          y={(a + b) / 2}
          fontSize={13}
          textAnchor={lado === 'dir' ? 'start' : 'end'}
          dominantBaseline="middle"
          fontWeight={negrito ? 700 : 400}
          fill="#1f2937"
        >
          {texto}
        </text>
      </g>
    )
  }

  // pendências além da ficha (que o desenho já resolve)
  const outrosErros = res.avisos.filter((a) => a.nivel === 'erro' && !/^Ficha/.test(a.texto))

  const baixar = () => {
    const svg = svgRef.current
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'croqui_cortina_estacas.svg'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const caixaH = 112 + (outrosErros.length ? 18 : 0)

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">Croqui do pré-dimensionamento</div>
        <button
          onClick={baixar}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
        >
          <Download size={14} /> Baixar SVG
        </button>
      </div>
      <svg
        id="croqui-cortina"
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${W} ${Ht}`}
        className="h-auto w-full rounded bg-white"
        fontFamily="'JetBrains Mono', ui-monospace, monospace"
      >
        <defs>
          <pattern id="hat" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#c9a227" strokeWidth="1" opacity="0.5" />
          </pattern>
          <pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.9" fill="#9ca3af" opacity="0.6" />
          </pattern>
          <marker id="seta" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#dc2626" />
          </marker>
          <marker id="setaq" markerWidth="8" markerHeight="8" refX="4" refY="7" orient="auto">
            <path d="M0,0 L8,0 L4,8 Z" fill="#111827" />
          </marker>
        </defs>

        {/* título */}
        <text x={20} y={26} fontSize={12} fill="#6b7280" letterSpacing={1}>
          DETALHE PRELIMINAR
        </text>
        <text x={20} y={50} fontSize={20} fontWeight={700} fill="#111827" fontFamily="ui-sans-serif, system-ui, sans-serif">
          Cortina de estacas com ficha na areia
        </text>

        {/* argila e areia */}
        {camadas.map((c, k) => {
          const mole = (c.l.phi ?? 0) === 0
          return (
            <g key={c.i}>
              <rect {...rect(xmin, xmax, Math.max(c.base, yFundo), c.top)} fill={mole ? (k % 2 ? '#d3e2f4' : '#e4eefa') : '#f1ecdd'} />
              {!mole && <rect {...rect(xmin, xmax, Math.max(c.base, yFundo), c.top)} fill="url(#dots)" />}
              <line x1={sx(xmin)} y1={sy(c.base)} x2={sx(xmax)} y2={sy(c.base)} stroke="#9ca3af" strokeWidth={0.8} />
            </g>
          )
        })}
        <line x1={sx(xmin)} y1={sy(baseArgila)} x2={sx(xmax)} y2={sy(baseArgila)} stroke="#6b7280" strokeWidth={1.6} />

        {/* aterro contido pela cortina */}
        <rect {...rect(p.x, xmax, 0, H)} fill="#f0e2a0" />
        <rect {...rect(p.x, xmax, 0, H)} fill="url(#hat)" />
        <line x1={sx(p.x)} y1={sy(H)} x2={sx(xmax)} y2={sy(H)} stroke="#1f2937" strokeWidth={2.2} />

        {/* terreno natural e N.A. */}
        <line x1={sx(xmin)} y1={sy(0)} x2={sx(p.x)} y2={sy(0)} stroke="#4b5563" strokeWidth={2} />
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
            <line x1={sx(p.x + 1.2)} y1={sy(H + 1.5)} x2={sx(xr + 4)} y2={sy(H + 1.5)} />
            {Array.from({ length: 10 }).map((_, i) => {
              const x = sx(p.x + 1.2 + ((xr + 4 - p.x - 1.2) * i) / 9)
              return <line key={i} x1={x} y1={sy(H + 1.5)} x2={x} y2={sy(H + 0.1)} markerEnd="url(#setaq)" />
            })}
          </g>
        )}
        {q > 0 && (
          <text x={sx((p.x + xr) / 2)} y={sy(H + 1.5) - 8} fontSize={14} textAnchor="middle" fill="#111827">
            q = {fmt(q, 0)} kPa
          </text>
        )}

        {/* painel de fechamento e dreno junto à face (lado do terreno natural) */}
        <rect {...rect(p.x - p.diametro / 2 - 0.3, p.x - p.diametro / 2, 0, yTie)} fill="#6b7280" opacity={0.6} />
        <circle cx={sx(p.x + p.diametro / 2 + 0.3)} cy={sy(0.3)} r={5} fill="#fff" stroke="#4b7a5c" strokeWidth={1.5} />

        {/* estaca da cortina (ficha dimensionada) */}
        <rect {...rect(p.x - p.diametro / 2, p.x + p.diametro / 2, yPonta, yBeamTop)} fill="#9ca3af" stroke="#374151" strokeWidth={1.2} />
        <rect {...rect(p.x - 0.7, p.x + 0.7, yTie, yBeamTop)} fill="#4b5563" stroke="#1f2937" strokeWidth={1.2} />

        {/* estaca de reação */}
        <rect {...rect(xr - p.diametroReacao / 2, xr + p.diametroReacao / 2, -p.comprimentoReacao, yTieEnd + 0.4)} fill="#9ca3af" stroke="#374151" strokeWidth={1.2} />

        {/* tirante */}
        <line x1={sx(p.x + 0.7)} y1={sy(yTie + 0.4)} x2={sx(xr)} y2={sy(yTieEnd)} stroke="#111827" strokeWidth={3} />
        <text x={sx((p.x + xr) / 2)} y={sy((yTie + yTieEnd) / 2) - 12} fontSize={13} textAnchor="middle" fill="#111827">
          tirante em bainha livre · F = {fmt(e.Ftirante, 0)} kN/estaca · As ≥ {fmt(e.AtirNec, 1)} cm²
        </text>

        {/* superfície de ruptura crítica e força T */}
        {arc.length > 1 && <polyline points={arc.join(' ')} fill="none" stroke="#dc2626" strokeWidth={2.2} strokeDasharray="8 6" />}
        {forca.yCruz != null && forca.T > 0 && (
          <g>
            <line x1={sx(p.x) - 70} y1={sy(forca.yCruz)} x2={sx(p.x) - 6} y2={sy(forca.yCruz)} stroke="#dc2626" strokeWidth={2.4} markerEnd="url(#seta)" />
            <text x={sx(p.x) - 8} y={sy(forca.yCruz) - 24} fontSize={13} textAnchor="end" fill="#dc2626" fontWeight={700}>
              T = {fmt(forca.T, 0)} kN/m
            </text>
            <text x={sx(p.x) - 8} y={sy(forca.yCruz) - 9} fontSize={12} textAnchor="end" fill="#dc2626">
              (cota {fmt(forca.yCruz, 1)} m)
            </text>
          </g>
        )}
        <text x={sx(xmin) + 6} y={sy(-1.6) + 4} fontSize={12} fill="#dc2626">
          superfície de ruptura
        </text>
        <text x={sx(xmin) + 6} y={sy(-1.6) + 18} fontSize={12} fill="#dc2626">
          crítica (com T)
        </text>

        {/* rótulos de material */}
        {camadas.map((c) => {
          const base = Math.max(c.base, yFundo)
          const esp = c.top - c.base
          const mole = (c.l.phi ?? 0) === 0
          const meio = (c.top + base) / 2
          const apoioFlag = c.i === e.apoio.indice ? ' · apoio da ficha' : ''
          const dados = mole
            ? `su ${fmt(c.l.c, 0)} kPa · γ ${fmt(c.l.gamma, 1)}`
            : `c' ${fmt(c.l.c, 0)} kPa · φ' ${fmt(c.l.phi ?? 0, 0)}° · γ ${fmt(c.l.gamma, 1)}`
          const xt = sx((p.x + xr) / 2)
          return (
            <g key={c.i} fill={mole ? '#3b556f' : '#6b7280'} textAnchor="middle">
              {esp >= 1.4 ? (
                <>
                  <text x={xt} y={sy(meio) - 4} fontSize={14} fontWeight={700}>
                    {c.l.name.toUpperCase()}
                    {apoioFlag}
                  </text>
                  <text x={xt} y={sy(meio) + 14} fontSize={12}>
                    {dados} · {fmt(esp, 1)} m
                  </text>
                </>
              ) : (
                <text x={xt} y={sy(meio) + 4} fontSize={12}>
                  {c.l.name} · {dados} · {fmt(esp, 1)} m{apoioFlag}
                </text>
              )}
            </g>
          )
        })}
        <text x={sx(p.x + 1.5)} y={sy(1.15)} fontSize={14} fontWeight={700} fill="#7a6212">
          ATERRO COMPACTADO
        </text>
        <text x={sx(p.x + 1.5)} y={sy(0.45)} fontSize={12} fill="#7a6212">
          c' {fmt(fill.c, 0)} kPa · φ' {fmt(fill.phi, 0)}° · γ {fmt(fill.gamma, 1)} kN/m³
        </text>

        {/* dimensões */}
        {dimV(xmax - 1.2, 0, H, `aterro ${fmt(H)} m`, 'esq')}
        {baseArgila < -0.05 && dimV(xmax - 1.2, baseArgila, 0, `até o apoio ${fmt(-baseArgila)} m`, 'esq')}
        {dimV(p.x - 4.5, yPonta, H, `L = ${fmt(H - yPonta)} m`, 'esq', true)}
        {dimV(p.x + 2.2, yPonta, baseArgila, fichaInviavel ? 'ficha > 25 m' : `ficha ${fmt(fichaDes)} m`, 'dir', true)}
        {dimV(xr - 1.8, -p.comprimentoReacao, yTieEnd + 0.4, `L = ${fmt(p.comprimentoReacao + yTieEnd + 0.4)} m`, 'esq')}
        <g>
          <line x1={sx(p.x)} y1={sy(-1.2)} x2={sx(xr)} y2={sy(-1.2)} stroke="#6b7280" strokeWidth={1} />
          {tick(sx(p.x), sy(-1.2))}
          {tick(sx(xr), sy(-1.2))}
          <text x={sx((p.x + xr) / 2)} y={sy(-1.2) + 16} fontSize={13} textAnchor="middle" fill="#1f2937">
            {fmt(p.distReacao)} m (cortina até estaca de reação)
          </text>
        </g>

        {/* legendas */}
        <text x={12} y={sy(yBeamTop) + 14} fontSize={13} fill="#1f2937">
          viga de coroamento
        </text>
        <text x={12} y={sy(yBeamTop) + 30} fontSize={13} fill="#1f2937">
          estacas Ø {fmt(p.diametro)} m c/c {fmt(p.espacamento)} m
        </text>
        <text x={12} y={sy(yBeamTop) + 50} fontSize={12} fill="#4b5563">
          painel de fechamento e
        </text>
        <text x={12} y={sy(yBeamTop) + 64} fontSize={12} fill="#4b5563">
          dreno geocomposto na face
        </text>
        <text x={sx(xr) + 18} y={sy(-p.comprimentoReacao / 2)} fontSize={13} fill="#1f2937">
          estaca de reação
        </text>
        <text x={sx(xr) + 18} y={sy(-p.comprimentoReacao / 2) + 16} fontSize={13} fill="#1f2937">
          Ø {fmt(p.diametroReacao)} m · FS lateral {Number.isFinite(e.fsReacao) ? fmt(e.fsReacao, 1) : '∞'}
        </text>

        {/* caixa de esforços */}
        <g transform={`translate(${W - 346} 14)`}>
          <rect width={334} height={caixaH} rx={8} fill="#fff" stroke="#d1d5db" />
          <text x={14} y={24} fontSize={14} fontWeight={700} fill="#b45309">
            SEÇÃO PRELIMINAR
          </text>
          <text x={14} y={44} fontSize={12} fill="#1f2937">
            M máx = {fmt(e.Mmax, 0)} kN·m · V = {fmt(e.Vengaste, 0)} kN / estaca
          </text>
          <text x={14} y={62} fontSize={12} fill="#1f2937">
            As ≈ {fmt(e.AsNec, 0)} cm² ({fmt(e.taxaAco * 100, 1)}%) · FS global {fmt(forca.fsFinal)}
          </text>
          <text x={14} y={80} fontSize={12} fill={fichaInviavel ? '#dc2626' : '#15803d'}>
            {fichaInviavel ? 'ficha: sem solução até 25 m' : `ficha dimensionada: ${fmt(fichaDes, 1)} m (FS ≥ 2,0)`}
          </text>
          <text x={14} y={98} fontSize={12} fill="#1f2937">
            tirante {fmt(e.Ftirante, 0)} kN/estaca · reação FS {Number.isFinite(e.fsReacao) ? fmt(e.fsReacao, 1) : '∞'}
          </text>
          {outrosErros.length > 0 && (
            <text x={14} y={116} fontSize={12} fontWeight={700} fill="#dc2626">
              ● há verificações não atendidas
            </text>
          )}
        </g>

        {/* planta da estaca */}
        <g transform={`translate(${W - 250} ${Ht - 136})`}>
          <rect width={236} height={122} rx={4} fill="#fff" stroke="#d1d5db" />
          <text x={14} y={22} fontSize={12} fill="#6b7280" letterSpacing={1}>
            PLANTA
          </text>
          {[0, 1, 2].map((i) => {
            const rr = Math.min(p.diametro * 22, 24)
            const passo = Math.max(p.espacamento * 44, rr * 2 + 2)
            return <circle key={i} cx={34 + rr + i * passo} cy={62} r={rr} fill="#9ca3af" stroke="#374151" />
          })}
          <text x={14} y={108} fontSize={12} fill="#1f2937">
            Ø {fmt(p.diametro)} m · c/c {fmt(p.espacamento)} m
          </text>
        </g>

        <text x={20} y={Ht - 12} fontSize={12} fill="#6b7280">
          Pré-dimensionamento. Medidas em metros, cotas relativas ao terreno natural (0,00). Não usar para execução.
        </text>
      </svg>
    </div>
  )
}
