import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Play } from 'lucide-react'
import {
  alertasFaixa,
  FAIXA_PADRAO,
  fsComFaixa,
  razaoAreas,
  varrerFaixa,
  type ColchaoGeogrelha,
  type FaixaColunas,
  type LinhaVarredura,
  type ResultadoFaixa,
} from '../../engine/argilaMole/faixaColunas'
import type { FaceCoverage, FillMaterial, Layer, SlopeGeometry } from '../../engine/types'
import { usePersistedState } from '../../lib/persist'
import { NumberField } from '../forms/NumberField'

// Pré-dimensionamento de solução sobre argila mole: faixa de colunas (CMC ou
// brita) com colchão de geogrelha. O perfil, as camadas e o aterro vêm da
// Nova Análise (mesmo navegador); aqui só se define a faixa.

const CARD = 'rounded-lg border border-border bg-surface p-4'
const SELECT =
  'w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-brand focus:outline-none'
const BTN_PRIMARIO =
  'flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50'
const FS_ALVO = 1.5

const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',')

function lerAnalise<T>(chave: string): T | null {
  try {
    const raw = localStorage.getItem('miso4slope:analise:' + chave)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function ArgilaMolePanel() {
  const geo = useMemo(() => lerAnalise<SlopeGeometry>('geometry'), [])
  const layers = useMemo(() => lerAnalise<Layer[]>('layers'), [])
  const fill = useMemo(() => lerAnalise<FillMaterial>('fill'), [])
  const coverage = useMemo(() => lerAnalise<FaceCoverage>('coverage') ?? undefined, [])

  const [faixa, setFaixa] = usePersistedState<FaixaColunas>('miso4slope.argila.faixa', FAIXA_PADRAO)
  const [colchao, setColchao] = usePersistedState<ColchaoGeogrelha>('miso4slope.argila.colchao', { espessura: 0.8, T: 0 })
  const f = { ...FAIXA_PADRAO, ...faixa }

  const [rodando, setRodando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sem, setSem] = useState<ResultadoFaixa | null>(null)
  const [com, setCom] = useState<ResultadoFaixa | null>(null)
  const [tabela, setTabela] = useState<LinhaVarredura[] | null>(null)

  const set = <K extends keyof FaixaColunas>(k: K, v: FaixaColunas[K]) => setFaixa({ ...f, [k]: v })
  const alertas = layers ? alertasFaixa(layers, f) : []
  const m = razaoAreas(f)

  if (!geo || !layers || !fill) {
    return (
      <div className={CARD}>
        Abra a <span className="font-medium">Nova Análise</span>, defina a geometria do aterro, as camadas (CPTu) e o
        material do aterro; este painel usa esses dados.
      </div>
    )
  }

  const colchaoAtivo = colchao.T > 0 ? colchao : null

  const calcular = async () => {
    setRodando(true)
    setErro(null)
    setTabela(null)
    try {
      setProgresso('Sem tratamento…')
      const r0 = await fsComFaixa(geo, layers, fill, coverage, undefined, null, null)
      setSem(r0)
      setProgresso('Com a faixa…')
      setCom(await fsComFaixa(geo, layers, fill, coverage, undefined, f, colchaoAtivo))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro no cálculo.')
    } finally {
      setRodando(false)
      setProgresso('')
    }
  }

  const varrer = async () => {
    setRodando(true)
    setErro(null)
    try {
      const larguras = [4, 6, 8, 10, 12, 15, 20]
      const malhas = [f.malha * 0.8, f.malha, f.malha * 1.25]
      const t = await varrerFaixa(geo, layers, fill, coverage, f, colchaoAtivo, larguras, malhas, FS_ALVO, (a, b) =>
        setProgresso(`Varredura ${a}/${b}…`)
      )
      setTabela(t)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na varredura.')
    } finally {
      setRodando(false)
      setProgresso('')
    }
  }

  const sus = layers.filter((l) => (l.phi ?? 0) === 0).map((l) => l.c)

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          Dados vindos da Nova Análise
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary md:grid-cols-4">
          <div>
            Altura do aterro: <span className="font-mono text-text-primary">{fmt(geo.total_height)} m</span>
          </div>
          <div>
            Talude H:V: <span className="font-mono text-text-primary">{fmt(geo.slope_ratio, 1)}</span>
          </div>
          <div>
            Sobrecarga: <span className="font-mono text-text-primary">{fmt(geo.surcharge_q ?? 0, 0)} kPa</span>
          </div>
          <div>
            Condição:{' '}
            <span className="text-text-primary">
              {geo.analysis_condition === 'undrained' ? 'não drenada' : 'drenada'}
            </span>
          </div>
          <div>
            Camadas: <span className="font-mono text-text-primary">{layers.length}</span>
          </div>
          <div>
            su (φ = 0):{' '}
            <span className="font-mono text-text-primary">
              {sus.length ? `${fmt(Math.min(...sus), 0)} a ${fmt(Math.max(...sus), 0)} kPa` : '—'}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-text-secondary">
          Para alterar perfil, camadas ou sobrecarga, edite na Nova Análise e volte aqui.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Faixa de colunas sob o pé
          </div>
          <label className="mb-3 block">
            <span className="mb-1 block text-xs text-text-secondary">Tipo</span>
            <select
              value={f.tipo}
              onChange={(e) => {
                const tipo = e.target.value as FaixaColunas['tipo']
                setFaixa({
                  ...f,
                  tipo,
                  diametro: tipo === 'cmc' ? 0.4 : 0.8,
                  malha: tipo === 'cmc' ? 2 : 2.5,
                  gamma_col: tipo === 'cmc' ? 24 : 19,
                })
              }}
              className={SELECT}
            >
              <option value="brita">Colunas de brita</option>
              <option value="cmc">CMC (coluna modulada, concreto)</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="À frente do pé" value={f.frente} step={0.5} min={0} suffix="m" onChange={(v) => set('frente', v)} />
            <NumberField label="Largura da faixa" value={f.largura} step={0.5} min={1} suffix="m" onChange={(v) => set('largura', v)} />
            <NumberField label="Comprimento das colunas" value={f.comprimento} step={0.5} min={1} suffix="m" onChange={(v) => set('comprimento', v)} />
            <NumberField label="Diâmetro" value={f.diametro} step={0.05} min={0.1} suffix="m" onChange={(v) => set('diametro', v)} />
            <NumberField label="Malha (espaçamento)" value={f.malha} step={0.25} min={0.5} suffix="m" onChange={(v) => set('malha', v)} />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Arranjo</span>
              <select
                value={f.arranjo}
                onChange={(e) => set('arranjo', e.target.value as FaixaColunas['arranjo'])}
                className={SELECT}
              >
                <option value="quadrado">Quadrado</option>
                <option value="triangular">Triangular</option>
              </select>
            </label>
            {f.tipo === 'brita' ? (
              <>
                <NumberField label="φ da brita" value={f.phi_col} step={1} suffix="°" onChange={(v) => set('phi_col', v)} />
                <NumberField label="n (concentração de tensão)" value={f.n_stress} step={0.5} min={1} onChange={(v) => set('n_stress', v)} />
              </>
            ) : (
              <NumberField
                label="Resistência ao cisalhamento do CMC"
                value={f.tau_col}
                step={10}
                min={0}
                suffix="kPa"
                onChange={(v) => set('tau_col', v)}
              />
            )}
            <NumberField label="γ da coluna" value={f.gamma_col} step={0.5} suffix="kN/m³" onChange={(v) => set('gamma_col', v)} />
          </div>
          <div className="mt-3 text-xs text-text-secondary">
            Razão de substituição m = <span className="font-mono text-text-primary">{(m * 100).toFixed(1).replace('.', ',')}%</span>
          </div>
        </div>

        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Colchão de brita com geogrelha
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Espessura do colchão" value={colchao.espessura} step={0.1} min={0.2} suffix="m" onChange={(v) => setColchao({ ...colchao, espessura: v })} />
            <NumberField
              label="Resistência de projeto T (0 = sem geogrelha)"
              value={colchao.T}
              step={10}
              min={0}
              suffix="kN/m"
              onChange={(v) => setColchao({ ...colchao, T: v })}
            />
            <NumberField
              label="Reforço além da crista"
              value={colchao.alem_crista ?? 10}
              step={1}
              min={0}
              suffix="m"
              onChange={(v) => setColchao({ ...colchao, alem_crista: v })}
            />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-text-secondary">
            A geogrelha só entra no equilíbrio onde a superfície de ruptura a cruza com ancoragem suficiente; o
            arrancamento limita a força mobilizada.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={calcular} disabled={rodando} className={BTN_PRIMARIO}>
              {rodando ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Calcular
            </button>
            <button
              onClick={varrer}
              disabled={rodando}
              className="rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              Varrer largura × malha
            </button>
            {progresso && <span className="text-xs text-text-secondary">{progresso}</span>}
          </div>
          {erro && <div className="mt-2 text-xs text-accent-red">{erro}</div>}
        </div>
      </div>

      {(sem || com) && (
        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">Resultado</div>
          <div className="grid grid-cols-3 gap-4 font-mono">
            <div>
              <div className="font-sans text-xs text-text-secondary">Sem tratamento</div>
              <div className={`text-2xl font-bold ${sem && sem.FS >= FS_ALVO ? 'text-accent-green' : 'text-accent-red'}`}>
                {sem ? fmt(sem.FS, 3) : '—'}
              </div>
            </div>
            <div>
              <div className="font-sans text-xs text-text-secondary">Com a faixa{colchaoAtivo ? ' + geogrelha' : ''}</div>
              <div className={`text-2xl font-bold ${com && com.FS >= FS_ALVO ? 'text-accent-green' : 'text-accent-red'}`}>
                {com ? fmt(com.FS, 3) : '—'}
              </div>
            </div>
            <div>
              <div className="font-sans text-xs text-text-secondary">Ganho / alvo</div>
              <div className="text-2xl font-bold text-text-primary">
                {sem && com ? `${com.FS - sem.FS >= 0 ? '+' : ''}${fmt(com.FS - sem.FS, 3)}` : '—'}
              </div>
              <div className="font-sans text-xs text-text-secondary">FS exigido ≥ {fmt(FS_ALVO)}</div>
            </div>
          </div>
          {com && (
            <p className="mt-2 text-xs text-text-secondary">
              Círculo crítico com a faixa: xc {fmt(com.result.circle.xc)}, yc {fmt(com.result.circle.yc)}, R{' '}
              {fmt(com.result.circle.R)} m, de x = {fmt(com.result.x_left, 1)} a {fmt(com.result.x_right, 1)} m.
              {com.FS < FS_ALVO && ' Não atinge o FS exigido com esta faixa.'}
            </p>
          )}
        </div>
      )}

      {tabela && (
        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
            FS por largura da faixa × malha
          </div>
          <table className="w-full font-mono text-xs">
            <thead className="text-text-secondary">
              <tr className="border-b border-border text-left">
                <th className="py-1">Largura (m)</th>
                <th>Malha (m)</th>
                <th className="text-right">m</th>
                <th className="text-right">FS</th>
                <th className="text-right">Alvo</th>
              </tr>
            </thead>
            <tbody>
              {tabela.map((l, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-1">{fmt(l.largura, 0)}</td>
                  <td>{fmt(l.malha)}</td>
                  <td className="text-right">{(l.m * 100).toFixed(1).replace('.', ',')}%</td>
                  <td className={`text-right ${l.atende ? 'text-accent-green' : 'text-accent-red'}`}>{fmt(l.FS, 3)}</td>
                  <td className="text-right">{l.atende ? 'atende' : 'não'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={CARD}>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          <AlertTriangle size={14} className="text-accent-amber" /> O que este pré-dimensionamento não cobre
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-text-secondary">
          {alertas.map((a, i) => (
            <li key={i}>{a.texto}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
