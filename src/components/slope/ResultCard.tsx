import type { AnalysisResult } from '../../engine/types'
import type { PartialFS } from '../../engine/fsDecomposition'

interface ResultCardProps {
  result: AnalysisResult | null
  source?: 'search' | 'manual'
  partialFS?: PartialFS | null
}

function fsColor(fs: number): string {
  if (fs >= 1.5) return 'var(--color-accent-green)'
  if (fs >= 1.3) return 'var(--color-accent-amber)'
  return 'var(--color-accent-red)'
}

const fmt = (n: number, digits = 2) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const METHOD_LABELS = {
  bishop: 'Bishop Simplificado',
  fellenius: 'Fellenius (Método Comum)',
}

export function ResultCard({ result, source = 'search', partialFS }: ResultCardProps) {
  if (!result) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-text-secondary">
        Preencha os parâmetros e clique em <span className="font-medium text-text-primary">Calcular</span> para ver o
        resultado.
      </div>
    )
  }

  const color = fsColor(result.FS)

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-text-secondary">
        <span>Fator de Segurança</span>
        <span className="normal-case text-brand">{METHOD_LABELS[result.method]}</span>
      </div>
      <div className="font-mono text-4xl font-bold" style={{ color }}>
        {fmt(result.FS, 3)}
      </div>

      <div className="mt-1 flex items-center gap-2 text-sm font-medium" style={{ color }}>
        <span>●</span>
        <span>{result.is_adequate ? 'ADEQUADO' : 'INADEQUADO'} (NBR 11682)</span>
      </div>
      <div className="text-xs text-text-secondary">FS mínimo exigido: {fmt(result.fs_min_nbr)}</div>

      {partialFS && (partialFS.fsCoesao != null || partialFS.fsAtrito != null) && (
        <div className="mt-4 border-t border-border pt-3">
          <div
            className="mb-1 font-sans text-xs font-medium uppercase tracking-wide text-text-secondary"
            title="Cenários hipotéticos independentes para o mesmo círculo: um recálculo completo assumindo φ'=0 em todo o perfil (só a coesão resiste) e outro assumindo c'=0 (só o atrito resiste). Não somam ao FS combinado acima — são dois recálculos separados, não uma decomposição aditiva dele."
          >
            FS isolado por parcela de resistência
          </div>
          <div className="flex gap-4 font-mono text-sm">
            <div>
              <span className="text-text-secondary">só coesão: </span>
              {partialFS.fsCoesao != null ? fmt(partialFS.fsCoesao, 3) : '—'}
            </div>
            <div>
              <span className="text-text-secondary">só atrito: </span>
              {partialFS.fsAtrito != null ? fmt(partialFS.fsAtrito, 3) : '—'}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-1 border-t border-border pt-3 font-mono text-sm">
        <div className="mb-1 font-sans text-xs font-medium uppercase tracking-wide text-text-secondary">
          {source === 'manual' ? 'Círculo informado' : 'Círculo crítico'}
        </div>
        <div>xc = {fmt(result.circle.xc)} m</div>
        <div>yc = {fmt(result.circle.yc)} m</div>
        <div>R&nbsp;&nbsp;= {fmt(result.circle.R)} m</div>
      </div>

      <div className="mt-4 border-t border-border pt-3 text-xs text-text-secondary">
        Fatias analisadas: {result.slices.length}
        <br />
        Convergiu em: {result.iterations} iterações
      </div>
    </div>
  )
}
