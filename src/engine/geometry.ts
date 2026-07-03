import type { Point, SlopeGeometry } from './types'

export type { Point }

const RUNOUT = 60           // trecho plano antes do pé e depois da plataforma (m), quando não há terreno customizado
const MAX_BENCHES = 10      // limite de bancadas suportadas
const EPS = 1e-9

/**
 * Determina a altura de subida de cada bancada, do pé para a plataforma.
 * O aterro é definido de cima para baixo (plataforma fixa, bancadas cheias
 * de bench_height empilhadas a partir dela): a bancada "resto" — a que não
 * completa bench_height — fica sempre encostada no pé/terreno natural, não
 * no topo. Ex.: total_height=18,011 e bench_height=8 → [2,011, 8, 8]
 * (resto primeiro, depois as bancadas cheias subindo até a plataforma).
 */
function computeBenchRises(bench_height: number, total_height: number): number[] {
  if (total_height <= bench_height + EPS) return [total_height]

  const fullCount = Math.floor((total_height + EPS) / bench_height)
  const remainder = total_height - fullCount * bench_height

  const rises: number[] = []
  if (remainder > EPS) rises.push(remainder)
  for (let i = 0; i < fullCount; i++) rises.push(bench_height)

  return rises.slice(0, MAX_BENCHES)
}

/**
 * Trecho do perfil antes do pé (x <= 0): usa o terreno natural informado
 * pelo usuário quando existir (poligonal real, x/y relativos ao pé=0,0),
 * senão um trecho plano padrão de RUNOUT metros. O pé (0,0) é sempre o
 * último ponto — é o datum fixo do resto da geometria construída — mesmo
 * que o terreno informado não bata exatamente em y=0 no x=0 (o segmento
 * final simplesmente conecta o último ponto do terreno ao pé.
 */
function buildApproachSegment(naturalTerrain: Point[] | undefined): Point[] {
  if (!naturalTerrain || naturalTerrain.length === 0) {
    return [
      { x: -RUNOUT, y: 0 },
      { x: 0, y: 0 },
    ]
  }

  const beforeToe = naturalTerrain
    .filter((p) => p.x <= 0)
    .slice()
    .sort((a, b) => a.x - b.x)

  const points = beforeToe.length ? beforeToe : [{ x: -RUNOUT, y: naturalTerrain[0].y }]
  const last = points[points.length - 1]
  if (Math.abs(last.x) > EPS) points.push({ x: 0, y: 0 })

  return points
}

/**
 * Gera o perfil poligonal do talude: terreno natural → pé → sequência de
 * subidas/bermas até atingir total_height → plataforma final.
 * Réplica da lógica da planilha Geometria (colunas B=x, C=y, D=alt. acumulada),
 * com a ordem das bancadas corrigida (resto junto ao pé, não ao topo).
 */
export function buildProfile(geo: SlopeGeometry): Point[] {
  const { bench_height, slope_ratio, berm_width, total_height } = geo

  const points: Point[] = buildApproachSegment(geo.natural_terrain)

  let x = 0
  let y = 0
  let cumHeight = 0

  const rises = computeBenchRises(bench_height, total_height)
  for (const rise of rises) {
    cumHeight += rise
    x += rise * slope_ratio
    y += rise
    points.push({ x, y })

    x += cumHeight < total_height - EPS ? berm_width : 0
    points.push({ x, y })
  }

  points.push({ x: x + RUNOUT, y })  // plataforma final

  return points
}

/**
 * Interpola a elevação de uma superfície poligonal em qualquer x.
 * Fora do intervalo do perfil, estende o valor da extremidade mais próxima.
 * Usada tanto para o perfil construído do talude quanto para o terreno
 * natural bruto (que pode se estender por baixo do aterro, servindo de
 * referência de profundidade para as camadas de fundação). O perfil tem x
 * não-decrescente por construção, então a busca do segmento usa bisseção
 * (necessário: a busca do círculo crítico chama isso milhões de vezes
 * durante o grid search).
 */
export function groundY(x: number, profile: Point[]): number {
  if (x <= profile[0].x) return profile[0].y
  const last = profile[profile.length - 1]
  if (x >= last.x) return last.y

  let lo = 0
  let hi = profile.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (profile[mid].x <= x) lo = mid
    else hi = mid
  }

  const p1 = profile[lo]
  const p2 = profile[hi]
  if (p2.x === p1.x) return p1.y
  const t = (x - p1.x) / (p2.x - p1.x)
  return p1.y + t * (p2.y - p1.y)
}
