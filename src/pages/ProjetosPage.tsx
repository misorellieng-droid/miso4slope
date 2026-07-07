import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, FolderOpen, Layers, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  createProjeto, deleteProjeto, listProjetos, updateProjeto, type ProjetoSummary,
  listClientes, createCliente, type Cliente,
} from '../lib/projetosStorage'
import { dispatchCadastro } from '../lib/cadastroSync'

const REPLICATE_TARGETS = [
  { slug: 'miso4eng', label: 'Miso4Eng' },
  { slug: 'miso4manager', label: 'Miso4Manager' },
  { slug: 'miso4proj', label: 'Miso4Proj' },
]

export function ProjetosPage() {
  const [projetos, setProjetos] = useState<ProjetoSummary[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, c] = await Promise.all([listProjetos(), listClientes()])
      setProjetos(p)
      setClientes(c)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar projetos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // ── Modal: Novo / Editar projeto ──────────────────────────────────────────
  const [formOpen, setFormOpen] = useState<null | 'create' | string>(null)
  const [formNome, setFormNome] = useState('')
  const [formDescricao, setFormDescricao] = useState('')
  const [formClienteId, setFormClienteId] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  const openCreate = () => {
    setFormOpen('create')
    setFormNome('')
    setFormDescricao('')
    setFormClienteId('')
  }

  const openEdit = (p: ProjetoSummary, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setFormOpen(p.id)
    setFormNome(p.nome)
    setFormDescricao(p.descricao ?? '')
    setFormClienteId(p.cliente_id ?? '')
  }

  const closeForm = () => setFormOpen(null)

  const handleSaveForm = async () => {
    if (!formNome.trim()) {
      setError('Informe o nome do projeto.')
      return
    }
    setFormSaving(true)
    setError(null)
    try {
      if (formOpen === 'create') {
        await createProjeto(formNome.trim(), formDescricao.trim() || undefined, formClienteId || null)
      } else if (formOpen) {
        await updateProjeto(formOpen, {
          nome: formNome.trim(),
          descricao: formDescricao.trim() || null,
          cliente_id: formClienteId || null,
        })
      }
      closeForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar projeto.')
    } finally {
      setFormSaving(false)
    }
  }

  // ── Modal: Novo cliente (chamado a partir do modal de projeto) ────────────
  const [clienteFormOpen, setClienteFormOpen] = useState(false)
  const [clienteNome, setClienteNome] = useState('')
  const [clienteDocumento, setClienteDocumento] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [clienteReplicate, setClienteReplicate] = useState<string[]>([])
  const [clienteSaving, setClienteSaving] = useState(false)

  const openNovoCliente = () => {
    setClienteNome('')
    setClienteDocumento('')
    setClienteEmail('')
    setClienteTelefone('')
    setClienteReplicate([])
    setClienteFormOpen(true)
  }

  const handleSaveCliente = async () => {
    if (!clienteNome.trim()) {
      setError('Informe o nome do cliente.')
      return
    }
    setClienteSaving(true)
    setError(null)
    try {
      const created = await createCliente({
        nome: clienteNome.trim(),
        documento: clienteDocumento.trim() || null,
        email: clienteEmail.trim() || null,
        telefone: clienteTelefone.trim() || null,
      })
      setClientes((prev) => [...prev, created].sort((a, b) => a.nome.localeCompare(b.nome)))
      setFormClienteId(created.id)

      if (clienteReplicate.length > 0) {
        const result = await dispatchCadastro({
          sourceRecordId: created.id,
          tipo: 'cliente',
          payload: {
            tipo: 'PJ',
            nome: created.nome,
            documento: created.documento,
            email: created.email,
            telefone: created.telefone,
          },
          targetAppSlugs: clienteReplicate,
        })
        if (result.error) {
          setError(`Falha ao replicar cliente: ${result.error}`)
        }
      }

      setClienteFormOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar cliente.')
    } finally {
      setClienteSaving(false)
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
          onClick={openCreate}
          disabled={!supabase}
          className="flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          title={!supabase ? 'Configure VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY para habilitar' : undefined}
        >
          <Plus size={16} />
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
                  {p.cliente_nome && <div className="text-xs text-text-secondary">Cliente: {p.cliente_nome}</div>}
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
                    aria-label="Editar projeto"
                    onClick={(e) => openEdit(p, e)}
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

      {/* Modal: Novo/Editar projeto */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-sans text-lg font-bold text-text-primary">
                {formOpen === 'create' ? 'Novo projeto' : 'Editar projeto'}
              </h2>
              <button onClick={closeForm} className="rounded p-1 hover:bg-elevated">
                <X size={18} className="text-text-secondary" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Nome do projeto *</label>
                <input
                  className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
                  placeholder="Ex: Talude BR-101 km 42"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Cliente</label>
                <div className="flex gap-1">
                  <select
                    className="flex-1 rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
                    value={formClienteId}
                    onChange={(e) => setFormClienteId(e.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={openNovoCliente}
                    className="rounded-md border border-border px-2 hover:bg-elevated"
                    title="Novo cliente"
                  >
                    <Plus size={16} className="text-text-secondary" />
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Descrição</label>
                <textarea
                  className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
                  rows={2}
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={closeForm} className="rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-elevated">
                Cancelar
              </button>
              <button
                onClick={handleSaveForm}
                disabled={formSaving}
                className="flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {formSaving && <Loader2 size={14} className="animate-spin" />}
                {formOpen === 'create' ? 'Criar projeto' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Novo cliente */}
      {clienteFormOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-sans text-lg font-bold text-text-primary">Novo cliente</h2>
              <button onClick={() => setClienteFormOpen(false)} className="rounded p-1 hover:bg-elevated">
                <X size={18} className="text-text-secondary" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Nome *</label>
                <input
                  className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">CPF / CNPJ</label>
                  <input
                    className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
                    value={clienteDocumento}
                    onChange={(e) => setClienteDocumento(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Telefone</label>
                  <input
                    className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
                    value={clienteTelefone}
                    onChange={(e) => setClienteTelefone(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">E-mail</label>
                <input
                  type="email"
                  className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
                  value={clienteEmail}
                  onChange={(e) => setClienteEmail(e.target.value)}
                />
              </div>

              <div className="rounded-md border border-border p-3">
                <div className="mb-2 text-xs font-medium text-text-secondary">Replicar para</div>
                <div className="flex flex-wrap gap-3">
                  {REPLICATE_TARGETS.map((t) => (
                    <label key={t.slug} className="flex items-center gap-1.5 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={clienteReplicate.includes(t.slug)}
                        onChange={(e) =>
                          setClienteReplicate((prev) =>
                            e.target.checked ? [...prev, t.slug] : prev.filter((s) => s !== t.slug),
                          )
                        }
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setClienteFormOpen(false)} className="rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-elevated">
                Cancelar
              </button>
              <button
                onClick={handleSaveCliente}
                disabled={clienteSaving}
                className="flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {clienteSaving && <Loader2 size={14} className="animate-spin" />}
                Criar cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
