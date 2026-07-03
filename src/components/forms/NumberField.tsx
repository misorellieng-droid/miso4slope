interface NumberFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  suffix?: string
  computed?: boolean // true = valor calculado pelo sistema (destacado, mas ainda editável)
}

export function NumberField({ label, value, onChange, step = 0.01, min, suffix, computed = false }: NumberFieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-text-secondary">
        {label}
        {computed && <span className="ml-1 text-brand">(calculado)</span>}
      </span>
      <div
        className={`flex items-center gap-2 rounded-md border bg-elevated px-2 py-1.5 ${
          computed ? 'border-border border-l-2 border-l-brand' : 'border-border'
        }`}
        title={computed ? 'Calculado automaticamente pelo sistema — editável, sua alteração manual prevalece' : undefined}
      >
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          step={step}
          min={min}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          className="w-full bg-transparent font-mono text-sm text-text-primary focus:outline-none"
        />
        {suffix && <span className="text-xs text-text-secondary">{suffix}</span>}
      </div>
    </label>
  )
}
