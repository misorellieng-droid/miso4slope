import { Plus, Trash2 } from 'lucide-react'
import type { CompactionReference, CoverageType, FaceCoverage, FillMaterial, FillZone, SoilClass } from '../../engine/types'
import { estimateFromCompaction } from '../../engine/compaction'
import { estimateFromSPT } from '../../engine/spt'
import { NumberField } from './NumberField'

interface FillFormProps {
  value: FillMaterial
  onChange: (value: FillMaterial) => void
  coverage: FaceCoverage
  onCoverageChange: (value: FaceCoverage) => void
  reference: CompactionReference | null
  onReferenceChange: (value: CompactionReference | null) => void
  zones: FillZone[]
  onZonesChange: (value: FillZone[]) => void
}

const COVERAGE_LABELS: Record<CoverageType, string> = {
  none: 'Sem proteção',
  grass: 'Vegetação rasteira (grama)',
  shrub: 'Vegetação arbustiva/arbórea',
  rigid: 'Revestimento rígido (concreto/solo-cimento)',
}

const DEFAULT_REFERENCE: CompactionReference = { c: 15, phi: 28, gamma: 19 }
const EMPTY_ZONE: FillZone = {
  name: 'Camadas superiores',
  thickness: 0.9,
  compaction_degree: 100,
  c: 0,
  phi: 0,
  gamma: 0,
}

export function FillForm({
  value,
  onChange,
  coverage,
  onCoverageChange,
  reference,
  onReferenceChange,
  zones,
  onZonesChange,
}: FillFormProps) {
  const set = <K extends keyof FillMaterial>(key: K, v: number) => onChange({ ...value, [key]: v })

  const useCompaction = reference !== null
  const referenceMode: 'manual' | 'spt' = reference?.n_spt != null && reference?.soil_class ? 'spt' : 'manual'

  const setReference = (patch: Partial<CompactionReference>) => {
    const merged = { ...(reference ?? DEFAULT_REFERENCE), ...patch }
    onReferenceChange(merged)
    if (value.compaction_degree != null) {
      const est = estimateFromCompaction(merged, value.compaction_degree)
      onChange({ ...value, c: est.c, phi: est.phi, gamma: est.gamma })
    }
    if (zones.length) {
      onZonesChange(
        zones.map((z) => {
          const est = estimateFromCompaction(merged, z.compaction_degree)
          return { ...z, c: est.c, phi: est.phi, gamma: est.gamma }
        })
      )
    }
  }

  const setReferenceFromSPT = (patch: Partial<Pick<CompactionReference, 'n_spt' | 'soil_class'>>) => {
    const merged = { ...(reference ?? DEFAULT_REFERENCE), ...patch }
    if (merged.n_spt != null && merged.soil_class) {
      const est = estimateFromSPT(merged.n_spt, merged.soil_class)
      setReference({ ...merged, c: est.c, phi: est.phi, gamma: est.gamma })
    } else {
      setReference(merged)
    }
  }

  const setBodyGC = (gc: number | undefined) => {
    if (gc != null && reference) {
      const est = estimateFromCompaction(reference, gc)
      onChange({ ...value, compaction_degree: gc, c: est.c, phi: est.phi, gamma: est.gamma })
    } else {
      onChange({ ...value, compaction_degree: gc })
    }
  }

  const updateZone = (index: number, patch: Partial<FillZone>) => {
    const merged = { ...zones[index], ...patch }
    if (reference) {
      const est = estimateFromCompaction(reference, merged.compaction_degree)
      onZonesChange(zones.map((z, i) => (i === index ? { ...merged, c: est.c, phi: est.phi, gamma: est.gamma } : z)))
    } else {
      onZonesChange(zones.map((z, i) => (i === index ? merged : z)))
    }
  }
  const removeZone = (index: number) => onZonesChange(zones.filter((_, i) => i !== index))
  const addZone = () => {
    const base = reference ? estimateFromCompaction(reference, EMPTY_ZONE.compaction_degree) : EMPTY_ZONE
    onZonesChange([...zones, { ...EMPTY_ZONE, ...base }])
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          <input
            type="checkbox"
            checked={useCompaction}
            onChange={(e) => {
              if (e.target.checked) {
                const gc = value.compaction_degree ?? 95
                const est = estimateFromCompaction(DEFAULT_REFERENCE, gc)
                onReferenceChange(DEFAULT_REFERENCE)
                onChange({ ...value, compaction_degree: gc, c: est.c, phi: est.phi, gamma: est.gamma })
              } else {
                onReferenceChange(null)
              }
            }}
          />
          Calcular por material de referência + grau de compactação
        </label>

        {useCompaction && (
          <div className="mb-3 space-y-3 rounded-md border border-border bg-elevated/40 p-3">
            <p className="text-xs text-text-secondary">
              Informe c'/φ'/γ do material ensaiado a 100% do GC (de laboratório, ou pelo N_SPT da jazida, mesma
              correlação usada na fundação). O corpo do aterro e as zonas abaixo calculam seus próprios valores a
              partir do GC especificado para cada um (γ e c' escalam com o GC; φ' é mantido).
            </p>

            <div className="flex gap-3 text-xs">
              <button
                type="button"
                onClick={() => setReference({ n_spt: undefined, soil_class: undefined })}
                className={referenceMode === 'manual' ? 'font-medium text-accent-blue underline' : 'text-text-secondary'}
              >
                Valores diretos (laboratório)
              </button>
              <button
                type="button"
                onClick={() => setReferenceFromSPT({ n_spt: reference?.n_spt ?? 10, soil_class: reference?.soil_class ?? 'coesivo' })}
                className={referenceMode === 'spt' ? 'font-medium text-accent-blue underline' : 'text-text-secondary'}
              >
                Por N_SPT da jazida
              </button>
            </div>

            {referenceMode === 'manual' ? (
              <div className="grid grid-cols-3 gap-3">
                <NumberField
                  label="c' de referência (100% GC)"
                  value={reference!.c}
                  step={0.5}
                  min={0}
                  suffix="kPa"
                  onChange={(v) => setReference({ c: v })}
                />
                <NumberField
                  label="φ' de referência"
                  value={reference!.phi}
                  step={0.5}
                  min={0}
                  suffix="°"
                  onChange={(v) => setReference({ phi: v })}
                />
                <NumberField
                  label="γ de referência (100% GC)"
                  value={reference!.gamma}
                  step={0.1}
                  min={0}
                  suffix="kN/m³"
                  onChange={(v) => setReference({ gamma: v })}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="N_SPT da jazida"
                    value={reference!.n_spt!}
                    step={1}
                    min={0}
                    onChange={(v) => setReferenceFromSPT({ n_spt: v })}
                  />
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-text-secondary">Tipo de solo</span>
                    <select
                      value={reference!.soil_class}
                      onChange={(e) => setReferenceFromSPT({ soil_class: e.target.value as SoilClass })}
                      className="rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:outline-none"
                    >
                      <option value="granular">Granular</option>
                      <option value="coesivo">Coesivo</option>
                    </select>
                  </label>
                </div>
                <div className="text-xs text-accent-blue">
                  {estimateFromSPT(reference!.n_spt!, reference!.soil_class!).classification} → c'=
                  {reference!.c.toFixed(1)}kPa, φ'={reference!.phi.toFixed(1)}°, γ={reference!.gamma.toFixed(1)}kN/m³
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <NumberField
                    label="c' de referência (calculado)"
                    value={reference!.c}
                    step={0.5}
                    min={0}
                    suffix="kPa"
                    computed
                    onChange={(v) => setReference({ c: v })}
                  />
                  <NumberField
                    label="φ' de referência (calculado)"
                    value={reference!.phi}
                    step={0.5}
                    min={0}
                    suffix="°"
                    computed
                    onChange={(v) => setReference({ phi: v })}
                  />
                  <NumberField
                    label="γ de referência (calculado)"
                    value={reference!.gamma}
                    step={0.1}
                    min={0}
                    suffix="kN/m³"
                    computed
                    onChange={(v) => setReference({ gamma: v })}
                  />
                </div>
              </div>
            )}

            <NumberField
              label="GC do corpo do aterro"
              value={value.compaction_degree ?? 95}
              step={1}
              min={1}
              suffix="%"
              onChange={(v) => setBodyGC(v)}
            />
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          Corpo do aterro {value.compaction_degree != null && `(GC=${value.compaction_degree}%)`}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <NumberField
            label="Coesão c'"
            value={value.c}
            step={0.5}
            min={0}
            suffix="kPa"
            computed={useCompaction}
            onChange={(v) => set('c', v)}
          />
          <NumberField
            label="Ângulo de atrito φ'"
            value={value.phi}
            step={0.5}
            min={0}
            suffix="°"
            computed={useCompaction}
            onChange={(v) => set('phi', v)}
          />
          <NumberField
            label="Peso específico γ"
            value={value.gamma}
            step={0.1}
            min={0}
            suffix="kN/m³"
            computed={useCompaction}
            onChange={(v) => set('gamma', v)}
          />
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          Zonas de compactação diferenciada (a partir da plataforma)
        </div>
        <p className="mb-3 text-xs text-text-secondary">
          Ex.: últimas camadas de aterro compactadas a um GC mais alto que o corpo. Cada zona é medida por espessura
          a partir do topo da anterior (a primeira, a partir da plataforma).
        </p>
        {zones.map((zone, i) => (
          <div key={i} className="mb-2 rounded-md border border-border bg-elevated/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <input
                value={zone.name}
                onChange={(e) => updateZone(i, { name: e.target.value })}
                className="flex-1 rounded bg-elevated px-2 py-1 text-sm text-text-primary focus:outline-none"
              />
              <button
                aria-label="Remover zona"
                onClick={() => removeZone(i)}
                className="text-text-secondary hover:text-accent-red"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <NumberField
                label="Espessura"
                value={zone.thickness}
                step={0.1}
                min={0}
                suffix="m"
                onChange={(v) => updateZone(i, { thickness: v })}
              />
              <NumberField
                label="GC"
                value={zone.compaction_degree}
                step={1}
                min={1}
                suffix="%"
                onChange={(v) => updateZone(i, { compaction_degree: v })}
              />
              <NumberField
                label="c'"
                value={zone.c}
                step={0.5}
                min={0}
                suffix="kPa"
                computed={!!reference}
                onChange={(v) => updateZone(i, { c: v })}
              />
              <NumberField
                label="φ'"
                value={zone.phi}
                step={0.5}
                min={0}
                suffix="°"
                computed={!!reference}
                onChange={(v) => updateZone(i, { phi: v })}
              />
              <NumberField
                label="γ"
                value={zone.gamma}
                step={0.1}
                min={0}
                suffix="kN/m³"
                computed={!!reference}
                onChange={(v) => updateZone(i, { gamma: v })}
              />
            </div>
          </div>
        ))}
        <button onClick={addZone} className="flex items-center gap-1 text-xs text-accent-blue hover:underline">
          <Plus size={14} /> Adicionar zona
        </button>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
          Proteção da face do talude
        </div>
        <p className="mb-3 text-xs text-text-secondary">
          Sem proteção, trincas de dessecação e ciclos de umedecimento/secagem degradam a coesão de compactação
          perto da face. A cobertura reduz esse efeito dentro de uma faixa de profundidade a partir da superfície.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-secondary">Tipo de cobertura</span>
            <select
              value={coverage.type}
              onChange={(e) => onCoverageChange({ ...coverage, type: e.target.value as CoverageType })}
              className="rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:outline-none"
            >
              {(Object.keys(COVERAGE_LABELS) as CoverageType[]).map((t) => (
                <option key={t} value={t}>
                  {COVERAGE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label="Profundidade da zona de influência"
            value={coverage.depth}
            step={0.1}
            min={0}
            suffix="m"
            onChange={(v) => onCoverageChange({ ...coverage, depth: v })}
          />
        </div>
      </div>
    </div>
  )
}
