import type { Point } from '../types'

// Utilitários geométricos 2D da verificação de muros. Polígonos são listas de
// vértices (fechamento implícito, último → primeiro), em qualquer sentido.

const EPS = 1e-9

/** Área (sempre positiva) e centroide de um polígono simples (fórmula do laço/shoelace). */
export function areaCentroide(poly: Point[]): { area: number; cx: number; cy: number } {
  let a2 = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const cross = p.x * q.y - q.x * p.y
    a2 += cross
    cx += (p.x + q.x) * cross
    cy += (p.y + q.y) * cross
  }
  if (Math.abs(a2) < EPS) return { area: 0, cx: poly[0]?.x ?? 0, cy: poly[0]?.y ?? 0 }
  return { area: Math.abs(a2) / 2, cx: cx / (3 * a2), cy: cy / (3 * a2) }
}

/** Ponto estritamente dentro do polígono (regra par-ímpar). Pontos na borda podem dar qualquer resultado. */
export function dentroPoligono(x: number, y: number, poly: Point[]): boolean {
  let dentro = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i]
    const pj = poly[j]
    if (pi.y > y !== pj.y > y) {
      const xCruz = ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x
      if (x < xCruz) dentro = !dentro
    }
  }
  return dentro
}

/**
 * Trechos [y_baixo, y_alto] em que a vertical x corta o polígono. Para um
 * polígono convexo é no máximo um trecho; a sapata+parede em "L" invertido do
 * muro de flexão também dá um trecho só por vertical.
 */
export function corteVertical(x: number, poly: Point[]): [number, number][] {
  const ys: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const x1 = Math.min(p.x, q.x)
    const x2 = Math.max(p.x, q.x)
    if (x < x1 || x >= x2 || x2 - x1 < EPS) continue
    const t = (x - p.x) / (q.x - p.x)
    ys.push(p.y + t * (q.y - p.y))
  }
  ys.sort((a, b) => a - b)
  const trechos: [number, number][] = []
  for (let i = 0; i + 1 < ys.length; i += 2) trechos.push([ys[i], ys[i + 1]])
  return trechos
}

/** Espessura vertical do polígono dentro de [yBase, yTopo] na vertical x. */
export function espessuraVerticalEntre(x: number, yBase: number, yTopo: number, poly: Point[]): number {
  let t = 0
  for (const [a, b] of corteVertical(x, poly)) {
    const lo = Math.max(a, yBase)
    const hi = Math.min(b, yTopo)
    if (hi > lo) t += hi - lo
  }
  return t
}

/** Topo do polígono na vertical x (−∞ se a vertical não corta o polígono). */
export function topoPoligono(x: number, poly: Point[]): number {
  let topo = -Infinity
  for (const [, b] of corteVertical(x, poly)) topo = Math.max(topo, b)
  return topo
}

/** Base do polígono na vertical x (+∞ se a vertical não corta o polígono). */
export function basePoligono(x: number, poly: Point[]): number {
  let base = Infinity
  for (const [a] of corteVertical(x, poly)) base = Math.min(base, a)
  return base
}

/**
 * Interseções do segmento AB com a circunferência (centro C, raio R).
 * Retorna os parâmetros t ∈ [0, 1] ao longo de AB.
 */
export function segmentoCirculo(a: Point, b: Point, xc: number, yc: number, R: number): number[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const fx = a.x - xc
  const fy = a.y - yc
  const A = dx * dx + dy * dy
  const B = 2 * (fx * dx + fy * dy)
  const Cc = fx * fx + fy * fy - R * R
  const disc = B * B - 4 * A * Cc
  if (A < EPS || disc < 0) return []
  const s = Math.sqrt(disc)
  return [(-B - s) / (2 * A), (-B + s) / (2 * A)].filter((t) => t >= 0 && t <= 1)
}

/**
 * Interpola z numa poligonal com x crescente (estende as pontas). Mesmo
 * comportamento de groundY, mas aceita poligonais com trechos verticais
 * (x repetido): nesse caso devolve o maior z naquele x.
 */
export function zEmX(x: number, linha: Point[]): number {
  if (linha.length === 0) return NaN
  if (x <= linha[0].x) return linha[0].y
  const ultimo = linha[linha.length - 1]
  if (x >= ultimo.x) return ultimo.y
  let melhor = -Infinity
  for (let i = 0; i + 1 < linha.length; i++) {
    const p = linha[i]
    const q = linha[i + 1]
    if (x < p.x || x > q.x) continue
    const z = q.x - p.x < EPS ? Math.max(p.y, q.y) : p.y + ((x - p.x) / (q.x - p.x)) * (q.y - p.y)
    melhor = Math.max(melhor, z)
  }
  return melhor
}

/** Área entre duas poligonais (|a − b|) integrada em [x0, x1], por trapézios. */
export function areaEntre(a: Point[], b: Point[], x0: number, x1: number, passo = 0.05): number {
  if (x1 <= x0) return 0
  const n = Math.max(1, Math.ceil((x1 - x0) / passo))
  const h = (x1 - x0) / n
  let soma = 0
  let prev = Math.abs(zEmX(x0, a) - zEmX(x0, b))
  for (let i = 1; i <= n; i++) {
    const x = x0 + i * h
    const cur = Math.abs(zEmX(x, a) - zEmX(x, b))
    soma += ((prev + cur) / 2) * h
    prev = cur
  }
  return soma
}
