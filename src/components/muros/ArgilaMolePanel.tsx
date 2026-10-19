import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FileDown, Loader2, Play } from 'lucide-react'
import {
  alertasColuna,
  alertasFaixa,
  circuloAtravessaFaixa,
  comTipo,
  contextoColuna,
  FAIXA_PADRAO,
  fsComFaixa,
  ganhoRapido,
  N_PADRAO,
  NOME_TIPO,
  normalizaFaixa,
  pesDoTalude,
  tauColuna,
  tipoEfetivo,
  TIPOS_COLUNA,
  varrerFaixa,
  verificarColuna,
  type Alerta,
  type ColchaoGeogrelha,
  type FaixaColunas,
  type LinhaVarredura,
  type ResultadoFaixa,
  type TipoColuna,
} from '../../engine/argilaMole/faixaColunas'
import type { FaceCoverage, FillMaterial, Layer, SlopeGeometry } from '../../engine/types'
import { usePersistedState } from '../../lib/persist'
import { NumberField } from '../forms/NumberField'
import { FaixaCroqui } from './FaixaCroqui'
import { lerPrecosPremissas, OrcamentoCard } from './OrcamentoCard'
import { quantFaixa } from '../../engine/quantitativos'
import { baixarRelatorioContencao, relatorioFaixa } from '../../lib/relatoriosContencao'

// Pré-dimensionamento de solução sobre argila mole: faixa de colunas (brita,
// brita encamisada ou coluna rígida) com colchão de geogrelha. O perfil, as camadas e o aterro vêm da
// Nova Análise (mesmo navegador); aqui só se define a faixa.

const CARD = 'rounded-lg border border-border bg-surface p-4'
const SELECT =
  'w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-brand focus:outline-none'
const BTN_PRIMARIO =
  'flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50'
const FS_ALVO = 1.5

const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',')

type Origem = 'LIDO' | 'CALCULADO' | 'EMPÍRICO' | 'HIPÓTESE'
const COR_ORIGEM: Record<Origem, string> = {
  LIDO: 'border-accent-green text-accent-green',
  CALCULADO: 'border-border text-text-secondary',
  EMPÍRICO: 'border-brand text-brand',
  HIPÓTESE: 'border-accent-amber text-accent-amber',
}
function Selo({ o }: { o: Origem }) {
  return <span className={`ml-2 rounded border px-1 py-px font-sans text-[9px] font-medium ${COR_ORIGEM[o]}`}>{o}</span>
}
function AlertaBox({ a }: { a: Alerta }) {
  return (
    <p className={`rounded-md border p-2 text-xs ${a.nivel === 'erro' ? 'border-accent-red text-accent-red' : 'border-accent-amber text-accent-amber'}`}>
      {a.texto}
    </p>
  )
}

function lerAnalise<T>(chave: string): T | null {
  try {
    const raw = localStorage.getItem('miso4slope:analise:' + chave)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export interface EstadoFaixa {
  sem: ResultadoFaixa | null
  com: ResultadoFaixa | null
  tabela: LinhaVarredura[] | null
  snap: { f: FaixaColunas; colchao: ColchaoGeogrelha } | null
  fsTipos?: Partial<Record<TipoColuna, number>> // FS do Bishop com a faixa de cada tipo (mesmos d, s, largura)
  fsSemGeo?: number | null // FS do Bishop com a faixa, sem a geogrelha (para comparar com o ΔFS rápido)
}

// inicial: resultado de um estudo salvo reaberto; aoMudar: avisa a página (para salvar o estudo)
export function ArgilaMolePanel({ inicial, aoMudar }: { inicial?: EstadoFaixa | null; aoMudar?: (e: EstadoFaixa | null) => void } = {}) {
  const geo = useMemo(() => lerAnalise<SlopeGeometry>('geometry'), [])
  const layers = useMemo(() => lerAnalise<Layer[]>('layers'), [])
  const fill = useMemo(() => lerAnalise<FillMaterial>('fill'), [])
  const coverage = useMemo(() => lerAnalise<FaceCoverage>('coverage') ?? undefined, [])

  const [faixa, setFaixa] = usePersistedState<FaixaColunas>('miso4slope.argila.faixa', FAIXA_PADRAO)
  const [colchao, setColchao] = usePersistedState<ColchaoGeogrelha>('miso4slope.argila.colchao', { espessura: 0.8, T: 0 })
  const f = normalizaFaixa(faixa)

  const [rodando, setRodando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sem, setSem] = useState<ResultadoFaixa | null>(inicial?.sem ?? null)
  const [com, setCom] = useState<ResultadoFaixa | null>(inicial?.com ?? null)
  const [tabela, setTabela] = useState<LinhaVarredura[] | null>(inicial?.tabela ?? null)
  // entradas usadas no último cálculo (o croqui precisa bater com o resultado mostrado)
  const [snap, setSnap] = useState<{ f: FaixaColunas; colchao: ColchaoGeogrelha } | null>(inicial?.snap ?? null)
  const [fsTipos, setFsTipos] = useState<Partial<Record<TipoColuna, number>>>(inicial?.fsTipos ?? {})
  const [fsSemGeo, setFsSemGeo] = useState<number | null>(inicial?.fsSemGeo ?? null)
  useEffect(() => {
    aoMudar?.(sem || com ? { sem, com, tabela, snap, fsTipos, fsSemGeo } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sem, com, tabela, snap, fsTipos, fsSemGeo])

  const set = <K extends keyof FaixaColunas>(k: K, v: FaixaColunas[K]) => setFaixa({ ...f, [k]: v })
  const alertas = layers ? alertasFaixa(layers, f) : []
  const tipo = tipoEfetivo(f)

  if (!geo || !layers || !fill) {
    return (
      <div className={CARD}>
        Abra a <span className="font-medium">Nova Análise</span>, defina a geometria do aterro, as camadas (CPTu) e o
        material do aterro; este painel usa esses dados.
      </div>
    )
  }

  const colchaoAtivo = colchao.T > 0 ? colchao : null
  const ctx = contextoColuna(geo, layers, fill, f)
  const ver = verificarColuna(f, ctx.su, ctx.sigmaV)
  const alertasCol = alertasColuna(ver, ctx.su, colchaoAtivo != null)
  // resultado do último cálculo (o que foi calculado, não o que está nos campos agora)
  const fr = snap ? normalizaFaixa(snap.f) : f
  const rapido = sem ? ganhoRapido(sem.result, fr, ctx.su, ctx.sigmaV, ctx.gammaArgila) : null
  const dFsBishop = sem && com ? (fsSemGeo ?? com.FS) - sem.FS : null
  const difRapido = rapido && dFsBishop != null && Math.abs(dFsBishop) > 1e-6 ? Math.abs(rapido.deltaFS - dFsBishop) / Math.abs(dFsBishop) : null

  const calcular = async () => {
    setRodando(true)
    setErro(null)
    setTabela(null)
    try {
      setProgresso('Sem tratamento…')
      const r0 = await fsComFaixa(geo, layers, fill, coverage, undefined, null, null)
      setSem(r0)
      setSnap({ f, colchao })
      setProgresso('Com a faixa…')
      const r1 = await fsComFaixa(geo, layers, fill, coverage, undefined, f, colchaoAtivo)
      const fsT: Partial<Record<TipoColuna, number>> = { [tipo]: r1.FS }
      let semGeo: number | null = null
      if (colchaoAtivo) {
        setProgresso('Com a faixa, sem geogrelha…')
        semGeo = (await fsComFaixa(geo, layers, fill, coverage, undefined, f, null)).FS
      }
      for (const t of TIPOS_COLUNA) {
        if (t === tipo) continue
        setProgresso(`Comparando: ${NOME_TIPO[t]}…`)
        fsT[t] = (await fsComFaixa(geo, layers, fill, coverage, undefined, comTipo(f, t), colchaoAtivo)).FS
      }
      setFsTipos(fsT)
      setFsSemGeo(semGeo)
      setCom(r1)
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
          <div>
            su usado na coluna: <span className="font-mono text-text-primary">{fmt(ctx.su, 0)} kPa</span>
            <Selo o="LIDO" />
          </div>
          <div>
            γ da argila: <span className="font-mono text-text-primary">{fmt(ctx.gammaArgila, 1)} kN/m³</span>
            <Selo o="LIDO" />
          </div>
          <div className="col-span-2">
            σv de topo = γ·H + q = <span className="font-mono text-text-primary">{fmt(ctx.sigmaV, 1)} kPa</span>
            <Selo o="CALCULADO" />
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
            <span className="mb-1 block text-xs text-text-secondary">Tipo de coluna</span>
            <select
              value={tipo}
              onChange={(e) => {
                const t = e.target.value as TipoColuna
                setFaixa({ ...f, tipo: t, n_stress: N_PADRAO[t], gamma_col: t === 'rigida' ? 24 : 19 })
              }}
              className={SELECT}
            >
              {TIPOS_COLUNA.map((t) => (
                <option key={t} value={t}>
                  {NOME_TIPO[t]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Faixa posicionada no pé de</span>
              <select value={f.xRef} onChange={(ev) => set('xRef', Number(ev.target.value))} className={SELECT}>
                {pesDoTalude(geo).map((xp, i) => (
                  <option key={i} value={xp}>
                    {i === 0 ? 'talude inferior' : `bancada ${i + 1}`} (x = {fmt(xp, 1)} m)
                  </option>
                ))}
              </select>
            </label>
            <NumberField label="À frente do pé" value={f.frente} step={0.5} suffix="m" onChange={(v) => set('frente', v)} />
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
            {tipo !== 'rigida' && (
              <NumberField label="φ da brita" value={f.phi_col} step={1} suffix="°" onChange={(v) => set('phi_col', v)} />
            )}
            <NumberField label="n (concentração de tensões) · HIPÓTESE" value={f.n_stress} step={0.5} min={1} onChange={(v) => set('n_stress', v)} />
            {tipo !== 'rigida' && (
              <NumberField label="σh0 no solo mole · HIPÓTESE" value={f.sigma_h0} step={5} min={0} suffix="kPa" onChange={(v) => set('sigma_h0', v)} />
            )}
            {tipo === 'gec' && (
              <>
                <NumberField label="Rigidez J da meia · HIPÓTESE" value={f.J} step={100} min={0} suffix="kN/m" onChange={(v) => set('J', v)} />
                <NumberField label="εr admissível · HIPÓTESE" value={f.eps_r} step={0.5} min={0} suffix="%" onChange={(v) => set('eps_r', v)} />
                <NumberField label="T_ult da meia · HIPÓTESE" value={f.T_ult} step={10} min={0} suffix="kN/m" onChange={(v) => set('T_ult', v)} />
                <NumberField label="FS_fl (fluência) · HIPÓTESE" value={f.FS_fl} step={0.1} min={1} onChange={(v) => set('FS_fl', v)} />
              </>
            )}
            {tipo === 'rigida' && (
              <>
                <NumberField label="fck da coluna" value={f.fck} step={1} min={1} suffix="MPa" onChange={(v) => set('fck', v)} />
                <NumberField label="Eficiência ao cisalhamento η · HIPÓTESE" value={f.eta} step={0.05} min={0} onChange={(v) => set('eta', v)} />
                <NumberField
                  label="τ_col (0,1·fck·1000)"
                  value={tauColuna(f)}
                  step={50}
                  min={0}
                  suffix="kPa"
                  computed={!f.tau_manual}
                  onChange={(v) => setFaixa({ ...f, tau_col: v, tau_manual: true })}
                />
              </>
            )}
            <NumberField label="γ da coluna" value={f.gamma_col} step={0.5} suffix="kN/m³" onChange={(v) => set('gamma_col', v)} />
          </div>
          {f.tau_manual && tipo === 'rigida' && (
            <button onClick={() => setFaixa({ ...f, tau_manual: false })} className="mt-2 text-[11px] text-brand">
              voltar a τ_col = 0,1·fck·1000
            </button>
          )}
        </div>

        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Colchão de brita com geogrelha
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Espessura do colchão (informativa: não altera o FS)" value={colchao.espessura} step={0.1} min={0.2} suffix="m" onChange={(v) => setColchao({ ...colchao, espessura: v })} />
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
            O colchão de brita é a plataforma de trabalho e de transferência de carga para as colunas; a geogrelha dentro
            dele é o que entra no cálculo, como força horizontal T. Com T = 0 não há geogrelha e o colchão não altera o
            FS. A espessura do colchão, seu peso e sua resistência própria não são modelados. A geogrelha só age onde a
            superfície de ruptura a cruza com ancoragem suficiente (aumente "Reforço além da crista" para alcançar
            círculos profundos); o arrancamento limita a força mobilizada.
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


      <div className={CARD}>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          Verificação da coluna: {NOME_TIPO[tipo]}
        </div>
        <table className="w-full font-mono text-xs">
          <tbody>
            {(
              [
                ['Razão de substituição a', fmt(ver.a, 4), 'CALCULADO'],
                ['μc (tensão na coluna)', fmt(ver.muC, 2), 'CALCULADO'],
                ['μs (tensão no solo)', fmt(ver.muS, 3), 'CALCULADO'],
                ...(tipo === 'rigida'
                  ? [
                      ['τ_col', `${fmt(ver.tauCol, 0)} kPa`, f.tau_manual ? 'HIPÓTESE' : 'EMPÍRICO'],
                      ['c_comp = (1 − a)·su + a·η·τ_col', `${fmt(ver.cComp + f.eta * ver.a * ver.tauCol, 1)} kPa`, 'CALCULADO'],
                    ]
                  : [
                      ['c_comp = (1 − a)·su', `${fmt(ver.cComp, 1)} kPa`, 'CALCULADO'],
                      ['φ_comp (tan φ = a·μc·tan φc)', `${fmt(ver.phiComp, 1)}°`, 'CALCULADO'],
                    ]),
                ['σ_col = μc·σv', `${fmt(ver.sigmaCol, 0)} kPa`, 'CALCULADO'],
                ...(tipo === 'rigida'
                  ? [['fck/1,4 (admissível)', `${fmt(ver.qUlt, 0)} kPa`, 'EMPÍRICO']]
                  : [
                      ...(tipo === 'gec' ? [['Δσr = J·εr/r', `${fmt(ver.deltaSigmaR!, 0)} kPa`, 'HIPÓTESE']] : []),
                      ['σr,lim = σh0 + 4·su' + (tipo === 'gec' ? ' + Δσr' : ''), `${fmt(ver.sigmaRLim!, 0)} kPa`, 'EMPÍRICO'],
                      ['Kp,c = tan²(45° + φc/2)', fmt(ver.kp!, 2), 'CALCULADO'],
                      ['q_ult = Kp,c·σr,lim', `${fmt(ver.qUlt, 0)} kPa`, 'EMPÍRICO'],
                    ]),
                ['FS da coluna', fmt(ver.fsColuna, 2), 'CALCULADO'],
                ...(tipo === 'gec'
                  ? [
                      ['Tração na meia T = Δσr·r', `${fmt(ver.tracaoMeia!, 1)} kN/m`, 'HIPÓTESE'],
                      ['T / (T_ult/FS_fl)', `${fmt(ver.razaoTracao!, 2)} (${ver.razaoTracao! <= 1 ? 'atende' : 'não atende'})`, 'HIPÓTESE'],
                    ]
                  : []),
                ['Redução do recalque (1 − μs)', `${fmt(ver.reducaoRecalque * 100, 0)}%`, 'EMPÍRICO'],
              ] as [string, string, Origem][]
            ).map(([k, v, o]) => (
              <tr key={k} className="border-b border-border last:border-0">
                <td className="py-1 pr-2 font-sans text-text-secondary">{k}</td>
                <td className={`text-right ${k === 'FS da coluna' ? (ver.fsColuna < 1.5 ? 'text-accent-red' : ver.fsColuna < 2 ? 'text-accent-amber' : 'text-accent-green') : 'text-text-primary'}`}>{v}</td>
                <td className="w-24 text-right">
                  <Selo o={o} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 space-y-2">
          {alertasCol.map((a, i) => (
            <AlertaBox key={i} a={a} />
          ))}
        </div>
      </div>

      <OrcamentoCard
        titulo="Quantitativos e custo por metro linear"
        chave="faixa"
        rotulo={`Faixa de colunas: ${NOME_TIPO[tipo]}`}
        calcular={(prem) => ({ quant: quantFaixa(f, colchao, geo, layers, prem) })}
      />

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
          {com && !circuloAtravessaFaixa(com.result, f) && (
            <p className="mt-2 rounded-md border border-accent-red p-2 text-xs text-accent-red">
              O círculo crítico (x de {fmt(com.result.x_left, 1)} a {fmt(com.result.x_right, 1)} m) não passa pela faixa
              (x de {fmt(f.xRef - f.frente, 1)} a {fmt(f.xRef - f.frente + f.largura, 1)} m). Por isso malha, diâmetro e
              largura não alteram o FS: o mecanismo que governa está fora da faixa. Posicione a faixa sob esse
              mecanismo (campo "Faixa posicionada no pé de") ou trate-o por outra solução.
            </p>
          )}
        </div>
      )}


      {sem && com && snap && (
        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Ganho de FS: Bishop × fórmula rápida
          </div>
          <div className="grid grid-cols-2 gap-4 font-mono md:grid-cols-4">
            <div>
              <div className="font-sans text-xs text-text-secondary">FS sem faixa (Bishop)</div>
              <div className="text-xl font-bold">{fmt(sem.FS, 3)}</div>
            </div>
            <div>
              <div className="font-sans text-xs text-text-secondary">FS com faixa (Bishop)</div>
              <div className="text-xl font-bold">{fmt(com.FS, 3)}</div>
            </div>
            <div>
              <div className="font-sans text-xs text-text-secondary">
                ΔFS Bishop{colchaoAtivo && fsSemGeo != null ? ' (sem geogrelha)' : ''}
              </div>
              <div className="text-xl font-bold">{dFsBishop != null ? fmt(dFsBishop, 3) : '—'}</div>
            </div>
            <div>
              <div className="font-sans text-xs text-text-secondary">
                ΔFS rápido <Selo o="EMPÍRICO" />
              </div>
              <div className="text-xl font-bold">{rapido ? fmt(rapido.deltaFS, 3) : '—'}</div>
            </div>
          </div>
          {rapido ? (
            <p className="mt-2 text-xs text-text-secondary">
              ΔFS = Δτ·L·R/M_d, com Δτ = {fmt(rapido.deltaTau, 1)} kPa (σv no plano = {fmt(rapido.sigmaVPlano, 0)} kPa), L_faixa = {fmt(rapido.lFaixa, 1)} m, R = {fmt(rapido.R, 1)} m e M_d = {fmt(rapido.Md, 0)} kN·m/m do círculo crítico sem faixa.
            </p>
          ) : (
            <p className="mt-2 text-xs text-text-secondary">O círculo crítico sem faixa não cruza a faixa: o ΔFS rápido não se aplica.</p>
          )}
          {difRapido != null && difRapido > 0.25 && (
            <div className="mt-2">
              <AlertaBox
                a={{
                  nivel: 'aviso',
                  texto: `O ΔFS da fórmula rápida (${fmt(rapido!.deltaFS, 3)}) difere ${fmt(difRapido * 100, 0)}% do ΔFS do Bishop (${fmt(dFsBishop!, 3)}). Revise a posição da faixa: o círculo crítico pode ter mudado de lugar com o tratamento.`,
                }}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-text-secondary">
            Redução estimada do recalque: <span className="font-mono text-text-primary">{fmt(ver.reducaoRecalque * 100, 0)}%</span> (deformação igual, fator μs = {fmt(ver.muS, 3)}) <Selo o="EMPÍRICO" />
          </p>
        </div>
      )}

      {sem && com && snap && (
        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Comparação dos 3 tipos (mesmos d = {fmt(fr.diametro)} m, s = {fmt(fr.malha)} m, faixa de {fmt(fr.largura, 1)} m)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead className="text-text-secondary">
                <tr className="border-b border-border text-left">
                  <th className="py-1 font-sans">Tipo</th>
                  <th className="text-right">a</th>
                  <th className="text-right">n</th>
                  <th className="text-right">σ_col</th>
                  <th className="text-right">q_ult ou fck/1,4</th>
                  <th className="text-right">FS coluna</th>
                  <th className="text-right">ΔFS rápido</th>
                  <th className="text-right">FS Bishop</th>
                  <th className="text-right">Recalque</th>
                </tr>
              </thead>
              <tbody>
                {TIPOS_COLUNA.map((t) => {
                  const ft = comTipo(fr, t)
                  const v = verificarColuna(ft, ctx.su, ctx.sigmaV)
                  const gr = ganhoRapido(sem.result, ft, ctx.su, ctx.sigmaV, ctx.gammaArgila)
                  const fsB = fsTipos[t]
                  return (
                    <tr key={t} className={`border-b border-border last:border-0 ${t === tipoEfetivo(fr) ? 'bg-elevated' : ''}`}>
                      <td className="py-1 font-sans">{NOME_TIPO[t]}</td>
                      <td className="text-right">{fmt(v.a, 4)}</td>
                      <td className="text-right">{fmt(ft.n_stress, 1)}</td>
                      <td className="text-right">{fmt(v.sigmaCol, 0)}</td>
                      <td className="text-right">{fmt(v.qUlt, 0)}</td>
                      <td className={`text-right ${v.fsColuna < 1.5 ? 'text-accent-red' : v.fsColuna < 2 ? 'text-accent-amber' : 'text-accent-green'}`}>{fmt(v.fsColuna, 2)}</td>
                      <td className="text-right">{gr ? fmt(gr.deltaFS, 3) : '—'}</td>
                      <td className="text-right">{fsB != null ? fmt(fsB, 3) : '—'}</td>
                      <td className="text-right">{fmt(v.reducaoRecalque * 100, 0)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-text-secondary">
            Cada tipo usa o n padrão (brita 5, GEC 5, rígida 20: HIPÓTESE), exceto o tipo selecionado, que usa o valor digitado. A coluna rígida só vale como solução com geogrelha no colchão.
          </p>
        </div>
      )}

      {com && snap && <FaixaCroqui geo={geo} layers={layers} fill={fill} f={fr} colchao={snap.colchao} sem={sem} com={com} />}

      {com && snap && (
        <button
          onClick={() =>
            baixarRelatorioContencao((projeto, responsavel) => {
              const { precos, prem } = lerPrecosPremissas()
              return relatorioFaixa({
                geo, layers, fill, f: fr, colchao: snap.colchao, sem, com, varredura: tabela, fsTipos, fsSemGeo, projeto, responsavel,
                orcamento: { quant: quantFaixa(fr, snap.colchao, geo, layers, prem), precos },
              })
            }, 'croqui-faixa')
          }
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
        >
          <FileDown size={16} /> Gerar relatório (PDF)
        </button>
      )}

      {tabela && (
        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
            FS por largura da faixa × malha
          </div>
          {tabela.length > 1 && Math.max(...tabela.map((l) => l.FS)) - Math.min(...tabela.map((l) => l.FS)) < 0.005 && (
            <p className="mb-2 rounded-md border border-accent-red p-2 text-xs text-accent-red">
              O FS não muda com a largura nem com a malha: o círculo crítico não passa pela faixa. Mude a posição da
              faixa (campo "Faixa posicionada no pé de").
            </p>
          )}
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
