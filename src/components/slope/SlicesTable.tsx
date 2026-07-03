import { useState } from 'react'
import { ChevronDown, ChevronUp, FileSpreadsheet } from 'lucide-react'
import type { AnalysisResult } from '../../engine/types'
import { exportSlicesToXlsx } from '../../lib/exportXlsx'

interface SlicesTableProps {
  result: AnalysisResult | null
}

const fmt = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',')

export const SLICE_COLUMNS: { key: keyof AnalysisResult['slices'][number]; label: string; digits?: number }[] = [
  { key: 'index', label: '#', digits: 0 },
  { key: 'xm', label: 'xm (m)' },
  { key: 'y_top', label: 'y topo (m)' },
  { key: 'y_base', label: 'y base (m)' },
  { key: 'h', label: 'h (m)' },
  { key: 'h_aterro', label: 'h aterro (m)' },
  { key: 'h_fundacao', label: 'h fund. (m)' },
  { key: 'b', label: 'b (m)' },
  { key: 'c', label: "c' (kPa)" },
  { key: 'phi', label: "φ' (°)" },
  { key: 'gamma', label: 'γ (kN/m³)' },
  { key: 'W', label: 'W (kN/m)' },
  { key: 'W_aterro', label: 'W aterro (kN/m)' },
  { key: 'W_fundacao', label: 'W fund. (kN/m)' },
  { key: 'alpha_deg', label: 'α (°)' },
  { key: 'u', label: 'u (kPa)' },
  { key: 'm_alpha', label: 'mα', digits: 4 },
  { key: 'numerator_term', label: 'termo' },
]

export function SlicesTable({ result }: SlicesTableProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={!result}
          className="flex flex-1 items-center gap-2 text-sm font-medium text-text-primary disabled:text-text-secondary"
        >
          <span>Tabela de Fatias {result && `(${result.slices.length})`}</span>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {result && (
          <button
            onClick={() => exportSlicesToXlsx(result)}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:border-brand hover:text-brand"
          >
            <FileSpreadsheet size={14} /> Exportar XLSX
          </button>
        )}
      </div>

      {open && result && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="text-left text-text-secondary">
                {SLICE_COLUMNS.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-2 py-2">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {result.slices.map((s) => (
                <tr key={s.index} className="border-t border-border">
                  {SLICE_COLUMNS.map((c) => (
                    <td key={c.key} className="whitespace-nowrap px-2 py-1">
                      {c.key === 'index' ? s.index : fmt(s[c.key] as number, c.digits)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
