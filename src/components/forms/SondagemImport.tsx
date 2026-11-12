import { useEffect, useState } from 'react'
import { AlertTriangle, Check, FileJson, FileUp, Loader2, Save } from 'lucide-react'
import { convertSondagemToLayers } from '../../engine/sondagem'
import { parseSondagemJson } from '../../engine/sondagemJson'
import type { Layer, SondagemExtractionResult } from '../../engine/types'
import { supabase } from '../../lib/supabase'
import { getSondagemCamadas, listAllSondagens, type SondagemSummary } from '../../lib/projetosStorage'
import { useProjetoAtivo } from '../../lib/ProjetoAtivoContext'
import type { SondagemLayerParam } from '../../engine/sondagem'
import { saveSondagem, uploadSondagemFile, type SondagemUpload } from '../../lib/sondagemStorage'
import { NumberField } from './NumberField'
import { SondagemLayersEditor } from './SondagemLayersEditor'

interface SondagemImportProps {
  toeElevation: number | undefined
  onImport: (layers: Layer[], waterTableDepth?: number) => void
  onClose: () => void
}

export function SondagemImport({ toeElevation, onImport, onClose }: SondagemImportProps) {
  const [file, setFile] = useState<File | null>(null)
  const [collarElevation, setCollarElevation] = useState<number | undefined>(toeElevation)
  const [result, setResult] = useState<SondagemExtractionResult | null>(null)

  const [uploadedFile, setUploadedFile] = useState<SondagemUpload | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const { projetoAtivoId } = useProjetoAtivo()
  const [salvas, setSalvas] = useState<SondagemSummary[]>([])
  const [carregandoSalva, setCarregandoSalva] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    listAllSondagens()
      .then((l) => setSalvas([...l].sort((a, b) => Number(b.projeto_id === projetoAtivoId) - Number(a.projeto_id === projetoAtivoId))))
      .catch(() => {})
  }, [projetoAtivoId])

  /** Usa uma sondagem já salva (camadas com c', φ' e γ gravados) sem reimportar o JSON. */
  const handleUsarSalva = async (id: string) => {
    const sond = salvas.find((x) => x.id === id)
    if (!sond) return
    setCarregandoSalva(true)
    setErro(null)
    setSaveMessage(null)
    try {
      const rows = await getSondagemCamadas(id)
      const layers: SondagemLayerParam[] = rows
        .filter((c) => c.depth_top != null && c.depth_base != null)
        .map((c) => ({
          depth_top: c.depth_top as number,
          depth_base: c.depth_base as number,
          description: c.nome,
          n_spt: c.n_spt ?? 0,
          soil_class: (c.soil_class as 'granular' | 'coesivo') ?? 'coesivo',
          c: c.c,
          phi: c.phi,
          gamma: c.gamma,
        }))
      setResult({
        layers,
        water_table_depth: sond.na_profundidade ?? undefined,
        source_note: `Sondagem salva ${sond.nome} (${sond.projeto_nome})`,
      })
      setAvisos(layers.length < rows.length ? ['Algumas camadas salvas não têm profundidades e foram ignoradas.'] : [])
      if (sond.cota_terreno != null) setCollarElevation(sond.cota_terreno)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao carregar a sondagem salva.')
    } finally {
      setCarregandoSalva(false)
    }
  }
  const [avisos, setAvisos] = useState<string[]>([])

  const handleJson = async (jsonFile: File | null) => {
    if (!jsonFile) return
    setSaveMessage(null)
    const { furos, erros } = parseSondagemJson(await jsonFile.text())
    if (erros.length) {
      setErro(erros.join(' '))
      return
    }
    setErro(null)
    const f = furos[0]
    setResult(f.extraction)
    setAvisos([...(furos.length > 1 ? [`O JSON tem ${furos.length} furos; carregado só "${f.identifier}". Use a página Sondagens para importar todos.`] : []), ...f.avisos])
    if (f.cotaBoca != null) setCollarElevation(f.cotaBoca)
    if (file && supabase) {
      uploadSondagemFile(file).then(setUploadedFile, () => setUploadedFile(null))
    }
  }

  const handleSaveSondagem = async () => {
    if (!result) return
    const projetoNome = window.prompt('Nome do projeto:', '')
    if (!projetoNome) return
    const nomeSondagem = window.prompt('Nome da sondagem (ex.: SP-01):', 'SP-01')
    if (!nomeSondagem) return

    setSaving(true)
    setSaveMessage(null)
    try {
      await saveSondagem(projetoNome, nomeSondagem, collarElevation ?? null, uploadedFile, file?.name ?? null, result)
      setSaveMessage('Sondagem salva.')
    } catch (err) {
      setSaveMessage(err instanceof Error ? `Erro ao salvar: ${err.message}` : 'Erro ao salvar sondagem.')
    } finally {
      setSaving(false)
    }
  }

  // sem cota do pé definida na Geometria, usa a cota da boca do furo como referência (pé = boca:
  // terreno natural plano no furo) — as camadas ficam em y = -profundidade
  const toeEfetivo = toeElevation ?? collarElevation
  const canImport = result && collarElevation != null && toeEfetivo != null

  const handleImport = () => {
    if (!result || collarElevation == null || toeEfetivo == null) return
    const layers = convertSondagemToLayers(result.layers, collarElevation, toeEfetivo)
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
          O app não lê a tabela do PDF: gere o JSON miso-spt no Claude Chat (com c', φ' e γ discutidos/revisados lá) e importe abaixo. Confira contra o boletim antes de importar. O arquivo original do PDF, se escolhido, fica guardado ao salvar a sondagem.
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">Arquivo do boletim (PDF/imagem)</span>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-elevated px-2 py-1.5 text-sm text-text-secondary hover:border-brand">
            <FileUp size={16} />
            {file?.name ?? 'Escolher arquivo...'}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setUploadedFile(null)
              }}
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
          Cota do pé/plataforma não definida na aba Geometria: as camadas serão posicionadas com o pé do talude na
          mesma cota da boca do furo (profundidade do furo = -y). Se o pé estiver em outra cota (aterro: "Cota do
          pé do talude"; corte: "Cota da plataforma de corte"), defina-a na aba Geometria antes de importar.
        </div>
      )}

      {salvas.length > 0 && (
        <label className="mb-3 flex flex-col gap-1">
          <span className="text-xs text-text-secondary">Ou use uma sondagem já salva (com c', φ' e γ):</span>
          <select
            defaultValue=""
            disabled={carregandoSalva}
            onChange={(e) => e.target.value && handleUsarSalva(e.target.value)}
            className="rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:outline-none"
          >
            <option value="">Selecione...</option>
            {salvas.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome} — {x.projeto_nome}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="mb-3 inline-flex cursor-pointer items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white">
        <FileJson size={14} />
        Importar JSON (miso-spt)
        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            handleJson(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />
      </label>
      {erro && <div className="mb-3 text-xs text-accent-red">{erro}</div>}
      {avisos.map((a, i) => (
        <div key={i} className="mb-1 text-xs text-accent-amber">{a}</div>
      ))}

      {result && (
        <div className="space-y-3">
          <SondagemLayersEditor
            layers={result.layers}
            onChange={(layers) => setResult({ ...result, layers })}
          />

          {result.water_table_depth != null && (
            <div className="text-xs text-text-secondary">
              N.A. identificado a {result.water_table_depth.toFixed(2)}m abaixo da boca do furo.
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              disabled={!canImport}
              className="rounded-md bg-accent-green px-3 py-2 text-sm font-medium disabled:opacity-40"
              style={{ color: '#0D1B2A' }}
            >
              Importar para Solo / Fundação
            </button>
            <button
              onClick={handleSaveSondagem}
              disabled={!supabase || saving}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40"
              title={!supabase ? 'Configure VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY para habilitar' : undefined}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar sondagem no projeto
            </button>
            {saveMessage && <span className="text-xs text-text-secondary">{saveMessage}</span>}
          </div>
          {uploadedFile && (
            <div className="flex items-center gap-1 text-xs text-accent-green">
              <Check size={12} /> Arquivo enviado — será vinculado à sondagem ao salvar.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
