import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, FolderOpen, Layers, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { createProjeto, deleteProjeto, listProjetos, updateProjeto, type ProjetoSummary } from '../lib/projetosStorage'

export function ProjetosPage() {
  const [projetos, setProjetos] = useState<ProjetoSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setProjetos(await listProjetos())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar projetos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async () => {
    const nome = window.prompt('Nome do projeto:')
    if (!nome) return
    const descricao = window.prompt('Descrição (opcional):', '') ?? undefined

    setCreating(true)
    try {
      await createProjeto(nome, descricao)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar projeto.')
    } finally {
      setCreating(false)
    }
  }

  const handleRename = async (p: ProjetoSummary, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const nome = window.prompt('Nome do projeto:', p.nome)
    if (!nome || nome === p.nome) return
    setBusyId(p.id)
    try {
      await updateProjeto(p.id, { nome })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao renomear projeto.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (p: ProjetoSummary, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (
      !window.confirm(
        `Isso apaga o projeto "${p.nome}" e todas as suas análises e sondagens (${p.analisesCount} análise(s), ${p.sondagensCount} sondagem(ns)). Não pode ser desfeito. Continuar?`
      )
    ) {
      return
    }
    setBusyId(p.id)
    try {
      await deleteProjeto(p.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir projeto.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">Projetos</h1>
          <p className="text-sm text-text-secondary">Organize análises e sondagens por projeto.</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={!supabase || creating}
          className="flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          title={!supabase ? 'Configure VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY para habilitar' : undefined}
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Novo projeto
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">
          {error}
        </div>
      )}

      {!supabase && (
        <div className="mb-4 rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">
          Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para usar projetos.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 size={16} className="animate-spin" /> Carregando...
        </div>
      ) : projetos.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Nenhum projeto ainda. Projetos também são criados automaticamente ao salvar uma análise ou sondagem com um
          nome novo — ou clique em "Novo projeto" para criar um vazio.
        </div>
      ) : (
        <div className="space-y-2">
          {projetos.map((p) => (
            <Link
              key={p.id}
              to={`/projetos/${p.id}`}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 hover:border-brand"
            >
              <div className="flex items-center gap-3">
                <FolderOpen size={20} className="text-brand" />
                <div>
                  <div className="font-sans text-sm font-semibold text-text-primary">{p.nome}</div>
                  {p.descricao && <div className="text-xs text-text-secondary">{p.descricao}</div>}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-text-secondary">
                <span className="flex items-center gap-1">
                  <FileText size={14} /> {p.analisesCount} análise{p.analisesCount === 1 ? '' : 's'}
                </span>
                <span className="flex items-center gap-1">
                  <Layers size={14} /> {p.sondagensCount} sondage{p.sondagensCount === 1 ? 'm' : 'ns'}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    aria-label="Renomear projeto"
                    onClick={(e) => handleRename(p, e)}
                    disabled={busyId === p.id}
                    className="rounded p-1 hover:bg-elevated hover:text-text-primary disabled:opacity-40"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label="Excluir projeto"
                    onClick={(e) => handleDelete(p, e)}
                    disabled={busyId === p.id}
                    className="rounded p-1 hover:bg-accent-red/10 hover:text-accent-red disabled:opacity-40"
                  >
                    {busyId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
