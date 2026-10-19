import { useEffect, useState } from 'react'
import { usePersistedState } from '../../lib/persist'
import {
  CATALOGO,
  custoPorMetro,
  NOME_CLASSE,
  PREMISSAS_PADRAO,
  type ClasseSolo,
  type Cod,
  type Precos,
  type Premissas,
  type Quantitativo,
} from '../../engine/quantitativos'

// Pré-orçamento por metro linear: quantidades calculadas da solução adotada,
// sobreconsumo pelo solo atravessado e preços unitários do usuário (a tabela
// de preços e as premissas ficam salvas no navegador e valem para todas as soluções).

const CARD = 'rounded-lg border border-border bg-surface p-4'
export const CHAVE_PRECOS = 'miso4slope.orcamento.precos'
export const CHAVE_PREMISSAS = 'miso4slope.orcamento.premissas'
const CHAVE_RESUMOS = 'miso4slope.orcamento.resumos'
const EVENTO = 'miso4slope-orcamento'

const fmt = (v: number, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const brl = (v: number) => 'R$ ' + fmt(v, 2)

export interface ResumoCusto {
  rotulo: string
  atualizadoEm: string
  total: number | null
  completo: boolean
  itens: { nome: string; un: string; qtd: number; custo: number | null }[]
}

function lerResumos(): Record<string, ResumoCusto> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_RESUMOS) ?? '{}')
  } catch {
    return {}
  }
}

function gravarResumo(chave: string, r: ResumoCusto) {
  try {
    const t = lerResumos()
    t[chave] = r
    localStorage.setItem(CHAVE_RESUMOS, JSON.stringify(t))
    window.dispatchEvent(new Event(EVENTO))
  } catch {
    // sem localStorage: o quadro comparativo só não registra
  }
}

/** Preços e premissas salvos, lidos na hora (para os relatórios em PDF). */
export function lerPrecosPremissas(): { precos: Precos; prem: Premissas } {
  const ler = <T,>(k: string, padrao: T): T => {
    try {
      const raw = localStorage.getItem(k)
      return raw ? (JSON.parse(raw) as T) : padrao
    } catch {
      return padrao
    }
  }
  const premRaw = ler<Partial<Premissas>>(CHAVE_PREMISSAS, {})
  return {
    precos: ler<Precos>(CHAVE_PRECOS, {}),
    prem: { ...PREMISSAS_PADRAO, ...premRaw, sobre: { ...PREMISSAS_PADRAO.sobre, ...(premRaw.sobre ?? {}) } },
  }
}

export function usePrecos() {
  const [precos, setPrecos] = usePersistedState<Precos>(CHAVE_PRECOS, {})
  const [premRaw, setPrem] = usePersistedState<Premissas>(CHAVE_PREMISSAS, PREMISSAS_PADRAO)
  const prem: Premissas = { ...PREMISSAS_PADRAO, ...premRaw, sobre: { ...PREMISSAS_PADRAO.sobre, ...(premRaw?.sobre ?? {}) } }
  return { precos, setPrecos, prem, setPrem }
}

function Campo({ rotulo, valor, onChange, suf, passo = 0.01 }: { rotulo: string; valor: number; onChange: (v: number) => void; suf?: string; passo?: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-secondary">
      {rotulo}
      <span className="flex items-center gap-1 rounded-md border border-border bg-elevated px-2 py-1">
        <input
          type="number"
          step={passo}
          value={Number.isFinite(valor) ? valor : ''}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          className="w-full bg-transparent font-mono text-sm text-text-primary focus:outline-none"
        />
        {suf && <span>{suf}</span>}
      </span>
    </label>
  )
}

export function PremissasEditor({ prem, setPrem }: { prem: Premissas; setPrem: (p: Premissas) => void }) {
  const set = <K extends keyof Premissas>(k: K, v: Premissas[K]) => setPrem({ ...prem, [k]: v })
  const pct = (v: number) => (Number.isFinite(v) ? v * 100 : NaN)
  return (
    <div className="mt-3 space-y-3 rounded-md border border-border p-3">
      <div className="text-xs font-medium text-text-secondary">
        Sobreconsumo do material de colunas e estacas, conforme o solo em que estão inseridas
        <span className="ml-2 rounded border border-accent-amber px-1 py-px text-[9px] text-accent-amber">HIPÓTESE</span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {(Object.keys(NOME_CLASSE) as ClasseSolo[]).map((c) => (
          <Campo key={c} rotulo={NOME_CLASSE[c]} valor={pct(prem.sobre[c])} suf="%" passo={1} onChange={(v) => set('sobre', { ...prem.sobre, [c]: v / 100 })} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Campo rotulo="Sobreconsumo da calda do grampo" valor={pct(prem.sobre_calda)} suf="%" passo={5} onChange={(v) => set('sobre_calda', v / 100)} />
        <Campo rotulo="Perda de lançamento da brita na camisa (GEC)" valor={pct(prem.sobre_gec)} suf="%" passo={1} onChange={(v) => set('sobre_gec', v / 100)} />
        <Campo rotulo="Aço mínimo das estacas" valor={prem.aco_estaca} suf="kg/m³" passo={5} onChange={(v) => set('aco_estaca', v)} />
        <Campo rotulo="Aço das vigas" valor={prem.aco_viga} suf="kg/m³" passo={5} onChange={(v) => set('aco_viga', v)} />
        <Campo rotulo="Aço do muro de flexão" valor={prem.aco_muro} suf="kg/m³" passo={5} onChange={(v) => set('aco_muro', v)} />
        <Campo rotulo="Viga de coroamento: largura" valor={prem.viga_b} suf="m" onChange={(v) => set('viga_b', v)} />
        <Campo rotulo="Viga de coroamento: altura" valor={prem.viga_h} suf="m" onChange={(v) => set('viga_h', v)} />
        <Campo rotulo="Traspasse (geotêxtil, tela)" valor={pct(prem.traspasse)} suf="%" passo={1} onChange={(v) => set('traspasse', v / 100)} />
        <Campo rotulo="Perda da geogrelha" valor={pct(prem.perda_geo)} suf="%" passo={1} onChange={(v) => set('perda_geo', v / 100)} />
        <Campo rotulo="Retorno do geossintético na face" valor={prem.dobra_mse} suf="m" onChange={(v) => set('dobra_mse', v)} />
        <Campo rotulo="Rebote do concreto projetado" valor={pct(prem.rebote)} suf="%" passo={1} onChange={(v) => set('rebote', v / 100)} />
        <Campo rotulo="Perda do concreto do muro" valor={pct(prem.perda_concreto)} suf="%" passo={1} onChange={(v) => set('perda_concreto', v / 100)} />
        <Campo rotulo="Rachão de agulhamento sob o colchão (0 = sem)" valor={prem.rachao_esp} suf="m" onChange={(v) => set('rachao_esp', v)} />
        <Campo rotulo="Espessura do lastro" valor={prem.lastro_esp} suf="m" onChange={(v) => set('lastro_esp', v)} />
        <Campo rotulo="Barra do grampo" valor={prem.barra_grampo} suf="kg/m" onChange={(v) => set('barra_grampo', v)} />
        <Campo rotulo="Diâmetro do furo do grampo" valor={prem.furo_grampo} suf="m" onChange={(v) => set('furo_grampo', v)} />
      </div>
      <button onClick={() => setPrem(PREMISSAS_PADRAO)} className="text-[11px] text-brand">
        voltar às premissas padrão
      </button>
    </div>
  )
}

export interface CalculoOrcamento {
  quant: Quantitativo
  comprimento?: number // m de muro: mostra o custo total do trecho
  totais?: Partial<Record<Cod, number>> // quantidade total no alinhamento
}

/** `calcular` recebe as premissas atuais (editadas aqui) e devolve as quantidades. */
export function OrcamentoCard({
  titulo,
  calcular,
  chave,
  rotulo,
}: {
  titulo: string
  calcular: (prem: Premissas) => CalculoOrcamento | null
  chave: string
  rotulo: string
}) {
  const { precos, setPrecos, prem, setPrem } = usePrecos()
  const [verPrem, setVerPrem] = useState(false)
  const calc = calcular(prem)
  const quant = calc?.quant ?? null
  const comprimento = calc?.comprimento
  const totais = calc?.totais
  const c = quant ? custoPorMetro(quant, precos) : null

  useEffect(() => {
    if (!quant || !c) return
    gravarResumo(chave, {
      rotulo,
      atualizadoEm: new Date().toISOString(),
      total: c.total,
      completo: c.completo,
      itens: c.linhas.map((l) => ({ nome: CATALOGO[l.cod].nome, un: l.un, qtd: l.qtd, custo: l.custo })),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, rotulo, JSON.stringify(c?.linhas.map((l) => [l.cod, l.qtd, l.preco]))])

  if (!quant || !c) return null
  const un = (u: string) => u

  return (
    <div className={CARD}>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">{titulo}</div>
        <button onClick={() => setVerPrem((v) => !v)} className="text-[11px] text-brand">
          {verPrem ? 'ocultar premissas' : 'premissas e sobreconsumo'}
        </button>
      </div>
      <p className="mb-2 text-[11px] text-text-secondary">
        Quantidades por metro linear da solução adotada, com o sobreconsumo previsto. Digite o preço unitário de cada serviço (fica salvo no navegador). Pré-dimensionamento: não substitui o orçamento executivo.
      </p>
      {verPrem && <PremissasEditor prem={prem} setPrem={setPrem} />}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead className="text-text-secondary">
            <tr className="border-b border-border text-left">
              <th className="py-1 font-sans">Serviço</th>
              <th className="text-right">Un</th>
              <th className="text-right">Líquido/m</th>
              <th className="text-right">Sobre</th>
              <th className="text-right">Qtd/m</th>
              <th className="text-right">Preço unit. (R$)</th>
              <th className="text-right">Custo/m (R$)</th>
              {totais && <th className="text-right">Qtd total</th>}
            </tr>
          </thead>
          <tbody>
            {c.linhas.map((l) => (
              <tr key={l.cod} className="border-b border-border last:border-0">
                <td className="py-1 pr-2 font-sans">
                  {CATALOGO[l.cod].nome}
                  <div className="text-[10px] text-text-secondary">{l.descricao}</div>
                </td>
                <td className="text-right">{un(l.un)}</td>
                <td className="text-right">{fmt(l.liquida, 2)}</td>
                <td className="text-right">{l.sobre > 0 ? `${fmt(l.sobre * 100, 0)}%` : '—'}</td>
                <td className="text-right font-bold">{fmt(l.qtd, 2)}</td>
                <td className="text-right">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={precos[l.cod] ?? ''}
                    placeholder="0,00"
                    onChange={(e) => {
                      const v = e.target.valueAsNumber
                      setPrecos({ ...precos, [l.cod]: Number.isFinite(v) ? v : undefined })
                    }}
                    className="w-24 rounded border border-border bg-elevated px-1 py-0.5 text-right text-text-primary"
                  />
                </td>
                <td className="text-right">{l.custo != null ? fmt(l.custo, 2) : '—'}</td>
                {totais && <td className="text-right">{totais[l.cod] != null ? fmt(totais[l.cod]!, 1) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-6">
        <div>
          <div className="text-xs text-text-secondary">Custo por metro linear</div>
          <div className="font-mono text-2xl font-bold text-text-primary">{c.total != null ? brl(c.total) : '—'}</div>
        </div>
        {c.total != null && comprimento != null && comprimento > 0 && (
          <div>
            <div className="text-xs text-text-secondary">Custo do trecho ({fmt(comprimento, 1)} m)</div>
            <div className="font-mono text-xl font-bold text-text-primary">{brl(c.total * comprimento)}</div>
          </div>
        )}
      </div>
      {c.total != null && !c.completo && (
        <p className="mt-2 rounded-md border border-accent-amber p-2 text-xs text-accent-amber">
          Custo parcial: faltam preços para {c.faltam.map((x) => CATALOGO[x].nome).join('; ')}.
        </p>
      )}
      {c.total == null && <p className="mt-2 text-xs text-text-secondary">Preencha os preços unitários para ver o custo por metro linear.</p>}
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[11px] text-text-secondary">
        {quant.notas.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  )
}

/** Quadro comparativo: o custo por metro linear de cada solução já calculada nesta máquina. */
export function ComparativoCustos() {
  const [res, setRes] = useState<Record<string, ResumoCusto>>(lerResumos)
  useEffect(() => {
    const f = () => setRes(lerResumos())
    window.addEventListener(EVENTO, f)
    return () => window.removeEventListener(EVENTO, f)
  }, [])
  const linhas = Object.entries(res).sort((a, b) => a[1].rotulo.localeCompare(b[1].rotulo))
  if (linhas.length === 0) return null
  const validos = linhas.filter(([, r]) => r.total != null && r.completo).map(([, r]) => r.total as number)
  const menor = validos.length ? Math.min(...validos) : null
  return (
    <div className={CARD}>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">Comparativo: custo por metro linear</div>
      <p className="mb-2 text-[11px] text-text-secondary">
        Reúne a última estimativa feita em cada solução (faixa de colunas, cortina, solo reforçado e muros). Só compara de forma justa quando todos os itens têm preço e as soluções atendem à mesma altura e ao mesmo FS.
      </p>
      <table className="w-full font-mono text-xs">
        <thead className="text-text-secondary">
          <tr className="border-b border-border text-left">
            <th className="py-1 font-sans">Solução</th>
            <th className="text-right">R$/m</th>
            <th className="text-right">Situação</th>
            <th className="text-right">Atualizado</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(([k, r]) => (
            <tr key={k} className="border-b border-border last:border-0">
              <td className="py-1 font-sans">{r.rotulo}</td>
              <td className={`text-right ${r.total != null && r.completo && r.total === menor ? 'font-bold text-accent-green' : ''}`}>{r.total != null ? fmt(r.total, 2) : '—'}</td>
              <td className="text-right font-sans">{r.total == null ? 'sem preços' : r.completo ? 'completo' : 'parcial'}</td>
              <td className="text-right font-sans">{new Date(r.atualizadoEm).toLocaleDateString('pt-BR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
