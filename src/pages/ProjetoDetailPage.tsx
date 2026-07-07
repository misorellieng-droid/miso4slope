import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronUp,
  Download,
  FileDown,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Share2,
  Trash2,
  UserPlus,
  Upload,
  Users,
} from 'lucide-react'
import { deleteAnalysis, renameAnalysis } from '../lib/analysisStorage'
import {
  createCliente,
  deleteProjeto,
  getProjetoDetail,
  getSondagemCamadas,
  listClientes,
  sondagemFileUrl,
  updateProjeto,
  type CamadaRow,
  type Cliente,
  type ProjetoDetail,
} from '../lib/projetosStorage'
import { deleteSondagem, renameSondagem } from '../lib/sondagemStorage'
import { dispatchCadastro } from '../lib/cadastroSync'
import { Modal } from '../components/ui/Modal'
import { Field, fieldInputClass } from '../components/ui/Field'

const METHOD_LABELS: Record<string, string> = {
  bishop: 'Bishop Simplificado',
  fellenius: 'Fellenius',
}

const REPLICATE_TARGETS = [
  { slug: 'miso4eng', label: 'Miso4Eng' },
  { slug: 'miso4manager', label: 'Miso4Manager' },
  { slug: 'miso4proj', label: 'Miso4Proj' },
]

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const GHOST_BTN = 'rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-elevated'

function fmt(n: number | null, digits = 2): string {
  return n == null || !Number.isFinite(n) ? '—' : n.toFixed(digits)
}

export function ProjetoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [projeto, setProjeto] = useState<ProjetoDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [busyRowId, setBusyRowId] = useState<string | null>(null)
  const [expandedSondagem, setExpandedSondagem] = useState<string | null>(null)
  const [camadas, setCamadas] = useState<Record<string, CamadaRow[]>>({})
  const [clientes, setClientes] = useState<Cliente[]>([])

  // ── Modal: Editar projeto ─────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false)
  const [formNome, setFormNome] = useState('')
  const [formDescricao, setFormDescricao] = useState('')
  const [formClienteId, setFormClienteId] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  // ── Modal: Novo cliente (chamado a partir do modal de projeto) ────────────
  const [clienteFormOpen, setClienteFormOpen] = useState(false)
  const [clienteNome, setClienteNome] = useState('')
  const [clienteDocumento, setClienteDocumento] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [clienteReplicate, setClienteReplicate] = useState<string[]>([])
  const [clienteSaving, setClienteSaving] = useState(false)

  const reload = () => {
    if (!id) return Promise.resolve()
    return getProjetoDetail(id)
      .then(setProjeto)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar projeto.'))
  }

  useEffect(() => {
    listClientes()
      .then(setClientes)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    reload().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const toggleSondagem = async (sondagemId: string) => {
    if (expandedSondagem === sondagemId) {
      setExpandedSondagem(null)
      return
    }
    setExpandedSondagem(sondagemId)
    if (!camadas[sondagemId]) {
      try {
        const rows = await getSondagemCamadas(sondagemId)
        setCamadas((prev) => ({ ...prev, [sondagemId]: rows }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar camadas.')
      }
    }
  }

  const handleDelete = async () => {
    if (!id || !projeto) return
    if (
      !window.confirm(
        `Isso apaga o projeto "${projeto.nome}" e todas as suas análises e sondagens (${projeto.analises.length} análise(s), ${projeto.sondagens.length} sondagem(ns)). Não pode ser desfeito. Continuar?`
      )
    ) {
      return
    }
    setDeleting(true)
    try {
      await deleteProjeto(id)
      navigate('/projetos')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir projeto.')
      setDeleting(false)
    }
  }

  const openEdit = () => {
    if (!projeto) return
    setFormNome(projeto.nome)
    setFormDescricao(projeto.descricao ?? '')
    setFormClienteId(projeto.cliente_id ?? '')
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!id || !formNome.trim()) {
      setError('Informe o nome do projeto.')
      return
    }
    setFormSaving(true)
    setError(null)
    try {
      await updateProjeto(id, {
        nome: formNome.trim(),
        descricao: formDescricao.trim() || null,
        cliente_id: formClienteId || null,
      })
      setEditOpen(false)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar projeto.')
    } finally {
      setFormSaving(false)
    }
  }

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

  const handleDeleteAnalise = async (analiseId: string, nomeSecao: string) => {
    if (!window.confirm(`Excluir a análise "${nomeSecao}"? Não pode ser desfeito.`)) return
    setBusyRowId(analiseId)
    try {
      await deleteAnalysis(analiseId)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir análise.')
    } finally {
      setBusyRowId(null)
    }
  }

  const handleRenameAnalise = async (analiseId: string, nomeSecao: string) => {
    const novoNome = window.prompt('Nome da seção/análise:', nomeSecao)
    if (!novoNome || novoNome === nomeSecao) return
    setBusyRowId(analiseId)
    try {
      await renameAnalysis(analiseId, novoNome)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao renomear análise.')
    } finally {
      setBusyRowId(null)
    }
  }

  const handleDeleteSondagem = async (sondagemId: string, nome: string) => {
    if (!window.confirm(`Excluir a sondagem "${nome}" e suas camadas? Não pode ser desfeito.`)) return
    setBusyRowId(sondagemId)
    try {
      await deleteSondagem(sondagemId)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir sondagem.')
    } finally {
      setBusyRowId(null)
    }
  }

  const handleRenameSondagem = async (sondagemId: string, nome: string) => {
    const novoNome = window.prompt('Nome da sondagem:', nome)
    if (!novoNome || novoNome === nome) return
    setBusyRowId(sondagemId)
    try {
      await renameSondagem(sondagemId, novoNome)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao renomear sondagem.')
    } finally {
      setBusyRowId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Loader2 size={16} className="animate-spin" /> Carregando...
      </div>
    )
  }

  if (error && !projeto) {
    return <div className="rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>
  }

  if (!projeto) return null

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/projetos" className="mb-3 flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
        <ArrowLeft size={14} /> Projetos
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">{projeto.nome}</h1>
          {projeto.cliente_nome && (
            <p className="flex items-center gap-1 text-sm text-text-secondary">
              <Users size={13} /> {projeto.cliente_nome}
            </p>
          )}
          {projeto.descricao && <p className="text-sm text-text-secondary">{projeto.descricao}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openEdit}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
          >
            <Pencil size={14} /> Editar
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 rounded-md border border-accent-red/40 px-3 py-2 text-sm text-accent-red hover:bg-accent-red/10 disabled:opacity-60"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Excluir projeto
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">
          {error}
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-2 font-sans text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Análises ({projeto.analises.length})
        </h2>
        {projeto.analises.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-4 text-sm text-text-secondary">
            Nenhuma análise salva neste projeto ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {projeto.analises.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
              >
                <div>
                  <div className="text-sm font-medium text-text-primary">{a.nome_secao}</div>
                  <div className="text-xs text-text-secondary">
                    {METHOD_LABELS[a.method] ?? a.method} · {a.mode === 'corte' ? 'Corte' : 'Aterro'} ·{' '}
                    {new Date(a.created_at).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {a.fs != null && (
                    <span
                      className="font-mono text-sm font-bold"
                      style={{ color: a.is_adequate ? 'var(--color-accent-green)' : 'var(--color-accent-red)' }}
                    >
                      FS = {a.fs.toFixed(3)}
                    </span>
                  )}
                  <button
                    aria-label="Renomear análise"
                    onClick={() => handleRenameAnalise(a.id, a.nome_secao)}
                    disabled={busyRowId === a.id}
                    className="rounded p-1.5 text-text-secondary hover:bg-elevated hover:text-text-primary disabled:opacity-40"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label="Excluir análise"
                    onClick={() => handleDeleteAnalise(a.id, a.nome_secao)}
                    disabled={busyRowId === a.id}
                    className="rounded p-1.5 text-text-secondary hover:bg-accent-red/10 hover:text-accent-red disabled:opacity-40"
                  >
                    {busyRowId === a.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                  <Link
                    to={`/analise?load=${a.id}`}
                    className="rounded-md border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary"
                  >
                    Abrir
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-sans text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Sondagens ({projeto.sondagens.length})
        </h2>
        {projeto.sondagens.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-4 text-sm text-text-secondary">
            Nenhuma sondagem salva neste projeto ainda. Envie um boletim na aba Solo/Fundação de uma análise e use
            "Salvar sondagem no projeto".
          </div>
        ) : (
          <div className="space-y-2">
            {projeto.sondagens.map((s) => (
              <div key={s.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => toggleSondagem(s.id)}
                    className="flex items-center gap-2 text-left text-sm font-medium text-text-primary"
                  >
                    {expandedSondagem === s.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {s.nome}
                  </button>
                  <div className="flex items-center gap-3 text-xs text-text-secondary">
                    <span>{s.camadasCount} camada(s)</span>
                    {s.file_path && (
                      <a
                        href={sondagemFileUrl(s.file_path) ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 hover:text-text-primary"
                      >
                        <Download size={12} /> {s.file_name ?? 'arquivo'}
                      </a>
                    )}
                    <Link
                      to={`/analise?importSondagemId=${s.id}`}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:text-text-primary"
                    >
                      <Upload size={12} /> Usar em nova análise
                    </Link>
                    <button
                      aria-label="Renomear sondagem"
                      onClick={() => handleRenameSondagem(s.id, s.nome)}
                      disabled={busyRowId === s.id}
                      className="rounded p-1 hover:bg-elevated hover:text-text-primary disabled:opacity-40"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      aria-label="Excluir sondagem"
                      onClick={() => handleDeleteSondagem(s.id, s.nome)}
                      disabled={busyRowId === s.id}
                      className="rounded p-1 hover:bg-accent-red/10 hover:text-accent-red disabled:opacity-40"
                    >
                      {busyRowId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>

                {expandedSondagem === s.id && (
                  <div className="mt-3 overflow-x-auto border-t border-border pt-3">
                    <div className="mb-2 flex gap-4 text-xs text-text-secondary">
                      <span>Cota do terreno: {fmt(s.cota_terreno)} m</span>
                      <span>N.A.: {fmt(s.na_profundidade)} m</span>
                    </div>
                    {!camadas[s.id] ? (
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <Loader2 size={12} className="animate-spin" /> Carregando camadas...
                      </div>
                    ) : (
                      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-xs">
                        <thead>
                          <tr className="text-left text-text-secondary">
                            <th className="pb-1">Camada</th>
                            <th className="pb-1">Prof. (m)</th>
                            <th className="pb-1">N_SPT</th>
                            <th className="pb-1">c' (kPa)</th>
                            <th className="pb-1">φ' (°)</th>
                            <th className="pb-1">γ (kN/m³)</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          {camadas[s.id].map((c) => (
                            <tr key={c.id} className="border-t border-border">
                              <td className="py-1 pr-2 font-sans">{c.nome}</td>
                              <td className="py-1 pr-2">
                                {fmt(c.depth_top)}–{fmt(c.depth_base)}
                              </td>
                              <td className="py-1 pr-2">{c.n_spt ?? '—'}</td>
                              <td className="py-1 pr-2">{fmt(c.c)}</td>
                              <td className="py-1 pr-2">{fmt(c.phi)}</td>
                              <td className="py-1">{fmt(c.gamma)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-6 flex items-center gap-1 text-xs text-text-secondary">
        <FileDown size={12} /> Precisa de um relatório? Abra uma análise e use "Exportar PDF".
      </p>

      {/* Modal: Editar projeto */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar projeto"
        description="Atualize os dados do projeto."
        icon={<Pencil size={20} />}
        footer={
          <>
            <button onClick={() => setEditOpen(false)} className={GHOST_BTN}>
              Cancelar
            </button>
            <button onClick={handleSaveEdit} disabled={formSaving} className={PRIMARY_BTN}>
              {formSaving && <Loader2 size={14} className="animate-spin" />}
              Salvar alterações
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
