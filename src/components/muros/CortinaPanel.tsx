import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FileDown, Loader2, Play, XCircle } from 'lucide-react'
import {
  analisarCortina,
  CORTINA_PADRAO,
  resolverApoio,
  type AnaliseCortina,
  type ParamsCortina,
} from '../../engine/argilaMole/cortina'
import type { FaceCoverage, FillMaterial, Layer, SlopeGeometry } from '../../engine/types'
import { usePersistedState } from '../../lib/persist'
import { NumberField } from '../forms/NumberField'
import { CortinaCroqui } from './CortinaCroqui'
import { baixarRelatorioContencao, relatorioCortina } from '../../lib/relatoriosContencao'

// Cortina de estacas na face vertical do aterro, atirantada a uma estaca de
// reação, com ficha numa camada de apoio qualquer (solo mole ou não). O perfil, as camadas e o aterro vêm
// da Nova Análise (a face do aterro é tratada como vertical, sem bermas).

const CARD = 'rounded-lg border border-border bg-surface p-4'
const SELECT =
  'w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-brand focus:outline-none'
const BTN_PRIMARIO =
  'flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50'

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '∞')

function lerAnalise<T>(chave: string): T | null {
  try {
    const raw = localStorage.getItem('miso4slope:analise:' + chave)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function CortinaPanel({ inicial, aoMudar }: { inicial?: AnaliseCortina | null; aoMudar?: (r: AnaliseCortina | null) => void } = {}) {
  const geo = useMemo(() => lerAnalise<SlopeGeometry>('geometry'), [])
  const layers = useMemo(() => lerAnalise<Layer[]>('layers'), [])
  const fill = useMemo(() => lerAnalise<FillMaterial>('fill'), [])
  const coverage = useMemo(() => lerAnalise<FaceCoverage>('coverage') ?? undefined, [])

  const [params, setParams] = usePersistedState<ParamsCortina>('miso4slope.argila.cortina', CORTINA_PADRAO)
  const p = { ...CORTINA_PADRAO, ...params }
  const set = <K extends keyof ParamsCortina>(k: K, v: ParamsCortina[K]) => setParams({ ...p, [k]: v })

  const [rodando, setRodando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [res, setRes] = useState<AnaliseCortina | null>(inicial ?? null)
  useEffect(() => {
    aoMudar?.(res)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res])

  if (!geo || !layers || !fill) {
    return (
      <div className={CARD}>
        Abra a <span className="font-medium">Nova Análise</span>, defina a altura do aterro, as camadas (CPTu) e o
        material do aterro; este painel usa esses dados.
      </div>
    )
  }

  const calcular = async () => {
    setRodando(true)
    setErro(null)
    try {
      setRes(await analisarCortina(geo, layers, fill, coverage, p, setProgresso))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro no cálculo.')
    } finally {
      setRodando(false)
      setProgresso('')
    }
  }

  const e = res?.esforcos
  const f = res?.forca
  const apoio = resolverApoio(layers, p)
  const baseArgila = apoio.cotaTopo
  const temMole = layers.some((l) => (l.phi ?? 0) === 0)
  const temErro = res?.avisos.some((a) => a.nivel === 'erro') ?? false

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          Dados vindos da Nova Análise
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary md:grid-cols-4">
          <div>
            Altura contida: <span className="font-mono text-text-primary">{fmt(geo.total_height, 2)} m</span>
          </div>
          <div>
            Sobrecarga: <span className="font-mono text-text-primary">{fmt(geo.surcharge_q ?? 0, 0)} kPa</span>
          </div>
          <div>
            Aterro: <span className="font-mono text-text-primary">c' {fmt(fill.c, 0)} · φ' {fmt(fill.phi, 0)}° · γ {fmt(fill.gamma, 0)}</span>
          </div>
          <div>
            Condição:{' '}
            <span className="text-text-primary">{geo.analysis_condition === 'undrained' ? 'não drenada' : 'drenada'}</span>
          </div>
          <div>
            Camada de apoio da ficha:{' '}
            <span className="text-text-primary">{apoio.nome}</span>
          </div>
          <div>
            Topo do apoio: <span className="font-mono text-text-primary">{fmt(baseArgila, 1)} m</span>
            {temMole && <span> (espessura da camada mole acima: {fmt(-baseArgila, 1)} m)</span>}
          </div>
          <div>
            Ponta da estaca com a ficha adotada:{' '}
            <span className="font-mono text-text-primary">{fmt(baseArgila - p.ficha, 1)} m</span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-text-secondary">
          A face do aterro é tratada como vertical (contida pela cortina), sem bermas. Círculos que saem pela face acima
          do terreno são carga direta na estaca (empuxo); só os que cruzam a cortina abaixo do terreno mobilizam a força
          T da estabilidade global.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">Cortina e tirante</div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Diâmetro da estaca" value={p.diametro} step={0.05} min={0.2} suffix="m" onChange={(v) => set('diametro', v)} />
            <NumberField label="Espaçamento c/c" value={p.espacamento} step={0.05} min={0.3} suffix="m" onChange={(v) => set('espacamento', v)} />
            <NumberField label="Cota do tirante" value={p.cotaTirante} step={0.1} suffix="m" onChange={(v) => set('cotaTirante', v)} />
            <NumberField label="Ficha na camada resistente" value={p.ficha} step={0.5} min={0.5} suffix="m" onChange={(v) => set('ficha', v)} />
            <NumberField label="Cortina → estaca de reação" value={p.distReacao} step={1} min={3} suffix="m" onChange={(v) => set('distReacao', v)} />
            <NumberField label="Ø da estaca de reação" value={p.diametroReacao} step={0.05} min={0.2} suffix="m" onChange={(v) => set('diametroReacao', v)} />
            <NumberField label="Comprimento da reação" value={p.comprimentoReacao} step={0.5} min={2} suffix="m" onChange={(v) => set('comprimentoReacao', v)} />
            <NumberField label="FS alvo (global)" value={p.fsAlvo} step={0.05} min={1} onChange={(v) => set('fsAlvo', v)} />
          </div>
        </div>

        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">Solo de apoio e materiais</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Camada de apoio da ficha (qualquer solo)</span>
              <select value={p.camadaApoio} onChange={(ev) => set('camadaApoio', Number(ev.target.value))} className={SELECT}>
                <option value={-1}>Automática (abaixo da camada mole; sem camada mole, desde o terreno)</option>
                {layers.map((l, i) => (
                  <option key={i} value={i}>
                    {i + 1} · {l.name} (c {fmt(l.c, 0)} kPa, φ {fmt(l.phi ?? 0, 0)}°, γ {fmt(l.gamma, 1)})
                  </option>
                ))}
              </select>
            </label>
            <div className="col-span-2 text-[11px] text-text-secondary">
              Resistência passiva usada: {apoio.phi >= 5 ? `granular (φ' ${fmt(apoio.phi, 0)}°, coesão desprezada)` : `coesiva (c = ${fmt(apoio.c, 0)} kPa)`}.
            </div>
            <NumberField label="fyk do aço" value={p.fyk} step={50} suffix="MPa" onChange={(v) => set('fyk', v)} />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Empuxo do aterro</span>
              <select value={p.empuxo} onChange={(ev) => set('empuxo', ev.target.value as ParamsCortina['empuxo'])} className={SELECT}>
                <option value="k0">Repouso K0 (conservador)</option>
                <option value="ka">Ativo Ka</option>
              </select>
            </label>
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

      {res && e && f && (
        <>
          <div className={CARD}>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
              Estabilidade global com a cortina
            </div>
            <div className="grid grid-cols-3 gap-4 font-mono">
              <div>
                <div className="font-sans text-xs text-text-secondary">FS sem cortina (fundação)</div>
                <div className={`text-2xl font-bold ${f.fs0 >= p.fsAlvo ? 'text-accent-green' : 'text-accent-red'}`}>{fmt(f.fs0, 2)}</div>
              </div>
              <div>
                <div className="font-sans text-xs text-text-secondary">T necessário (kN/m)</div>
                <div className="text-2xl font-bold text-text-primary">{fmt(f.T, 0)}</div>
                <div className="font-sans text-xs text-text-secondary">
                  cruza a cortina na cota {f.yCruz != null ? fmt(f.yCruz, 1) : '—'} m
                </div>
              </div>
              <div>
                <div className="font-sans text-xs text-text-secondary">FS com T</div>
                <div className={`text-2xl font-bold ${f.fsFinal >= p.fsAlvo - 0.01 ? 'text-accent-green' : 'text-accent-red'}`}>{fmt(f.fsFinal, 2)}</div>
                <div className="font-sans text-xs text-text-secondary">alvo ≥ {fmt(p.fsAlvo, 2)}</div>
              </div>
            </div>
            {temErro && (
              <p className="mt-3 rounded-md border border-accent-red p-2 text-xs text-accent-red">
                Este FS é condicional: ele assume que a cortina entrega T = {fmt(f.T, 0)} kN/m. As verificações abaixo
                mostram que, como está dimensionada, a cortina não consegue entregar essa força. Corrija os itens em
                vermelho antes de considerar o FS válido.
              </p>
            )}
          </div>

          <div className={CARD}>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
              Esforços por estaca (c/c {fmt(p.espacamento, 2)} m)
            </div>
            <table className="mb-3 w-full font-mono text-xs">
              <thead className="text-text-secondary">
                <tr className="border-b border-border text-left">
                  <th className="py-1">Carga</th>
                  <th className="text-right">kN/estaca</th>
                  <th className="text-right">cota (m)</th>
                </tr>
              </thead>
              <tbody>
                {e.cargas.map((c, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-1 font-sans">{c.nome}</td>
                    <td className="text-right">{fmt(c.valor, 0)}</td>
                    <td className="text-right">{fmt(c.cota, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs md:grid-cols-3">
              <div>Força no tirante: <span className="text-text-primary">{fmt(e.Ftirante, 0)} kN</span></div>
              <div>Momento máx.: <span className="text-text-primary">{fmt(e.Mmax, 0)} kN·m</span></div>
              <div>Cortante no engaste: <span className="text-text-primary">{fmt(e.Vengaste, 0)} kN</span></div>
              <div>As necessária: <span className="text-text-primary">{fmt(e.AsNec, 0)} cm² ({fmt(e.taxaAco * 100, 1)}%)</span></div>
              <div>Tirante (aço): <span className="text-text-primary">{fmt(e.AtirNec, 1)} cm²</span></div>
              <div>
                FS da ficha:{' '}
                <span className={e.fsFicha >= 2 ? 'text-accent-green' : 'text-accent-red'}>{fmt(e.fsFicha, 2)}</span>
                {e.fichaNecessaria != null && e.fsFicha < 2 && <span> (≈ {fmt(e.fichaNecessaria, 1)} m)</span>}
              </div>
              <div>
                Estaca de reação:{' '}
                <span className={e.fsReacao >= 1.5 ? 'text-accent-green' : 'text-accent-red'}>FS {fmt(e.fsReacao, 2)}</span>
              </div>
              <div>
                Ponta da reação: <span className="text-text-primary">{fmt(e.cotaPontaReacao, 1)} m</span>
                {e.cotaRupturaReacao != null && <span> (ruptura em {fmt(e.cotaRupturaReacao, 1)} m)</span>}
              </div>
            </div>
          </div>

          <CortinaCroqui geo={geo} layers={layers} fill={fill} p={p} res={res} />

          <button
            onClick={() =>
              baixarRelatorioContencao(
                (projeto, responsavel) => relatorioCortina({ geo, layers, fill, p, res, projeto, responsavel }),
                'croqui-cortina'
              )
            }
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
          >
            <FileDown size={16} /> Gerar relatório (PDF)
          </button>

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
              <li>
                <span className="font-medium text-text-primary">Preparo e instrumentação:</span> locação, limpeza,
                piezômetros, placas de recalque e inclinômetros instalados antes de qualquer carga.
              </li>
              <li>
                <span className="font-medium text-text-primary">Plataforma de trabalho:</span> sobre solo mole, aterro
                de trabalho leve (geotêxtil + brita) para o equipamento de estacas; sem ele, o equipamento instabiliza o
                terreno.
              </li>
              <li>
                <span className="font-medium text-text-primary">Estacas de reação primeiro</span> (atrás da cortina) e
                depois as estacas da cortina, até a ficha dimensionada; em argila mole, com camisa ou lama para evitar
                estrangulamento do fuste; concretagem contínua e ensaio de integridade.
              </li>
              <li>
                <span className="font-medium text-text-primary">Vigas de coroamento</span> da cortina e de cabeça da
                estaca de reação, com as cabeças de ancoragem do tirante embutidas.
              </li>
              <li>
                <span className="font-medium text-text-primary">Aterro até a cota do tirante, em camadas</span>{' '}
                compactadas, com velocidade de alteamento controlada pela poropressão. Nessa fase as estacas trabalham
                em balanço: verifique a altura máxima de aterro antes de o tirante entrar.
              </li>
              <li>
                <span className="font-medium text-text-primary">Tirantes</span> em bainha livre, protegidos contra
                corrosão, ligados às duas vigas; pré-tensão pequena conforme o projeto.
              </li>
              <li>
                <span className="font-medium text-text-primary">Painel de fechamento e dreno</span> entre as estacas,
                em etapas junto com o aterro, com barbacãs e dreno geocomposto atrás.
              </li>
              <li>
                <span className="font-medium text-text-primary">Aterro até a cota final</span> (GC conforme projeto),
                compactação leve perto da cortina; sobrecarga e pavimento só quando o monitoramento permitir.
              </li>
              <li>
                <span className="font-medium text-text-primary">Monitoramento contínuo:</span> deslocamento da cortina,
                recalque, poropressão e carga nos tirantes (célula de carga), com critérios de parada definidos.
              </li>
            </ol>
            <p className="mt-3 text-[11px] text-text-secondary">
              Sequência típica de referência. O detalhamento é do projetista e do executor.
            </p>
          </details>
        </>
      )}
    </div>
  )
}
