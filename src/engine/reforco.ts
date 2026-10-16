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
  if (camadas.length === 0) return { momentoSobreR: 0, itens }
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
