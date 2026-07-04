import { useState } from 'react'
import { AlertTriangle, Check, FileUp, Loader2, Save } from 'lucide-react'
import { convertSondagemToLayers, mockExtractSondagem } from '../../engine/sondagem'
import type { Layer, SondagemExtractionResult } from '../../engine/types'
import { supabase } from '../../lib/supabase'
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
  const [extracting, setExtracting] = useState(false)
  const [result, setResult] = useState<SondagemExtractionResult | null>(null)

  const [uploadedFile, setUploadedFile] = useState<SondagemUpload | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const handleExtract = async () => {
    setExtracting(true)
    setUploadedFile(null)
    setSaveMessage(null)
    try {
      // envio do arquivo original (se selecionado) em paralelo com a
      // extração — o envio já é real, só a leitura do conteúdo continua
      // simulada (mock) enquanto a IA com visão computacional não é conectada
      const [r, uploaded] = await Promise.all([
        mockExtractSondagem(),
        file && supabase
          ? uploadSondagemFile(file).then(
              (u) => ({ ok: true as const, u }),
              (err) => ({ ok: false as const, err })
            )
          : Promise.resolve(null),
      ])
      setResult(r)
      if (uploaded) {
        if (uploaded.ok) {
          setUploadedFile(uploaded.u)
        } else {
          setUploadedFile(null)
          setSaveMessage(
            `Não foi possível enviar o arquivo (${uploaded.err instanceof Error ? uploaded.err.message : 'erro desconhecido'}) — verifique se o bucket "sondagens" foi criado no Supabase.`
          )
        }
      }
    } finally {
      setExtracting(false)
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
          A leitura do conteúdo ainda é simulada (mock) — a extração por IA com visão computacional ainda não está
          conectada, os dados abaixo são de exemplo; sempre confira contra o boletim antes de importar. O envio do
          arquivo em si já é real: ao salvar a sondagem, o arquivo original fica guardado para conferência futura.
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
          Defina a cota do pé/plataforma na aba Geometria (aterro: "Cota do pé do talude"; corte: "Cota da
          plataforma de corte") para poder converter as profundidades do furo em posição dentro do talude.
        </div>
      )}

      <button
        onClick={handleExtract}
        disabled={extracting}
        className="mb-3 flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {extracting && <Loader2 size={14} className="animate-spin" />}
        {extracting ? 'Extraindo...' : 'Extrair dados do boletim'}
      </button>

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
