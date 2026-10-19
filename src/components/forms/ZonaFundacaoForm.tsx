import { NumberField } from './NumberField'
import { OrigemTag } from '../ui/OrigemTag'
import { camadaTratada, espessuraCamada, NOTA_PRECARGA, xLimUsuario, ZONA_PADRAO } from '../../engine/zonaFundacao'
import type { Origem } from '../../engine/zonaFundacao'
import type { Layer, ModoZonaA, ZonaFundacao } from '../../engine/types'

interface Props {
  value: ZonaFundacao | undefined
  onChange: (v: ZonaFundacao) => void
  layers: Layer[]
  xPeUsuario: number // x do pé do talude no referencial do usuário (H·m)
  analiseNaoDrenada: boolean
}

const MODOS: { id: ModoZonaA; label: string }[] = [
  { id: 'su', label: 'su equivalente direto' },
  { id: 'precarga', label: 'Ganho por pré-carga' },
  { id: 'colunas', label: 'Faixa de colunas (c, φ do composto)' },
]

function Rotulo({ texto, origem }: { texto: string; origem: Origem | Origem[] }) {
  const lista = Array.isArray(origem) ? origem : [origem]
  return (
    <span>
      {texto}
      {lista.map((o) => (
        <OrigemTag key={o} origem={o} />
      ))}
    </span>
  )
}

export function ZonaFundacaoForm({ value, onChange, layers, xPeUsuario, analiseNaoDrenada }: Props) {
  const zf: ZonaFundacao = { ...ZONA_PADRAO, ...(value ?? {}) }
  const set = (p: Partial<ZonaFundacao>) => onChange({ ...zf, ...p })
  const alvo = camadaTratada(zf, layers)
  const esp = alvo ? espessuraCamada(alvo.layer) : 0
  const xLim = xLimUsuario(zf, xPeUsuario)
  const dtrTotal = zf.d_tr == null

  return (
    <div className="mt-4 rounded-md border border-border p-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text-primary">
        <input type="checkbox" checked={zf.ativa} onChange={(e) => set({ ativa: e.target.checked })} />
        Fundação em duas zonas (A tratada · B natural)
      </label>
      <p className="mt-1 text-xs text-text-secondary">
        x = 0 na borda da plataforma, positivo rumo ao pé e além; o pé está em x = {xPeUsuario.toFixed(2)} m. A Zona A
        vale para x ≤ x_lim e z ≤ d_tr; fora dela vale a Zona B (os valores já lançados na camada).
      </p>

      {zf.ativa && (
        <div className="mt-3 space-y-4">
          {!analiseNaoDrenada && (
            <div className="rounded border border-accent-amber/40 bg-accent-amber/10 p-2 text-xs text-accent-amber">
              A análise está em condição drenada. Os modos de su (direto e pré-carga) pressupõem condição não drenada
              (φ = 0): troque a condição na aba Geometria.
            </div>
          )}

          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">Zona A (tratada)</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary">Camada tratada</span>
                <select
                  value={alvo?.indice ?? 0}
                  onChange={(e) => set({ camada: Number(e.target.value) })}
                  className="rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:outline-none"
                >
                  {layers.map((l, i) => (
                    <option key={i} value={i}>
                      {i + 1}. {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary">Limite horizontal informado como</span>
                <select
                  value={zf.limite_modo}
                  onChange={(e) => set({ limite_modo: e.target.value as ZonaFundacao['limite_modo'] })}
                  className="rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:outline-none"
                >
                  <option value="alem_pe">distância além do pé</option>
                  <option value="x_abs">posição x absoluta</option>
                </select>
              </label>
              {zf.limite_modo === 'alem_pe' ? (
                <NumberField
                  label="Distância tratável além do pé (0 = só até o pé)"
                  value={zf.alem_pe}
                  step={0.5}
                  min={0}
                  suffix="m"
                  onChange={(v) => set({ alem_pe: Number.isFinite(v) ? Math.max(v, 0) : 0 })}
                />
              ) : (
                <NumberField
                  label="x_lim absoluto"
                  value={zf.x_abs}
                  step={0.5}
                  suffix="m"
                  onChange={(v) => set({ x_abs: Number.isFinite(v) ? v : 0 })}
                />
              )}
              <div className="flex flex-col justify-end pb-2 font-mono text-xs text-text-secondary">
                x_lim = {xLim.toFixed(2)} m <OrigemTag origem="LIDO" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={dtrTotal}
                    onChange={(e) => set({ d_tr: e.target.checked ? null : esp || 5 })}
                  />
                  Tratar toda a espessura da argila{esp > 0 ? ` (${esp.toFixed(1)} m)` : ''}
                </label>
                {!dtrTotal && (
                  <NumberField
                    label="Profundidade tratada d_tr"
                    value={zf.d_tr ?? 0}
                    step={0.5}
                    min={0}
                    suffix="m"
                    onChange={(v) => set({ d_tr: Number.isFinite(v) ? Math.max(v, 0) : 0 })}
                  />
                )}
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary">Transição entre zonas</span>
                <select
                  value={zf.transicao}
                  onChange={(e) => set({ transicao: e.target.value as ZonaFundacao['transicao'] })}
                  className="rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:outline-none"
                >
                  <option value="abrupta">abrupta</option>
                  <option value="gradual">gradual em L metros</option>
                </select>
                {zf.transicao === 'gradual' && (
                  <NumberField
                    label="L (de x_lim a x_lim + L)"
                    value={zf.L_trans}
                    step={0.5}
                    min={0}
                    suffix="m"
                    onChange={(v) => set({ L_trans: Number.isFinite(v) ? Math.max(v, 0) : 0 })}
                  />
                )}
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {MODOS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => set({ modo: m.id })}
                  className={`rounded px-2 py-1 text-xs ${
                    zf.modo === m.id ? 'bg-brand text-white' : 'border border-border text-text-secondary'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {zf.modo === 'su' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <NumberField
                  label="su no topo da Zona A"
                  value={zf.su_topo}
                  step={1}
                  min={0}
                  suffix="kPa"
                  onChange={(v) => set({ su_topo: Number.isFinite(v) ? v : 0 })}
                />
                <NumberField
                  label="Gradiente k: su(z) = su_topo + k·z"
                  value={zf.k}
                  step={0.5}
                  suffix="kPa/m"
                  onChange={(v) => set({ k: Number.isFinite(v) ? v : 0 })}
                />
                <div className="col-span-2 text-xs text-text-secondary">
                  su_topo e k <OrigemTag origem="LIDO" />
                </div>
              </div>
            )}

            {zf.modo === 'precarga' && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="r (razão de ganho)"
                    value={zf.r}
                    step={0.01}
                    min={0}
                    onChange={(v) => set({ r: Number.isFinite(v) ? v : 0 })}
                  />
                  <NumberField
                    label="U (grau de adensamento, 0 a 1)"
                    value={zf.U}
                    step={0.05}
                    min={0}
                    onChange={(v) => set({ U: Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0 })}
                  />
                  <NumberField
                    label="q_pré (carga da pré-carga)"
                    value={zf.q_pre}
                    step={1}
                    min={0}
                    suffix="kPa"
                    onChange={(v) => set({ q_pre: Number.isFinite(v) ? v : 0 })}
                  />
                  <NumberField
                    label="B (largura da pré-carga)"
                    value={zf.B}
                    step={0.5}
                    min={0.1}
                    suffix="m"
                    onChange={(v) => set({ B: Number.isFinite(v) ? Math.max(v, 0.1) : 0.1 })}
                  />
                </div>
                <div className="text-xs text-text-secondary">
                  <Rotulo texto="r" origem={['EMPÍRICO', 'HIPÓTESE']} /> · <Rotulo texto="U" origem="HIPÓTESE" /> ·{' '}
                  <Rotulo texto="q_pré" origem="HIPÓTESE" /> · <Rotulo texto="B" origem="HIPÓTESE" />
                  <br />
                  {NOTA_PRECARGA} Espraiamento 2:1 <OrigemTag origem="EMPÍRICO" />
                </div>
              </div>
            )}

            {zf.modo === 'colunas' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <NumberField
                  label="c_comp (solo composto)"
                  value={zf.c_comp}
                  step={1}
                  min={0}
                  suffix="kPa"
                  onChange={(v) => set({ c_comp: Number.isFinite(v) ? v : 0 })}
                />
                <NumberField
                  label="φ_comp (solo composto)"
                  value={zf.phi_comp}
                  step={1}
                  min={0}
                  suffix="°"
                  onChange={(v) => set({ phi_comp: Number.isFinite(v) ? v : 0 })}
                />
                <div className="col-span-2 text-xs text-text-secondary">
                  c_comp e φ_comp <OrigemTag origem="HIPÓTESE" /> — copie os valores calculados na aba de colunas
                  (Contenções · Argila mole); aqui eles são digitados.
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
              Zona B (natural) — vazio = valores da camada
            </div>
            <div className="grid grid-cols-2 gap-2">
              <OpcionalField
                label={`su / c no topo (camada: ${alvo?.layer.c ?? '—'} kPa)`}
                value={zf.b_su_topo}
                suffix="kPa"
                onChange={(v) => set({ b_su_topo: v })}
              />
              <OpcionalField
                label="Gradiente k de B"
                value={zf.b_k}
                suffix="kPa/m"
                onChange={(v) => set({ b_k: v })}
              />
              <OpcionalField
                label={`φ (camada: ${alvo?.layer.phi ?? '—'}°)`}
                value={zf.b_phi}
                suffix="°"
                onChange={(v) => set({ b_phi: v })}
              />
              <OpcionalField
                label={`γ (camada: ${alvo?.layer.gamma ?? '—'} kN/m³)`}
                value={zf.b_gamma}
                suffix="kN/m³"
                onChange={(v) => set({ b_gamma: v })}
              />
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">Busca de círculos</div>
            <div className="grid grid-cols-2 gap-2">
              <OpcionalField
                label={`Saída máxima além do pé (padrão 3× espessura = ${(3 * esp).toFixed(1)} m)`}
                value={zf.saida_max}
                suffix="m"
                onChange={(v) => set({ saida_max: v })}
              />
              <NumberField
                label="Círculos críticos a listar"
                value={zf.n_criticos ?? 5}
                step={1}
                min={1}
                onChange={(v) => set({ n_criticos: Number.isFinite(v) ? Math.max(1, Math.round(v)) : 5 })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OpcionalField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string
  value: number | undefined
  suffix: string
  onChange: (v: number | undefined) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-text-secondary">{label}</span>
      <div className="flex items-center gap-2 rounded-md border border-border bg-elevated px-2 py-1.5">
        <input
          type="number"
          value={value ?? ''}
          placeholder="da camada"
          onChange={(e) => onChange(e.target.value === '' || Number.isNaN(e.target.valueAsNumber) ? undefined : e.target.valueAsNumber)}
          className="w-full bg-transparent font-mono text-sm text-text-primary focus:outline-none"
        />
        <span className="text-xs text-text-secondary">{suffix}</span>
      </div>
    </label>
  )
}
