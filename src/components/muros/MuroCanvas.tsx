import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { doMotor, type ModeloSecao } from '../../engine/muros/entrada'
import type { AvaliacaoSerial } from '../../engine/muros/serial'
import type { TipoMuro, XZ } from '../../engine/muros/tipos'
import { arcY } from '../../engine/slices'
import { FILL_COLOR } from '../slope/SlopeCanvas'

// Desenho da seção do muro nas cotas do Civil 3D (x a partir do platô, z
// absoluto): terreno natural, linha de projeto, corpo do muro, grampos, N.A.
// e a superfície de ruptura crítica. Opcionalmente sobrepõe a seção sugerida
// (tracejada). Coordenadas do SVG em metros, escala 1:1 (sem distorção).

export interface MuroCanvasHandle {
  svg: SVGSVGElement | null
}

interface Props {
  tipo: TipoMuro
  avaliacao: AvaliacaoSerial
  sugerida?: AvaliacaoSerial | null
  titulo?: string
}

const COR_CORPO: Record<TipoMuro, string> = {
  concreto: '#94a3b8',
  gabiao: '#a8875c',
  grampeado: '#94a3b8',
}

const pts = (lista: XZ[], zTopo: number) => lista.map(([x, z]) => `${x.toFixed(3)},${(zTopo - z).toFixed(3)}`).join(' ')

function linhaArquivo(m: ModeloSecao, linha: { x: number; y: number }[]): XZ[] {
  return linha.map((p) => doMotor(m, p)).sort((a, b) => a[0] - b[0])
}

/** Recorta a poligonal (x crescente) na janela [x0, x1], interpolando nas bordas. */
function recortar(linha: XZ[], x0: number, x1: number): XZ[] {
  const zEm = (x: number): number => {
    if (x <= linha[0][0]) return linha[0][1]
    for (let i = 0; i + 1 < linha.length; i++) {
      const [ax, az] = linha[i]
      const [bx, bz] = linha[i + 1]
      if (x >= ax && x <= bx) return bx === ax ? Math.max(az, bz) : az + ((x - ax) / (bx - ax)) * (bz - az)
    }
    return linha[linha.length - 1][1]
  }
  return [[x0, zEm(x0)], ...linha.filter(([x]) => x > x0 && x < x1), [x1, zEm(x1)]]
}

export const MuroCanvas = forwardRef<MuroCanvasHandle, Props>(function MuroCanvas({ tipo, avaliacao, sugerida, titulo }, ref) {
  const svgRef = useRef<SVGSVGElement>(null)
  useImperativeHandle(ref, () => ({ get svg() { return svgRef.current } }), [])

  const d = useMemo(() => {
    const m = avaliacao.modelo
    const g = avaliacao.global
    const secao = avaliacao.secao
    const arco: XZ[] = []
    if (g) {
      const n = 80
      for (let i = 0; i <= n; i++) {
        const x = g.x_left + ((g.x_right - g.x_left) * i) / n
        const y = arcY(x, g.circle)
        if (y != null) arco.push(doMotor(m, { x, y }))
      }
    }
    const xsBase = [...secao.talude, ...secao.corpo.flat(), ...secao.grampos.flat()].map(([x]) => x)
    const xsArco = arco.map(([x]) => x)
    const H = m.yMax - m.yMin
    const xMin = Math.min(...xsBase, ...xsArco) - Math.max(2, 0.15 * H)
    const xMax = Math.max(...xsBase, ...xsArco) + Math.max(2, 0.15 * H)
    const zs = [...secao.talude, ...secao.terreno, ...secao.corpo.flat(), ...arco].map(([, z]) => z)
    const zTopo = Math.max(...zs) + Math.max(1.5, 0.12 * H)
    const zFundo = Math.min(...zs) - Math.max(1.5, 0.15 * H)
    const linhaProj = recortar(linhaArquivo(m, m.linhaProjeto), xMin, xMax)
    const terreno = recortar(linhaArquivo(m, m.terreno), xMin, xMax)
    const naZ = Number.isFinite(avaliacao.waterY) ? avaliacao.waterY + m.zDatum : null
    const centro = g ? doMotor(m, { x: g.circle.xc, y: g.circle.yc }) : null
    const grampos = secao.grampos.map((gr, i) => ({ gr, info: g?.grampos[i] ?? null }))
    const sug = sugerida
      ? {
          linha: recortar(linhaArquivo(sugerida.modelo, sugerida.modelo.linhaProjeto), xMin, xMax),
          corpo: sugerida.secao.corpo,
          grampos: sugerida.secao.grampos,
        }
      : null
    return { arco, xMin, xMax, zTopo, zFundo, linhaProj, terreno, naZ, centro, grampos, sug, m }
  }, [avaliacao, sugerida])

  const w = d.xMax - d.xMin
  const h = d.zTopo - d.zFundo
  const fonte = Math.max(w, h) / 55
  const tr = (x: number, z: number) => [x, d.zTopo - z] as const

  // maciço: da linha de projeto até o fundo do desenho; o aterro é o trecho do maciço acima do terreno natural
  const macico = [...d.linhaProj, [d.xMax, d.zFundo] as XZ, [d.xMin, d.zFundo] as XZ]
  const acimaTerreno = [...d.terreno, [d.xMax, d.zTopo + 10] as XZ, [d.xMin, d.zTopo + 10] as XZ]
  const clipId = `clip-aterro-${avaliacao.secao.s}`

  return (
    <svg
      ref={svgRef}
      viewBox={`${d.xMin} 0 ${w} ${h}`}
      className="h-auto w-full rounded-md border border-border bg-surface"
      style={{ maxHeight: 520 }}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id={clipId}>
          <polygon points={pts(acimaTerreno, d.zTopo)} />
        </clipPath>
      </defs>

      {/* solo natural e aterro */}
      <polygon points={pts(macico, d.zTopo)} fill="var(--color-bg-elevated)" />
      <polygon points={pts(macico, d.zTopo)} fill={FILL_COLOR} fillOpacity={0.22} clipPath={`url(#${clipId})`} />
      <polyline points={pts(d.terreno, d.zTopo)} fill="none" stroke="var(--color-text-secondary)" strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />

      {/* N.A. */}
      {d.naZ != null && d.naZ > d.zFundo && d.naZ < d.zTopo && (
        <>
          <line x1={d.xMin} x2={d.xMax} y1={d.zTopo - d.naZ} y2={d.zTopo - d.naZ} stroke="var(--color-accent-blue)" strokeDasharray="6 4" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <text x={d.xMin + fonte} y={d.zTopo - d.naZ - fonte * 0.4} fontSize={fonte} fill="var(--color-accent-blue)">N.A.</text>
        </>
      )}

      {/* corpo do muro */}
      {avaliacao.secao.corpo.map((poly, i) => (
        <polygon key={i} points={pts(poly, d.zTopo)} fill={COR_CORPO[tipo]} fillOpacity={0.85} stroke="var(--color-text-primary)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      ))}

      {/* linha de projeto */}
      <polyline points={pts(d.linhaProj, d.zTopo)} fill="none" stroke="var(--color-text-primary)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />

      {/* grampos: inteiro fino; trecho ancorado além da superfície em verde */}
      {d.grampos.map(({ gr, info }, i) => {
        const [a, b] = gr
        const pm = info?.ponto ? doMotor(d.m, info.ponto) : null
        return (
          <g key={i}>
            <line x1={a[0]} y1={d.zTopo - a[1]} x2={b[0]} y2={d.zTopo - b[1]} stroke="var(--color-brand)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
            {pm && <line x1={pm[0]} y1={d.zTopo - pm[1]} x2={b[0]} y2={d.zTopo - b[1]} stroke="var(--color-accent-green)" strokeWidth={3} vectorEffect="non-scaling-stroke" />}
          </g>
        )
      })}

      {/* seção sugerida */}
      {d.sug && (
        <g opacity={0.9}>
          <polyline points={pts(d.sug.linha, d.zTopo)} fill="none" stroke="var(--color-accent-green)" strokeWidth={1.6} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          {d.sug.corpo.map((poly, i) => (
            <polygon key={i} points={pts(poly, d.zTopo)} fill="none" stroke="var(--color-accent-green)" strokeWidth={1.2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          ))}
          {d.sug.grampos.map(([a, b], i) => (
            <line key={i} x1={a[0]} y1={d.zTopo - a[1]} x2={b[0]} y2={d.zTopo - b[1]} stroke="var(--color-accent-green)" strokeWidth={1.2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      )}

      {/* superfície de ruptura crítica */}
      {d.arco.length > 1 && (
        <polyline points={pts(d.arco, d.zTopo)} fill="none" stroke="var(--color-accent-red)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      )}
      {d.centro && d.centro[1] < d.zTopo && (
        <circle cx={d.centro[0]} cy={d.zTopo - d.centro[1]} r={fonte * 0.25} fill="var(--color-accent-red)" />
      )}

      {/* rótulos */}
      <text x={d.xMin + fonte} y={fonte * 1.4} fontSize={fonte * 1.05} fontWeight={700} fill="var(--color-text-primary)">
        {titulo ?? `s = ${avaliacao.secao.s} · H = ${avaliacao.secao.H.toFixed(2)} m`}
      </text>
      {avaliacao.global && (
        <text x={d.xMin + fonte} y={fonte * 2.8} fontSize={fonte} fill="var(--color-accent-red)">
          {`FS global = ${avaliacao.global.FS.toFixed(3).replace('.', ',')}`}
        </text>
      )}
      {(() => {
        const [x, z] = tr(avaliacao.secao.pe_face[0], avaliacao.secao.pe_face[1])
        return <circle cx={x} cy={z} r={fonte * 0.2} fill="var(--color-text-primary)" />
      })()}
    </svg>
  )
})
