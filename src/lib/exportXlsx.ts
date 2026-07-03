import * as XLSX from 'xlsx'
import type { AnalysisResult } from '../engine/types'
import { SLICE_COLUMNS } from '../components/slope/SlicesTable'

/**
 * Exporta a tabela de fatias do resultado atual para um arquivo .xlsx, com
 * as mesmas colunas exibidas na tela (mesma ordem, mesmos rótulos).
 */
export function exportSlicesToXlsx(result: AnalysisResult, fileName = 'miso4slope-fatias.xlsx'): void {
  const header = SLICE_COLUMNS.map((c) => c.label)
  const rows = result.slices.map((s) =>
    SLICE_COLUMNS.map((c) => (c.key === 'index' ? s.index : Number((s[c.key] as number).toFixed(c.digits ?? 4))))
  )

  const summary = [
    ['FS', Number(result.FS.toFixed(4))],
    ['Método', result.method === 'bishop' ? 'Bishop Simplificado' : 'Fellenius'],
    ['Adequado (NBR 11682, FS ≥ 1,5)', result.is_adequate ? 'Sim' : 'Não'],
    ['xc (m)', result.circle.xc],
    ['yc (m)', result.circle.yc],
    ['R (m)', result.circle.R],
    ['Número de fatias', result.slices.length],
  ]

  const wb = XLSX.utils.book_new()
  const wsSummary = XLSX.utils.aoa_to_sheet(summary)
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo')

  const wsSlices = XLSX.utils.aoa_to_sheet([header, ...rows])
  wsSlices['!cols'] = SLICE_COLUMNS.map(() => ({ wch: 12 }))
  XLSX.utils.book_append_sheet(wb, wsSlices, 'Fatias')

  XLSX.writeFile(wb, fileName)
}
