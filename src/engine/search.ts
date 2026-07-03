import { bishopFS } from './bishop'
import { felleniusFS } from './fellenius'
import type {
  AnalysisResult,
  CircleParams,
  FaceCoverage,
  FillMaterial,
  FillZone,
  Layer,
  SlopeGeometry,
  StabilityMethod,
} from './types'

const SOLVERS: Record<StabilityMethod, typeof bishopFS> = {
  bishop: bishopFS,
  fellenius: felleniusFS,
}

const BATCH_SIZE = 50

export interface SearchProgress {
  tested: number
  total: number
  best_fs: number | null
  best_circle: CircleParams | null
}

interface Range {
  min: number
  max: number
  step: number
}

function buildGrid(xc: Range, yc: Range, R: Range): CircleParams[] {
  const circles: CircleParams[] = []
  for (let xcVal = xc.min; xcVal <= xc.max + 1e-9; xcVal += xc.step) {
    for (let ycVal = yc.min; ycVal <= yc.max + 1e-9; ycVal += yc.step) {
      for (let rVal = R.min; rVal <= R.max + 1e-9; rVal += R.step) {
        if (rVal <= 0) continue
        circles.push({ xc: xcVal, yc: ycVal, R: rVal })
      }
    }
  }
  return circles
}

/**
 * Testa uma lista de círculos em lotes (com setTimeout entre lotes para não
 * travar a UI), mantendo o menor FS válido encontrado.
 */
async function searchGrid(
  circles: CircleParams[],
  geo: SlopeGeometry,
  layers: Layer[],
  fill: FillMaterial | null,
  coverage: FaceCoverage | undefined,
  fillZones: FillZone[] | undefined,
  n_slices: number,
  method: StabilityMethod,
  totalForProgress: number,
  testedSoFar: number,
  best: { fs: number | null; result: AnalysisResult | null },
  onProgress?: (p: SearchProgress) => void
): Promise<number> {
  let tested = testedSoFar
  const solve = SOLVERS[method]

  for (let i = 0; i < circles.length; i += BATCH_SIZE) {
    const batch = circles.slice(i, i + BATCH_SIZE)
    for (const circle of batch) {
      const result = solve(circle, geo, layers, fill, coverage, fillZones, n_slices)
      tested++
      if (result && (best.fs === null || result.FS < best.fs)) {
        best.fs = result.FS
        best.result = result
      }
    }

    onProgress?.({
      tested,
      total: totalForProgress,
      best_fs: best.fs,
      best_circle: best.result?.circle ?? null,
    })

    // cede o event loop entre lotes para manter a UI responsiva
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return tested
}

/**
 * Busca o círculo crítico (menor FS) em duas passagens: uma varredura
 * grossa em toda a faixa plausível, seguida de um refinamento ao redor do
 * melhor resultado da primeira passagem.
 */
export function findCriticalCircle(
  geo: SlopeGeometry,
  layers: Layer[],
  fill: FillMaterial | null,
  coverage?: FaceCoverage,
  fillZones?: FillZone[],
  n_slices = 40,
  method: StabilityMethod = 'bishop',
  onProgress?: (p: SearchProgress) => void
): Promise<AnalysisResult> {
  const H = geo.total_height

  const pass1 = {
    xc: { min: -H * 0.5, max: H * 1.5, step: H * 0.1 },
    yc: { min: H * 0.3, max: H * 3.0, step: H * 0.1 },
    R: { min: H * 0.5, max: H * 4.0, step: H * 0.1 },
  }

  const circlesPass1 = buildGrid(pass1.xc, pass1.yc, pass1.R)

  return (async () => {
    const best: { fs: number | null; result: AnalysisResult | null } = { fs: null, result: null }

    // estimativa grosseira do total combinado (passagem 2 é tipicamente bem menor)
    const roughTotal = circlesPass1.length

    const testedAfterPass1 = await searchGrid(
      circlesPass1,
      geo,
      layers,
      fill,
      coverage,
      fillZones,
      n_slices,
      method,
      roughTotal,
      0,
      best,
      onProgress
    )

    const centerXc = best.result?.circle.xc ?? (pass1.xc.min + pass1.xc.max) / 2
    const centerYc = best.result?.circle.yc ?? (pass1.yc.min + pass1.yc.max) / 2
    const centerR = best.result?.circle.R ?? (pass1.R.min + pass1.R.max) / 2

    const pass2 = {
      xc: { min: centerXc - H * 0.2, max: centerXc + H * 0.2, step: H * 0.02 },
      yc: { min: centerYc - H * 0.2, max: centerYc + H * 0.2, step: H * 0.02 },
      R: { min: Math.max(centerR - H * 0.2, H * 0.1), max: centerR + H * 0.2, step: H * 0.02 },
    }

    const circlesPass2 = buildGrid(pass2.xc, pass2.yc, pass2.R)
    const total = roughTotal + circlesPass2.length

    await searchGrid(
      circlesPass2,
      geo,
      layers,
      fill,
      coverage,
      fillZones,
      n_slices,
      method,
      total,
      testedAfterPass1,
      best,
      onProgress
    )

    if (!best.result) {
      throw new Error('Nenhum círculo válido encontrado na faixa de busca.')
    }

    return best.result
  })()
}
