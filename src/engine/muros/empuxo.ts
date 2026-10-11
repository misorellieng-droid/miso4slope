// Coeficientes e distribuição de empuxo de terra.
//
// O empuxo é calculado num PLANO VIRTUAL vertical que passa pelo fim da
// base (fim do talão no concreto; fundo da caixa de baixo no gabião). O solo
// entre o muro e esse plano entra como peso estabilizante; o empuxo age no
// plano, como no procedimento clássico de muros de flexão (Rankine) — e,
// para manter os dois métodos comparáveis, Coulomb usa o mesmo plano.
// c' do maciço retido é desprezado no empuxo (a favor da segurança).

const rad = (g: number) => (g * Math.PI) / 180

/**
 * Rankine com terrapleno inclinado β (paramento vertical). O empuxo resulta
 * paralelo à superfície (inclinado de β). Indefinido para β ≥ φ (NaN).
 *   Ka = cosβ · (cosβ − √(cos²β − cos²φ)) / (cosβ + √(cos²β − cos²φ))
 */
export function kaRankine(phiGraus: number, betaGraus = 0): number {
  const cb = Math.cos(rad(betaGraus))
  const cp = Math.cos(rad(phiGraus))
  const raiz = cb * cb - cp * cp
  if (raiz < 0) return NaN
  const r = Math.sqrt(raiz)
  return (cb * (cb - r)) / (cb + r)
}

/**
 * Coulomb, paramento com inclinação θ em relação à vertical (θ=0 vertical),
 * atrito solo-plano δ e terrapleno β. Empuxo inclinado de δ (+θ) com a horizontal.
 *   Ka = cos²(φ−θ) / { cos²θ · cos(δ+θ) · [1 + √( sen(φ+δ)·sen(φ−β) / (cos(δ+θ)·cos(θ−β)) )]² }
 */
export function kaCoulomb(phiGraus: number, betaGraus = 0, deltaGraus = 0, thetaGraus = 0): number {
  const phi = rad(phiGraus)
  const beta = rad(betaGraus)
  const delta = rad(deltaGraus)
  const theta = rad(thetaGraus)
  if (beta > phi) return NaN
  const num = Math.cos(phi - theta) ** 2
  const s = (Math.sin(phi + delta) * Math.sin(phi - beta)) / (Math.cos(delta + theta) * Math.cos(theta - beta))
  if (s < 0) return NaN
  return num / (Math.cos(theta) ** 2 * Math.cos(delta + theta) * (1 + Math.sqrt(s)) ** 2)
}

/** Rankine passivo, terreno horizontal: Kp = tg²(45° + φ/2). */
export function kpRankine(phiGraus: number): number {
  return Math.tan(rad(45 + phiGraus / 2)) ** 2
}

export interface EmpuxoDistribuido {
  E: number       // resultante do empuxo de terra (kN/m), na direção inclinada do método
  zE: number      // altura do ponto de aplicação acima da base (m)
  Uw: number      // empuxo hidrostático horizontal no plano (kN/m)
  zU: number      // altura do ponto de aplicação de Uw acima da base (m)
  hw: number      // altura de água acima da base (m)
}

/**
 * Integra σ = K·(σ'v + q) ao longo da altura Hv do plano virtual, com γ que
 * pode variar com a profundidade (camadas) e N.A. a uma altura hw acima da
 * base: abaixo do N.A., σ'v usa γ' = γ − γw e soma-se a pressão de água u.
 * Para γ constante, sem água e q=0, dá a fórmula fechada E = ½·K·γ·Hv² a Hv/3.
 */
export function empuxoNoPlano(
  Hv: number,
  K: number,
  gamaNaProfundidade: (d: number) => number, // d = profundidade a partir do topo do plano (m)
  q = 0,
  hwAcimaDaBase = 0,
  gamaW = 9.81,
  n = 400
): EmpuxoDistribuido {
  if (!(Hv > 0)) return { E: 0, zE: 0, Uw: 0, zU: 0, hw: 0 }
  const hw = Math.min(Math.max(hwAcimaDaBase, 0), Hv)
  const dNA = Hv - hw // profundidade do N.A. a partir do topo
  const dd = Hv / n
  let sv = 0 // σ'v no topo do trecho
  let E = 0
  let ME = 0 // momento em relação à base
  for (let i = 0; i < n; i++) {
    const d0 = i * dd
    const dm = d0 + dd / 2
    const g = gamaNaProfundidade(dm)
    const gEf = dm > dNA ? g - gamaW : g
    const svm = sv + gEf * (dd / 2)
    const sigma = K * (svm + q)
    E += sigma * dd
    ME += sigma * dd * (Hv - dm)
    sv += gEf * dd
  }
  const Uw = 0.5 * gamaW * hw * hw
  return { E, zE: E > 0 ? ME / E : 0, Uw, zU: hw / 3, hw }
}

export interface CunhaTentativa {
  Pa: number   // empuxo máximo (kN/m), inclinado de δ
  rho: number  // inclinação do plano de ruptura crítico (graus)
  Keq: number  // coeficiente equivalente: Pa = ½·Keq·γ·Hv²
}

/**
 * Coulomb generalizado por cunha de tentativa (Culmann) sobre a superfície
 * real do terrapleno — berma, talude de altura finita, platô —, em vez de um
 * β único. Plano virtual vertical de altura Hv; o plano de ruptura parte da
 * base dele com inclinação ρ e vai até a superfície. Para cada ρ:
 *
 *   Pa(ρ) = [W·sen(ρ − φ) − C·cos φ] / cos(ρ − φ − δ)
 *
 * (W = peso da cunha, C = c'·comprimento do plano, só se a coesão for
 * considerada). O empuxo de projeto é o máximo em ρ. Com terrapleno
 * horizontal e C = 0, reproduz a fórmula fechada de Coulomb.
 *
 * zSup(d) = cota da superfície a uma distância d (m) do plano virtual, para
 * dentro do maciço; zBase = cota da base do plano.
 */
export function empuxoCunha(
  Hv: number,
  zBase: number,
  zSup: (d: number) => number,
  gama: number,
  phiGraus: number,
  deltaGraus: number,
  coesao = 0
): CunhaTentativa {
  if (!(Hv > 0)) return { Pa: 0, rho: 45, Keq: 0 }
  const phi = (phiGraus * Math.PI) / 180
  const delta = (deltaGraus * Math.PI) / 180
  const passo = Math.max(0.02, Hv / 300) // m, integração da área da cunha
  let melhor = { Pa: 0, rho: 45 + phiGraus / 2 }
  for (let rg = phiGraus + 0.5; rg < 89.9; rg += 0.5) {
    const rho = (rg * Math.PI) / 180
    const tg = Math.tan(rho)
    // área entre a superfície e o plano, até o plano encontrar a superfície
    let area = 0
    let d = 0
    let dS = NaN
    for (let i = 0; i < 20000; i++) {
      const d1 = d + passo
      const h0 = zSup(d) - (zBase + d * tg)
      const h1 = zSup(d1) - (zBase + d1 * tg)
      if (h1 <= 0) {
        const t = h0 / (h0 - h1)
        area += (h0 / 2) * passo * t
        dS = d + passo * t
        break
      }
      area += ((h0 + h1) / 2) * passo
      d = d1
    }
    if (!Number.isFinite(dS)) continue
    const W = gama * area
    const C = coesao * (dS / Math.cos(rho))
    const den = Math.cos(rho - phi - delta)
    if (den <= 1e-6) continue
    const Pa = (W * Math.sin(rho - phi) - C * Math.cos(phi)) / den
    if (Pa > melhor.Pa) melhor = { Pa, rho: rg }
  }
  return { Pa: melhor.Pa, rho: melhor.rho, Keq: (2 * melhor.Pa) / (gama * Hv * Hv) }
}
