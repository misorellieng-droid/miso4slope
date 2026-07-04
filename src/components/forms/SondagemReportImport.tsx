import { useEffect, useState } from 'react'
import { AlertTriangle, Check, FileUp, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { mockExtractSondagem } from '../../engine/sondagem'
import { detectSondagemGroups } from '../../engine/sondagemDetection'
import type { SondagemExtractionResult } from '../../engine/types'
import { listProjetos, type ProjetoSummary } from '../../lib/projetosStorage'
import { extractPdfPageTexts } from '../../lib/pdfText'
import { saveSondagem, uploadSondagemFile, type SondagemUpload } from '../../lib/sondagemStorage'
import { NumberField } from './NumberField'
import { SondagemLayersEditor } from './SondagemLayersEditor'

interface Card {
  key: string
  identifier: string
  pageStart: number
  pageEnd: number
  autoDetected: boolean
  cotaTerreno: number | undefined
  extraction: SondagemExtractionResult | null
  extracting: boolean
  saving: boolean
  saved: boolean
  message: string | null
}

interface SondagemReportImportProps {
  onSaved?: () => void
}

/**
 * Import de um relatório completo (PDF com várias folhas) que pode conter
 * mais de uma sondagem — o sistema lê o texto de cada página e tenta
 * reconhecer o cabeçalho de cada furo ("SONDAGEM SP-01", "FURO Nº 02" etc.),
 * agrupando páginas consecutivas sem cabeçalho novo na sondagem anterior
 * (cobre o caso de uma sondagem dividida em duas folhas). A extração de
 * texto/cabeçalho é real (pdfjs, roda no navegador); a leitura da TABELA de
 * camadas de cada sondagem continua simulada (mock), já que a extração por
 * IA com visão computacional ainda não está conectada — cada card mostra os
 * dados de exemplo prontos para conferência e ajuste manual antes de salvar.
 */
export function SondagemReportImport({ onSaved }: SondagemReportImportProps) {
  const [projetos, setProjetos] = useState<ProjetoSummary[]>([])
  const [projetoNome, setProjetoNome] = useState('')
  const [novoProjetoNome, setNovoProjetoNome] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploadedFile, setUploadedFile] = useState<SondagemUpload | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)
  const [cards, setCards] = useState<Card[]>([])

  useEffect(() => {
    listProjetos()
      .then(setProjetos)
      .catch(() => {})
  }, [])

  const effectiveProjetoNome = projetoNome === '__novo__' ? novoProjetoNome : projetoNome

  const updateCard = (key: string, patch: Partial<Card>) => {
    setCards((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }

  const handleDetect = async () => {
    if (!file) return
    setDetecting(true)
    setDetectError(null)
    setCards([])
    setUploadedFile(null)
    try {
      const [pageTexts, uploaded] = await Promise.all([
        extractPdfPageTexts(file),
        uploadSondagemFile(file).catch(() => null),
      ])
      setUploadedFile(uploaded)

      const groups = detectSondagemGroups(pageTexts)
      const initialCards: Card[] = groups.map((g, i) => ({
        key: `${Date.now()}-${i}`,
        identifier: g.identifier,
        pageStart: g.pageStart,
        pageEnd: g.pageEnd,
        autoDetected: g.autoDetected,
        cotaTerreno: undefined,
        extraction: null,
        extracting: true,
        saving: false,
        saved: false,
        message: null,
      }))
      setCards(initialCards)

      // extração (mock) de cada sondagem em paralelo — real seria uma chamada
      // por sondagem à IA de visão computacional, restrita ao intervalo de
      // páginas detectado
      await Promise.all(
        initialCards.map(async (c) => {
          const extraction = await mockExtractSondagem()
          setCards((prev) => prev.map((card) => (card.key === c.key ? { ...card, extraction, extracting: false } : card)))
        })
      )
    } catch (err) {
      setDetectError(
        err instanceof Error ? `Erro ao ler o PDF: ${err.message}` : 'Erro ao ler o PDF — tente outro arquivo.'
      )
    } finally {
      setDetecting(false)
    }
  }

  const handleAddCard = () => {
    const lastPage = cards.length ? cards[cards.length - 1].pageEnd + 1 : 1
    const key = `manual-${Date.now()}`
    setCards((prev) => [
      ...prev,
      {
        key,
        identifier: `Sondagem ${prev.length + 1}`,
        pageStart: lastPage,
        pageEnd: lastPage,
        autoDetected: false,
        cotaTerreno: undefined,
        extraction: null,
        extracting: true,
        saving: false,
        saved: false,
        message: null,
      },
    ])
    mockExtractSondagem().then((extraction) => updateCard(key, { extraction, extracting: false }))
  }

  const handleRemoveCard = (key: string) => setCards((prev) => prev.filter((c) => c.key !== key))

  const handleSaveCard = async (card: Card) => {
    if (!card.extraction || !effectiveProjetoNome) return
    updateCard(card.key, { saving: true, message: null })
    try {
      await saveSondagem(
        effectiveProjetoNome,
        card.identifier,
        card.cotaTerreno ?? null,
        uploadedFile,
        file?.name ?? null,
        card.extraction,
        { start: card.pageStart, end: card.pageEnd }
      )
      updateCard(card.key, { saving: false, saved: true, message: 'Salva.' })
      onSaved?.()
    } catch (err) {
      updateCard(card.key, {
        saving: false,
        message: err instanceof Error ? `Erro: ${err.message}` : 'Erro ao salvar.',
      })
    }
  }

  const canSave = !!effectiveProjetoNome

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 font-sans text-sm font-bold text-text-primary">Importar relatório completo</h3>

      <div className="mb-3 flex items-start gap-2 rounded-md border border-accent-amber/40 bg-accent-amber/10 p-2 text-xs text-accent-amber">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>
          A identificação de quantas sondagens existem no PDF e quais páginas pertencem a cada uma já é real (lê o
          texto de cada página em busca do cabeçalho do furo — uma sondagem sem cabeçalho novo numa página é tratada
          como continuação da anterior, cobrindo o caso dela estar dividida em duas folhas). A leitura da TABELA de
          camadas de cada sondagem continua simulada (mock) — confira e ajuste os dados de cada card antes de salvar.
          PDFs escaneados como imagem (sem texto) não têm cabeçalho detectável; ajuste os intervalos de página
          manualmente nesse caso.
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">Projeto</span>
          <select
            value={projetoNome}
            onChange={(e) => setProjetoNome(e.target.value)}
            className="rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:outline-none"
          >
            <option value="">Selecione...</option>
            {projetos.map((p) => (
              <option key={p.id} value={p.nome}>
                {p.nome}
              </option>
            ))}
            <option value="__novo__">+ Novo projeto...</option>
          </select>
        </label>
        {projetoNome === '__novo__' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-secondary">Nome do novo projeto</span>
            <input
              value={novoProjetoNome}
              onChange={(e) => setNovoProjetoNome(e.target.value)}
              className="rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:outline-none"
            />
          </label>
        )}
      </div>

      <label className="mb-3 flex flex-col gap-1">
        <span className="text-xs text-text-secondary">Arquivo do relatório (PDF)</span>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-elevated px-2 py-1.5 text-sm text-text-secondary hover:border-brand">
          <FileUp size={16} />
          {file?.name ?? 'Escolher arquivo...'}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </label>

      <button
        onClick={handleDetect}
        disabled={!file || detecting}
        className="mb-3 flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {detecting && <Loader2 size={14} className="animate-spin" />}
        {detecting ? 'Detectando sondagens...' : 'Detectar sondagens'}
      </button>

      {detectError && <div className="mb-3 text-xs text-accent-red">{detectError}</div>}

      {cards.length > 0 && (
        <div className="space-y-3">
          {cards.map((card) => (
            <div key={card.key} className="rounded-lg border border-border bg-elevated/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    value={card.identifier}
                    onChange={(e) => updateCard(card.key, { identifier: e.target.value })}
                    className="rounded bg-elevated px-2 py-1 font-sans text-sm font-semibold text-text-primary focus:outline-none"
                  />
                  {!card.autoDetected && (
                    <span className="text-xs text-accent-amber">nome não reconhecido — confira/ajuste</span>
                  )}
                </div>
                <button
                  aria-label="Remover este card"
                  onClick={() => handleRemoveCard(card.key)}
                  className="rounded p-1 text-text-secondary hover:bg-accent-red/10 hover:text-accent-red"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="mb-2 grid grid-cols-3 gap-2">
                <NumberField
                  label="Página inicial"
                  value={card.pageStart}
                  step={1}
                  min={1}
                  onChange={(v) => updateCard(card.key, { pageStart: Math.round(v) })}
                />
                <NumberField
                  label="Página final"
                  value={card.pageEnd}
                  step={1}
                  min={card.pageStart}
                  onChange={(v) => updateCard(card.key, { pageEnd: Math.round(v) })}
                />
                <NumberField
                  label="Cota do terreno na boca do furo"
                  value={card.cotaTerreno ?? NaN}
                  step={0.01}
                  suffix="m"
                  onChange={(v) => updateCard(card.key, { cotaTerreno: v })}
                />
              </div>

              {card.extracting && (
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Loader2 size={12} className="animate-spin" /> Extraindo camadas...
                </div>
              )}

              {card.extraction && (
                <div className="space-y-2">
                  <SondagemLayersEditor
                    layers={card.extraction.layers}
                    onChange={(layers) => updateCard(card.key, { extraction: { ...card.extraction!, layers } })}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSaveCard(card)}
                      disabled={!canSave || card.saving || card.saved}
                      className="flex items-center gap-2 rounded-md bg-accent-green px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                      style={{ color: '#0D1B2A' }}
                      title={!canSave ? 'Selecione ou crie um projeto acima' : undefined}
                    >
                      {card.saving ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : card.saved ? (
                        <Check size={12} />
                      ) : (
                        <Save size={12} />
                      )}
                      {card.saved ? 'Salva no projeto' : 'Salvar no projeto'}
                    </button>
                    {card.message && <span className="text-xs text-text-secondary">{card.message}</span>}
                  </div>
                </div>
              )}
            </div>
          ))}

          <button
            onClick={handleAddCard}
            className="flex items-center gap-1 text-xs text-brand hover:underline"
          >
            <Plus size={14} /> A detecção perdeu uma sondagem? Adicionar manualmente
          </button>
        </div>
      )}
    </div>
  )
}
