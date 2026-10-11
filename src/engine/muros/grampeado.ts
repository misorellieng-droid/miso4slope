import { kaCoulomb, kaRankine } from './empuxo'
import type { ModeloSecao } from './entrada'
import { zEmX } from './geometria2d'
import type { ResultadoGlobal } from './global'
import type { SoloSecao } from './solo'
import type { ParametrosMuros, SecaoEntrada } from './tipos'

// Solo grampeado: verificação do arrancamento de cada linha de grampos.
//
// Força máxima de tração por grampo — envoltória simplificada da FHWA
// (GEC 7, FHWA-NHI-14-007):
//   T_max = λ · Ka · (γ·H + q) · Sh · Sv        (λ = 0,75 por padrão)
// Resistência ao arrancamento: só o trecho do grampo ALÉM da superfície
// crítica global (no maciço estável) ancora:
//   R_p = qs · Le       (qs em kN por metro de grampo)
//   FS_arrancamento = R_p / T_max ≥ 2,0 (padrão)
// A tração na barra (T_barra / T_max) sai como informação.

export interface LinhaGrampo {
  linha: number      // 1 = a mais baixa
  zCabeca: number    // cota da cabeça do grampo (m)
  L: number          // comprimento total (m)
  Le: number         // comprimento além da superfície crítica (m)
  Tmax: number       // kN por grampo
  Rp: number         // kN por grampo
  fs_arrancamento: number
  fs_barra: number
  ok: boolean
}

export interface ResultadoGrampeado {
  H: number
  phi: number
  gama: number
  beta: number
  Ka: number
  sh: number
  sv: number
  linhas: LinhaGrampo[]
  fs_arrancamento_min: number
  ok: boolean
  avisos: string[]
}

export function verificarGrampeado(
  secao: SecaoEntrada,
  modelo: ModeloSecao,
  solo: SoloSecao,
  p: ParametrosMuros,
  critico: ResultadoGlobal | null
): ResultadoGrampeado {
  const avisos: string[] = []
  const H = secao.dim.H ?? secao.H
  const sh = secao.dim.espacamento_h ?? 1.5
  const sv = secao.dim.espacamento_v ?? 1.5
  const pe = modelo.peFace

  // maciço retido logo atrás da face, ao longo da altura do muro (motor: retido à direita)
  let sPhi = 0
  let sGama = 0
  const n = 20
  for (let i = 0; i < n; i++) {
    const y = pe.y + (H * (i + 0.5)) / n
    const m = solo.materialEm(pe.x + 0.5, y)
    sPhi += m.phi
    sGama += m.gamma
  }
  const phi = sPhi / n
  const gama = sGama / n

  // terrapleno acima do topo: inclinação média sobre a cunha ativa
  const topo = { x: pe.x, y: pe.y + H }
  const L = Math.max(H / Math.tan(((45 + phi / 2) * Math.PI) / 180), 0.5)
  const yTopo = zEmX(topo.x + 0.01, modelo.linhaProjeto)
  let beta = (Math.atan((zEmX(topo.x + L, modelo.linhaProjeto) - yTopo) / L) * 180) / Math.PI
  if (beta >= phi - 0.5) {
    avisos.push(
      `Talude acima do grampeado (${beta.toFixed(1)}°) igual ou mais íngreme que φ' (${phi.toFixed(1)}°): T_max calculado com β = φ' − 0,5°.`
    )
    beta = phi - 0.5
  }
  beta = Math.max(beta, 0)
  const Ka =
    p.metodo_empuxo === 'coulomb' ? kaCoulomb(phi, beta, p.delta_coulomb_fator * phi, 0) : kaRankine(phi, beta)
  const Tmax = p.lambda_grampo * Ka * (gama * H + p.sobrecarga) * sh * sv

  if (!critico) avisos.push('Sem círculo crítico global: comprimento ancorado não calculado.')

  const linhas: LinhaGrampo[] = modelo.grampos
    .map(([A, B], i) => {
      const Ltot = Math.hypot(B.x - A.x, B.y - A.y)
      const g = critico?.grampos[i]
      // grampo sem cruzar o círculo: ou inteiro fora da massa (ancora tudo) ou inteiro dentro (nada)
      const cabecaFora = critico ? Math.hypot(A.x - critico.circle.xc, A.y - critico.circle.yc) >= critico.circle.R : false
      const Le = g ? (g.cruza ? g.Le : cabecaFora ? Ltot : 0) : 0
      const Rp = p.qs_grampo * Le
      const fs_arrancamento = Tmax > 0 ? Rp / Tmax : Infinity
      return {
        linha: 0,
        zCabeca: A.y + modelo.zDatum,
        L: Ltot,
        Le,
        Tmax,
        Rp,
        fs_arrancamento,
        fs_barra: Tmax > 0 ? p.t_barra / Tmax : Infinity,
        ok: fs_arrancamento >= p.fs_arrancamento_min,
      }
    })
    .sort((a, b) => a.zCabeca - b.zCabeca)
    .map((l, i) => ({ ...l, linha: i + 1 }))

  const fs_arrancamento_min = linhas.length ? Math.min(...linhas.map((l) => l.fs_arrancamento)) : NaN
  return {
    H,
    phi,
    gama,
    beta,
    Ka,
    sh,
    sv,
    linhas,
    fs_arrancamento_min,
    ok: linhas.length > 0 && linhas.every((l) => l.ok),
    avisos,
  }
}

