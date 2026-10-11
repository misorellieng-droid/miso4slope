import { iterateBishop } from '../bishop'
import { arcY, buildRawSlicesOnProfile, type RawSlice } from '../slices'
import type { CircleParams, Point } from '../types'
import type { ModeloSecao } from './entrada'
import { dentroPoligono, espessuraVerticalEntre, segmentoCirculo } from './geometria2d'
import type { SoloSecao } from './solo'

// Estabilidade global (Bishop Simplificado) do conjunto talude + muro.
//
// - Concreto e gabião são CORPO RÍGIDO: o círculo não pode atravessar o
//   corpo (só passar por baixo); as fatias que passam sob o muro carregam o
//   peso dele (γ do concreto/gabião no lugar do γ do solo).
// - Grampeado: o paramento é fino e não trava o círculo; cada grampo cortado
//   pela superfície de ruptura contribui com a força que o trecho além dela
//   (no maciço estável) consegue ancorar: T = mín(qs·Le; T_barra) / Sh, por
//   metro de muro. A força entra como momento resistente em torno do centro
//   do círculo (dividido por R, para ficar na mesma unidade do numerador do
//   Bishop) — o mesmo tratamento "passivo" dos programas comerciais, em que o
//   FS também minora a força do grampo. Não se soma o efeito do grampo na
//   normal da base (a favor da segurança).
// - Em todos os tipos, só contam círculos que ENVOLVEM o muro (passam sob o
//   pé da face): é a estabilidade global do muro, não a ruptura local de um
//   trecho do talude longe dele.

export interface OpcoesGlobal {
  corpoRigido: boolean
  gamaCorpo: number
  n_fatias: number
  // grampeado
  qs?: number      // kN/m de grampo
  tBarra?: number  // kN
  sh?: number      // espaçamento horizontal (m)
}

export interface GrampoNoCirculo {
  cruza: boolean
  Le: number   // comprimento além da superfície de ruptura (m)
  T: number    // força mobilizável por metro de muro (kN/m)
  ponto: Point | null
}

export interface ResultadoGlobal {
  FS: number
  circle: CircleParams
  x_left: number
  x_right: number
  b: number
  slices: RawSlice[]
  grampos: GrampoNoCirculo[]
  converged: boolean
}

const TOL_PE = 0.1 // m — o círculo pode sair até 10 cm acima do pé da face

/** Comprimento de cada grampo além do círculo e a força que ele ancora. */
export function grampoNoCirculo(
  [A, B]: [Point, Point],
  circle: CircleParams,
  op: Pick<OpcoesGlobal, 'qs' | 'tBarra' | 'sh'>
): GrampoNoCirculo {
  const { xc, yc, R } = circle
  const dentroA = Math.hypot(A.x - xc, A.y - yc) < R
  const dentroB = Math.hypot(B.x - xc, B.y - yc) < R
  const L = Math.hypot(B.x - A.x, B.y - A.y)
  const qs = op.qs ?? 0
  const tBarra = op.tBarra ?? Infinity
  const sh = op.sh ?? 1
  if (!dentroA) {
    // a cabeça já está fora da massa: o grampo inteiro está no maciço estável
    return { cruza: false, Le: L, T: 0, ponto: null }
  }
  if (dentroB) return { cruza: false, Le: 0, T: 0, ponto: null } // grampo inteiro dentro da massa que escorrega
  const ts = segmentoCirculo(A, B, xc, yc, R)
  if (ts.length === 0) return { cruza: false, Le: 0, T: 0, ponto: null }
  const t = ts[0]
  const P = { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) }
  if (P.y >= yc) return { cruza: false, Le: 0, T: 0, ponto: null } // cruzamento no arco de cima (fora da superfície)
  const Le = (1 - t) * L
  const T = Math.min(qs * Le, tBarra) / sh
  return { cruza: true, Le, T, ponto: P }
}

/** FS de Bishop de um círculo de tentativa no conjunto talude + muro. null = círculo inválido. */
export function fsGlobalCirculo(
  circle: CircleParams,
  modelo: ModeloSecao,
  solo: SoloSecao,
  op: OpcoesGlobal
): ResultadoGlobal | null {
  // 1) tem que envolver o muro: passar sob o pé da face (teste barato, antes de montar fatias)
  const pe = modelo.peFace
  const yArcPe = arcY(pe.x, circle)
  if (yArcPe === null || yArcPe > pe.y + TOL_PE) return null

  const built = buildRawSlicesOnProfile(circle, {
    profile: modelo.superficie,
    refTerrain: solo.refTerrain,
    waterY: solo.waterY,
    gammaWater: solo.gammaWater,
    layers: solo.layers,
    fill: solo.fill,
    n_slices: op.n_fatias,
  })
  if (!built) return null
  const { x_left, x_right, b } = built
  if (pe.x < x_left || pe.x > x_right) return null

  // 2) corpo rígido: o arco não pode atravessar o muro
  if (op.corpoRigido) {
    const n = 200
    for (let i = 0; i <= n; i++) {
      const x = x_left + ((x_right - x_left) * i) / n
      const y = arcY(x, circle)
      if (y === null) continue
      for (const poly of modelo.corpos) if (dentroPoligono(x, y, poly)) return null
    }
  }

  // 3) peso do corpo do muro nas fatias que passam sob ele
  const slices = built.raw.map((s) => {
    let extra = 0
    for (const poly of modelo.corpos) {
      const t = espessuraVerticalEntre(s.xm, s.y_base, s.y_top, poly)
      if (t <= 0) continue
      // γ do solo que o integrador de peso considerou nesse trecho (aterro ou camada)
      const gSolo = solo.materialEm(s.xm, s.y_top - t / 2).gamma
      extra += (op.gamaCorpo - gSolo) * t * b
    }
    return extra === 0 ? s : { ...s, W: s.W + extra }
  })

  // 4) grampos
  let momentoGrampos = 0
  const grampos = modelo.grampos.map((g) => {
    const r = grampoNoCirculo(g, circle, op)
    if (r.cruza && r.ponto) {
      const [A, B] = g
      const L = Math.hypot(B.x - A.x, B.y - A.y)
      const dx = (B.x - A.x) / L
      const dy = (B.y - A.y) / L
      // momento da força T (no sentido cabeça → ponta) em torno do centro; o
      // motor gira a massa no sentido horário, então anti-horário (+) resiste
      momentoGrampos += (r.ponto.x - circle.xc) * r.T * dy - (r.ponto.y - circle.yc) * r.T * dx
    }
    return r
  })

  const solved = iterateBishop(slices, b, momentoGrampos / circle.R)
  if (!solved) return null
  return { FS: solved.FS, circle, x_left, x_right, b, slices, grampos, converged: solved.converged }
}

// ---------------------------------------------------------------------------
// Busca do círculo crítico em perfil livre.
//
// No talude paramétrico a grade de centros é montada a partir da altura e do
// pé em (0,0). Aqui o perfil é qualquer (berma, muro no meio, platô), então a
// primeira passada é por pontos de ENTRADA e SAÍDA na superfície: para cada
// par (x1 < x2) e alguns raios, o centro fica na mediatriz da corda, do lado
// de cima. Pontos extras perto do muro garantem círculos do tamanho dele.
// Depois, duas passadas de refinamento em (xc, yc, R) em volta do melhor.

export interface OpcoesBusca {
  rapida?: boolean
  alturaMuro: number
}

function amostrar(a: number, b: number, n: number): number[] {
  if (n <= 1) return [(a + b) / 2]
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1))
}

function superficieY(x: number, sup: Point[]): number {
  // mesma interpolação do motor (groundY), sem importar para manter o módulo enxuto
  if (x <= sup[0].x) return sup[0].y
  if (x >= sup[sup.length - 1].x) return sup[sup.length - 1].y
  let lo = 0
  let hi = sup.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (sup[mid].x <= x) lo = mid
    else hi = mid
  }
  const p = sup[lo]
  const q = sup[hi]
  return q.x === p.x ? p.y : p.y + ((x - p.x) / (q.x - p.x)) * (q.y - p.y)
}

export function buscarCirculoCritico(
  modelo: ModeloSecao,
  avaliar: (c: CircleParams) => ResultadoGlobal | null,
  op: OpcoesBusca
): ResultadoGlobal | null {
  const sup = modelo.superficie
  const H = Math.max(modelo.yMax - modelo.yMin, 1)
  const Hw = Math.max(op.alturaMuro, 1)
  const xHigh = sup.find((p) => p.y >= modelo.yMax - 0.01)!.x
  const xLow = [...sup].reverse().find((p) => p.x < xHigh && p.y <= modelo.yMin + 0.01)?.x ?? sup[0].x
  const pe = modelo.peFace

  const nGeral = op.rapida ? 14 : 24
  const nMuro = op.rapida ? 10 : 16
  const xs = [
    ...amostrar(xLow - 0.5 * H, xHigh + 1.0 * H, nGeral),
    ...amostrar(pe.x - 2 * Hw, pe.x + 3 * Hw, nMuro),
  ].sort((a, b) => a - b)
  const fatoresR = op.rapida ? [1.02, 1.15, 1.4, 1.8, 2.5, 3.5] : [1.01, 1.05, 1.15, 1.3, 1.5, 1.8, 2.2, 2.8, 3.6]

  let best: ResultadoGlobal | null = null
  const testar = (c: CircleParams) => {
    if (!(c.R > 0)) return
    const r = avaliar(c)
    if (r && (best === null || r.FS < best.FS)) best = r
  }

  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const x1 = xs[i]
      const x2 = xs[j]
      if (x2 - x1 < 3) continue
      const y1 = superficieY(x1, sup)
      const y2 = superficieY(x2, sup)
      const dx = x2 - x1
      const dy = y2 - y1
      const corda = Math.hypot(dx, dy)
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2
      // normal à corda, apontando para cima
      let nx = -dy / corda
      let ny = dx / corda
      if (ny < 0) {
        nx = -nx
        ny = -ny
      }
      for (const f of fatoresR) {
        const R = (corda / 2) * f
        const d = Math.sqrt(R * R - (corda / 2) ** 2)
        testar({ xc: mx + nx * d, yc: my + ny * d, R })
      }
    }
  }

  const passadas = op.rapida ? [{ meia: 0.08, passo: 0.02 }] : [{ meia: 0.1, passo: 0.02 }, { meia: 0.02, passo: 0.004 }]
  for (const { meia, passo } of passadas) {
    const b0 = best as ResultadoGlobal | null
    if (!b0) break
    const c0 = b0.circle
    const n = Math.round(meia / passo)
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++)
        for (let k = -n; k <= n; k++)
          testar({ xc: c0.xc + i * passo * H, yc: c0.yc + j * passo * H, R: c0.R + k * passo * H })
  }

  return best
}
