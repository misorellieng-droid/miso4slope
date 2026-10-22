import { RotateCcw } from 'lucide-react'
import { OrigemTag } from '../../../components/ui/OrigemTag'
import { DESCRICAO_PARAMETROS, PARAMETROS_PADRAO, deltaSigma } from '../calc/parametros'
import type { ParametrosCptu } from '../calc/tipos'

// Parâmetros do projeto, com a origem de cada um: a engenharia não pode
// tomar hipótese como medida.

const fmt = (v: number) => (Number.isFinite(v) ? String(Number(v.toPrecision(10))).replace('.', ',') : '—')

interface Props {
  parametros: ParametrosCptu
  onChange: (p: ParametrosCptu) => void
}

export function AbaParametros({ parametros: p, onChange }: Props) {
  const alterados = (Object.keys(PARAMETROS_PADRAO) as (keyof ParametrosCptu)[]).filter((k) => p[k] !== PARAMETROS_PADRAO[k])

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Parâmetros do projeto</h2>
          <p className="text-xs text-text-secondary">
            Valem para todos os furos desta análise. Padrão = planilha de referência (26.22.2 EREA Meli Biguaçu).
          </p>
        </div>
        <button
          onClick={() => onChange({ ...PARAMETROS_PADRAO })}
          disabled={alterados.length === 0}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40"
        >
          <RotateCcw size={14} /> Restaurar padrão{alterados.length ? ` (${alterados.length})` : ''}
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-secondary">
            <th className="px-4 py-2 font-medium">Parâmetro</th>
            <th className="w-40 px-4 py-2 font-medium">Valor</th>
            <th className="w-28 px-4 py-2 font-medium">Origem</th>
            <th className="px-4 py-2 font-medium">Observação</th>
          </tr>
        </thead>
        <tbody>
          {DESCRICAO_PARAMETROS.map((d) => {
            const calculado = d.chave === 'deltaSigma'
            const valor = calculado ? deltaSigma(p) : p[d.chave as keyof ParametrosCptu]
            const padrao = calculado ? deltaSigma(PARAMETROS_PADRAO) : PARAMETROS_PADRAO[d.chave as keyof ParametrosCptu]
            const mudou = valor !== padrao
            return (
              <tr key={d.chave} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-1.5 text-text-primary">{d.rotulo}</td>
                <td className="px-4 py-1.5">
                  {calculado ? (
                    <div className="flex items-center gap-2 px-2 py-1 font-mono text-text-primary">
                      {fmt(valor)} <span className="font-sans text-xs text-text-secondary">{d.unidade}</span>
                    </div>
                  ) : (
                    <div className={`flex items-center gap-2 rounded-md border bg-elevated px-2 py-1 ${mudou ? 'border-accent-amber' : 'border-border'}`}>
                      <input
                        type="number"
                        aria-label={d.rotulo}
                        step="any"
                        value={Number.isFinite(valor) ? valor : ''}
                        onChange={(e) => onChange({ ...p, [d.chave]: e.target.valueAsNumber })}
                        className="w-full bg-transparent font-mono text-sm text-text-primary focus:outline-none"
                      />
                      {d.unidade && <span className="whitespace-nowrap text-xs text-text-secondary">{d.unidade}</span>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-1.5">
                  <OrigemTag origem={d.origem} />
                </td>
                <td className="px-4 py-1.5 text-xs text-text-secondary">
                  {d.nota}
                  {mudou && !calculado && <span className="ml-1 text-accent-amber">(padrão: {fmt(padrao)})</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
