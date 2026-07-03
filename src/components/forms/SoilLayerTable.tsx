import { Fragment } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Layer, SoilClass } from '../../engine/types'
import { estimateFromSPT } from '../../engine/spt'

interface SoilLayerTableProps {
  value: Layer[]
  onChange: (value: Layer[]) => void
}

const EMPTY_LAYER: Layer = { name: 'Nova camada', y_top: 0, y_base: -1, c: 0, phi: 30, gamma: 18 }

const isDepthMode = (layer: Layer) => layer.depth_top != null || layer.depth_base != null

export function SoilLayerTable({ value, onChange }: SoilLayerTableProps) {
  const update = (index: number, patch: Partial<Layer>) => {
    onChange(value.map((layer, i) => (i === index ? { ...layer, ...patch } : layer)))
  }

  // Atualiza N_SPT / tipo de solo e recalcula c'/φ'/γ pela correlação quando
  // os dois estiverem definidos. Editar c'/φ'/γ manualmente depois continua
  // possível — só é sobrescrito de novo se o N_SPT ou o tipo mudarem.
  const updateSPT = (index: number, patch: Partial<Pick<Layer, 'n_spt' | 'soil_class'>>) => {
    const merged = { ...value[index], ...patch }
    if (merged.n_spt != null && merged.soil_class) {
      const est = estimateFromSPT(merged.n_spt, merged.soil_class)
      update(index, { ...patch, c: est.c, phi: est.phi, gamma: est.gamma })
    } else {
      update(index, patch)
    }
  }

  const toggleMode = (index: number, layer: Layer) => {
    if (isDepthMode(layer)) {
      update(index, { y_top: layer.y_top ?? 0, y_base: layer.y_base ?? -1, depth_top: undefined, depth_base: undefined })
    } else {
      update(index, { depth_top: 0, depth_base: 1, y_top: undefined, y_base: undefined })
    }
  }

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index))
  const add = () => onChange([...value, { ...EMPTY_LAYER, y_top: value.at(-1)?.y_base ?? 0 }])

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-xs text-text-secondary">
            <th className="pb-2">Camada</th>
            <th className="pb-2">Referência</th>
            <th className="pb-2">Topo (m)</th>
            <th className="pb-2">Base (m)</th>
            <th className="pb-2">N_SPT</th>
            <th className="pb-2">Tipo</th>
            <th className="pb-2">c' (kPa)</th>
            <th className="pb-2">φ' (°)</th>
            <th className="pb-2">γ (kN/m³)</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody className="font-mono">
          {value.map((layer, i) => {
            const fromSpt = layer.n_spt != null && !!layer.soil_class
            const estimate = fromSpt ? estimateFromSPT(layer.n_spt!, layer.soil_class!) : null
            const depthMode = isDepthMode(layer)
            const topField = depthMode ? 'depth_top' : 'y_top'
            const baseField = depthMode ? 'depth_base' : 'y_base'

            return (
              <Fragment key={i}>
              <tr className="border-t border-border align-top">
                <td className="py-1 pr-2">
                  <input
                    value={layer.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className="w-full rounded bg-elevated px-2 py-1 font-sans text-text-primary focus:outline-none"
                  />
                </td>
                <td className="py-1 pr-2">
                  <button
                    onClick={() => toggleMode(i, layer)}
                    className="whitespace-nowrap rounded border border-border bg-elevated px-2 py-1 font-sans text-xs text-text-secondary hover:text-text-primary"
                    title="Alternar entre elevação absoluta e profundidade a partir do terreno natural"
                  >
                    {depthMode ? 'Prof. do terreno' : 'Elevação (y)'}
                  </button>
                </td>
                {([topField, baseField] as const).map((field) => (
                  <td key={field} className="py-1 pr-2">
                    <input
                      type="number"
                      step="0.01"
                      value={layer[field] ?? ''}
                      onChange={(e) => update(i, { [field]: e.target.valueAsNumber })}
                      className="w-20 rounded bg-elevated px-2 py-1 text-text-primary focus:outline-none"
                    />
                  </td>
                ))}
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    step="1"
                    min={0}
                    placeholder="—"
                    value={layer.n_spt ?? ''}
                    onChange={(e) =>
                      updateSPT(i, { n_spt: Number.isNaN(e.target.valueAsNumber) ? undefined : e.target.valueAsNumber })
                    }
                    className="w-16 rounded bg-elevated px-2 py-1 text-text-primary focus:outline-none"
                  />
                </td>
                <td className="py-1 pr-2">
                  <select
                    value={layer.soil_class ?? ''}
                    onChange={(e) =>
                      updateSPT(i, { soil_class: (e.target.value || undefined) as SoilClass | undefined })
                    }
                    className="rounded bg-elevated px-2 py-1 font-sans text-text-primary focus:outline-none"
                  >
                    <option value="">—</option>
                    <option value="granular">Granular</option>
                    <option value="coesivo">Coesivo</option>
                  </select>
                </td>
                {(['c', 'phi', 'gamma'] as const).map((field) => (
                  <td key={field} className="py-1 pr-2">
                    <input
                      type="number"
                      step="0.01"
                      value={layer[field]}
                      onChange={(e) => update(i, { [field]: e.target.valueAsNumber })}
                      className={`w-20 rounded bg-elevated px-2 py-1 text-text-primary focus:outline-none ${
                        fromSpt ? 'border-l-2 border-accent-blue' : ''
                      }`}
                      title={fromSpt ? 'Calculado pela correlação com N_SPT — editável, sua alteração manual prevalece' : undefined}
                    />
                  </td>
                ))}
                <td className="py-1">
                  <button
                    aria-label="Remover camada"
                    onClick={() => remove(i)}
                    className="text-text-secondary hover:text-accent-red"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
              {(estimate || depthMode) && (
                <tr>
                  <td colSpan={10} className="pb-1 pl-2 font-sans text-xs text-accent-blue">
                    {depthMode && 'Medido a partir do terreno natural local (acompanha a topografia). '}
                    {estimate?.classification}
                  </td>
                </tr>
              )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      <button
        onClick={add}
        className="mt-2 flex items-center gap-1 text-xs text-accent-blue hover:underline"
      >
        <Plus size={14} /> Adicionar camada
      </button>
    </div>
  )
}
