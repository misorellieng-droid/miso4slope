import { NumberField } from './NumberField'
import { CONFIG_TRANSLACIONAL_PADRAO } from '../../engine/translacional'
import type { AnalysisMode, ConfigTranslacional, Layer, PlanoTranslacional } from '../../engine/types'

interface TranslacionalFormProps {
  value: ConfigTranslacional | undefined
  onChange: (value: ConfigTranslacional) => void
  layers: Layer[]
  mode: AnalysisMode
}

type TipoPlano = PlanoTranslacional['tipo']

const DESCRICAO_PLANO: Record<TipoPlano, string> = {
  casca:
    'Plano a uma espessura fixa abaixo da superfície, paralelo a ela: saia do aterro mal compactada ou camada alterada da face do corte.',
  camada: 'Plano na base de uma camada cadastrada: colúvio sobre residual, solo sobre rocha.',
  terreno_natural: 'Plano no contato entre o aterro e o terreno natural: aterro lançado sobre encosta sem endentamento.',
}

export function TranslacionalForm({ value, onChange, layers, mode }: TranslacionalFormProps) {
  const cfg = value ?? CONFIG_TRANSLACIONAL_PADRAO
  const set = (patch: Partial<ConfigTranslacional>) => onChange({ ...cfg, ...patch })

  const trocarTipo = (tipo: TipoPlano) => {
    if (tipo === 'casca') set({ plano: { tipo, espessura: cfg.plano.tipo === 'casca' ? cfg.plano.espessura : 1.5 } })
    else if (tipo === 'camada') set({ plano: { tipo, indice: cfg.plano.tipo === 'camada' ? cfg.plano.indice : 0 } })
    else set({ plano: { tipo } })
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text-primary">
        <input id="tr-ativa" type="checkbox" checked={cfg.ativa} onChange={(e) => set({ ativa: e.target.checked })} />
        Verificar ruptura translacional (talude infinito)
      </label>
      <p className="text-xs text-text-secondary">
        Fatia rasa que escorrega paralela à superfície sobre um plano imposto pela estratigrafia. É uma verificação
        separada da análise de conjunto: o círculo crítico do Bishop não encontra esse mecanismo.
      </p>

      {cfg.ativa && (
        <>
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">Plano de ruptura</div>
            <select
              id="tr-tipo"
              value={cfg.plano.tipo}
              onChange={(e) => trocarTipo(e.target.value as TipoPlano)}
              className="w-full rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="casca">Casca paralela à face</option>
              <option value="camada">Base de uma camada</option>
              {mode === 'aterro' && <option value="terreno_natural">Contato aterro / terreno natural</option>}
            </select>
            <p className="text-xs text-text-secondary">{DESCRICAO_PLANO[cfg.plano.tipo]}</p>

            {cfg.plano.tipo === 'casca' && (
              <NumberField
                label="Espessura vertical da casca"
                value={cfg.plano.espessura}
                step={0.1}
                min={0}
                suffix="m"
                onChange={(v) => set({ plano: { tipo: 'casca', espessura: v } })}
              />
            )}
            {cfg.plano.tipo === 'camada' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary">Camada cuja base é o plano</span>
                <select
                  id="tr-camada"
                  value={cfg.plano.indice}
                  onChange={(e) => set({ plano: { tipo: 'camada', indice: Number(e.target.value) } })}
                  className="rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary"
                >
                  {layers.map((l, i) => (
                    <option key={l.id ?? i} value={i}>
                      {i + 1}. {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
              <input
                id="tr-proprios"
                type="checkbox"
                checked={cfg.usar_parametros_proprios}
                onChange={(e) => set({ usar_parametros_proprios: e.target.checked })}
              />
              Parâmetros próprios do plano
            </label>
            <p className="text-xs text-text-secondary">
              {cfg.usar_parametros_proprios
                ? 'Use a resistência do contato (ensaio na interface ou residual, se já houve movimento).'
                : "Desmarcado: c' e φ' do material logo acima do plano e γ médio da camada que desliza."}
            </p>
            {cfg.usar_parametros_proprios && (
              <div className="grid grid-cols-3 gap-2">
                <NumberField label="c' no plano" value={cfg.c_plano} step={0.5} min={0} suffix="kPa" onChange={(v) => set({ c_plano: v })} />
                <NumberField label="φ' no plano" value={cfg.phi_plano} step={0.5} min={0} suffix="°" onChange={(v) => set({ phi_plano: v })} />
                <NumberField label="γ da camada" value={cfg.gamma} step={0.5} min={0} suffix="kN/m³" onChange={(v) => set({ gamma: v })} />
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">Água na camada</div>
            <p className="text-xs text-text-secondary">
              m é a fração da espessura com água, em fluxo paralelo à encosta: 0 = seco, 1 = água até a superfície (crista
              sem drenagem, chuva longa).
            </p>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="m do cenário intermediário" value={cfg.m_parcial} step={0.05} min={0} onChange={(v) => set({ m_parcial: v })} />
              <NumberField label="m de verificação" value={cfg.m_projeto} step={0.05} min={0} onChange={(v) => set({ m_projeto: v })} />
              <NumberField label="Sucção em tempo seco" value={cfg.succao} step={1} min={0} suffix="kPa" onChange={(v) => set({ succao: v })} />
              <NumberField label="φᵇ" value={cfg.phi_b} step={0.5} min={0} suffix="°" onChange={(v) => set({ phi_b: v })} />
            </div>
            <p className="text-xs text-text-secondary">Sucção 0 = cenário com sucção não é calculado.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <NumberField label="FS mínimo exigido" value={cfg.fs_min} step={0.05} min={0} onChange={(v) => set({ fs_min: v })} />
            <NumberField label="Ignorar trechos com inclinação menor que" value={cfg.beta_min} step={1} min={0} suffix="°" onChange={(v) => set({ beta_min: v })} />
          </div>
        </>
      )}
    </div>
  )
}
