import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FileDown, Loader2, Play, XCircle } from 'lucide-react'
import { analisarMSE, MSE_PADRAO, type ParamsMSE, type ResultadoMSE } from '../../engine/argilaMole/soloReforcado'
import type { FaceCoverage, FillMaterial, Layer, SlopeGeometry } from '../../engine/types'
import { usePersistedState } from '../../lib/persist'
import { NumberField } from '../forms/NumberField'
import { SoloReforcadoCroqui } from './SoloReforcadoCroqui'
import { baixarRelatorioContencao, relatorioMSE } from '../../lib/relatoriosContencao'
import { lerPrecosPremissas, OrcamentoCard } from './OrcamentoCard'
import { quantMSE } from '../../engine/quantitativos'

// Muro de solo reforçado com geossintético (face vertical), sobre qualquer
// solo de fundação. Altura, sobrecarga, camadas e aterro vêm da Nova Análise.

const CARD = 'rounded-lg border border-border bg-surface p-4'
const BTN_PRIMARIO =
  'flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50'

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '∞')

function lerAnalise<T>(chave: string): T | null {
  try {
    const raw = localStorage.getItem('miso4slope:analise:' + chave)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function Fs({ v, min, d = 2 }: { v: number; min: number; d?: number }) {
  return <span className={v >= min ? 'text-accent-green' : 'text-accent-red'}>{fmt(v, d)}</span>
}

export function SoloReforcadoPanel({ inicial, aoMudar }: { inicial?: ResultadoMSE | null; aoMudar?: (r: ResultadoMSE | null) => void } = {}) {
  const geo = useMemo(() => lerAnalise<SlopeGeometry>('geometry'), [])
  const layers = useMemo(() => lerAnalise<Layer[]>('layers'), [])
  const fill = useMemo(() => lerAnalise<FillMaterial>('fill'), [])
  const coverage = useMemo(() => lerAnalise<FaceCoverage>('coverage') ?? undefined, [])

  const [params, setParams] = usePersistedState<ParamsMSE>('miso4slope.argila.mse', MSE_PADRAO)
  const p = { ...MSE_PADRAO, ...params }
  const set = <K extends keyof ParamsMSE>(k: K, v: ParamsMSE[K]) => setParams({ ...p, [k]: v })

  const [rodando, setRodando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [res, setRes] = useState<ResultadoMSE | null>(inicial ?? null)
  useEffect(() => {
    aoMudar?.(res)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res])

  if (!geo || !layers || !fill) {
    return (
      <div className={CARD}>
        Abra a <span className="font-medium">Nova Análise</span>, defina a altura do muro, as camadas e o material do
        aterro; este painel usa esses dados.
      </div>
    )
  }

  const calcular = async () => {
    setRodando(true)
    setErro(null)
    try {
      setRes(await analisarMSE(geo, layers, fill, coverage, p, setProgresso))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro no cálculo.')
    } finally {
      setRodando(false)
      setProgresso('')
    }
  }

  const x = res?.externa

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          Dados vindos da Nova Análise
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary md:grid-cols-4">
          <div>
            Altura do muro: <span className="font-mono text-text-primary">{fmt(geo.total_height)} m</span>
          </div>
          <div>
            Sobrecarga: <span className="font-mono text-text-primary">{fmt(geo.surcharge_q ?? 0, 0)} kPa</span>
          </div>
          <div>
            Aterro (reforçado e retido):{' '}
            <span className="font-mono text-text-primary">
              c' {fmt(fill.c, 0)} · φ' {fmt(fill.phi, 0)}° · γ {fmt(fill.gamma, 0)}
            </span>
          </div>
          <div>
            Camadas de fundação: <span className="font-mono text-text-primary">{layers.length}</span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-text-secondary">
          A fundação é a camada na cota da base do muro (terreno menos o embutimento). A face é vertical; a coesão do
          aterro é desprezada nos empuxos. Para outro perfil ou aterro, edite na Nova Análise.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">Geometria do reforço</div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Embutimento da base" value={p.embutimento} step={0.1} min={0} suffix="m" onChange={(v) => set('embutimento', v)} />
            <NumberField label="Comprimento L (0 = auto 0,7·H)" value={p.comprimento} step={0.5} min={0} suffix="m" onChange={(v) => set('comprimento', v)} />
            <NumberField label="Espaçamento vertical Sv" value={p.espacamento} step={0.05} min={0.1} suffix="m" onChange={(v) => set('espacamento', v)} />
            <NumberField label="FS global alvo" value={p.fsAlvoGlobal} step={0.05} min={1} onChange={(v) => set('fsAlvoGlobal', v)} />
          </div>
        </div>
        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">Geossintético</div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Tult (0 = automática)" value={p.tult} step={5} min={0} suffix="kN/m" onChange={(v) => set('tult', v)} />
            <NumberField label="Coef. de interação Ci" value={p.ci} step={0.05} min={0.1} onChange={(v) => set('ci', v)} />
            <NumberField label="RF fluência" value={p.rfCr} step={0.1} min={1} onChange={(v) => set('rfCr', v)} />
            <NumberField label="RF dano de instalação" value={p.rfId} step={0.05} min={1} onChange={(v) => set('rfId', v)} />
            <NumberField label="RF durabilidade" value={p.rfD} step={0.05} min={1} onChange={(v) => set('rfD', v)} />
            <NumberField label="Eficiência da conexão" value={p.efConexao} step={0.05} min={0.1} onChange={(v) => set('efConexao', v)} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={calcular} disabled={rodando} className={BTN_PRIMARIO}>
              {rodando ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Calcular
            </button>
            {progresso && <span className="text-xs text-text-secondary">{progresso}</span>}
          </div>
          {erro && <div className="mt-2 text-xs text-accent-red">{erro}</div>}
        </div>
      </div>

      {res && x && (
        <>
          <div className={CARD}>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">Resumo</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs md:grid-cols-3">
              <div>Camadas de reforço: <span className="text-text-primary">{res.camadas.length}</span> (Sv {fmt(res.Sv)} m)</div>
              <div>Comprimento L: <span className="text-text-primary">{fmt(res.L)} m</span></div>
              <div>Ka (aterro): <span className="text-text-primary">{fmt(res.Ka, 3)}</span></div>
              <div>Tult necessário: <span className="text-text-primary">{fmt(res.tultNecessario, 1)} kN/m</span></div>
              <div>Tult adotado: <span className="text-text-primary">{fmt(res.tultAdotado, 0)} kN/m</span></div>
              <div>Tadm: <span className="text-text-primary">{fmt(res.tadm, 1)} kN/m</span></div>
              <div>Tombamento: <Fs v={x.fsTomb} min={2} /></div>
              <div>Deslizamento: <Fs v={x.fsDesl} min={1.5} /></div>
              <div>Cap. de carga: <Fs v={x.fsCap} min={3} /> ({fmt(x.qmax, 0)} / {fmt(x.qult, 0)} kPa)</div>
              <div>Excentricidade: <span className="text-text-primary">{fmt(x.e)} m</span> (B' {fmt(x.Bef)} m)</div>
              <div>Fundação: <span className="text-text-primary">{x.fundacao.nome}</span></div>
              <div>
                FS global: <Fs v={res.fsGlobal} min={p.fsAlvoGlobal} /> (sem reforço {fmt(res.fs0)})
              </div>
            </div>
          </div>

          <SoloReforcadoCroqui geo={geo} layers={layers} fill={fill} p={p} res={res} />

          <OrcamentoCard
            titulo="Quantitativos e custo por metro linear"
            chave="mse"
            rotulo="Solo reforçado (MSE)"
            calcular={(prem) => ({ quant: quantMSE(p, res, prem) })}
          />

          <button
            onClick={() =>
              baixarRelatorioContencao((projeto, responsavel) => {
                const { precos, prem } = lerPrecosPremissas()
                return relatorioMSE({ geo, layers, fill, p, res, projeto, responsavel, orcamento: { quant: quantMSE(p, res, prem), precos } })
              }, 'croqui-mse')
            }
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
          >
            <FileDown size={16} /> Gerar relatório (PDF)
          </button>

          <div className={CARD}>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">Estabilidade interna por camada</div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full font-mono text-xs">
                <thead className="sticky top-0 bg-surface text-text-secondary">
                  <tr className="border-b border-border text-left">
                    <th className="py-1">h (m)</th>
                    <th className="text-right">σv (kPa)</th>
                    <th className="text-right">Tmax (kN/m)</th>
                    <th className="text-right">Le (m)</th>
                    <th className="text-right">FS ruptura</th>
                    <th className="text-right">FS arranc.</th>
                    <th className="text-right">FS conexão</th>
                  </tr>
                </thead>
                <tbody>
                  {[...res.camadas].reverse().map((c, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-1">{fmt(c.h)}</td>
                      <td className="text-right">{fmt(c.sigmaV, 1)}</td>
                      <td className="text-right">{fmt(c.Tmax, 1)}</td>
                      <td className="text-right">{fmt(c.Le)}</td>
                      <td className="text-right"><Fs v={c.fsRup} min={1} /></td>
                      <td className="text-right"><Fs v={c.fsArranc} min={1.5} /></td>
                      <td className="text-right"><Fs v={c.fsConexao} min={1} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={CARD}>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
              <AlertTriangle size={14} className="text-accent-amber" /> Verificações e limites
            </div>
            <ul className="space-y-2 text-xs">
              {res.avisos.map((a, i) => (
                <li key={i} className={`flex gap-2 ${a.nivel === 'erro' ? 'text-accent-red' : 'text-text-secondary'}`}>
                  {a.nivel === 'erro' ? <XCircle size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                  <span>{a.texto}</span>
                </li>
              ))}
            </ul>
          </div>

          <details className={CARD}>
            <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-text-secondary">
              Sequência executiva típica
            </summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-text-secondary">
              <li>Locação, remoção do solo orgânico e preparo da fundação; instrumentação (placas de recalque e piezômetros) se a fundação for compressível.</li>
              <li>Camada de regularização da base (brita ou concreto magro), com o embutimento de projeto.</li>
              <li>Montagem da face (blocos, painéis ou envelopamento) e primeira camada de geossintético, ancorada e esticada, sem rugas.</li>
              <li>Lançamento do aterro por camadas compactadas (espessura compatível com Sv), do reforço para a face, sem tráfego direto sobre o geossintético.</li>
              <li>Compactação leve junto à face (faixa de ~1 m), controle de GC e de umidade a cada camada.</li>
              <li>Drenagem do maciço: dreno na base, barbacãs e dreno vertical junto à face e atrás do bloco.</li>
              <li>Repetição das camadas até a cota final; reforços no comprimento e posição de projeto, conferidos por camada.</li>
              <li>Coroamento, pavimento e sobrecarga somente depois da verificação de recalque e deslocamento da face.</li>
            </ol>
            <p className="mt-3 text-[11px] text-text-secondary">Sequência típica de referência. O detalhamento é do projetista e do executor.</p>
          </details>
        </>
      )}
    </div>
  )
}
