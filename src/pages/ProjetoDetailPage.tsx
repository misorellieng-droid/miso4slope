import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, Download, FileDown, Loader2, Trash2, Upload } from 'lucide-react'
import {
  deleteProjeto,
  getProjetoDetail,
  getSondagemCamadas,
  sondagemFileUrl,
  type CamadaRow,
  type ProjetoDetail,
} from '../lib/projetosStorage'

const METHOD_LABELS: Record<string, string> = {
  bishop: 'Bishop Simplificado',
  fellenius: 'Fellenius',
}

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
  const [expandedSondagem, setExpandedSondagem] = useState<string | null>(null)
  const [camadas, setCamadas] = useState<Record<string, CamadaRow[]>>({})

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    getProjetoDetail(id)
      .then(setProjeto)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar projeto.'))
      .finally(() => setLoading(false))
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
          {projeto.descricao && <p className="text-sm text-text-secondary">{projeto.descricao}</p>}
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-2 rounded-md border border-accent-red/40 px-3 py-2 text-sm text-accent-red hover:bg-accent-red/10 disabled:opacity-60"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Excluir projeto
        </button>
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
    </div>
  )
}
