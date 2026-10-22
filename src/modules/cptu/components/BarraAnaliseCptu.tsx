import { useEffect, useState } from 'react'
import { FilePlus, FolderOpen, Loader2, Pencil, Save, Trash2 } from 'lucide-react'
import { useProjetoAtivo } from '../../../lib/ProjetoAtivoContext'
import { analiseNova, type EstadoAnaliseCptu } from '../estado'
import {
  carregarAnaliseCptu,
  criarAnaliseCptu,
  erroMigracaoCptuPendente,
  excluirAnaliseCptu,
  excluirFuroCptu,
  listAnalisesCptu,
  renomearAnaliseCptu,
  salvarConfigAnaliseCptu,
  salvarFuroCptu,
  type AnaliseCptuResumo,
} from '../storage'

// Barra de nova/abrir/salvar da análise CPTu, no projeto e na revisão ativos
// (mesmo comportamento da barra de estudos de Muros).

const BTN =
  'flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40'

interface Props {
  estado: EstadoAnaliseCptu
  alterado: boolean
  /** Troca a análise inteira (nova ou aberta do banco). */
  aoTrocar: (estado: EstadoAnaliseCptu) => void
  /** Depois de salvar: ids novos da análise e dos furos. */
  aoSalvar: (id: string, nome: string, idsFuros: string[]) => void
}

export function BarraAnaliseCptu({ estado, alterado, aoTrocar, aoSalvar }: Props) {
  const { projetoAtivoId, projetoAtivo, revisaoAtivaId, revisaoAtiva, garantirRevisao } = useProjetoAtivo()
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aberta, setAberta] = useState(false)
  const [lista, setLista] = useState<AnaliseCptuResumo[]>([])
  const [todasRevisoes, setTodasRevisoes] = useState(false)

  useEffect(() => setAberta(false), [projetoAtivoId, revisaoAtivaId])

  const erroMsg = (e: unknown, prefixo: string) =>
    erroMigracaoCptuPendente(e)
      ? 'Falta rodar a migração supabase/009_cptu.sql no Supabase.'
      : `${prefixo}: ${e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'erro desconhecido'}`

  const descartarAlteracoes = () => !alterado || window.confirm('Há alterações não salvas nesta análise. Descartar?')

  const recarregar = async (todas = todasRevisoes) => {
    if (!projetoAtivoId) return
    try {
      setLista(await listAnalisesCptu(projetoAtivoId, todas ? null : revisaoAtivaId))
    } catch (e) {
      setMsg(erroMsg(e, 'Erro ao listar'))
    }
  }

  const nova = () => {
    if (!descartarAlteracoes()) return
    aoTrocar(analiseNova())
    setMsg('Nova análise (ainda não salva).')
  }

  const salvar = async () => {
    if (!projetoAtivoId) {
      setMsg('Escolha o projeto ativo no cabeçalho antes de salvar.')
      return
    }
    const nomes = estado.furos.map((f) => f.cabecalho.nome.trim().toUpperCase())
    if (nomes.some((n) => !n)) return setMsg('Há furo sem nome.')
    if (new Set(nomes).size !== nomes.length) return setMsg('Há dois furos com o mesmo nome.')

    let id = estado.id
    let nome = estado.nome
    setOcupado(true)
    setMsg(null)
    try {
      if (!id) {
        const escolhido = window.prompt('Nome da análise:', estado.nome)
        if (!escolhido?.trim()) return
        nome = escolhido.trim()
        const { projetoId, revisaoId } = await garantirRevisao()
        id = await criarAnaliseCptu(projetoId, revisaoId, nome)
      }
      await salvarConfigAnaliseCptu(id, estado)
      for (const fid of estado.removidos) await excluirFuroCptu(fid)
      const idsFuros: string[] = []
      for (const [i, furo] of estado.furos.entries()) idsFuros.push(await salvarFuroCptu(id, furo, i))
      aoSalvar(id, nome, idsFuros)
      setMsg(`Salva em ${projetoAtivo?.nome ?? 'projeto'} · ${revisaoAtiva?.nome ?? 'Rev. 0'} (${estado.furos.length} furo(s)).`)
      if (aberta) await recarregar()
    } catch (e) {
      // a análise pode ter sido criada antes do erro: guarda o id para não duplicar
      if (id && !estado.id) aoSalvar(id, nome, estado.furos.map((f) => f.id ?? ''))
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
    if (!descartarAlteracoes()) return
    setOcupado(true)
    try {
      const a = await carregarAnaliseCptu(id)
      aoTrocar({
        id: a.id,
        nome: a.nome,
        parametros: a.parametros,
        premissasTempo: a.premissasTempo,
        opcoes: a.opcoes,
        furos: a.furos,
        removidos: [],
      })
      setAberta(false)
      setMsg(`Análise "${a.nome}" aberta (${a.furos.length} furo(s)).`)
    } catch (e) {
      setMsg(erroMsg(e, 'Erro ao abrir'))
    } finally {
      setOcupado(false)
    }
  }

  const renomear = async (a: AnaliseCptuResumo) => {
    const nome = window.prompt('Nome da análise:', a.nome)
    if (!nome?.trim() || nome === a.nome) return
    try {
      await renomearAnaliseCptu(a.id, nome.trim())
      if (estado.id === a.id) aoSalvar(a.id, nome.trim(), estado.furos.map((f) => f.id ?? ''))
      await recarregar()
    } catch (e) {
      setMsg(erroMsg(e, 'Erro ao renomear'))
    }
  }

  const excluir = async (a: AnaliseCptuResumo) => {
    if (!window.confirm(`Excluir a análise "${a.nome}" e todos os furos dela? Não pode ser desfeito.`)) return
    try {
      await excluirAnaliseCptu(a.id)
      if (estado.id === a.id) {
        aoTrocar(analiseNova())
      }
      await recarregar()
    } catch (e) {
      setMsg(erroMsg(e, 'Erro ao excluir'))
    }
  }

  const destino = projetoAtivo
    ? `${projetoAtivo.nome} · ${revisaoAtiva?.nome ?? 'sem revisão (será criada Rev. 0)'}`
    : 'nenhum projeto ativo: escolha no cabeçalho'

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto text-xs text-text-secondary">
          <span className="font-medium text-text-primary">{estado.nome}</span>
          {estado.id ? '' : ' (não salva)'}
          {alterado && <span className="ml-1 text-accent-amber">• alterações não salvas</span>}
          <span className="ml-2">destino: <span className="text-text-primary">{destino}</span></span>
        </div>
        {msg && <span className="text-xs text-text-secondary">{msg}</span>}
        <button className={BTN} onClick={nova} disabled={ocupado}>
          <FilePlus size={14} /> Nova
        </button>
        <button className={BTN} onClick={abrirLista} disabled={!projetoAtivoId || ocupado}>
          <FolderOpen size={14} /> Abrir
        </button>
        <button className={BTN} onClick={salvar} disabled={ocupado || !projetoAtivoId}>
          {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar
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
            <div className="text-sm text-text-secondary">Nenhuma análise CPTu {todasRevisoes ? 'no projeto' : 'nesta revisão'}.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {lista.map((a) => (
                <li key={a.id} className="flex items-center rounded hover:bg-elevated">
                  <button onClick={() => abrir(a.id)} className="flex flex-1 items-center justify-between px-2 py-1.5 text-left">
                    <span className="text-text-primary">{a.nome}</span>
                    <span className="font-mono text-xs text-text-secondary">{new Date(a.updated_at).toLocaleDateString('pt-BR')}</span>
                  </button>
                  <button aria-label="Renomear análise" onClick={() => renomear(a)} className="rounded p-1.5 text-text-secondary hover:text-text-primary">
                    <Pencil size={14} />
                  </button>
                  <button aria-label="Excluir análise" onClick={() => excluir(a)} className="rounded p-1.5 text-text-secondary hover:text-accent-red">
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
