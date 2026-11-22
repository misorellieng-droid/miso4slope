import type { ResultadoTranslacional, TrechoTranslacional } from '../../engine/types'

interface TranslacionalPanelProps {
  resultado: ResultadoTranslacional | null
}

const fmt = (n: number, digits = 2) =>
  Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—'

/** Cor do FS na translacional: verde ≥ FS mínimo, âmbar entre 1,0 e o mínimo, vermelho < 1,0. */
export function corFsTranslacional(fs: number, fsMin: number): string {
  if (fs >= fsMin) return 'var(--color-accent-green)'
  if (fs >= 1) return 'var(--color-accent-amber)'
  return 'var(--color-accent-red)'
}

function textoMCritico(m: number): string {
  if (m > 1) return '> 1'
  if (m < 0) return 'rompe seco'
  return fmt(m, 2)
}

function nomeTrecho(t: TrechoTranslacional): string {
  return `x ${fmt(t.x0, 1)} a ${fmt(t.x1, 1)}`
}

export function TranslacionalPanel({ resultado }: TranslacionalPanelProps) {
  if (!resultado) return null
  const { critico, fs_min, m_projeto } = resultado

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-text-secondary">
        <span>Ruptura translacional</span>
        <span className="normal-case text-brand">Talude infinito</span>
      </div>

      {critico ? (
        <>
          <div className="font-mono text-4xl font-bold" style={{ color: corFsTranslacional(critico.fs_projeto, fs_min) }}>
            {fmt(critico.fs_projeto, 3)}
          </div>
          <div className="mt-1 text-sm font-medium" style={{ color: corFsTranslacional(critico.fs_projeto, fs_min) }}>
            ● {critico.adequado ? 'ADEQUADO' : 'INADEQUADO'} no cenário de verificação (m = {fmt(m_projeto, 2)})
          </div>
          <div className="text-xs text-text-secondary">
            Trecho crítico: {nomeTrecho(critico)} m · z = {fmt(critico.z_critico)} m · β = {fmt(critico.beta_plano, 1)}° ·
            FS mínimo exigido {fmt(fs_min)}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs text-text-secondary">
            <div>
              m crítico
              <div className="font-mono text-sm text-text-primary">{textoMCritico(critico.m_critico)}</div>
            </div>
            <div>
              β máximo para FS {fmt(fs_min)}
              <div className="font-mono text-sm text-text-primary">
                {critico.beta_max != null ? `${fmt(critico.beta_max, 1)}°` : 'nenhum'}
              </div>
            </div>
            <div>
              z limite (seco)
              <div className="font-mono text-sm text-text-primary">
                {critico.z_limite != null ? `${fmt(critico.z_limite)} m` : 'não há'}
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-text-secondary">
            m crítico: fração de água que leva o FS a 1,0. β máximo: inclinação que atende o FS mínimo com a mesma camada e
            a mesma água. z limite: espessura acima da qual a camada rompe seca, sem sucção.
          </p>

          <div className="mt-3 overflow-x-auto border-t border-border pt-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">FS por trecho e cenário</div>
            <table className="w-full font-mono text-xs">
              <thead className="text-text-secondary">
                <tr>
                  <th className="text-left font-normal">trecho (m)</th>
                  <th className="pl-2 text-right font-normal">β</th>
                  <th className="pl-2 text-right font-normal">z</th>
                  {critico.cenarios.map((c) => (
                    <th key={c.nome} className="pl-2 text-right font-normal" title={c.nome}>
                      {c.succao > 0 ? 'sucção' : `m=${fmt(c.m, c.m === 0 || c.m === 1 ? 0 : 2)}`}
                    </th>
                  ))}
                  <th className="pl-2 text-right font-normal">m crít.</th>
                </tr>
              </thead>
              <tbody>
                {resultado.trechos.map((t) => (
                  <tr key={t.indice} className={t === critico ? 'font-bold' : undefined}>
                    <td className="whitespace-nowrap">
                      {fmt(t.x0, 1)} a {fmt(t.x1, 1)}
                      {t.nao_paralelo && <span title="superfície e plano não paralelos: talude infinito aproximado"> *</span>}
                    </td>
                    <td className="pl-2 text-right">{fmt(t.beta_plano, 1)}°</td>
                    <td className="whitespace-nowrap pl-2 text-right">
                      {Math.abs(t.z_max - t.z_min) < 0.05 ? fmt(t.z_min) : `${fmt(t.z_min, 1)}–${fmt(t.z_max, 1)}`}
                    </td>
                    {t.cenarios.map((c) => (
                      <td key={c.nome} className="pl-2 text-right" style={{ color: corFsTranslacional(c.FS, fs_min) }}>
                        {fmt(c.FS)}
                      </td>
                    ))}
                    <td className="pl-2 text-right">{textoMCritico(t.m_critico)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-text-secondary">
              Material no plano (trecho crítico): {critico.material} · c' = {fmt(critico.c, 1)} kPa · φ' ={' '}
              {fmt(critico.phi, 1)}° · γ = {fmt(critico.gamma, 1)} kN/m³ · γw = {fmt(resultado.gamma_w)} kN/m³
            </p>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-text-secondary">Nenhum trecho verificado.</p>
      )}

      {resultado.avisos.map((a, i) => (
        <div key={i} className="mt-3 rounded-md border border-border p-2 text-xs text-accent-amber">
          {a}
        </div>
      ))}
    </div>
  )
}
