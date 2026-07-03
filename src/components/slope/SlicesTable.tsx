import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { AnalysisResult } from '../../engine/types'

interface SlicesTableProps {
  result: AnalysisResult | null
}

const fmt = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',')

const COLUMNS: { key: keyof AnalysisResult['slices'][number]; label: string; digits?: number }[] = [
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
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!result}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-text-primary disabled:text-text-secondary"
      >
        <span>Tabela de Fatias {result && `(${result.slices.length})`}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && result && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="text-left text-text-secondary">
                {COLUMNS.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-2 py-2">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {result.slices.map((s) => (
                <tr key={s.index} className="border-t border-border">
                  {COLUMNS.map((c) => (
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
