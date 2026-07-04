import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FolderOpen, Loader2, Pencil, Trash2, Upload } from 'lucide-react'
import { SondagemReportImport } from '../components/forms/SondagemReportImport'
import { listAllSondagens, sondagemFileUrl, type SondagemSummary } from '../lib/projetosStorage'
import { deleteSondagem, renameSondagem } from '../lib/sondagemStorage'
import { supabase } from '../lib/supabase'

function fmt(n: number | null, digits = 2): string {
  return n == null || !Number.isFinite(n) ? '—' : n.toFixed(digits)
}

export function SondagensPage() {
  const [sondagens, setSondagens] = useState<SondagemSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setSondagens(await listAllSondagens())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar sondagens.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleRename = async (s: SondagemSummary) => {
    const novoNome = window.prompt('Nome da sondagem:', s.nome)
    if (!novoNome || novoNome === s.nome) return
    setBusyId(s.id)
    try {
      await renameSondagem(s.id, novoNome)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao renomear sondagem.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (s: SondagemSummary) => {
    if (!window.confirm(`Excluir a sondagem "${s.nome}" e suas camadas? Não pode ser desfeito.`)) return
    setBusyId(s.id)
    try {
      await deleteSondagem(s.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir sondagem.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-sans text-xl font-bold text-text-primary">Sondagens</h1>
        <p className="text-sm text-text-secondary">
          Importe boletins de sondagem e reutilize-os em qualquer análise do projeto.
        </p>
      </div>

      {!supabase && (
        <div className="rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">
          Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para usar sondagens.
        </div>
      )}

      <SondagemReportImport onSaved={load} />

      <section>
        <h2 className="mb-2 font-sans text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Todas as sondagens ({sondagens.length})
        </h2>

        {error && (
          <div className="mb-3 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 size={16} className="animate-spin" /> Carregando...
          </div>
        ) : sondagens.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
            Nenhuma sondagem salva ainda. Use "Importar relatório completo" acima, ou salve uma sondagem avulsa na
            aba Solo/Fundação de uma análise.
          </div>
        ) : (
          <div className="space-y-2">
            {sondagens.map((s) => (
              <div key={s.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-text-primary">{s.nome}</div>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-text-secondary">
                      <Link to={`/projetos/${s.projeto_id}`} className="flex items-center gap-1 hover:text-text-primary">
                        <FolderOpen size={12} /> {s.projeto_nome}
                      </Link>
                      <span>{s.camadasCount} camada(s)</span>
                      <span>Cota do terreno: {fmt(s.cota_terreno)} m</span>
                      {s.page_start != null && (
                        <span>
                          Páginas {s.page_start}
                          {s.page_end != null && s.page_end !== s.page_start ? `–${s.page_end}` : ''} do relatório
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-xs text-text-secondary">
                    {s.file_path && (
                      <a
                        href={sondagemFileUrl(s.file_path) ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:text-text-primary"
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
                      onClick={() => handleRename(s)}
                      disabled={busyId === s.id}
                      className="rounded p-1.5 hover:bg-elevated hover:text-text-primary disabled:opacity-40"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      aria-label="Excluir sondagem"
                      onClick={() => handleDelete(s)}
                      disabled={busyId === s.id}
                      className="rounded p-1.5 hover:bg-accent-red/10 hover:text-accent-red disabled:opacity-40"
                    >
                      {busyId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
