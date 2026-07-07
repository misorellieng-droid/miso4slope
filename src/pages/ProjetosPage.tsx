import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  ChevronDown,
  FileText,
  FolderOpen,
  FolderPlus,
  Layers,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Share2,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  createProjeto, deleteProjeto, listProjetos, updateProjeto, type ProjetoSummary,
  listClientes, createCliente, type Cliente,
} from '../lib/projetosStorage'
import { dispatchCadastro } from '../lib/cadastroSync'
import { Modal } from '../components/ui/Modal'
import { Field, fieldInputClass } from '../components/ui/Field'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const GHOST_BTN = 'rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-elevated'

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
      <Modal
        open={formOpen != null}
        onClose={closeForm}
        title={formOpen === 'create' ? 'Novo projeto' : 'Editar projeto'}
        description={
          formOpen === 'create'
            ? 'Cadastre o projeto e, se já tiver, vincule o cliente responsável.'
            : 'Atualize os dados do projeto.'
        }
        icon={<FolderPlus size={20} />}
        footer={
          <>
            <button onClick={closeForm} className={GHOST_BTN}>
              Cancelar
            </button>
            <button onClick={handleSaveForm} disabled={formSaving} className={PRIMARY_BTN}>
              {formSaving && <Loader2 size={14} className="animate-spin" />}
              {formOpen === 'create' ? 'Criar projeto' : 'Salvar alterações'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nome do projeto" required>
            <input
              autoFocus
              className={fieldInputClass}
              placeholder="Ex: Talude BR-101 km 42"
              value={formNome}
              onChange={(e) => setFormNome(e.target.value)}
            />
          </Field>

          <Field label="Cliente" hint="Vincule um cliente já cadastrado ou crie um novo sem sair daqui.">
            <div className="flex items-stretch gap-2">
              <div className="relative flex-1">
                <select
                  className={`${fieldInputClass} appearance-none pr-8`}
                  value={formClienteId}
                  onChange={(e) => setFormClienteId(e.target.value)}
                >
                  <option value="">Nenhum cliente vinculado</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={15}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
                />
              </div>
              <button
                type="button"
                onClick={openNovoCliente}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-xs font-medium text-text-secondary transition hover:border-brand hover:text-brand"
                title="Cadastrar novo cliente"
              >
                <UserPlus size={14} /> Novo
              </button>
            </div>
          </Field>

          <Field label="Descrição" hint="Opcional — local, tipo de talude, referência interna, etc.">
            <textarea
              className={`${fieldInputClass} resize-none`}
              rows={3}
              value={formDescricao}
              onChange={(e) => setFormDescricao(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      {/* Modal: Novo cliente */}
      <Modal
        open={clienteFormOpen}
        onClose={() => setClienteFormOpen(false)}
        title="Novo cliente"
        description="Cadastre o cliente para vincular a este e a outros projetos."
        icon={<UserPlus size={20} />}
        footer={
          <>
            <button onClick={() => setClienteFormOpen(false)} className={GHOST_BTN}>
              Cancelar
            </button>
            <button onClick={handleSaveCliente} disabled={clienteSaving} className={PRIMARY_BTN}>
              {clienteSaving && <Loader2 size={14} className="animate-spin" />}
              Criar cliente
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nome" required>
            <input autoFocus className={fieldInputClass} value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="CPF / CNPJ">
              <div className="relative">
                <Building2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                <input
                  className={`${fieldInputClass} pl-8`}
                  value={clienteDocumento}
                  onChange={(e) => setClienteDocumento(e.target.value)}
                />
              </div>
            </Field>
            <Field label="Telefone">
              <div className="relative">
                <Phone size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                <input
                  className={`${fieldInputClass} pl-8`}
                  value={clienteTelefone}
                  onChange={(e) => setClienteTelefone(e.target.value)}
                />
              </div>
            </Field>
          </div>

          <Field label="E-mail">
            <div className="relative">
              <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                type="email"
                className={`${fieldInputClass} pl-8`}
                value={clienteEmail}
                onChange={(e) => setClienteEmail(e.target.value)}
              />
            </div>
          </Field>

          <div className="rounded-lg border border-border bg-elevated/40 p-3.5">
            <div className="mb-2.5 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <Share2 size={13} /> Replicar cadastro para
            </div>
            <div className="flex flex-wrap gap-2">
              {REPLICATE_TARGETS.map((t) => {
                const active = clienteReplicate.includes(t.slug)
                return (
                  <button
                    type="button"
                    key={t.slug}
                    onClick={() =>
                      setClienteReplicate((prev) =>
                        active ? prev.filter((s) => s !== t.slug) : [...prev, t.slug]
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      active
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-border text-text-secondary hover:border-brand/50 hover:text-text-primary'
                    }`}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
