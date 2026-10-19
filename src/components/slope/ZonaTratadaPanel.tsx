import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { OrigemTag } from '../ui/OrigemTag'
import { NumberField } from '../forms/NumberField'
import { xCristaMotor, xLimUsuario, contornaZona } from '../../engine/zonaFundacao'
import {
  comparar,
  suParaFsAlvo,
  varreduraDist,
  varreduraDtr,
  varreduraSu,
  type Comparacao,
  type EntradaAnalise,
  type SuNecessario,
  type Varredura,
} from '../../engine/zonaVarredura'
import type { AnalysisResult, ZonaFundacao } from '../../engine/types'

interface Props {
  entrada: EntradaAnalise
  zona: ZonaFundacao
  result: AnalysisResult | null
}

const f = (n: number | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })

export function ZonaTratadaPanel({ entrada, zona, result }: Props) {
  const [comp, setComp] = useState<Comparacao | null>(null)
  const [varreduras, setVarreduras] = useState<Record<string, Varredura>>({})
  const [suNec, setSuNec] = useState<SuNecessario | null>(null)
  const [fsAlvo, setFsAlvo] = useState(1.5)
  const [rodando, setRodando] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const xLim = xLimUsuario(zona, xCristaMotor(entrada.geo))

  const rodar = async (id: string, fn: () => Promise<void>) => {
    setRodando(id)
    setErro(null)
    try {
      await fn()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na análise.')
    } finally {
      setRodando(null)
      setTexto('')
    }
  }
  const prog = (t: string, i: number, n: number) => setTexto(`${t} (${i}/${n})`)

  const botao = (id: string, rotulo: string, fn: () => Promise<void>) => (
    <button
      onClick={() => rodar(id, fn)}
      disabled={rodando != null}
      className="flex items-center gap-1 rounded-md border border-brand px-3 py-1.5 text-xs font-medium text-brand disabled:opacity-40"
    >
      {rodando === id && <Loader2 size={12} className="animate-spin" />} {rotulo}
    </button>
  )

  const circulos = result?.worst_circles ?? []

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        Fundação tratada · Zona A até x_lim = {f(xLim)} m
      </div>

      {circulos.length > 0 && result?.x_saida != null && (
        <div>
          <div className="mb-1 text-xs text-text-secondary">
            Círculos mais críticos <OrigemTag origem="CALCULADO" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead className="text-left text-text-secondary">
                <tr>
                  <th className="pr-2">#</th>
                  <th className="pr-2">FS</th>
                  <th className="pr-2">Centro (x; y)</th>
                  <th className="pr-2">R</th>
                  <th className="pr-2">Prof. máx.</th>
                  <th className="pr-2">Saída x (y=0)</th>
                  <th>% na Zona A</th>
                </tr>
              </thead>
              <tbody>
                {circulos.map((c) => {
                  const fora = (c.x_saida ?? 0) > xLim + 1e-6
                  return (
                    <tr key={c.rank} className="border-t border-border">
                      <td className="pr-2">{c.rank}</td>
                      <td className="pr-2">{f(c.FS, 3)}</td>
                      <td className="pr-2">
                        {f(xCristaMotor(entrada.geo) - c.circle.xc, 1)}; {f(c.circle.yc, 1)}
                      </td>
                      <td className="pr-2">{f(c.circle.R, 1)}</td>
                      <td className="pr-2">{f(c.prof_max, 1)} m</td>
                      <td className="pr-2">
                        {f(c.x_saida, 1)} m {fora ? '(fora da zona)' : '(dentro)'}
                      </td>
                      <td>{f(c.pct_zona_a, 0)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-1 text-[11px] text-text-secondary">
            Centro no referencial do usuário (x a partir da borda da plataforma). Descartados:{' '}
            {(result?.search_warnings ?? []).filter((w) => /descartado/.test(w)).join(' ') || 'nenhum'}
          </div>
          {contornaZona(zona, entrada.geo, result) && (
            <div className="mt-2 rounded border border-accent-amber/40 bg-accent-amber/10 p-2 text-xs text-accent-amber">
              O círculo crítico contorna a zona tratada (saída em x = {f(result.x_saida, 1)} m; {f(result.pct_zona_a, 0)}%
              do arco dentro da Zona A).
            </div>
          )}
        </div>
      )}

      {/* comparação */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          {botao('comparar', 'Comparar sem × com tratamento', async () =>
            setComp(await comparar(entrada, zona, prog))
          )}
          {rodando === 'comparar' && <span className="text-xs text-text-secondary">{texto}</span>}
        </div>
        {comp && (
          <table className="w-full font-mono text-xs">
            <thead className="text-left text-text-secondary">
              <tr>
                <th>Cenário</th>
                <th>FS</th>
                <th>Ganho</th>
                <th>Saída x</th>
                <th>% na Zona A</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td>Sem tratamento</td>
                <td>{f(comp.sem.FS, 3)}</td>
                <td>—</td>
                <td>{f(comp.sem.x_saida, 1)} m</td>
                <td>{f(comp.sem.pct_zona_a, 0)}%</td>
              </tr>
              <tr className="border-t border-border">
                <td>Com tratamento</td>
                <td>{f(comp.com.FS, 3)}</td>
                <td>
                  +{f(comp.ganho, 3)} ({f(comp.ganhoPct, 1)}%)
                </td>
                <td>{f(comp.com.x_saida, 1)} m</td>
                <td>{f(comp.com.pct_zona_a, 0)}%</td>
              </tr>
            </tbody>
          </table>
        )}
        {comp?.aviso && (
          <div className="mt-2 rounded border border-accent-amber/40 bg-accent-amber/10 p-2 text-xs text-accent-amber">
            Aviso: {comp.aviso}. FS = {f(comp.com.FS, 3)} (CALCULADO <OrigemTag origem="CALCULADO" />).
          </div>
        )}
      </div>

      {/* varreduras de sensibilidade */}
      <div>
        <div className="mb-2 text-xs text-text-secondary">
          Varreduras de sensibilidade <OrigemTag origem="CALCULADO" /> — cada ponto é uma busca do círculo crítico
          (grade rápida). As de su usam o modo direto (su equivalente).
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {botao('su', 'FS × su da Zona A', async () => {
            const v = await varreduraSu(entrada, zona, prog)
            setVarreduras((o) => ({ ...o, su: v }))
          })}
          {botao('dtr', 'FS × profundidade tratada', async () => {
            const v = await varreduraDtr(entrada, zona, prog)
            setVarreduras((o) => ({ ...o, dtr: v }))
          })}
          {botao('dist', 'FS × distância além do pé', async () => {
            const v = await varreduraDist(entrada, zona, prog)
            setVarreduras((o) => ({ ...o, dist: v }))
          })}
        </div>
        {rodando && rodando !== 'comparar' && rodando !== 'sunec' && (
          <div className="mt-1 text-xs text-text-secondary">{texto}</div>
        )}
        <div className="mt-3 space-y-4">
          {(['su', 'dtr', 'dist'] as const).map((id) => {
            const v = varreduras[id]
            return v ? <GraficoVarredura key={id} v={v} fsAlvo={fsAlvo} /> : null
          })}
        </div>
      </div>

      {/* su necessário */}
      <div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32">
            <NumberField
              label="FS alvo"
              value={fsAlvo}
              step={0.05}
              min={0.1}
              onChange={(v) => setFsAlvo(Number.isFinite(v) ? v : 1.5)}
            />
          </div>
          {botao('sunec', 'su necessário na Zona A', async () =>
            setSuNec(await suParaFsAlvo(entrada, zona, fsAlvo, prog))
          )}
          {rodando === 'sunec' && <span className="pb-2 text-xs text-text-secondary">{texto}</span>}
        </div>
        {suNec && (
          <div className="mt-2 space-y-1 font-mono text-xs">
            <div>
              FS com su natural ({f(suNec.suNatural, 1)} kPa): {f(suNec.fsNatural, 3)}
            </div>
            <div>
              Teto: su da Zona A muito alto ({f(suNec.suTeto, 0)} kPa, 10× o natural): FS = {f(suNec.fsTeto, 3)}{' '}
              <OrigemTag origem="CALCULADO" />
            </div>
            {suNec.suNecessario != null && (
              <div className="text-sm">
                su necessário para FS ≥ {f(suNec.fsAlvo)}: <b>{f(suNec.suNecessario, 1)} kPa</b> (FS conferido{' '}
                {f(suNec.fsFinal ?? undefined, 3)}) <OrigemTag origem="CALCULADO" />
              </div>
            )}
            {suNec.aviso && (
              <div className="rounded border border-accent-amber/40 bg-accent-amber/10 p-2 font-sans text-accent-amber">
                {suNec.aviso}
              </div>
            )}
          </div>
        )}
      </div>

      {erro && (
        <div className="rounded border border-accent-red/40 bg-accent-red/10 p-2 text-xs text-accent-red">{erro}</div>
      )}
    </div>
  )
}

function GraficoVarredura({ v, fsAlvo }: { v: Varredura; fsAlvo: number }) {
  const W = 360
  const H = 170
  const m = { l: 38, r: 10, t: 10, b: 28 }
  const pts = v.pontos
  const normais = pts.filter((p) => !p.referencia)
  const xs = pts.map((p) => p.x)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const fs = pts.map((p) => p.FS)
  const y0 = Math.floor(Math.min(...fs, fsAlvo) * 10) / 10 - 0.05
  const y1 = Math.ceil(Math.max(...fs, fsAlvo) * 10) / 10 + 0.05
  const X = (x: number) => m.l + ((x - x0) / (x1 - x0 || 1)) * (W - m.l - m.r)
  const Y = (y: number) => H - m.b - ((y - y0) / (y1 - y0 || 1)) * (H - m.t - m.b)
  const linha = normais.map((p) => `${X(p.x)},${Y(p.FS)}`).join(' ')
  const ticksY = [y0, (y0 + y1) / 2, y1]

  return (
    <div>
      <div className="mb-1 text-xs font-medium text-text-primary">{v.titulo}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md">
        {ticksY.map((t, i) => (
          <g key={i}>
            <line x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} stroke="var(--color-border)" strokeWidth={0.5} />
            <text x={m.l - 4} y={Y(t) + 3} textAnchor="end" fontSize={9} fill="var(--color-text-secondary)">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        <line
          x1={m.l}
          x2={W - m.r}
          y1={Y(fsAlvo)}
          y2={Y(fsAlvo)}
          stroke="var(--color-accent-amber)"
          strokeWidth={0.8}
          strokeDasharray="4 3"
        />
        <text x={W - m.r} y={Y(fsAlvo) - 2} textAnchor="end" fontSize={8} fill="var(--color-accent-amber)">
          FS alvo {fsAlvo.toFixed(2)}
        </text>
        <polyline points={linha} fill="none" stroke="var(--color-brand)" strokeWidth={1.5} />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={X(p.x)}
            cy={Y(p.FS)}
            r={3}
            fill={p.referencia ? 'var(--color-accent-red)' : 'var(--color-brand)'}
          />
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--color-text-secondary)">
          {v.eixoX}
        </text>
      </svg>
      <table className="w-full font-mono text-xs">
        <thead className="text-left text-text-secondary">
          <tr>
            <th>{v.eixoX}</th>
            <th>FS</th>
            <th>Saída x</th>
            <th>% na Zona A</th>
          </tr>
        </thead>
        <tbody>
          {pts.map((p, i) => (
            <tr key={i} className="border-t border-border">
              <td>
                {f(p.x, 1)}
                {p.referencia && <span className="ml-1 font-sans text-accent-red">(su 10× o natural: teto)</span>}
              </td>
              <td>{f(p.FS, 3)}</td>
              <td>{f(p.x_saida, 1)} m</td>
              <td>{f(p.pct_zona_a, 0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
