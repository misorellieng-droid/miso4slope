import { useRef, useState } from 'react'
import { Calculator, FileDown, FolderOpen, Loader2, Play, Save } from 'lucide-react'
import { usePersistedState } from '../lib/persist'
import { supabase } from '../lib/supabase'
import { listAnalyses, loadAnalysis, saveAnalysis, type SavedAnalysis } from '../lib/analysisStorage'
import { exportReportToPdf } from '../lib/exportPdf'
import { GeometryForm } from '../components/forms/GeometryForm'
import { SoilLayerTable } from '../components/forms/SoilLayerTable'
import { FillForm } from '../components/forms/FillForm'
import { SondagemImport } from '../components/forms/SondagemImport'
import { NumberField } from '../components/forms/NumberField'
import { SlopeCanvas, type SlopeCanvasHandle } from '../components/slope/SlopeCanvas'
import { ResultCard } from '../components/slope/ResultCard'
import { SlicesTable } from '../components/slope/SlicesTable'
import { bishopFS } from '../engine/bishop'
import { felleniusFS } from '../engine/fellenius'
import { findCriticalCircle, type SearchProgress } from '../engine/search'
import { computePartialFS, type PartialFS } from '../engine/fsDecomposition'
import type {
  AnalysisMode,
  AnalysisResult,
  CircleParams,
  CompactionReference,
  FaceCoverage,
  FillMaterial,
  FillZone,
  Layer,
  SlopeGeometry,
  StabilityMethod,
} from '../engine/types'

const SOLVERS: Record<StabilityMethod, typeof bishopFS> = {
  bishop: bishopFS,
  fellenius: felleniusFS,
}

const METHOD_LABELS: Record<StabilityMethod, string> = {
  bishop: 'Bishop Simplificado',
  fellenius: 'Fellenius (Método Comum das Fatias)',
}

const DEFAULT_GEOMETRY: SlopeGeometry = {
  bench_height: 8,
  slope_ratio: 1.5,
  berm_width: 2.5,
  total_height: 18.011,
  water_table_depth: 14.25,
  gamma_water: 9.81,
}

const DEFAULT_LAYERS: Layer[] = [
  { name: 'Argila mole', y_top: 0, y_base: -1.5, c: 5, phi: 22, gamma: 15.0 },
  { name: 'Argila porosa', y_top: -1.5, y_base: -6.0, c: 6, phi: 23, gamma: 15.5 },
  { name: 'Argila rija', y_top: -6.0, y_base: -13.0, c: 18, phi: 35, gamma: 19.0 },
  { name: 'Areia compacta', y_top: -13.0, y_base: -16.51, c: 0, phi: 39, gamma: 19.5 },
  { name: 'Argila siltosa', y_top: -16.51, y_base: -17.15, c: 10, phi: 32, gamma: 18.0 },
  { name: 'Areia média', y_top: -17.15, y_base: -25.0, c: 0, phi: 33, gamma: 18.5 },
]

const DEFAULT_FILL: FillMaterial = { c: 8, phi: 25, gamma: 18 }

// talude sempre terá revestimento vegetal em projeto — grama como padrão realista
const DEFAULT_COVERAGE: FaceCoverage = { type: 'grass', depth: 1.5 }

type Tab = 'geometria' | 'solo' | 'aterro'

const TABS_ATERRO: { id: Tab; label: string }[] = [
  { id: 'geometria', label: 'Geometria' },
  { id: 'solo', label: 'Solo / Fundação' },
  { id: 'aterro', label: 'Aterro' },
]

const TABS_CORTE: { id: Tab; label: string }[] = [
  { id: 'geometria', label: 'Geometria' },
  { id: 'solo', label: 'Solo / Camadas' },
]

const STORAGE_PREFIX = 'miso4slope:analise:'

export function AnalysisPage() {
  const [geometry, setGeometry] = usePersistedState(STORAGE_PREFIX + 'geometry', DEFAULT_GEOMETRY)
  const [layers, setLayers] = usePersistedState(STORAGE_PREFIX + 'layers', DEFAULT_LAYERS)
  const [fill, setFill] = usePersistedState(STORAGE_PREFIX + 'fill', DEFAULT_FILL)
  const [coverage, setCoverage] = usePersistedState(STORAGE_PREFIX + 'coverage', DEFAULT_COVERAGE)
  const [fillReference, setFillReference] = usePersistedState<CompactionReference | null>(
    STORAGE_PREFIX + 'fillReference',
    null
  )
  const [fillZones, setFillZones] = usePersistedState<FillZone[]>(STORAGE_PREFIX + 'fillZones', [])
  const [tab, setTab] = useState<Tab>('geometria')
  const [showSondagemImport, setShowSondagemImport] = useState(false)

  const [result, setResult] = usePersistedState<AnalysisResult | null>(STORAGE_PREFIX + 'result', null)
  const [partialFS, setPartialFS] = usePersistedState<PartialFS | null>(STORAGE_PREFIX + 'partialFS', null)
  const [resultSource, setResultSource] = usePersistedState<'search' | 'manual'>(
    STORAGE_PREFIX + 'resultSource',
    'search'
  )
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<SearchProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [manualCircle, setManualCircle] = usePersistedState<CircleParams>(STORAGE_PREFIX + 'manualCircle', {
    xc: geometry.total_height * 0.15,
    yc: geometry.total_height * 2,
    R: geometry.total_height * 2,
  })
  const [nSlices, setNSlices] = usePersistedState(STORAGE_PREFIX + 'nSlices', 40)
  const [method, setMethod] = usePersistedState<StabilityMethod>(STORAGE_PREFIX + 'method', 'bishop')
  const [mode, setMode] = usePersistedState<AnalysisMode>(STORAGE_PREFIX + 'mode', 'aterro')

  const TABS = mode === 'corte' ? TABS_CORTE : TABS_ATERRO
  const effectiveFill = mode === 'aterro' ? fill : null
  const effectiveFillZones = mode === 'aterro' ? fillZones : undefined

  const setModeSafe = (m: AnalysisMode) => {
    setMode(m)
    if (m === 'corte' && tab === 'aterro') setTab('geometria')
  }

  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [showLoadList, setShowLoadList] = useState(false)
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const canvasRef = useRef<SlopeCanvasHandle>(null)

  const handleCalculate = async () => {
    setRunning(true)
    setError(null)
    setProgress(null)
    try {
      const r = await findCriticalCircle(
        geometry,
        layers,
        effectiveFill,
        coverage,
        effectiveFillZones,
        nSlices,
        method,
        setProgress
      )
      setResult(r)
      setResultSource('search')
      setPartialFS(
        computePartialFS(method, r.circle, geometry, layers, effectiveFill, coverage, effectiveFillZones, nSlices)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido na busca do círculo crítico.')
      setResult(null)
      setPartialFS(null)
    } finally {
      setRunning(false)
    }
  }

  const handleCalculateManual = () => {
    setError(null)
    const solve = SOLVERS[method]
    const r = solve(manualCircle, geometry, layers, effectiveFill, coverage, effectiveFillZones, nSlices)
    if (!r) {
      setError(
        'Círculo inválido para esta geometria (largura insuficiente, menos de 5 fatias válidas, ou instável numericamente — tente outro xc/yc/R).'
      )
      setResult(null)
      setPartialFS(null)
      return
    }
    setResult(r)
    setResultSource('manual')
    setPartialFS(
      computePartialFS(method, r.circle, geometry, layers, effectiveFill, coverage, effectiveFillZones, nSlices)
    )
  }

  const handleSave = async () => {
    const projetoNome = window.prompt('Nome do projeto:')
    if (!projetoNome) return
    const nomeSecao = window.prompt('Nome da seção/análise:', 'Seção 1')
    if (!nomeSecao) return

    setSaving(true)
    setSaveMessage(null)
    try {
      await saveAnalysis(projetoNome, nomeSecao, {
        geometry,
        layers,
        fill,
        coverage,
        fillReference,
        fillZones,
        nSlices,
        method,
        mode,
        result,
      })
      setSaveMessage('Análise salva.')
    } catch (err) {
      setSaveMessage(err instanceof Error ? `Erro ao salvar: ${err.message}` : 'Erro desconhecido ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const handleOpenLoadList = async () => {
    setShowLoadList(true)
    setLoadingList(true)
    try {
      setSavedAnalyses(await listAnalyses())
    } catch (err) {
      setSaveMessage(err instanceof Error ? `Erro ao listar: ${err.message}` : 'Erro ao listar análises salvas.')
    } finally {
      setLoadingList(false)
    }
  }

  const handleLoadAnalysis = async (id: string) => {
    try {
      const snapshot = await loadAnalysis(id)
      setGeometry(snapshot.geometry)
      setLayers(snapshot.layers)
      setFill(snapshot.fill)
      setCoverage(snapshot.coverage)
      setFillReference(snapshot.fillReference)
      setFillZones(snapshot.fillZones)
      setNSlices(snapshot.nSlices)
      setMethod(snapshot.method)
      setMode(snapshot.mode)
      setResult(snapshot.result)
      setPartialFS(
        snapshot.result
          ? computePartialFS(
              snapshot.method,
              snapshot.result.circle,
              snapshot.geometry,
              snapshot.layers,
              snapshot.mode === 'aterro' ? snapshot.fill : null,
              snapshot.coverage,
              snapshot.mode === 'aterro' ? snapshot.fillZones : undefined,
              snapshot.nSlices
            )
          : null
      )
      setShowLoadList(false)
      setSaveMessage('Análise carregada.')
    } catch (err) {
      setSaveMessage(err instanceof Error ? `Erro ao carregar: ${err.message}` : 'Erro ao carregar análise.')
    }
  }

  const handleExportPdf = async () => {
    if (!result) return
    const projeto = window.prompt('Nome do projeto:', '') ?? ''
    const secao = window.prompt('Nome da seção/análise:', 'Seção 1') ?? ''
    const responsavel = window.prompt('Responsável técnico:', '') ?? ''

    setExportingPdf(true)
    try {
      await exportReportToPdf({
        header: { projeto, secao, responsavel },
        mode,
        method,
        geometry,
        layers,
        fill,
        coverage,
        fillZones,
        fillReference,
        result,
        partialFS,
        svgElement: canvasRef.current?.svg ?? null,
        bounds: canvasRef.current?.bounds ?? null,
      })
    } catch (err) {
      setError(err instanceof Error ? `Erro ao exportar PDF: ${err.message}` : 'Erro ao exportar PDF.')
    } finally {
      setExportingPdf(false)
    }
  }

  const progressPct = progress ? Math.min(100, Math.round((progress.tested / progress.total) * 100)) : 0

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">Nova Análise</h1>
          <div className="mt-1 flex items-center gap-3">
            <div className="flex rounded-md border border-border p-0.5">
              {(['aterro', 'corte'] as AnalysisMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setModeSafe(m)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                    mode === m
                      ? 'bg-brand text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-sm text-text-secondary">Estabilidade de talude — {METHOD_LABELS[method]}</p>
          </div>
          <p className="mt-0.5 text-xs text-text-secondary">
            Salvo automaticamente neste navegador ·{' '}
            <button
              onClick={() => {
                if (window.confirm('Isso apaga todos os dados salvos automaticamente neste navegador e volta ao exemplo padrão. Continuar?')) {
                  Object.keys(localStorage)
                    .filter((k) => k.startsWith(STORAGE_PREFIX))
                    .forEach((k) => localStorage.removeItem(k))
                  location.reload()
                }
              }}
              className="text-brand hover:underline"
            >
              limpar dados salvos
            </button>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveMessage && <span className="text-xs text-text-secondary">{saveMessage}</span>}
          <button
            onClick={handleExportPdf}
            disabled={!result || exportingPdf}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40"
          >
            {exportingPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            Exportar PDF
          </button>
          <button
            onClick={handleOpenLoadList}
            disabled={!supabase}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40"
            title={!supabase ? 'Configure VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY para habilitar' : undefined}
          >
            <FolderOpen size={16} /> Carregar
          </button>
          <button
            onClick={handleSave}
            disabled={!supabase || saving}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40"
            title={!supabase ? 'Configure VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY para habilitar' : undefined}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar Análise
          </button>
        </div>
      </div>

      {showLoadList && (
        <div className="mb-6 rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium text-text-primary">Análises salvas</div>
            <button onClick={() => setShowLoadList(false)} className="text-xs text-text-secondary hover:underline">
              Fechar
            </button>
          </div>
          {loadingList && <div className="text-sm text-text-secondary">Carregando...</div>}
          {!loadingList && savedAnalyses.length === 0 && (
            <div className="text-sm text-text-secondary">Nenhuma análise salva ainda.</div>
          )}
          {!loadingList && savedAnalyses.length > 0 && (
            <ul className="space-y-1 text-sm">
              {savedAnalyses.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => handleLoadAnalysis(a.id)}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-elevated"
                  >
                    <span>
                      <span className="text-text-primary">{a.projeto_nome}</span>
                      <span className="text-text-secondary"> — {a.nome_secao}</span>
                    </span>
                    <span className="font-mono text-xs text-text-secondary">
                      {new Date(a.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* coluna esquerda: inputs */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-4 flex gap-1 border-b border-border">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`border-b-2 px-3 py-2 text-sm ${
                    tab === t.id
                      ? 'border-brand text-text-primary'
                      : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'geometria' && <GeometryForm value={geometry} onChange={setGeometry} mode={mode} />}
            {tab === 'solo' && (
              <div className="space-y-3">
                {!showSondagemImport && (
                  <button
                    onClick={() => setShowSondagemImport(true)}
                    className="text-xs text-brand hover:underline"
                  >
                    Importar boletim de sondagem
                  </button>
                )}
                {showSondagemImport && (
                  <SondagemImport
                    toeElevation={geometry.toe_elevation}
                    onClose={() => setShowSondagemImport(false)}
                    onImport={(imported, waterTableDepth) => {
                      // o motor assume um único perfil vertical (não há dependência em x),
                      // então camadas importadas substituem as atuais em vez de somar —
                      // duas listas cobrindo a mesma faixa de profundidade seriam
                      // ambíguas (soilAt usa só a primeira que casar).
                      if (
                        layers.length === 0 ||
                        window.confirm(
                          `Isso vai substituir as ${layers.length} camada(s) atual(is) de fundação pelas ${imported.length} camada(s) importadas do boletim. Continuar?`
                        )
                      ) {
                        setLayers(imported)
                        if (waterTableDepth != null) {
                          setGeometry({ ...geometry, water_table_depth: waterTableDepth })
                        }
                      }
                    }}
                  />
                )}
                <SoilLayerTable value={layers} onChange={setLayers} />
              </div>
            )}
            {tab === 'aterro' && (
              <FillForm
                value={fill}
                onChange={setFill}
                coverage={coverage}
                onCoverageChange={setCoverage}
                reference={fillReference}
                onReferenceChange={setFillReference}
                zones={fillZones}
                onZonesChange={setFillZones}
              />
            )}
          </div>

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-text-secondary">Método</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as StabilityMethod)}
                className="rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:outline-none"
              >
                {(Object.keys(METHOD_LABELS) as StabilityMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <div className="w-40">
              <NumberField
                label="Número de fatias"
                value={nSlices}
                step={1}
                min={5}
                onChange={(v) => setNSlices(Math.max(5, Math.round(v)))}
              />
            </div>
          </div>

          <button
            id="btn-calcular"
            onClick={handleCalculate}
            disabled={running}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent-green px-4 py-3 font-medium text-base disabled:opacity-60"
            style={{ color: '#0D1B2A' }}
          >
            {running ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
            {running ? 'Buscando círculo crítico...' : 'CALCULAR'}
          </button>

          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
              Ou informe um círculo específico
            </div>
            <div className="grid grid-cols-3 gap-2">
              <NumberField
                label="xc"
                value={manualCircle.xc}
                step={0.1}
                suffix="m"
                onChange={(v) => setManualCircle({ ...manualCircle, xc: v })}
              />
              <NumberField
                label="yc"
                value={manualCircle.yc}
                step={0.1}
                suffix="m"
                onChange={(v) => setManualCircle({ ...manualCircle, yc: v })}
              />
              <NumberField
                label="R"
                value={manualCircle.R}
                step={0.1}
                min={0}
                suffix="m"
                onChange={(v) => setManualCircle({ ...manualCircle, R: v })}
              />
            </div>
            <button
              id="btn-calcular-manual"
              onClick={handleCalculateManual}
              disabled={running}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-brand px-3 py-2 text-sm font-medium text-brand disabled:opacity-40"
            >
              <Calculator size={16} /> Calcular FS deste círculo
            </button>
          </div>

          {running && progress && (
            <div className="rounded-md border border-border bg-surface p-3">
              <div className="mb-1 flex justify-between text-xs text-text-secondary">
                <span>
                  {progress.tested.toLocaleString('pt-BR')} / {progress.total.toLocaleString('pt-BR')} círculos
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                <div className="h-full bg-brand transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              {progress.best_fs !== null && (
                <div className="mt-1 font-mono text-xs text-text-secondary">
                  Melhor FS até agora: {progress.best_fs.toFixed(3)}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">
              {error}
            </div>
          )}
        </div>

        {/* coluna direita: visualização */}
        <div className="space-y-4">
          <SlopeCanvas ref={canvasRef} geometry={geometry} layers={layers} result={result} mode={mode} />
          <ResultCard result={result} source={resultSource} partialFS={partialFS} />
          <SlicesTable result={result} />
        </div>
      </div>
    </div>
  )
}
