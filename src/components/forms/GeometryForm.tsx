import { Plus, Trash2 } from 'lucide-react'
import type { AnalysisMode, Point, SlopeGeometry } from '../../engine/types'
import { NumberField } from './NumberField'

interface GeometryFormProps {
  value: SlopeGeometry
  onChange: (value: SlopeGeometry) => void
  mode: AnalysisMode
}

export function GeometryForm({ value, onChange, mode }: GeometryFormProps) {
  const set = <K extends keyof SlopeGeometry>(key: K, v: number) =>
    onChange({ ...value, [key]: v })

  const terrain = value.natural_terrain ?? []
  const setTerrain = (points: Point[]) => onChange({ ...value, natural_terrain: points })
  const updatePoint = (i: number, patch: Partial<Point>) =>
    setTerrain(terrain.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const removePoint = (i: number) => setTerrain(terrain.filter((_, idx) => idx !== i))
  const addPoint = () => setTerrain([...terrain, { x: 0, y: 0 }])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Altura por bancada"
          value={value.bench_height}
          step={0.5}
          min={0.1}
          suffix="m"
          onChange={(v) => set('bench_height', v)}
        />
        <NumberField
          label="Fator do talude H:V"
          value={value.slope_ratio}
          step={0.1}
          min={0.1}
          onChange={(v) => set('slope_ratio', v)}
        />
        <NumberField
          label="Largura da berma"
          value={value.berm_width}
          step={0.5}
          min={0}
          suffix="m"
          onChange={(v) => set('berm_width', v)}
        />
        <NumberField
          label={mode === 'corte' ? 'Altura total do corte' : 'Altura total do talude'}
          value={value.total_height}
          step={0.1}
          min={0.1}
          suffix="m"
          onChange={(v) => set('total_height', v)}
        />
        <NumberField
          label="Profundidade do N.A. abaixo do pé"
          value={value.water_table_depth}
          step={0.5}
          min={0}
          suffix="m"
          onChange={(v) => set('water_table_depth', v)}
        />
        <NumberField
          label="Peso específico da água"
          value={value.gamma_water ?? 9.81}
          step={0.01}
          min={0}
          suffix="kN/m³"
          onChange={(v) => set('gamma_water', v)}
        />
        <NumberField
          label={mode === 'corte' ? 'Cota da plataforma de corte (opcional)' : 'Cota do pé do talude (opcional)'}
          value={value.toe_elevation ?? NaN}
          step={0.01}
          suffix="m"
          onChange={(v) => onChange({ ...value, toe_elevation: Number.isFinite(v) ? v : undefined })}
        />
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          Perfil do terreno natural (opcional)
        </div>
        <p className="mb-3 text-xs text-text-secondary">
          {mode === 'corte'
            ? 'Pontos x/y relativos ao pé (0,0), do mais negativo ao mais positivo. Representa o terreno original antes do corte — substitui o trecho plano padrão antes do pé e serve de referência de profundidade para as camadas de solo (o próprio material natural exposto pelo corte) definidas por "profundidade do terreno" na aba Solo/Fundação. Deixe vazio para manter o terreno plano (comportamento padrão).'
            : 'Pontos x/y relativos ao pé (0,0), do mais negativo ao mais positivo. Substitui o trecho plano padrão antes do pé e serve de referência de profundidade para camadas de solo definidas por "profundidade do terreno" na aba Solo/Fundação — inclusive por baixo do próprio aterro. Deixe vazio para manter o terreno plano (comportamento padrão).'}
        </p>
        <div className="space-y-2">
          {terrain.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <NumberField label="x" value={p.x} step={0.1} suffix="m" onChange={(v) => updatePoint(i, { x: v })} />
              <NumberField label="y" value={p.y} step={0.01} suffix="m" onChange={(v) => updatePoint(i, { y: v })} />
              <button
                aria-label="Remover ponto"
                onClick={() => removePoint(i)}
                className="mt-4 text-text-secondary hover:text-accent-red"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button onClick={addPoint} className="flex items-center gap-1 text-xs text-brand hover:underline">
            <Plus size={14} /> Adicionar ponto
          </button>
        </div>
      </div>
    </div>
  )
}
