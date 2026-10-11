import type { Point } from '../types'
import { empuxoNoPlano, kaCoulomb, kaRankine, kpRankine } from './empuxo'
import { linhaProjetoArquivo, paraMotor, type ModeloSecao } from './entrada'
import { areaCentroide, topoPoligono, zEmX } from './geometria2d'
import type { SoloSecao } from './solo'
import type { ParametrosMuros, SecaoEntrada, TipoMuro } from './tipos'

// Verificações de muro de gravidade/flexão (concreto armado e gabião), por
// metro de muro, no sistema do arquivo (x, z):
//
//   u = distância horizontal a partir da PONTA (aresta da base do lado aberto),
//       crescendo para o lado retido. Momentos em relação à ponta.
//
// Forças verticais (estabilizantes): peso do corpo; peso do solo sobre o
// talão/degraus (entre a face e o plano virtual); componente vertical do
// empuxo, aplicada no plano virtual (u = B). Subpressão na base, se houver
// N.A. acima dela.
// Forças horizontais (instabilizantes): componente horizontal do empuxo e
// empuxo hidrostático no plano virtual.
//
//   FS_tomb = M_estab / M_instab
//   FS_desl = (ΣV·tg(δb) + ca·B + Ep) / ΣH
//   e = B/2 − (M_estab − M_instab)/ΣV;  σ = ΣV/B·(1 ± 6e/B) se |e| ≤ B/6
//   (sem tração); senão σmáx = 2ΣV / (3·(B/2 − e)) e σmín = 0.
// O solo sobre a ponta (embutimento) não entra no peso (a favor da segurança).

export interface ResultadoGravidade {
  B: number
  Hv: number               // altura do plano virtual (m)
  zBase: number
  W_corpo: number
  W_solo: number
  phi: number              // φ' médio do maciço retido no plano virtual
  gama: number             // γ médio do maciço retido
  beta: number             // inclinação equivalente do terrapleno (graus)
  K: number
  inclinacaoEmpuxo: number // graus com a horizontal
  Ea: number
  Eh: number
  Ev: number
  zE: number
  Uw: number
  U: number                // subpressão
  Ep: number
  M_estab: number
  M_instab: number
  sumV: number
  sumH: number
  fs_tombamento: number
  fs_deslizamento: number
  excentricidade: number
  sigma_max: number
  sigma_min: number
  sem_tracao: boolean
  ok_tombamento: boolean
  ok_deslizamento: boolean
  ok_tensao: boolean
  ok: boolean
  phi_fundacao: number
  c_fundacao: number
  avisos: string[]
}

const DX = 0.01

export function verificarGravidade(
  tipo: TipoMuro,
  secao: SecaoEntrada,
  modelo: ModeloSecao,
  solo: SoloSecao,
  p: ParametrosMuros
): ResultadoGravidade {
  const avisos: string[] = []
  // lado aberto no sistema do arquivo: o motor sempre tem o lado baixo à
  // esquerda (x' < 0); espelhado → lado aberto em +x no arquivo
  const dir = modelo.espelhado ? 1 : -1
  const corpos = secao.corpo.map((poly) => poly.map(([x, y]) => ({ x, y })))
  const todos = corpos.flat()
  const zBase = Math.min(...todos.map((v) => v.y))
  const naBase = todos.filter((v) => v.y <= zBase + 1e-3)
  const xToe = dir > 0 ? Math.max(...naBase.map((v) => v.x)) : Math.min(...naBase.map((v) => v.x))
  const u = (x: number) => (xToe - x) * dir
  const xDeU = (uu: number) => xToe - uu * dir
  const B = Math.max(...naBase.map((v) => u(v.x)))

  const material = (x: number, z: number) => {
    const m = paraMotor(modelo, [x, z])
    return solo.materialEm(m.x, m.y)
  }

  // corpo
  const gamaCorpo = tipo === 'gabiao' ? p.gama_gabiao : p.gama_concreto
  let W_corpo = 0
  let M_corpo = 0
  for (const poly of corpos) {
    const { area, cx } = areaCentroide(poly)
    W_corpo += area * gamaCorpo
    M_corpo += area * gamaCorpo * u(cx)
  }

  // superfície do lado retido (linha de projeto, sem o muro)
  const linha: Point[] = linhaProjetoArquivo(secao, 200)
    .map(([x, z]) => ({ x, y: z }))
    .sort((a, b) => a.x - b.x)
  const zs = (x: number) => zEmX(x, linha)
  const topoCorpo = (x: number) => {
    let t = -Infinity
    for (const poly of corpos) t = Math.max(t, topoPoligono(x, poly))
    return t
  }

  // solo sobre o talão / degraus, entre a face e o plano virtual
  const uFace = Math.max(0, u(secao.pe_face[0]))
  let W_solo = 0
  let M_solo = 0
  for (let uu = uFace + DX / 2; uu < B; uu += DX) {
    const x = xDeU(uu)
    const fundo = Math.max(topoCorpo(x), zBase)
    const topo = zs(x)
    const h = topo - fundo
    if (h <= 0) continue
    const g = material(x, (topo + fundo) / 2).gamma
    W_solo += g * h * DX
    M_solo += g * h * DX * uu
  }

  // plano virtual
  const xV = xDeU(B)
  const xRet = xDeU(B + 0.01) // logo atrás do plano, no maciço
  const Hv = zs(xV) - zBase
  let sPhi = 0
  let sGama = 0
  const nAm = 20
  for (let i = 0; i < nAm; i++) {
    const z = zBase + (Hv * (i + 0.5)) / nAm
    const m = material(xRet, z)
    sPhi += m.phi
    sGama += m.gamma
  }
  const phi = sPhi / nAm
  const gama = sGama / nAm

  // terrapleno: inclinação média sobre a cunha ativa (extensão Hv/tg(45+φ/2))
  const L = Math.max(Hv / Math.tan(((45 + phi / 2) * Math.PI) / 180), 0.5)
  let beta = (Math.atan((zs(xDeU(B + L)) - zs(xV)) / L) * 180) / Math.PI
  if (beta >= phi - 0.5) {
    avisos.push(
      `Terrapleno acima do muro (${beta.toFixed(1)}°) igual ou mais íngreme que φ' do maciço (${phi.toFixed(1)}°): empuxo calculado com β = φ' − 0,5° — suavize o talude junto ao muro.`
    )
    beta = phi - 0.5
  }
  if (beta < -phi + 0.5) beta = -phi + 0.5

  let K: number
  let inc: number
  if (p.metodo_empuxo === 'coulomb') {
    const delta = p.delta_coulomb_fator * phi
    K = kaCoulomb(phi, beta, delta, 0)
    inc = delta
  } else {
    K = kaRankine(phi, beta)
    inc = beta
  }

  // N.A. no plano virtual
  const naZ = Number.isFinite(solo.waterY) ? solo.waterY + modelo.zDatum : -Infinity
  const hw = Number.isFinite(naZ) ? Math.max(0, naZ - zBase) : 0
  const gamaNaProf = (d: number) => material(xRet, zBase + Hv - d).gamma
  const emp = empuxoNoPlano(Hv, K, gamaNaProf, p.sobrecarga, hw, solo.gammaWater)
  const incR = (inc * Math.PI) / 180
  const Eh = emp.E * Math.cos(incR)
  const Ev = emp.E * Math.sin(incR)
  const U = hw > 0 ? solo.gammaWater * Math.min(hw, Hv) * B : 0
  if (hw > 0) avisos.push(`N.A. ${hw.toFixed(2)} m acima da base do muro: empuxo hidrostático e subpressão considerados (sem drenagem).`)

  // fundação
  const fund = material(xDeU(B / 2), zBase - 0.05)
  const deltaB = (p.atrito_base_fator * fund.phi * Math.PI) / 180
  const ca = p.adesao_base_fator * fund.c

  let Ep = 0
  if (p.considerar_passivo) {
    const D = Math.max(0, zs(xToe + 0.01 * dir) - zBase)
    const Kp = kpRankine(fund.phi)
    Ep = 0.5 * Kp * fund.gamma * D * D + 2 * fund.c * Math.sqrt(Kp) * D
  }

  const M_estab = M_corpo + M_solo + Ev * B
  const M_instab = Eh * emp.zE + emp.Uw * emp.zU + (U * B) / 2
  const sumV = W_corpo + W_solo + Ev - U
  const sumH = Eh + emp.Uw

  const fs_tombamento = M_instab > 0 ? M_estab / M_instab : Infinity
  const fs_deslizamento = sumH > 0 ? (Math.max(sumV, 0) * Math.tan(deltaB) + ca * B + Ep) / sumH : Infinity

  const d = sumV > 0 ? (M_estab - M_instab) / sumV : -Infinity
  const e = B / 2 - d
  let sigma_max: number
  let sigma_min: number
  const sem_tracao = Math.abs(e) <= B / 6 + 1e-9
  if (sem_tracao) {
    sigma_max = (sumV / B) * (1 + (6 * Math.abs(e)) / B)
    sigma_min = (sumV / B) * (1 - (6 * Math.abs(e)) / B)
  } else if (d > 0 && d < B) {
    const dBorda = Math.min(d, B - d) // distância da resultante à borda mais carregada
    sigma_max = (2 * sumV) / (3 * dBorda)
    sigma_min = 0
  } else {
    sigma_max = Infinity
    sigma_min = 0
    avisos.push('Resultante fora da base: o muro tomba.')
  }

  const ok_tombamento = fs_tombamento >= p.fs_tombamento_min
  const ok_deslizamento = fs_deslizamento >= p.fs_deslizamento_min
  const ok_tensao = sem_tracao && sigma_max <= p.tensao_admissivel

  return {
    B,
    Hv,
    zBase,
    W_corpo,
    W_solo,
    phi,
    gama,
    beta,
    K,
    inclinacaoEmpuxo: inc,
    Ea: emp.E,
    Eh,
    Ev,
    zE: emp.zE,
    Uw: emp.Uw,
    U,
    Ep,
    M_estab,
    M_instab,
    sumV,
    sumH,
    fs_tombamento,
    fs_deslizamento,
    excentricidade: e,
    sigma_max,
    sigma_min,
    sem_tracao,
    ok_tombamento,
    ok_deslizamento,
    ok_tensao,
    ok: ok_tombamento && ok_deslizamento && ok_tensao,
    phi_fundacao: fund.phi,
    c_fundacao: fund.c,
    avisos,
  }
}
