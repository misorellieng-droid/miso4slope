import { buildProfile, groundY } from './geometry'
import type { AnalysisMode, CircleParams, SlopeGeometry } from './types'

export interface ReforcoMobilizado {
  y: number
  x_cruzamento: number
  T_projeto: number
  T_mobilizado: number     // limitado pelo arrancamento da ancoragem
  ancoragem: number        // comprimento de ancoragem além do cruzamento (m)
  T_necessario_arrancamento: number
}

/**
 * Momento resistente (já dividido por R, pronto para o numerador do FS) dos
 * reforços horizontais cortados pela superfície de ruptura.
 *
 * A massa escorrega para −x (para o pé). O reforço trabalha no cruzamento do
 * arco com o nível do reforço do lado da plataforma (x2 = xc + √(R² − (y−yc)²)):
 * o trecho de reforço além de x2 está ancorado no solo estável e segura a
 * massa. A força mobilizada é o menor entre a resistência de projeto T e o
 * arrancamento 2·μ·σv·La (duas faces, σv do solo sobre o reforço, La = x_end − x2).
 */
export function momentoReforcos(
  circle: CircleParams,
  geo: SlopeGeometry,
  mode: AnalysisMode,
  x_left: number,
  x_right: number
): { momentoSobreR: number; itens: ReforcoMobilizado[] } {
  const itens: ReforcoMobilizado[] = []
  let momento = 0
  const camadas = geo.reinforcement ?? []
  for (const c of geo.curtains ?? []) {
    if (c.x < x_left || c.x > x_right) continue
    const inside = circle.R * circle.R - (c.x - circle.xc) ** 2
    if (inside <= 0) continue
    const yCruz = circle.yc - Math.sqrt(inside) // arco inferior
    if (yCruz > c.y_top || yCruz < c.y_tip) continue
    itens.push({
      y: yCruz,
      x_cruzamento: c.x,
      T_projeto: c.T,
      T_mobilizado: c.T,
      ancoragem: 0,
      T_necessario_arrancamento: 0,
    })
    momento += c.T * (circle.yc - yCruz)
  }
  if (camadas.length === 0) return { momentoSobreR: momento / circle.R, itens }
  const profile = buildProfile(geo, mode)

  for (const r of camadas) {
    const dy = r.y - circle.yc
    const inside = circle.R * circle.R - dy * dy
    if (inside <= 0 || r.y >= circle.yc) continue
    const x2 = circle.xc + Math.sqrt(inside)
    if (x2 < Math.max(r.x_start, x_left) || x2 > Math.min(r.x_end, x_right)) continue

    const La = r.x_end - x2
    const gamma = r.gamma_cover ?? 18
    const mu = r.mu ?? 0.6
    const cobertura = Math.max(0, (groundY(x2, profile) + groundY(r.x_end, profile)) / 2 - r.y)
    const sigmaV = gamma * cobertura
    const Tarranc = 2 * mu * sigmaV * La
    const Tmob = Math.min(r.T, Tarranc)
    itens.push({
      y: r.y,
      x_cruzamento: x2,
      T_projeto: r.T,
      T_mobilizado: Tmob,
      ancoragem: La,
      T_necessario_arrancamento: Tarranc,
    })
    // força horizontal +x (resiste ao movimento para −x), abaixo do centro
    momento += Tmob * (circle.yc - r.y)
  }
  return { momentoSobreR: momento / circle.R, itens }
}

/**
 * Círculo que sai pela face contida pela cortina (acima do terreno) não é um
 * mecanismo do talude: a face é segurada pela cortina, e o empuxo do aterro é
 * carga direta na estaca (dimensionada à parte). Esses círculos são descartados;
 * só os que cruzam a cortina abaixo do terreno mobilizam a força T.
 */
export function saiPelaFaceContida(geo: SlopeGeometry, mode: AnalysisMode, x_left: number): boolean {
  const curtains = geo.curtains
  if (!curtains || curtains.length === 0) return false
  const profile = buildProfile(geo, mode)
  const yExit = groundY(x_left, profile)
  return curtains.some((c) => x_left > c.x - 0.05 && yExit > 0.05)
}
