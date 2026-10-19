import { bishopFS } from './bishop'
import { felleniusFS } from './fellenius'
import { buildProfile, effectiveNaturalTerrain, groundY } from './geometry'
import { profileBaseAt } from './soil'
import { camadaTratada, espessuraCamada, resumoArco } from './zonaFundacao'
import type {
  AnalysisMode,
  AnalysisResult,
  CircleParams,
  FaceCoverage,
  FillMaterial,
  FillZone,
  Layer,
  SlopeGeometry,
  StabilityMethod,
  WorstCircle,
} from './types'

const SOLVERS: Record<StabilityMethod, typeof bishopFS> = {
  bishop: bishopFS,
  fellenius: felleniusFS,
}

const BATCH_SIZE = 200
const MAX_EXPANSIONS = 4
const N_WORST = 5
const REFINE_ROUNDS = 4
const REFINE_HALF_SPAN = 3 // pontos de cada lado do melhor, por dimensão, em cada rodada

export interface SearchOptions {
  nWorst?: number          // quantos círculos críticos devolver (padrão 5)
  rapido?: boolean         // grade mais grossa e menos sementes: para varreduras de sensibilidade
  saidaMax?: number        // m além do pé: círculos que saem mais longe são descartados
}

export interface SearchProgress {
  tested: number
  total: number
  best_fs: number | null
  best_circle: CircleParams | null
}

interface Trial {
  circle: CircleParams
  FS: number
  x_left: number
  x_right: number
}

// Parametrização da busca: centro (xc, yc) e cota do ponto mais baixo do
// círculo yb = yc − R. Varrer yb de "a base do perfil" até "perto do pé"
// garante cobrir desde círculos rasos até os tangentes à base da última
// camada, sem depender de um teto arbitrário de raio.
interface Domain {
  xc0: number
  yc0: number
  yb0: number
  dxc: number
  dyc: number
  dyb: number
  nyb: number
  ixMin: number
  ixMax: number
  iyMin: number
  iyMax: number
}

/**
 * Busca o círculo crítico (menor FS):
 *  1. varredura grossa em toda a região plausível (do pé − alguns metros até
 *     além da crista; do raso até tangente à base da última camada);
 *  2. se o melhor ficar na borda (xc, yc) da região, expande e repete;
 *  3. refinamento local (grades finas, passo reduzido a cada rodada) ao redor
 *     do melhor e de outros mecanismos distintos;
 *  4. devolve também os piores círculos distintos (outros mecanismos).
 *
 * Círculos que descem abaixo da base da última camada definida são
 * descartados da busca (o material ali é desconhecido) — e isso é contado e
 * avisado em `search_warnings`, nunca silencioso.
 */
export function findCriticalCircle(
  geo: SlopeGeometry,
  layers: Layer[],
  fill: FillMaterial | null,
  coverage?: FaceCoverage,
  fillZones?: FillZone[],
  n_slices = 40,
  method: StabilityMethod = 'bishop',
  onProgress?: (p: SearchProgress) => void,
  options?: SearchOptions
): Promise<AnalysisResult> {
  const solve = SOLVERS[method]
  const mode: AnalysisMode = fill == null ? 'corte' : 'aterro'
  const H = geo.total_height
  const profile = buildProfile(geo, mode)
  const terrain = effectiveNaturalTerrain(geo, mode)
  const xCrest = profile[profile.length - 2].x

  // base do perfil definido: a mais funda entre algumas posições representativas
  let baseY: number | null = null
  for (const x of [-10, 0, xCrest / 2, xCrest, xCrest + 10]) {
    const b = profileBaseAt(x, layers, terrain)
    if (b !== null && (baseY === null || b < baseY)) baseY = b
  }
  const D = baseY !== null ? Math.max(0, -baseY) : 3 * H // profundidade da base (m)
  const ybMin = baseY !== null ? baseY : -3 * H
  const ybMax = 0.5 * H

  // fundação em duas zonas: a grade precisa alcançar saídas bem além do pé
  const zf = geo.zona_fundacao?.ativa ? geo.zona_fundacao : undefined
  const alvo = zf ? camadaTratada(zf, layers) : null
  const saidaMax = zf
    ? options?.saidaMax ?? zf.saida_max ?? 3 * (alvo ? espessuraCamada(alvo.layer) || D : D)
    : Infinity
  const nWorst = options?.nWorst ?? zf?.n_criticos ?? N_WORST
  const nDiv = options?.rapido ? 12 : 24
  const nSeeds = options?.rapido ? 2 : nWorst
  const rounds = options?.rapido ? 3 : REFINE_ROUNDS

  const xcMin = -Math.max(2 * H, 0.5 * D, 5, zf ? 0.5 * saidaMax : 0)
  const xcMax = xCrest + Math.max(H, 0.5 * D, 5)
  const ycMin = Math.max(0.2 * H, 0.5)
  const ycMax = Math.max(3 * H, 2 * (H + D))

  const nyb = options?.rapido ? 8 : 16
  const dom: Domain = {
    xc0: xcMin,
    yc0: ycMin,
    yb0: ybMin,
    dxc: (xcMax - xcMin) / nDiv,
    dyc: (ycMax - ycMin) / nDiv,
    dyb: (ybMax - ybMin) / nyb,
    nyb,
    ixMin: 0,
    ixMax: nDiv,
    iyMin: 0,
    iyMax: nDiv,
  }

  let tested = 0
  let discardedBelowBase = 0
  const trials: Trial[] = []
  const seen = new Set<string>()
  let best: { fs: number; result: AnalysisResult } | null = null
  let totalEstimate = (nDiv + 1) * (nDiv + 1) * (nyb + 1)
  let discardedExit = 0

  const evaluate = (c: CircleParams): void => {
    if (c.R <= 0) return
    const key = `${c.xc.toFixed(4)}|${c.yc.toFixed(4)}|${c.R.toFixed(4)}`
    if (seen.has(key)) return
    seen.add(key)
    tested++
    const r = solve(c, geo, layers, fill, coverage, fillZones, n_slices)
    if (!r) return
    if (r.crosses_base) {
      discardedBelowBase++
      return
    }
    if (-r.x_left > saidaMax) {
      discardedExit++
      return
    }
    trials.push({ circle: c, FS: r.FS, x_left: r.x_left, x_right: r.x_right })
    if (!best || r.FS < best.fs) best = { fs: r.FS, result: r }
  }

  const report = () =>
    onProgress?.({
      tested,
      total: Math.max(totalEstimate, tested),
      best_fs: best?.fs ?? null,
      best_circle: best?.result.circle ?? null,
    })

  const flush = async (circles: CircleParams[]) => {
    for (let i = 0; i < circles.length; i += BATCH_SIZE) {
      for (const c of circles.slice(i, i + BATCH_SIZE)) evaluate(c)
      report()
      // cede o event loop entre lotes para manter a UI responsiva
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  const coarseCircles = (ix0: number, ix1: number, iy0: number, iy1: number): CircleParams[] => {
    const out: CircleParams[] = []
    for (let ix = ix0; ix <= ix1; ix++)
      for (let iy = iy0; iy <= iy1; iy++)
        for (let ib = 0; ib <= dom.nyb; ib++) {
          const yc = dom.yc0 + iy * dom.dyc
          const yb = dom.yb0 + ib * dom.dyb
          out.push({ xc: dom.xc0 + ix * dom.dxc, yc, R: yc - yb })
        }
    return out
  }

  return (async () => {
    const warnings: string[] = []

    // 1) varredura grossa
    await flush(coarseCircles(dom.ixMin, dom.ixMax, dom.iyMin, dom.iyMax))

    // 2) expansão da região enquanto o mínimo cair na borda (xc, yc)
    let expansions = 0
    let hitLimit = false
    while (best) {
      const c = (best as { result: AnalysisResult }).result.circle
      const ix = Math.round((c.xc - dom.xc0) / dom.dxc)
      const iy = Math.round((c.yc - dom.yc0) / dom.dyc)
      const stepX = Math.max(4, Math.round((dom.ixMax - dom.ixMin) * 0.5))
      const stepY = Math.max(4, Math.round((dom.iyMax - dom.iyMin) * 0.5))
      let grew = false
      const old = { ...dom }
      if (ix <= dom.ixMin + 1) {
        dom.ixMin -= stepX
        grew = true
      }
      if (ix >= dom.ixMax - 1) {
        dom.ixMax += stepX
        grew = true
      }
      if (iy >= dom.iyMax - 1) {
        dom.iyMax += stepY
        grew = true
      }
      // yc mínimo é limite geométrico (centro abaixo disso não faz sentido); não expande
      if (!grew) break
      if (expansions >= MAX_EXPANSIONS) {
        hitLimit = true
        break
      }
      expansions++
      totalEstimate += (dom.ixMax - dom.ixMin + 1) * (dom.iyMax - dom.iyMin + 1) * (nyb + 1) -
        (old.ixMax - old.ixMin + 1) * (old.iyMax - old.iyMin + 1) * (nyb + 1)
      // só as células novas (as antigas já estão em `seen`)
      await flush(coarseCircles(dom.ixMin, dom.ixMax, dom.iyMin, dom.iyMax))
    }
    if (hitLimit) {
      warnings.push(
        'O círculo crítico ficou na borda da região varrida mesmo após expandi-la várias vezes; o FS mínimo pode ser ainda menor. Verifique a geometria.'
      )
    }

    if (!best) {
      throw new Error('Nenhum círculo válido encontrado na região de busca.')
    }

    // 3) refinamento local: melhor + outros mecanismos distintos
    const seeds = pickDistinct(trials, nSeeds)
    totalEstimate = tested + seeds.length * rounds * (2 * REFINE_HALF_SPAN + 1) ** 3
    for (const seed of seeds) {
      let center = seed.circle
      let step = { x: dom.dxc, y: dom.dyc, b: dom.dyb }
      let centerFS = seed.FS
      for (let round = 0; round < rounds; round++) {
        step = { x: step.x / 2, y: step.y / 2, b: step.b / 2 }
        const yb0 = center.yc - center.R
        const local: CircleParams[] = []
        for (let i = -REFINE_HALF_SPAN; i <= REFINE_HALF_SPAN; i++)
          for (let j = -REFINE_HALF_SPAN; j <= REFINE_HALF_SPAN; j++)
            for (let k = -REFINE_HALF_SPAN; k <= REFINE_HALF_SPAN; k++) {
              const yc = center.yc + j * step.y
              if (yc <= 0) continue
              const yb = yb0 + k * step.b
              local.push({ xc: center.xc + i * step.x, yc, R: yc - yb })
            }
        const before = trials.length
        await flush(local)
        // melhor desta rodada, apenas entre os círculos novos
        let roundBest: Trial | null = null
        for (let t = before; t < trials.length; t++) if (!roundBest || trials[t].FS < roundBest.FS) roundBest = trials[t]
        if (roundBest && roundBest.FS < centerFS) {
          center = roundBest.circle
          centerFS = roundBest.FS
        }
      }
    }

    // 4) resultado: crítico + piores distintos
    const finalDistinct = pickDistinct(trials, nWorst)
    const critical = finalDistinct[0]
    const result = solve(critical.circle, geo, layers, fill, coverage, fillZones, n_slices)
    if (!result) throw new Error('Nenhum círculo válido encontrado na região de busca.')

    const xCristaUsuario = xCrest
    const worst: WorstCircle[] = finalDistinct.map((t, i) => {
      const base: WorstCircle = {
        rank: i + 1,
        circle: t.circle,
        FS: t.FS,
        x_left: t.x_left,
        x_right: t.x_right,
      }
      if (!zf) return base
      const det = solve(t.circle, geo, layers, fill, coverage, fillZones, n_slices)
      const xFundo = Math.min(Math.max(t.circle.xc, t.x_left), t.x_right)
      const solo = terrain?.length ? groundY(xFundo, terrain) : 0
      return {
        ...base,
        prof_max: solo - (t.circle.yc - t.circle.R),
        x_saida: xCristaUsuario - t.x_left,
        pct_zona_a: det ? resumoArco(geo, det.slices, det.x_left).pct_zona_a : undefined,
      }
    })

    if (discardedBelowBase > 0) {
      warnings.push(
        `${discardedBelowBase} círculo(s) testado(s) desceriam abaixo da base do perfil definido (cota ${baseY?.toFixed(2)} m) e foram descartados da busca, pois o material abaixo da base não está definido. Se houver solo abaixo dessa cota, estenda a última camada.`
      )
    }
    if (baseY !== null && critical.circle.yc - critical.circle.R <= baseY + 0.25) {
      warnings.push(
        `O círculo crítico é praticamente tangente à base do perfil (cota ${baseY.toFixed(2)} m): o FS é governado pela profundidade da última camada definida, não por uma ruptura interna.`
      )
    }

    if (discardedExit > 0) {
      warnings.push(
        `${discardedExit} círculo(s) saíam além do limite de ${saidaMax.toFixed(1)} m após o pé do talude e foram descartados.`
      )
    }

    return { ...result, worst_circles: worst, search_warnings: warnings }
  })()
}

/**
 * Escolhe até n círculos de mecanismos distintos, do menor FS para o maior.
 * Dois círculos são o "mesmo mecanismo" quando entrada e saída na superfície
 * diferem menos que 10% da largura do arco (mín. 0,5 m).
 */
function pickDistinct(trials: Trial[], n: number): Trial[] {
  const sorted = [...trials].sort((a, b) => a.FS - b.FS)
  const picked: Trial[] = []
  for (const t of sorted) {
    const span = t.x_right - t.x_left
    const tol = Math.max(0.5, 0.1 * span)
    const same = picked.some((p) => Math.abs(p.x_left - t.x_left) <= tol && Math.abs(p.x_right - t.x_right) <= tol)
    if (!same) picked.push(t)
    if (picked.length >= n) break
  }
  return picked
}

