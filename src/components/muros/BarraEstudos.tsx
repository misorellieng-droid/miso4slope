import { useEffect, useState } from 'react'
import { FolderOpen, Loader2, Pencil, Save, Trash2 } from 'lucide-react'
import { useProjetoAtivo } from '../../lib/ProjetoAtivoContext'
import {
  deleteEstudo,
  listEstudos,
  loadEstudo,
  renameEstudo,
  saveEstudo,
  TIPO_ESTUDO_LABEL,
  updateEstudo,
  type EstudoResumo,
  type TipoEstudo,
} from '../../lib/estudosStorage'
import { erroMigracaoPendente } from '../../lib/revisoesStorage'

// Barra de salvar/abrir estudos no projeto e na revisão ativos (cabeçalho).
// Serve à verificação de muros e aos três pré-dimensionamentos de contenção.

const BTN =
  'flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40'

interface Props {
  tipo: TipoEstudo
  nomeSugerido: string
  /** Monta o que será gravado; null = nada para salvar ainda. */
  coletar: () => { dados: unknown; resumo?: Record<string, unknown> | null } | null
  /** Recebe os dados de um estudo aberto para restaurar a tela. */
  aoAbrir: (dados: unknown, nome: string) => void
}

export function BarraEstudos({ tipo, nomeSugerido, coletar, aoAbrir }: Props) {
  const { projetoAtivoId, projetoAtivo, revisaoAtivaId, revisaoAtiva, garantirRevisao, migracaoPendente } = useProjetoAtivo()
  const [atual, setAtual] = useState<{ id: string; nome: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aberta, setAberta] = useState(false)
  const [lista, setLista] = useState<EstudoResumo[]>([])
  const [todasRevisoes, setTodasRevisoes] = useState(false)

  // trocou de projeto/revisão: o estudo aberto deixa de ser o "atual" para regravar
  useEffect(() => {
    setAtual(null)
  }, [projetoAtivoId, revisaoAtivaId])

  const erroMsg = (e: unknown, prefixo: string) =>
    erroMigracaoPendente(e)
      ? 'Falta rodar a migração supabase/008_revisoes_estudos.sql no Supabase.'
      : `${prefixo}: ${e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'erro desconhecido'}`

  const recarregar = async (todas = todasRevisoes) => {
    if (!projetoAtivoId) return
    try {
      const l = await listEstudos(projetoAtivoId, todas ? null : revisaoAtivaId)
      setLista(l.filter((e) => e.tipo === tipo))
    } catch (e) {
      setMsg(erroMsg(e, 'Erro ao listar'))
    }
  }

  const salvar = async (comoNovo: boolean) => {
    if (!projetoAtivoId) {
      setMsg('Escolha o projeto ativo no cabeçalho antes de salvar.')
      return
    }
    const coleta = coletar()
    if (!coleta) {
      setMsg('Nada para salvar ainda — calcule o estudo primeiro.')
      return
    }
    setOcupado(true)
    setMsg(null)
    try {
      if (atual && !comoNovo) {
        await updateEstudo(atual.id, coleta.dados, coleta.resumo)
        setMsg(`Estudo "${atual.nome}" atualizado.`)
      } else {
        const nome = window.prompt('Nome do estudo:', nomeSugerido)
        if (!nome?.trim()) return
        const { projetoId, revisaoId } = await garantirRevisao()
        const id = await saveEstudo({ projetoId, revisaoId, tipo, nome: nome.trim(), dados: coleta.dados, resumo: coleta.resumo })
        setAtual({ id, nome: nome.trim() })
        setMsg(`Estudo salvo em ${projetoAtivo?.nome ?? 'projeto'} · ${revisaoAtiva?.nome ?? 'Rev. 0'}.`)
      }
      if (aberta) await recarregar()
    } catch (e) {
      setMsg(erroMsg(e, 'Erro ao salvar'))
    } finally {
      setOcupado(false)
    }
  }

  const abrirLista = async () => {
    setAberta(true)
    setMsg(null)
    await recarregar()
  }

  const abrir = async (id: string) => {
    setOcupado(true)
    try {
      const e = await loadEstudo(id)
      aoAbrir(e.dados, e.nome)
      setAtual({ id, nome: e.nome })
      setAberta(false)
      setMsg(`Estudo "${e.nome}" aberto.`)
    } catch (err) {
      setMsg(erroMsg(err, 'Erro ao abrir'))
    } finally {
      setOcupado(false)
    }
  }

  const renomear = async (e: EstudoResumo) => {
    const nome = window.prompt('Nome do estudo:', e.nome)
    if (!nome?.trim() || nome === e.nome) return
    try {
      await renameEstudo(e.id, nome.trim())
      if (atual?.id === e.id) setAtual({ id: e.id, nome: nome.trim() })
      await recarregar()
    } catch (err) {
      setMsg(erroMsg(err, 'Erro ao renomear'))
    }
  }

  const excluir = async (e: EstudoResumo) => {
    if (!window.confirm(`Excluir o estudo "${e.nome}"? Não pode ser desfeito.`)) return
    try {
      await deleteEstudo(e.id)
      if (atual?.id === e.id) setAtual(null)
      await recarregar()
    } catch (err) {
      setMsg(erroMsg(err, 'Erro ao excluir'))
    }
  }

  const destino = projetoAtivo
    ? `${projetoAtivo.nome} · ${revisaoAtiva?.nome ?? 'sem revisão (será criada Rev. 0)'}`
    : 'nenhum projeto ativo — escolha no cabeçalho'

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto text-xs text-text-secondary">
          {TIPO_ESTUDO_LABEL[tipo]} · destino: <span className="text-text-primary">{destino}</span>
          {atual && (
            <>
              {' '}
              · aberto: <span className="text-text-primary">{atual.nome}</span>
            </>
          )}
        </div>
        {msg && <span className="text-xs text-text-secondary">{msg}</span>}
        <button className={BTN} onClick={abrirLista} disabled={!projetoAtivoId || migracaoPendente}>
          <FolderOpen size={14} /> Abrir
        </button>
        {atual && (
          <button className={BTN} onClick={() => salvar(true)} disabled={ocupado || !projetoAtivoId}>
            Salvar como novo
          </button>
        )}
        <button className={BTN} onClick={() => salvar(false)} disabled={ocupado || !projetoAtivoId || migracaoPendente}>
          {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {atual ? 'Salvar' : 'Salvar estudo'}
        </button>
      </div>

      {aberta && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 text-text-secondary">
              <input
                type="checkbox"
                checked={todasRevisoes}
                onChange={(e) => {
                  setTodasRevisoes(e.target.checked)
                  recarregar(e.target.checked)
                }}
              />
              Todas as revisões do projeto
            </label>
            <button onClick={() => setAberta(false)} className="text-text-secondary hover:underline">
              Fechar
            </button>
          </div>
          {lista.length === 0 ? (
            <div className="text-sm text-text-secondary">Nenhum estudo deste tipo {todasRevisoes ? 'no projeto' : 'nesta revisão'}.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {lista.map((e) => (
                <li key={e.id} className="flex items-center rounded hover:bg-elevated">
                  <button onClick={() => abrir(e.id)} className="flex flex-1 items-center justify-between px-2 py-1.5 text-left">
                    <span className="text-text-primary">{e.nome}</span>
                    <span className="font-mono text-xs text-text-secondary">
                      {new Date(e.updated_at).toLocaleDateString('pt-BR')}
                    </span>
                  </button>
                  <button aria-label="Renomear estudo" onClick={() => renomear(e)} className="rounded p-1.5 text-text-secondary hover:text-text-primary">
                    <Pencil size={14} />
                  </button>
                  <button aria-label="Excluir estudo" onClick={() => excluir(e)} className="rounded p-1.5 text-text-secondary hover:text-accent-red">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
