import { groundY } from './geometry'
import type { CoverageType, FaceCoverage, FillMaterial, FillZone, Layer, Point } from './types'

export interface SoilParams {
  c: number
  phi: number
  gamma: number
}

/**
 * Converte as zonas de compactação do aterro (definidas por espessura a
 * partir da plataforma) em bandas de elevação absoluta (y_top/y_base),
 * empilhadas a partir da crista do talude para baixo.
 */
export function resolveFillZones(zones: FillZone[], total_height: number): Layer[] {
  let yTop = total_height
  return zones.map((zone) => {
    const yBase = yTop - zone.thickness
    const resolved: Layer = {
      name: zone.name,
      y_top: yTop,
      y_base: yBase,
      c: zone.c,
      phi: zone.phi,
      gamma: zone.gamma,
    }
    yTop = yBase
    return resolved
  })
}

// Fração do c' nominal do aterro preservada bem na superfície da face (profundidade 0),
// por tipo de cobertura. Sem proteção, trincas de dessecação e ciclos de
// umedecimento/secagem degradam boa parte da coesão de compactação; cobertura
// vegetal ou revestimento rígido protegem a face desse intemperismo.
const COVERAGE_RETENTION: Record<CoverageType, number> = {
  none: 0.3,
  grass: 0.8,
  shrub: 1.0,
  rigid: 1.0,
}

/**
 * Elevação da superfície que separa aterro de fundação num dado x: o
 * terreno natural informado (que pode se estender por baixo do aterro),
 * ou y=0 (o pé) quando nenhum terreno customizado foi definido — o
 * comportamento padrão de sempre.
 */
function groundLevelAt(x: number, terrain?: Point[]): number {
  return terrain && terrain.length ? groundY(x, terrain) : 0
}

/**
 * Resolve os limites efetivos (topo/base) de uma camada num dado x: usa
 * depth_top/depth_base (profundidade a partir da superfície local) quando
 * definidos, senão y_top/y_base absolutos. Se nada estiver definido, retorna
 * limites que nunca casam com nenhum y (camada malformada é ignorada, não
 * derruba o cálculo).
 */
function effectiveBounds(layer: Layer, groundLevel: number): { top: number; base: number } {
  const top = layer.depth_top != null ? groundLevel - layer.depth_top : layer.y_top ?? -Infinity
  const base = layer.depth_base != null ? groundLevel - layer.depth_base : layer.y_base ?? Infinity
  return { top, base }
}

/**
 * Retorna os parâmetros do material num ponto (x,y).
 * Acima da superfície do terreno em x (aterro): percorre as zonas de
 * compactação diferenciada (fillZones, já resolvidas em y_top/y_base
 * absolutos a partir da plataforma) antes de cair no material padrão do
 * corpo do aterro (fill).
 * Abaixo da superfície (fundação): percorre as camadas do topo para a
 * base. Camadas com depth_top/depth_base definidos são medidas como
 * profundidade a partir da superfície local do terreno em x (acompanham a
 * topografia); as demais usam y_top/y_base absolutos, como antes. Se y
 * estiver abaixo da última camada, usa a última camada (fallback, mesmo
 * comportamento do TRUE() final da fórmula IFS da planilha de origem).
 */
export function soilAt(
  x: number,
  y: number,
  layers: Layer[],
  fill: FillMaterial,
  fillZones?: Layer[],
  terrain?: Point[]
): SoilParams {
  const groundLevel = groundLevelAt(x, terrain)

  if (y >= groundLevel) {
    if (fillZones) {
      for (const zone of fillZones) {
        const { top, base } = effectiveBounds(zone, groundLevel)
        if (y <= top && y >= base) {
          return { c: zone.c, phi: zone.phi, gamma: zone.gamma }
        }
      }
    }
    return { c: fill.c, phi: fill.phi, gamma: fill.gamma }
  }

  if (layers.length === 0) return { c: fill.c, phi: fill.phi, gamma: fill.gamma }

  for (const layer of layers) {
    const { top, base } = effectiveBounds(layer, groundLevel)
    if (y <= top && y >= base) {
      return { c: layer.c, phi: layer.phi, gamma: layer.gamma }
    }
  }

  const last = layers[layers.length - 1]
  return { c: last.c, phi: last.phi, gamma: last.gamma }
}

/**
 * Reduz o c' do aterro perto da face, proporcional à distância vertical até
 * a superfície do terreno local (y_top da fatia). Longe o suficiente da
 * superfície (>= coverage.depth), o c' nominal é usado sem redução; bem na
 * superfície, só a fração COVERAGE_RETENTION do c' nominal é considerada,
 * com interpolação linear entre os dois extremos.
 */
function applyCoverage(
  c: number,
  y: number,
  y_top: number,
  groundLevel: number,
  coverage?: FaceCoverage
): number {
  if (!coverage || y < groundLevel || coverage.depth <= 0) return c

  const depthBelowSurface = y_top - y
  if (depthBelowSurface >= coverage.depth) return c

  const retention = COVERAGE_RETENTION[coverage.type]
  const t = Math.max(0, depthBelowSurface) / coverage.depth
  return c * (retention + (1 - retention) * t)
}

/**
 * Encontra todas as fronteiras de camada (zonas do aterro + camadas da
 * fundação + a superfície do terreno) que caem dentro da altura de uma
 * fatia, para permitir integração exata do peso (em vez de amostrar N
 * pontos e aproximar). Sem isso, uma camada fina que a fatia atravessa
 * poderia ficar sub-representada (ou nem ser amostrada) numa integração por
 * amostragem — a lista de fronteiras garante que cada trecho realmente
 * atravessado entra na soma, não importa quão fino seja.
 */
function collectBoundaries(
  y_top: number,
  y_base: number,
  layers: Layer[],
  fillZones: Layer[] | undefined,
  groundLevel: number
): number[] {
  const ys = new Set<number>([y_top, y_base, groundLevel])
  for (const zone of fillZones ?? []) {
    const { top, base } = effectiveBounds(zone, groundLevel)
    if (Number.isFinite(top)) ys.add(top)
    if (Number.isFinite(base)) ys.add(base)
  }
  for (const layer of layers) {
    const { top, base } = effectiveBounds(layer, groundLevel)
    if (Number.isFinite(top)) ys.add(top)
    if (Number.isFinite(base)) ys.add(base)
  }
  return [...ys]
    .filter((y) => y <= y_top + 1e-9 && y >= y_base - 1e-9)
    .sort((a, b) => b - a)
}

export interface WeightBreakdown {
  gamma: number         // γ médio ponderado pela espessura de cada trecho (para referência)
  gammaH_aterro: number // Σ(γᵢ·hᵢ) da parcela de aterro — W_aterro = isto × b
  gammaH_fundacao: number // Σ(γᵢ·hᵢ) da parcela de fundação — W_fundacao = isto × b
}

/**
 * Integra o peso da fatia exatamente, trecho a trecho, entre cada fronteira
 * de camada que ela atravessa (aterro e fundação, com quantas camadas
 * houver) — sem aproximação por amostragem. Cada trecho usa o γ do material
 * naquele ponto (avaliado no meio do trecho) multiplicado pela espessura
 * exata do trecho.
 */
function integrateWeight(
  xm: number,
  y_top: number,
  y_base: number,
  layers: Layer[],
  fill: FillMaterial,
  fillZones: Layer[] | undefined,
  terrain: Point[] | undefined
): WeightBreakdown {
  const groundLevel = groundLevelAt(xm, terrain)
  const boundaries = collectBoundaries(y_top, y_base, layers, fillZones, groundLevel)

  let gammaH_aterro = 0
  let gammaH_fundacao = 0

  for (let i = 0; i < boundaries.length - 1; i++) {
    const segTop = boundaries[i]
    const segBase = boundaries[i + 1]
    const segH = segTop - segBase
    if (segH <= 1e-9) continue

    const mid = (segTop + segBase) / 2
    const gamma = soilAt(xm, mid, layers, fill, fillZones, terrain).gamma

    if (mid >= groundLevel) gammaH_aterro += gamma * segH
    else gammaH_fundacao += gamma * segH
  }

  const h = y_top - y_base
  const gamma = h > 0 ? (gammaH_aterro + gammaH_fundacao) / h : 0

  return { gamma, gammaH_aterro, gammaH_fundacao }
}

/**
 * Parâmetros efetivos de uma fatia. O peso (γ) integra exatamente (trecho a
 * trecho, por fronteira de camada) ao longo de toda a altura da fatia — a
 * fatia carrega o peso de tudo que passa por ela, aterro e fundação juntos
 * (com quantas camadas houver em cada), então γ precisa considerar todas as
 * parcelas. Já a resistência ao cisalhamento (c'/φ') é uma propriedade do
 * material exatamente onde a ruptura ocorre — na base da fatia, sobre a
 * superfície de deslizamento — e por isso vem só do material na base, nunca
 * de uma média com o que está acima. Misturar c'/φ' do aterro com os da
 * fundação numa fatia que cruza os dois não tem correspondência física: o
 * cisalhamento acontece no material que está literalmente em contato com o
 * círculo, não numa mistura dos dois.
 */
export function avgSoil(
  xm: number,
  y_top: number,
  y_base: number,
  layers: Layer[],
  fill: FillMaterial,
  coverage?: FaceCoverage,
  fillZones?: Layer[],
  terrain?: Point[]
): SoilParams & WeightBreakdown {
  const groundLevel = groundLevelAt(xm, terrain)

  const weight = integrateWeight(xm, y_top, y_base, layers, fill, fillZones, terrain)

  const baseSoil = soilAt(xm, y_base, layers, fill, fillZones, terrain)
  const c = applyCoverage(baseSoil.c, y_base, y_top, groundLevel, coverage)

  return { c, phi: baseSoil.phi, ...weight }
}

/**
 * Divide a altura de uma fatia entre a parcela de aterro (acima da
 * superfície do terreno local) e a parcela de fundação (abaixo dela) — para
 * exibição/auditoria (duas leituras de altura por fatia, como no boletim de
 * referência), não usada no cálculo de resistência em si.
 */
export function splitHeightByGround(
  xm: number,
  y_top: number,
  y_base: number,
  terrain?: Point[]
): { h_aterro: number; h_fundacao: number } {
  const groundLevel = groundLevelAt(xm, terrain)
  return {
    h_aterro: Math.max(0, y_top - Math.max(groundLevel, y_base)),
    h_fundacao: Math.max(0, Math.min(groundLevel, y_top) - y_base),
  }
}
