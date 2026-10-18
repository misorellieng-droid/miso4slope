import { Plus } from 'lucide-react'
import { useProjetoAtivo } from '../../lib/ProjetoAtivoContext'
import { proximoNomeRevisao } from '../../lib/revisoesStorage'

const SELECT =
  'rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-brand focus:outline-none'

/** Projeto ativo + revisão ativa: para onde vão os estudos salvos. */
export function SeletorProjetoRevisao() {
  const { projetos, projetoAtivoId, setProjetoAtivoId, revisoes, revisaoAtivaId, setRevisaoAtivaId, novaRevisao, migracaoPendente } =
    useProjetoAtivo()

  const criar = async () => {
    const nome = window.prompt('Nome da nova revisão:', proximoNomeRevisao(revisoes))
    if (!nome?.trim()) return
    try {
      await novaRevisao(nome.trim())
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Erro ao criar revisão.')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Projeto ativo"
        className={`${SELECT} max-w-[14rem]`}
        value={projetoAtivoId ?? ''}
        onChange={(e) => setProjetoAtivoId(e.target.value || null)}
      >
        <option value="">— projeto ativo —</option>
        {projetos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
      {projetoAtivoId && (
        <>
          <select
            aria-label="Revisão ativa"
            className={`${SELECT} max-w-[10rem]`}
            value={revisaoAtivaId ?? ''}
            onChange={(e) => setRevisaoAtivaId(e.target.value || null)}
            disabled={revisoes.length === 0}
          >
            {revisoes.length === 0 && <option value="">sem revisão</option>}
            {revisoes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
          <button
            onClick={criar}
            disabled={migracaoPendente}
            title={migracaoPendente ? 'Rode a migração 008 no Supabase' : 'Nova revisão'}
            className="rounded-md border border-border p-1.5 text-text-secondary hover:text-text-primary disabled:opacity-40"
          >
            <Plus size={16} />
          </button>
        </>
      )}
      {migracaoPendente && (
        <span className="text-xs text-accent-red" title="Falta rodar supabase/008_revisoes_estudos.sql">
          migração 008 pendente
        </span>
      )}
    </div>
  )
}
