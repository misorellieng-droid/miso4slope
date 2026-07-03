import { useState } from 'react'
import { AlertTriangle, FileUp, Loader2 } from 'lucide-react'
import { classifySoilFromDescription, convertSondagemToLayers, mockExtractSondagem } from '../../engine/sondagem'
import type { Layer, SondagemExtractionResult, SondagemLayer, SoilClass } from '../../engine/types'
import { NumberField } from './NumberField'

interface SondagemImportProps {
  toeElevation: number | undefined
  onImport: (layers: Layer[], waterTableDepth?: number) => void
  onClose: () => void
}

const SOIL_CLASS_LABELS: Record<SoilClass, string> = { granular: 'Granular', coesivo: 'Coesivo' }

export function SondagemImport({ toeElevation, onImport, onClose }: SondagemImportProps) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [collarElevation, setCollarElevation] = useState<number | undefined>(toeElevation)
  const [extracting, setExtracting] = useState(false)
  const [result, setResult] = useState<SondagemExtractionResult | null>(null)

  const handleExtract = async () => {
    setExtracting(true)
    try {
      const r = await mockExtractSondagem()
      setResult(r)
    } finally {
      setExtracting(false)
    }
  }

  const updateLayer = (index: number, patch: Partial<SondagemLayer>) => {
    if (!result) return
    setResult({
      ...result,
      layers: result.layers.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    })
  }

  const canImport = result && collarElevation != null && toeElevation != null

  const handleImport = () => {
    if (!result || collarElevation == null || toeElevation == null) return
    const layers = convertSondagemToLayers(result.layers, collarElevation, toeElevation)
    onImport(layers, result.water_table_depth)
    onClose()
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-sans text-sm font-bold text-text-primary">Importar boletim de sondagem</h3>
        <button onClick={onClose} className="text-xs text-text-secondary hover:text-text-primary">
          Fechar
        </button>
      </div>

      <div className="mb-3 flex items-start gap-2 rounded-md border border-accent-amber/40 bg-accent-amber/10 p-2 text-xs text-accent-amber">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>
          Extração simulada (mock) — a leitura automática do arquivo por IA ainda não está conectada. Os dados
          abaixo são de exemplo; sempre confira contra o boletim antes de importar.
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">Arquivo do boletim (PDF/imagem)</span>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-elevated px-2 py-1.5 text-sm text-text-secondary hover:border-accent-blue">
            <FileUp size={16} />
            {fileName ?? 'Escolher arquivo...'}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
          </label>
        </label>
        <NumberField
          label="Cota do terreno na boca do furo"
          value={collarElevation ?? NaN}
          step={0.01}
          suffix="m"
          onChange={setCollarElevation}
        />
      </div>

      {toeElevation == null && (
        <div className="mb-3 text-xs text-accent-amber">
          Defina a "Cota do pé do talude" na aba Geometria para poder converter as profundidades do furo em posição
          dentro do talude.
        </div>
      )}

      <button
        onClick={handleExtract}
        disabled={extracting}
        className="mb-3 flex items-center gap-2 rounded-md bg-accent-blue px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {extracting && <Loader2 size={14} className="animate-spin" />}
        {extracting ? 'Extraindo...' : 'Extrair dados do boletim'}
      </button>

      {result && (
        <div className="space-y-3">
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
                {result.layers.map((layer, i) => (
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

          {result.water_table_depth != null && (
            <div className="text-xs text-text-secondary">
              N.A. identificado a {result.water_table_depth.toFixed(2)}m abaixo da boca do furo.
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={!canImport}
            className="rounded-md bg-accent-green px-3 py-2 text-sm font-medium disabled:opacity-40"
            style={{ color: '#0D1B2A' }}
          >
            Importar para Solo / Fundação
          </button>
        </div>
      )}
    </div>
  )
}
