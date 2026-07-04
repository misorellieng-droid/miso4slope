import { classifySoilFromDescription } from '../../engine/sondagem'
import type { SondagemLayer, SoilClass } from '../../engine/types'

const SOIL_CLASS_LABELS: Record<SoilClass, string> = { granular: 'Granular', coesivo: 'Coesivo' }

interface SondagemLayersEditorProps {
  layers: SondagemLayer[]
  onChange: (layers: SondagemLayer[]) => void
}

/**
 * Tabela editável das camadas extraídas de um boletim (profundidade,
 * descrição, N_SPT, tipo) — usada tanto no import avulso de uma sondagem
 * (SondagemImport) quanto no import de relatório completo com várias
 * sondagens detectadas automaticamente (SondagemReportImport), pra não
 * duplicar a mesma tabela nos dois fluxos.
 */
export function SondagemLayersEditor({ layers, onChange }: SondagemLayersEditorProps) {
  const updateLayer = (index: number, patch: Partial<SondagemLayer>) => {
    onChange(layers.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-xs">
        <thead>
          <tr className="text-left text-text-secondary">
            <th className="pb-1">Prof. topo (m)</th>
            <th className="pb-1">Prof. base (m)</th>
            <th className="pb-1">Descrição</th>
            <th className="pb-1">N_SPT</th>
            <th className="pb-1">Tipo</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {layers.map((layer, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1 pr-2">
                <input
                  type="number"
                  step="0.01"
                  value={layer.depth_top}
                  onChange={(e) => updateLayer(i, { depth_top: e.target.valueAsNumber })}
                  className="w-20 rounded bg-elevated px-2 py-1 text-text-primary focus:outline-none"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="number"
                  step="0.01"
                  value={layer.depth_base}
                  onChange={(e) => updateLayer(i, { depth_base: e.target.valueAsNumber })}
                  className="w-20 rounded bg-elevated px-2 py-1 text-text-primary focus:outline-none"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  value={layer.description}
                  onChange={(e) =>
                    updateLayer(i, {
                      description: e.target.value,
                      soil_class: classifySoilFromDescription(e.target.value),
                    })
                  }
                  className="w-64 rounded bg-elevated px-2 py-1 font-sans text-text-primary focus:outline-none"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="number"
                  step="1"
                  value={layer.n_spt}
                  onChange={(e) => updateLayer(i, { n_spt: e.target.valueAsNumber })}
                  className="w-14 rounded bg-elevated px-2 py-1 text-text-primary focus:outline-none"
                />
              </td>
              <td className="py-1">
                <select
                  value={layer.soil_class}
                  onChange={(e) => updateLayer(i, { soil_class: e.target.value as SoilClass })}
                  className="rounded bg-elevated px-2 py-1 font-sans text-text-primary focus:outline-none"
                >
                  {(Object.keys(SOIL_CLASS_LABELS) as SoilClass[]).map((c) => (
                    <option key={c} value={c}>
                      {SOIL_CLASS_LABELS[c]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
