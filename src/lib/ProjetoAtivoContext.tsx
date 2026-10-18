import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { listProjetos, type ProjetoSummary } from './projetosStorage'
import { createRevisao, erroMigracaoPendente, listRevisoes, type Revisao } from './revisoesStorage'
import { supabase } from './supabase'

// Projeto ativo + revisão ativa (mesmo modelo do miso4dren): todo estudo salvo
// (análise de talude, verificação de muros, pré-dimensionamento de contenção)
// vai para o projeto e a revisão escolhidos aqui. A escolha fica no navegador.

const KEY_PROJETO = 'miso4slope:projetoAtivoId'
const keyRevisao = (projetoId: string) => `miso4slope:revisaoAtivaId:${projetoId}`

function ler(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function gravar(key: string, v: string | null) {
  try {
    if (v) localStorage.setItem(key, v)
    else localStorage.removeItem(key)
  } catch {
    // localStorage indisponível — a escolha só vale nesta sessão
  }
}

interface Ctx {
  projetos: ProjetoSummary[]
  projetoAtivoId: string | null
  projetoAtivo: ProjetoSummary | null
  setProjetoAtivoId: (id: string | null) => void
  revisoes: Revisao[]
  revisaoAtivaId: string | null
  revisaoAtiva: Revisao | null
  setRevisaoAtivaId: (id: string | null) => void
  loading: boolean
  /** true quando a migração 008 ainda não foi rodada no Supabase */
  migracaoPendente: boolean
  error: string | null
  reload: () => Promise<void>
  /** Cria uma revisão no projeto ativo e a torna ativa. */
  novaRevisao: (nome: string, descricao?: string | null) => Promise<Revisao>
  /** Devolve a revisão ativa; se o projeto ainda não tem nenhuma, cria "Rev. 0". */
  garantirRevisao: () => Promise<{ projetoId: string; revisaoId: string }>
}

const ProjetoAtivoContext = createContext<Ctx | null>(null)

export function ProjetoAtivoProvider({ children }: { children: ReactNode }) {
  const [projetos, setProjetos] = useState<ProjetoSummary[]>([])
  const [projetoAtivoId, setProjetoAtivoIdState] = useState<string | null>(() => ler(KEY_PROJETO))
  const [revisoes, setRevisoes] = useState<Revisao[]>([])
  const [revisaoAtivaId, setRevisaoAtivaIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [migracaoPendente, setMigracaoPendente] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const carregarRevisoes = useCallback(async (projetoId: string | null) => {
    if (!projetoId || !supabase) {
      setRevisoes([])
      setRevisaoAtivaIdState(null)
      return
    }
    try {
      const data = await listRevisoes(projetoId)
      setMigracaoPendente(false)
      setRevisoes(data)
      const salva = ler(keyRevisao(projetoId))
      setRevisaoAtivaIdState(data.find((r) => r.id === salva)?.id ?? data[data.length - 1]?.id ?? null)
    } catch (e) {
      setRevisoes([])
      setRevisaoAtivaIdState(null)
      if (erroMigracaoPendente(e)) setMigracaoPendente(true)
      else setError(e instanceof Error ? e.message : 'Erro ao carregar revisões.')
    }
  }, [])

  const reload = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const lista = await listProjetos()
      setProjetos(lista)
      setProjetoAtivoIdState((atual) => (atual && lista.some((p) => p.id === atual) ? atual : null))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar projetos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    carregarRevisoes(projetoAtivoId)
  }, [projetoAtivoId, carregarRevisoes])

  const setProjetoAtivoId = (id: string | null) => {
    setProjetoAtivoIdState(id)
    gravar(KEY_PROJETO, id)
  }

  const setRevisaoAtivaId = (id: string | null) => {
    setRevisaoAtivaIdState(id)
    if (projetoAtivoId) gravar(keyRevisao(projetoAtivoId), id)
  }

  const novaRevisao = async (nome: string, descricao?: string | null) => {
    if (!projetoAtivoId) throw new Error('Escolha o projeto ativo primeiro.')
    const r = await createRevisao(projetoAtivoId, nome, descricao)
    setRevisoes((rs) => [...rs, r])
    setRevisaoAtivaId(r.id)
    return r
  }

  const garantirRevisao = async () => {
    if (!projetoAtivoId) throw new Error('Escolha o projeto ativo (cabeçalho) antes de salvar.')
    if (revisaoAtivaId) return { projetoId: projetoAtivoId, revisaoId: revisaoAtivaId }
    const r = await novaRevisao('Rev. 0')
    return { projetoId: projetoAtivoId, revisaoId: r.id }
  }

  const value = useMemo<Ctx>(
    () => ({
      projetos,
      projetoAtivoId,
      projetoAtivo: projetos.find((p) => p.id === projetoAtivoId) ?? null,
      setProjetoAtivoId,
      revisoes,
      revisaoAtivaId,
      revisaoAtiva: revisoes.find((r) => r.id === revisaoAtivaId) ?? null,
      setRevisaoAtivaId,
      loading,
      migracaoPendente,
      error,
      reload,
      novaRevisao,
      garantirRevisao,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projetos, projetoAtivoId, revisoes, revisaoAtivaId, loading, migracaoPendente, error]
  )

  return <ProjetoAtivoContext.Provider value={value}>{children}</ProjetoAtivoContext.Provider>
}

export function useProjetoAtivo(): Ctx {
  const ctx = useContext(ProjetoAtivoContext)
  if (!ctx) throw new Error('useProjetoAtivo deve ser usado dentro de <ProjetoAtivoProvider>')
  return ctx
}
