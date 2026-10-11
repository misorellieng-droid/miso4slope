import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Download, FileDown, FileUp, Loader2, Play, Square, XCircle } from 'lucide-react'
import { MuroCanvas, type MuroCanvasHandle } from '../components/muros/MuroCanvas'
import { NumberField } from '../components/forms/NumberField'
import { lerMurosSecoes, secaoCritica } from '../engine/muros/entrada'
import type { DetalheSerial } from '../engine/muros/serial'
import type { SoloMuro } from '../engine/muros/solo'
import {
  PARAMETROS_PADRAO,
  type MuroEntrada,
  type MurosSecoesArquivo,
  type MurosVerificacaoArquivo,
  type ParametrosMuros,
  type TipoMuro,
} from '../engine/muros/tipos'
import type { FillMaterial } from '../engine/types'
import { exportarPdfMuro } from '../lib/exportMurosPdf'
import { carregarSolo, rotuloFonte, type FonteSolo } from '../lib/murosSolo'
import { usePersistedState } from '../lib/persist'
import { getProjetoDetail, listProjetos, type ProjetoDetail, type ProjetoSummary } from '../lib/projetosStorage'
import type { PedidoVerificacao, RespostaWorker } from '../workers/murosWorker'

// Verificação de muros do ME-DYN-TALUDE (Civil 3D): importa o
// <nome>_muros_secoes.json, verifica cada muro com o solo de uma análise ou
// sondagem do projeto e devolve o <nome>_muros_verificacao.json com as
// sugestões que o ME-DYN-TALUDE lê na rodada seguinte.

const P = 'miso4slope.muros.'

const TIPO_LABEL: Record<TipoMuro, string> = { concreto: 'Concreto armado', gabiao: 'Gabião', grampeado: 'Solo grampeado' }
const CARD = 'rounded-lg border border-border bg-surface p-4'
const BTN = 'flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40'
const BTN_PRIMARIO = 'flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50'
const SELECT = 'w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-brand focus:outline-none'

const fsFmt = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? (v === Infinity || v === 99 ? '>99' : '—') : v.toFixed(d).replace('.', ',')

function corFs(v: number | null | undefined, min: number) {
  if (v == null) return 'text-text-secondary'
  return v >= min ? 'text-accent-green' : v >= 0.9 * min ? 'text-accent-amber' : 'text-accent-red'
}

type Status = 'nao_verificado' | 'sem_solo' | 'calculando' | 'ok' | 'nao_ok'

function Chip({ status }: { status: Status }) {
  const map: Record<Status, [string, string]> = {
    nao_verificado: ['não verificado', 'bg-elevated text-text-secondary'],
    sem_solo: ['sem dados de solo', 'bg-amber-100 text-accent-amber'],
    calculando: ['calculando…', 'bg-blue-50 text-accent-blue'],
    ok: ['ok', 'bg-green-50 text-accent-green'],
    nao_ok: ['não ok', 'bg-red-50 text-accent-red'],
  }
  const [txt, cls] = map[status]
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{txt}</span>
}

function nomeSaida(nomeEntrada: string, plato: string) {
  const base = nomeEntrada.replace(/\.json$/i, '').replace(/_muros_secoes$/i, '')
  return `${base || plato}_muros_verificacao.json`
}

// soloAvulso: fonte de solo extra, fora do banco (usada na pré-visualização
// local, sem login); aparece como opção "Solo avulso" nas listas de fonte.
export function MurosPage({ soloAvulso }: { soloAvulso?: SoloMuro } = {}) {
  const [arquivo, setArquivo] = useState<MurosSecoesArquivo | null>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [leitura, setLeitura] = useState<{ erros: string[]; avisos: string[] }>({ erros: [], avisos: [] })

  const [projetos, setProjetos] = useState<ProjetoSummary[]>([])
  const [projetoId, setProjetoId] = usePersistedState<string>(P + 'projetoId', '')
  const [projeto, setProjeto] = useState<ProjetoDetail | null>(null)
  const [fontePadrao, setFontePadrao] = usePersistedState<FonteSolo>(P + 'fontePadrao', '')
  const [fontePorMuro, setFontePorMuro] = useState<Record<string, FonteSolo>>({})
  const [aterro, setAterro] = usePersistedState<FillMaterial>(P + 'aterroSondagem', { c: 10, phi: 28, gamma: 18 })
  const [params, setParams] = usePersistedState<ParametrosMuros>(P + 'params', PARAMETROS_PADRAO)
  const [verParams, setVerParams] = useState(false)
  const [responsavel, setResponsavel] = usePersistedState(P + 'responsavel', '')

  const [detalhes, setDetalhes] = useState<Record<string, DetalheSerial>>({})
  const [progresso, setProgresso] = useState<Record<string, { mensagem: string; fracao: number }>>({})
  const [rodando, setRodando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [secaoVista, setSecaoVista] = useState<number | null>(null)
  const [mostrarSugerida, setMostrarSugerida] = useState(true)
  const [gerandoPdf, setGerandoPdf] = useState(false)

  const workerRef = useRef<Worker | null>(null)
  const canvasRef = useRef<MuroCanvasHandle>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const p = { ...PARAMETROS_PADRAO, ...params } // parâmetros novos ganham o padrão se o salvo for antigo

  useEffect(() => {
    listProjetos().then(setProjetos).catch(() => setProjetos([]))
    return () => workerRef.current?.terminate()
  }, [])

  useEffect(() => {
    if (!projetoId) {
      setProjeto(null)
      return
    }
    getProjetoDetail(projetoId)
      .then(setProjeto)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar o projeto.'))
  }, [projetoId])

  const fonteDo = (id: string): FonteSolo => fontePorMuro[id] ?? fontePadrao
  const rotulo = (f: FonteSolo) => (f === 'x:avulso' ? `Solo avulso: ${soloAvulso?.fonte ?? ''}` : rotuloFonte(f, projeto))

  const lerArquivo = async (f: File) => {
    setErro(null)
    try {
      const json = JSON.parse(await f.text())
      const r = lerMurosSecoes(json)
      setLeitura({ erros: r.erros, avisos: r.avisos })
      setArquivo(r.arquivo)
      setNomeArquivo(f.name)
      setDetalhes({})
      setProgresso({})
      setFontePorMuro({})
      setSelecionado(r.arquivo?.muros[0]?.id ?? null)
      setSecaoVista(null)
    } catch (e) {
      setArquivo(null)
      setLeitura({ erros: [e instanceof Error ? `Arquivo inválido: ${e.message}` : 'Arquivo inválido.'], avisos: [] })
    }
  }

  const verificar = async (ids: string[] = []) => {
    if (!arquivo) return
    setErro(null)
    setRodando(true)
    try {
      const alvo = arquivo.muros.filter((m) => ids.length === 0 || ids.includes(m.id))
      const cache = new Map<string, SoloMuro | null>()
      const solos: Record<string, SoloMuro | null> = {}
      for (const m of alvo) {
        const f = fonteDo(m.id)
        if (!cache.has(f)) {
          if (f === 'x:avulso') cache.set(f, soloAvulso ?? null)
          else cache.set(f, projeto && f ? await carregarSolo(f, projeto, aterro) : null)
        }
        solos[m.id] = cache.get(f) ?? null
      }
      workerRef.current?.terminate()
      const w = new Worker(new URL('../workers/murosWorker.ts', import.meta.url), { type: 'module' })
      workerRef.current = w
      setProgresso((pr) => {
        const n = { ...pr }
        for (const m of alvo) n[m.id] = { mensagem: 'na fila', fracao: 0 }
        return n
      })
      w.onmessage = (e: MessageEvent<RespostaWorker>) => {
        const r = e.data
        if (r.tipo === 'progresso') setProgresso((pr) => ({ ...pr, [r.id]: { mensagem: r.mensagem, fracao: r.fracao } }))
        else if (r.tipo === 'muro') {
          setDetalhes((d) => ({ ...d, [r.detalhe.muro.id]: r.detalhe }))
          setProgresso((pr) => {
            const n = { ...pr }
            delete n[r.detalhe.muro.id]
            return n
          })
        } else if (r.tipo === 'fim') {
          setRodando(false)
          w.terminate()
        } else if (r.tipo === 'erro') {
          setErro(`Erro no cálculo: ${r.mensagem}`)
          setRodando(false)
          w.terminate()
        }
      }
      const pedido: PedidoVerificacao = { arquivo, ids, solos, params: p }
      w.postMessage(pedido)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao preparar a verificação.')
      setRodando(false)
    }
  }

  const parar = () => {
    workerRef.current?.terminate()
    workerRef.current = null
    setRodando(false)
    setProgresso({})
  }

  const saida: MurosVerificacaoArquivo | null = useMemo(() => {
    if (!arquivo) return null
    const muros = arquivo.muros.filter((m) => detalhes[m.id]).map((m) => detalhes[m.id].saida)
    if (!muros.length) return null
    return { versao: 1, plato: arquivo.plato, gerado_em: new Date().toISOString(), muros }
  }, [arquivo, detalhes])

  const baixarJson = () => {
    if (!saida || !arquivo) return
    const blob = new Blob([JSON.stringify(saida, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = nomeSaida(nomeArquivo, arquivo.plato)
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const statusDe = (m: MuroEntrada): Status => {
    if (progresso[m.id]) return 'calculando'
    const d = detalhes[m.id]
    if (d) return d.semSolo ? 'sem_solo' : d.saida.ok ? 'ok' : 'nao_ok'
    return fonteDo(m.id) && (projeto || fonteDo(m.id) === 'x:avulso') ? 'nao_verificado' : 'sem_solo'
  }

  const muroSel = arquivo?.muros.find((m) => m.id === selecionado) ?? null
  const detSel = selecionado ? detalhes[selecionado] : undefined
  const avaliacaoVista =
    detSel && (secaoVista != null ? detSel.avaliacoes.find((a) => a.secao.s === secaoVista) : detSel.governante)

  const gerarPdf = async () => {
    if (!detSel || !arquivo) return
    setGerandoPdf(true)
    try {
      // o PDF usa o desenho da seção crítica
      if (secaoVista != null && secaoVista !== detSel.governante?.secao.s) setSecaoVista(null)
      await new Promise((r) => setTimeout(r, 50))
      await exportarPdfMuro(
        detSel,
        { projeto: projeto?.nome ?? '', plato: arquivo.plato, responsavel, fonteSolo: rotulo(fonteDo(detSel.muro.id)) },
        p,
        canvasRef.current?.svg ?? null
      )
    } catch (e) {
      setErro(e instanceof Error ? `Erro ao gerar PDF: ${e.message}` : 'Erro ao gerar PDF.')
    } finally {
      setGerandoPdf(false)
    }
  }

  const opcaoAvulso = soloAvulso ? <option value="x:avulso">Solo avulso: {soloAvulso.fonte}</option> : null
  const temFonte = !!projeto || !!soloAvulso
  const opcoesFonte = projeto ? (
    <>
      <option value="">— escolha —</option>
      {opcaoAvulso}
      {projeto.analises.length > 0 && (
        <optgroup label="Análises salvas">
          {projeto.analises.map((a) => (
            <option key={a.id} value={`a:${a.id}`}>
              {a.nome_secao} ({a.mode})
            </option>
          ))}
        </optgroup>
      )}
      {projeto.sondagens.length > 0 && (
        <optgroup label="Sondagens">
          {projeto.sondagens.map((s) => (
            <option key={s.id} value={`s:${s.id}`}>
              {s.nome}
            </option>
          ))}
        </optgroup>
      )}
    </>
  ) : (
    <>
      <option value="">— escolha o projeto —</option>
      {opcaoAvulso}
    </>
  )

  const setP = <K extends keyof ParametrosMuros>(k: K, v: ParametrosMuros[K]) => setParams({ ...p, [k]: v })
  const usaSondagem = arquivo?.muros.some((m) => fonteDo(m.id).startsWith('s:'))

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">Verificação de Muros</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Integração com o ME-DYN-TALUDE (Civil 3D) — estabilidade global (Bishop), empuxo, tombamento, deslizamento,
            tensões na base e arrancamento de grampos, com sugestões para a próxima rodada.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rodando ? (
            <button onClick={parar} className={BTN}>
              <Square size={16} /> Parar
            </button>
          ) : (
            <button onClick={() => verificar()} disabled={!arquivo || !temFonte} className={BTN_PRIMARIO} title={!temFonte ? 'Escolha o projeto e a fonte do solo' : undefined}>
              <Play size={16} /> Verificar todos
            </button>
          )}
          <button onClick={baixarJson} disabled={!saida || rodando} className={BTN}>
            <Download size={16} /> Baixar _muros_verificacao.json
          </button>
        </div>
      </div>

      {erro && <div className="mb-4 rounded-md border border-accent-red/40 bg-red-50 px-3 py-2 text-sm text-accent-red">{erro}</div>}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {/* arquivo */}
        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">1 · Arquivo do ME-DYN-TALUDE</div>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])}
          />
          <button
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files?.[0]
              if (f) lerArquivo(f)
            }}
            className="flex w-full flex-col items-center gap-1 rounded-md border border-dashed border-border bg-elevated px-3 py-5 text-sm text-text-secondary hover:border-brand hover:text-text-primary"
          >
            <FileUp size={20} />
            {nomeArquivo ? <span className="font-mono text-xs text-text-primary">{nomeArquivo}</span> : <span>Importar <span className="font-mono text-xs">&lt;nome&gt;_muros_secoes.json</span></span>}
            <span className="text-[11px]">clique ou arraste o arquivo aqui</span>
          </button>
          {arquivo && (
            <div className="mt-2 text-xs text-text-secondary">
              Platô <span className="font-mono text-text-primary">{arquivo.plato}</span> · {arquivo.muros.length} muro(s) ·{' '}
              {arquivo.muros.reduce((a, m) => a + m.secoes.length, 0)} seções
            </div>
          )}
          {[...leitura.erros.map((t) => ({ t, e: true })), ...leitura.avisos.map((t) => ({ t, e: false }))].map(({ t, e }, i) => (
            <div key={i} className={`mt-1 text-xs ${e ? 'text-accent-red' : 'text-accent-amber'}`}>
              {t}
            </div>
          ))}
        </div>

        {/* projeto e solo */}
        <div className={CARD}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">2 · Projeto e solo</div>
          <label className="mb-2 block">
            <span className="mb-1 block text-xs text-text-secondary">Projeto</span>
            <select value={projetoId} onChange={(e) => { setProjetoId(e.target.value); setFontePadrao(''); setFontePorMuro({}) }} className={SELECT}>
              <option value="">— escolha —</option>
              {projetos.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-text-secondary">Solo padrão (análise salva ou sondagem)</span>
            <select value={fontePadrao} onChange={(e) => setFontePadrao(e.target.value)} className={SELECT} disabled={!temFonte}>
              {opcoesFonte}
            </select>
          </label>
          <p className="mt-2 text-[11px] leading-snug text-text-secondary">
            Camadas, aterro e N.A. vêm da fonte escolhida; dá para trocar muro a muro na lista abaixo.
          </p>
          {usaSondagem && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1 text-xs text-text-secondary">Aterro (a sondagem não traz)</div>
              <div className="grid grid-cols-3 gap-2">
                <NumberField label="c' (kPa)" value={aterro.c} onChange={(v) => setAterro({ ...aterro, c: v })} step={1} />
                <NumberField label="φ' (°)" value={aterro.phi} onChange={(v) => setAterro({ ...aterro, phi: v })} step={1} />
                <NumberField label="γ (kN/m³)" value={aterro.gamma} onChange={(v) => setAterro({ ...aterro, gamma: v })} step={0.5} />
              </div>
            </div>
          )}
        </div>

        {/* parâmetros */}
        <div className={CARD}>
          <button onClick={() => setVerParams((v) => !v)} className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-wide text-text-secondary">
            <span>3 · Parâmetros e critérios</span>
            <ChevronDown size={16} className={verParams ? 'rotate-180' : ''} />
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-text-secondary">
            <div>Empuxo: <span className="text-text-primary">{p.metodo_empuxo === 'rankine' ? 'Rankine' : 'Coulomb (cunha)'}</span></div>
            <div>FS global ≥ <span className="font-mono text-text-primary">{fsFmt(p.fs_global_min)}</span></div>
            <div>Tombamento ≥ <span className="font-mono text-text-primary">{fsFmt(p.fs_tombamento_min)}</span></div>
            <div>Deslizamento ≥ <span className="font-mono text-text-primary">{fsFmt(p.fs_deslizamento_min)}</span></div>
            <div>σ adm = <span className="font-mono text-text-primary">{fsFmt(p.tensao_admissivel, 0)} kPa</span></div>
            <div>Arrancamento ≥ <span className="font-mono text-text-primary">{fsFmt(p.fs_arrancamento_min)}</span></div>
          </div>
          {verParams && (
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              <div className="flex rounded-md border border-border p-0.5">
                {(['rankine', 'coulomb'] as const).map((mt) => (
                  <button
                    key={mt}
                    onClick={() => setP('metodo_empuxo', mt)}
                    className={`flex-1 rounded px-2 py-1 text-xs font-medium ${p.metodo_empuxo === mt ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    {mt === 'rankine' ? 'Rankine' : 'Coulomb (cunha)'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="FS global mín." value={p.fs_global_min} onChange={(v) => setP('fs_global_min', v)} step={0.05} />
                <NumberField label="FS tombamento mín." value={p.fs_tombamento_min} onChange={(v) => setP('fs_tombamento_min', v)} step={0.1} />
                <NumberField label="FS deslizamento mín." value={p.fs_deslizamento_min} onChange={(v) => setP('fs_deslizamento_min', v)} step={0.1} />
                <NumberField label="σ admissível" value={p.tensao_admissivel} onChange={(v) => setP('tensao_admissivel', v)} step={10} suffix="kPa" />
                <NumberField label="γ concreto" value={p.gama_concreto} onChange={(v) => setP('gama_concreto', v)} step={0.5} suffix="kN/m³" />
                <NumberField label="γ gabião" value={p.gama_gabiao} onChange={(v) => setP('gama_gabiao', v)} step={0.5} suffix="kN/m³" />
                <NumberField label="Sobrecarga no platô" value={p.sobrecarga} onChange={(v) => setP('sobrecarga', v)} step={5} suffix="kPa" />
                <NumberField label="δ base / φ' fundação" value={p.atrito_base_fator} onChange={(v) => setP('atrito_base_fator', v)} step={0.05} />
                <NumberField label="Adesão / c' fundação" value={p.adesao_base_fator} onChange={(v) => setP('adesao_base_fator', v)} step={0.05} />
                <NumberField label="δ Coulomb / φ'" value={p.delta_coulomb_fator} onChange={(v) => setP('delta_coulomb_fator', v)} step={0.05} />
                <NumberField label="qs grampo" value={p.qs_grampo} onChange={(v) => setP('qs_grampo', v)} step={5} suffix="kN/m" />
                <NumberField label="T barra" value={p.t_barra} onChange={(v) => setP('t_barra', v)} step={10} suffix="kN" />
                <NumberField label="λ (T_max FHWA)" value={p.lambda_grampo} onChange={(v) => setP('lambda_grampo', v)} step={0.05} />
                <NumberField label="FS arrancamento mín." value={p.fs_arrancamento_min} onChange={(v) => setP('fs_arrancamento_min', v)} step={0.1} />
                <NumberField label="Nº de fatias" value={p.n_fatias} onChange={(v) => setP('n_fatias', Math.max(10, Math.round(v)))} step={1} />
              </div>
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input type="checkbox" checked={p.considerar_passivo} onChange={(e) => setP('considerar_passivo', e.target.checked)} />
                Considerar empuxo passivo do embutimento no deslizamento
              </label>
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input type="checkbox" checked={p.coesao_no_empuxo} onChange={(e) => setP('coesao_no_empuxo', e.target.checked)} />
                Coulomb: considerar c' no plano de ruptura da cunha
              </label>
              <button onClick={() => setParams(PARAMETROS_PADRAO)} className="text-xs text-brand hover:underline">
                voltar aos valores padrão
              </button>
            </div>
          )}
        </div>
      </div>

      {/* lista de muros */}
      {arquivo && (
        <div className={`${CARD} mb-6 overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="py-2 pr-3">Muro</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Situação</th>
                <th className="py-2 pr-3">Seções · H máx</th>
                <th className="py-2 pr-3">Solo</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">FS global</th>
                <th className="py-2 pr-3 text-right">Tomb. / Desl. / Arranc.</th>
                <th className="py-2 pr-3">Sugestão</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {arquivo.muros.map((m) => {
                const d = detalhes[m.id]
                const pr = progresso[m.id]
                const fs = d?.saida.fs
                const st = statusDe(m)
                return (
                  <tr
                    key={m.id}
                    onClick={() => { setSelecionado(m.id); setSecaoVista(null) }}
                    className={`cursor-pointer border-b border-border last:border-0 hover:bg-elevated ${selecionado === m.id ? 'bg-elevated' : ''}`}
                  >
                    <td className="py-2 pr-3 font-mono font-medium">{m.id}</td>
                    <td className="py-2 pr-3">{TIPO_LABEL[m.tipo]}</td>
                    <td className="py-2 pr-3 text-xs text-text-secondary">
                      {m.condicao} · {m.posicao === 'pe' ? 'pé' : 'crista'} · {m.junto} · talude 1:{fsFmt(m.talude_h_por_v)}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {m.secoes.length} · {fsFmt(secaoCritica(m).H)} m
                    </td>
                    <td className="py-2 pr-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={fontePorMuro[m.id] ?? '__padrao'}
                        onChange={(e) =>
                          setFontePorMuro((f) => {
                            const n = { ...f }
                            if (e.target.value === '__padrao') delete n[m.id]
                            else n[m.id] = e.target.value
                            return n
                          })
                        }
                        className={`${SELECT} max-w-[220px] py-1 text-xs`}
                        disabled={!temFonte}
                      >
                        <option value="__padrao">padrão{fontePadrao ? ` (${rotulo(fontePadrao)})` : ''}</option>
                        {temFonte && opcoesFonte}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <Chip status={st} />
                      {pr && (
                        <div className="mt-1 w-40">
                          <div className="h-1 rounded bg-elevated">
                            <div className="h-1 rounded bg-brand" style={{ width: `${Math.round(pr.fracao * 100)}%` }} />
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-text-secondary">{pr.mensagem}</div>
                        </div>
                      )}
                    </td>
                    <td className={`py-2 pr-3 text-right font-mono ${corFs(fs?.global, p.fs_global_min)}`}>{fsFmt(fs?.global, 3)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-xs">
                      {m.tipo === 'grampeado' ? (
                        <span className={corFs(fs?.arrancamento, p.fs_arrancamento_min)}>{fsFmt(fs?.arrancamento)}</span>
                      ) : (
                        <>
                          <span className={corFs(fs?.tombamento, p.fs_tombamento_min)}>{fsFmt(fs?.tombamento)}</span>
                          {' / '}
                          <span className={corFs(fs?.deslizamento, p.fs_deslizamento_min)}>{fsFmt(fs?.deslizamento)}</span>
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {d?.saida.sugestao.talude_h_por_v != null && <div>talude 1:{fsFmt(d.saida.sugestao.talude_h_por_v)}</div>}
                      {Object.entries(d?.saida.sugestao.muros_tipos?.[m.tipo] ?? {}).map(([k, v]) => (
                        <div key={k}>
                          {k} = {String(v).replace('.', ',')}
                        </div>
                      ))}
                    </td>
                    <td className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => verificar([m.id])} disabled={rodando || !temFonte} className="rounded p-1 text-text-secondary hover:text-brand disabled:opacity-30" title="Verificar só este muro">
                        <Play size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* detalhe do muro */}
      {muroSel && detSel && !detSel.semSolo && avaliacaoVista && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-text-primary">
                {muroSel.id} · {TIPO_LABEL[muroSel.tipo]}
              </h2>
              {detSel.saida.ok ? <CheckCircle2 size={18} className="text-accent-green" /> : <XCircle size={18} className="text-accent-red" />}
            </div>
            <div className="flex items-center gap-2">
              <select value={secaoVista ?? ''} onChange={(e) => setSecaoVista(e.target.value === '' ? null : Number(e.target.value))} className={`${SELECT} w-auto py-1 text-xs`}>
                <option value="">seção crítica (s = {detSel.governante?.secao.s})</option>
                {detSel.avaliacoes.map((a) => (
                  <option key={a.secao.s} value={a.secao.s}>
                    s = {a.secao.s} (H = {fsFmt(a.secao.H)} m)
                  </option>
                ))}
              </select>
              {detSel.sugerida && (
                <label className="flex items-center gap-1 text-xs text-text-secondary">
                  <input type="checkbox" checked={mostrarSugerida} onChange={(e) => setMostrarSugerida(e.target.checked)} />
                  mostrar sugestão
                </label>
              )}
              <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Responsável técnico" className={`${SELECT} w-44 py-1 text-xs`} />
              <button onClick={gerarPdf} disabled={gerandoPdf} className={BTN}>
                {gerandoPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} Relatório PDF
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <MuroCanvas
                ref={canvasRef}
                tipo={muroSel.tipo}
                avaliacao={avaliacaoVista}
                sugerida={mostrarSugerida && avaliacaoVista === detSel.governante ? detSel.sugerida : null}
                titulo={`${muroSel.id} · s = ${avaliacaoVista.secao.s} · H = ${avaliacaoVista.secao.H.toFixed(2).replace('.', ',')} m`}
              />
              <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-text-secondary">
                <span><span className="text-text-primary">━</span> projeto</span>
                <span>┅ terreno natural</span>
                <span className="text-accent-red">━ superfície crítica</span>
                {muroSel.tipo === 'grampeado' && <span className="text-accent-green">━ trecho ancorado</span>}
                {detSel.sugerida && <span className="text-accent-green">┅ sugestão</span>}
                <span className="text-accent-blue">┅ N.A.</span>
              </div>
            </div>

            <div className={CARD}>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">Fatores de segurança — s = {avaliacaoVista.secao.s}</div>
              <table className="w-full text-sm">
                <tbody className="font-mono">
                  <LinhaFs nome="Global (Bishop)" v={avaliacaoVista.fs.global} min={p.fs_global_min} d={3} />
                  {muroSel.tipo !== 'grampeado' && (
                    <>
                      <LinhaFs nome="Tombamento" v={avaliacaoVista.fs.tombamento} min={p.fs_tombamento_min} />
                      <LinhaFs nome="Deslizamento" v={avaliacaoVista.fs.deslizamento} min={p.fs_deslizamento_min} />
                      {avaliacaoVista.gravidade && (
                        <tr className="border-t border-border">
                          <td className="py-1 font-sans text-text-secondary">σmáx / σmín</td>
                          <td className={`py-1 text-right ${avaliacaoVista.gravidade.ok_tensao ? 'text-accent-green' : 'text-accent-red'}`}>
                            {fsFmt(avaliacaoVista.gravidade.sigma_max, 0)} / {fsFmt(avaliacaoVista.gravidade.sigma_min, 0)} kPa
                          </td>
                          <td className="py-1 pl-2 text-right font-sans text-xs text-text-secondary">≤ {fsFmt(p.tensao_admissivel, 0)}{avaliacaoVista.gravidade.sem_tracao ? '' : ' · tração'}</td>
                        </tr>
                      )}
                    </>
                  )}
                  {muroSel.tipo === 'grampeado' && <LinhaFs nome="Arrancamento (mín.)" v={avaliacaoVista.fs.arrancamento} min={p.fs_arrancamento_min} />}
                </tbody>
              </table>

              {detSel.sugerida && (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-accent-green">Sugestão para o ME-DYN-TALUDE</div>
                  <pre className="whitespace-pre-wrap rounded bg-elevated p-2 font-mono text-[11px] text-text-primary">{JSON.stringify(detSel.saida.sugestao, null, 1)}</pre>
                  <div className="mt-1 font-mono text-xs text-text-secondary">
                    com a sugestão: global {fsFmt(detSel.sugerida.fs.global, 3)}
                    {detSel.sugerida.fs.tombamento != null && ` · tomb. ${fsFmt(detSel.sugerida.fs.tombamento)} · desl. ${fsFmt(detSel.sugerida.fs.deslizamento)}`}
                    {detSel.sugerida.fs.arrancamento != null && ` · arranc. ${fsFmt(detSel.sugerida.fs.arrancamento)}`}
                    {` · H ${fsFmt(detSel.sugerida.secao.H)} m`}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* seções */}
            <div className={`${CARD} overflow-x-auto`}>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">Todas as seções</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-secondary">
                    <th className="py-1">s</th>
                    <th className="py-1 text-right">H</th>
                    <th className="py-1 text-right">Global</th>
                    {muroSel.tipo === 'grampeado' ? <th className="py-1 text-right">Arranc.</th> : <><th className="py-1 text-right">Tomb.</th><th className="py-1 text-right">Desl.</th><th className="py-1 text-right">σmáx</th></>}
                    <th className="py-1 text-right" />
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {detSel.avaliacoes.map((a) => (
                    <tr key={a.secao.s} onClick={() => setSecaoVista(a.secao.s)} className="cursor-pointer border-t border-border hover:bg-elevated">
                      <td className="py-1">{a.secao.s}{a === detSel.governante && <span className="ml-1 font-sans text-[10px] text-brand">crítica</span>}</td>
                      <td className="py-1 text-right">{fsFmt(a.secao.H)}</td>
                      <td className={`py-1 text-right ${corFs(a.fs.global, p.fs_global_min)}`}>{fsFmt(a.fs.global, 3)}</td>
                      {muroSel.tipo === 'grampeado' ? (
                        <td className={`py-1 text-right ${corFs(a.fs.arrancamento, p.fs_arrancamento_min)}`}>{fsFmt(a.fs.arrancamento)}</td>
                      ) : (
                        <>
                          <td className={`py-1 text-right ${corFs(a.fs.tombamento, p.fs_tombamento_min)}`}>{fsFmt(a.fs.tombamento)}</td>
                          <td className={`py-1 text-right ${corFs(a.fs.deslizamento, p.fs_deslizamento_min)}`}>{fsFmt(a.fs.deslizamento)}</td>
                          <td className={`py-1 text-right ${a.gravidade?.ok_tensao ? '' : 'text-accent-red'}`}>{fsFmt(a.gravidade?.sigma_max, 0)}</td>
                        </>
                      )}
                      <td className="py-1 text-right">{a.ok ? <CheckCircle2 size={14} className="inline text-accent-green" /> : <XCircle size={14} className="inline text-accent-red" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* detalhe do muro */}
            <div className={`${CARD} overflow-x-auto`}>
              {avaliacaoVista.gravidade && (
                <>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">Empuxo e verificações do muro</div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
                    {(() => {
                      const g = avaliacaoVista.gravidade!
                      const it: [string, string][] = [
                        ['Base B', `${fsFmt(g.B)} m`],
                        ['Plano virtual Hv', `${fsFmt(g.Hv)} m`],
                        ["φ' / γ retido", `${fsFmt(g.phi, 1)}° / ${fsFmt(g.gama, 1)}`],
                        ['β equivalente', `${fsFmt(g.beta, 1)}°`],
                        ['K ativo', fsFmt(g.K, 3)],
                        ['Ea (inclinação)', `${fsFmt(g.Ea, 1)} kN/m (${fsFmt(g.inclinacaoEmpuxo, 1)}°)`],
                        ['Eh / Ev', `${fsFmt(g.Eh, 1)} / ${fsFmt(g.Ev, 1)}`],
                        ['Aplicação', `${fsFmt(g.zE)} m da base`],
                        ['Peso corpo / solo', `${fsFmt(g.W_corpo, 1)} / ${fsFmt(g.W_solo, 1)}`],
                        ['ΣV / ΣH', `${fsFmt(g.sumV, 1)} / ${fsFmt(g.sumH, 1)}`],
                        ['M estab / instab', `${fsFmt(g.M_estab, 1)} / ${fsFmt(g.M_instab, 1)}`],
                        ['e (B/6)', `${fsFmt(g.excentricidade, 3)} (${fsFmt(g.B / 6, 3)})`],
                        ["Fundação φ' / c'", `${fsFmt(g.phi_fundacao, 1)}° / ${fsFmt(g.c_fundacao, 1)}`],
                        ['Água / subpressão', `${fsFmt(g.Uw, 1)} / ${fsFmt(g.U, 1)}`],
                      ]
                      return it.map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="font-sans text-text-secondary">{k}</dt>
                          <dd className="text-right text-text-primary">{v}</dd>
                        </div>
                      ))
                    })()}
                  </dl>
                </>
              )}
              {avaliacaoVista.grampeado && (
                <>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Arrancamento por linha (Ka = {fsFmt(avaliacaoVista.grampeado.Ka, 3)}, Sh × Sv = {fsFmt(avaliacaoVista.grampeado.sh)} × {fsFmt(avaliacaoVista.grampeado.sv)} m)
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-text-secondary">
                        <th className="py-1">Linha</th>
                        <th className="py-1 text-right">Cota</th>
                        <th className="py-1 text-right">L</th>
                        <th className="py-1 text-right">Le</th>
                        <th className="py-1 text-right">T_max</th>
                        <th className="py-1 text-right">R_p</th>
                        <th className="py-1 text-right">FS</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {avaliacaoVista.grampeado.linhas.map((l) => (
                        <tr key={l.linha} className="border-t border-border">
                          <td className="py-1">{l.linha}</td>
                          <td className="py-1 text-right">{fsFmt(l.zCabeca)}</td>
                          <td className="py-1 text-right">{fsFmt(l.L)}</td>
                          <td className="py-1 text-right">{fsFmt(l.Le)}</td>
                          <td className="py-1 text-right">{fsFmt(l.Tmax, 1)}</td>
                          <td className="py-1 text-right">{fsFmt(l.Rp, 1)}</td>
                          <td className={`py-1 text-right ${corFs(l.fs_arrancamento, p.fs_arrancamento_min)}`}>{fsFmt(l.fs_arrancamento)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>

          {/* inclinações testadas */}
          <div className={`${CARD} overflow-x-auto`}>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
              Inclinações testadas para o talude junto ao muro — seção s = {detSel.governante?.secao.s} (busca rápida)
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-secondary">
                  <th className="py-1">H:V</th>
                  <th className="py-1 text-right">H muro</th>
                  <th className="py-1 text-right">Área de terra (m²/m)</th>
                  <th className="py-1 text-right">Global</th>
                  <th className="py-1 text-right">{muroSel.tipo === 'grampeado' ? 'Arranc.' : 'Tomb. / Desl.'}</th>
                  <th className="py-1 text-right">FS/FS mín</th>
                  <th className="py-1 pl-3">Ajuste de dimensões</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {detSel.candidatos.map((c) => {
                  const escolhido = detSel.saida.sugestao.talude_h_por_v === c.r
                  return (
                    <tr key={c.r} className={`border-t border-border ${escolhido ? 'bg-green-50' : ''}`}>
                      <td className="py-1">1:{fsFmt(c.r)}{c.r === muroSel.talude_h_por_v && <span className="ml-1 font-sans text-[10px] text-text-secondary">atual</span>}{escolhido && <span className="ml-1 font-sans text-[10px] text-accent-green">sugerida</span>}</td>
                      <td className="py-1 text-right">{fsFmt(c.H)}</td>
                      <td className="py-1 text-right">{fsFmt(c.area, 1)}</td>
                      <td className={`py-1 text-right ${corFs(c.fs.global, p.fs_global_min)}`}>{fsFmt(c.fs.global, 3)}</td>
                      <td className="py-1 text-right text-xs">
                        {muroSel.tipo === 'grampeado' ? fsFmt(c.fs.arrancamento) : `${fsFmt(c.fs.tombamento)} / ${fsFmt(c.fs.deslizamento)}`}
                      </td>
                      <td className={`py-1 text-right ${c.razao >= 1 ? 'text-accent-green' : 'text-accent-red'}`}>{fsFmt(c.razao)}</td>
                      <td className="py-1 pl-3 text-xs">{c.dimsAjustados ? Object.entries(c.dimsAjustados).map(([k, v]) => `${k} = ${v}`).join(' · ') : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {detSel.saida.avisos.length > 0 && (
            <div className={CARD}>
              <div className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-accent-amber">
                <AlertTriangle size={14} /> Avisos
              </div>
              <ul className="list-disc space-y-1 pl-5 text-xs text-text-secondary">
                {detSel.saida.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {muroSel && detSel?.semSolo && (
        <div className={`${CARD} text-sm text-accent-amber`}>{detSel.saida.avisos[0]}</div>
      )}

      {!arquivo && (
        <div className={`${CARD} text-sm text-text-secondary`}>
          Importe o <span className="font-mono">_muros_secoes.json</span> gerado pelo ME-DYN-TALUDE, escolha o projeto e a
          fonte do solo e clique em <span className="font-medium text-text-primary">Verificar todos</span>. O resultado sai
          em <span className="font-mono">_muros_verificacao.json</span>, com as sugestões que o ME-DYN-TALUDE lê na rodada
          seguinte, e em relatório PDF por muro.
        </div>
      )}
    </div>
  )
}

function LinhaFs({ nome, v, min, d = 2 }: { nome: string; v: number | null | undefined; min: number; d?: number }) {
  return (
    <tr className="border-t border-border first:border-0">
      <td className="py-1 font-sans text-text-secondary">{nome}</td>
      <td className={`py-1 text-right text-base font-bold ${corFs(v, min)}`}>{fsFmt(v, d)}</td>
      <td className="py-1 pl-2 text-right font-sans text-xs text-text-secondary">≥ {fsFmt(min)}</td>
    </tr>
  )
}
