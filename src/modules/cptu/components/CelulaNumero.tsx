import { memo, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { numeroBR } from '../entrada'

// Célula numérica que aceita vírgula decimal (padrão brasileiro). Enquanto
// está em foco guarda o texto digitado; grava o número ao sair (ou Enter).

export const formatarBR = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '' : String(Number(v.toPrecision(12))).replace('.', ',')

interface Props {
  valor: number | null | undefined
  aoMudar: (v: number | null) => void
  className?: string
  rotulo?: string
  placeholder?: string
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  onPaste?: (e: ClipboardEvent<HTMLInputElement>) => void
  onFocus?: () => void
  dataLinha?: number
  dataColuna?: number
}

export const CelulaNumero = memo(function CelulaNumero({
  valor, aoMudar, className = '', rotulo, placeholder, onKeyDown, onPaste, onFocus, dataLinha, dataColuna,
}: Props) {
  const [texto, setTexto] = useState<string | null>(null)

  const gravar = () => {
    if (texto == null) return
    const n = numeroBR(texto)
    const igual = n === (valor ?? null) || (n != null && valor != null && Number.isFinite(valor) && Math.abs(n - valor) < 1e-15)
    if (!igual) aoMudar(n)
    setTexto(null)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={rotulo}
      placeholder={placeholder}
      data-linha={dataLinha}
      data-coluna={dataColuna}
      value={texto ?? formatarBR(valor)}
      onFocus={(e) => {
        setTexto(formatarBR(valor))
        e.currentTarget.select()
        onFocus?.()
      }}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={gravar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') gravar()
        if (e.key === 'Escape') {
          setTexto(null)
          e.currentTarget.blur()
        }
        onKeyDown?.(e)
      }}
      onPaste={(e) => {
        onPaste?.(e)
        // bloco colado pela grade: o valor desta célula veio da colagem, não do texto em edição
        if (e.defaultPrevented) setTexto(null)
      }}
      className={`w-full bg-transparent px-1.5 py-0.5 font-mono text-[13px] focus:bg-white focus:outline focus:outline-1 focus:outline-brand ${className}`}
    />
  )
})
