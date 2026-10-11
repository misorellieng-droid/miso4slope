import type { Point } from '../types'
import { areaEntre, zEmX } from './geometria2d'
import type { MuroEntrada, SecaoEntrada, XZ } from './tipos'

// Refaz a linha de projeto da seção com outra inclinação H:V no "talude
// junto ao muro", para a sugestão de talude_h_por_v.
//
// A partir da face do muro, a linha é percorrida para longe dela:
// - muro na CRISTA: o talude junto ao muro é o de baixo — começa no pé da face;
// - muro no PÉ: o talude junto ao muro é o de cima — começa no topo da face.
// Bermas mantêm largura e desnível; trechos de talude (|dx/dz| ≈ talude_h_por_v)
// passam a ter dx = r·|dz|. Duas situações:
// a) a linha termina no TERRENO (muro junto ao platô: M1, M3 do exemplo):
//    o muro fica igual e o último trecho de talude é estendido/encurtado até
//    encontrar o terreno — mais suave = mais terra movimentada;
// b) a linha termina na BORDA DO PLATÔ (muro no pé junto à divisa: M2):
//    o platô e a posição do muro são fixos, então mantêm-se os x e muda a
//    cota: com talude mais suave o terrapleno chega mais alto no muro e a
//    altura do muro (H) cresce.

const TOL_INCL = 0.2

export interface TaludeRefeito {
  talude: XZ[]
  H: number               // nova altura do muro (só muda no caso b)
  terminaNoPlato: boolean
  area: number            // área de terra entre a linha e o terreno (m²/m), para comparar candidatos
}

function ehTalude(a: XZ, b: XZ, r0: number): boolean {
  const dx = Math.abs(b[0] - a[0])
  const dz = Math.abs(b[1] - a[1])
  return dz > 0.2 && Math.abs(dx / dz - r0) <= TOL_INCL
}

function interseccaoComTerreno(p: XZ, sentidoX: number, dzPorDx: number, terreno: Point[]): XZ | null {
  // anda pelo raio z = p.z + dzPorDx·(x − p.x) até cruzar o terreno
  const f = (x: number) => p[1] + dzPorDx * (x - p[0]) - zEmX(x, terreno)
  const f0 = f(p[0])
  let xa = p[0]
  const passo = 0.05
  for (let i = 1; i < 6000; i++) {
    const xb = p[0] + sentidoX * passo * i
    if (f(xb) === 0 || Math.sign(f(xb)) !== Math.sign(f0)) {
      let lo = xa
      let hi = xb
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2
        if (Math.sign(f(mid)) === Math.sign(f0)) lo = mid
        else hi = mid
      }
      const x = (lo + hi) / 2
      return [x, zEmX(x, terreno)]
    }
    xa = xb
  }
  return null
}

function indiceFace(secao: SecaoEntrada): { iPe: number; iTopo: number } | null {
  const tal = secao.talude
  const iPe = tal.findIndex(([x, z]) => Math.hypot(x - secao.pe_face[0], z - secao.pe_face[1]) < 1e-3)
  if (iPe < 0) return null
  // a face é o trecho íngreme vizinho ao pé da face
  for (const j of [iPe - 1, iPe + 1]) {
    if (j < 0 || j >= tal.length) continue
    const dx = Math.abs(tal[j][0] - tal[iPe][0])
    const dz = Math.abs(tal[j][1] - tal[iPe][1])
    if (dz > 0.3 && dx / dz < 0.2) return { iPe, iTopo: j }
  }
  return null
}

export function areaMovimento(talude: XZ[], terreno: XZ[]): number {
  const a = talude.map(([x, y]) => ({ x, y })).sort((p, q) => p.x - q.x)
  const b = terreno.map(([x, y]) => ({ x, y })).sort((p, q) => p.x - q.x)
  return areaEntre(a, b, a[0].x, a[a.length - 1].x)
}

export function refazerTalude(muro: MuroEntrada, secao: SecaoEntrada, r: number): TaludeRefeito | null {
  const face = indiceFace(secao)
  if (!face) return null
  const tal = secao.talude
  const r0 = muro.talude_h_por_v
  const inicio = muro.posicao === 'crista' ? face.iPe : face.iTopo
  const outro = muro.posicao === 'crista' ? face.iTopo : face.iPe
  const passo = inicio > outro ? 1 : -1 // índice crescente ou decrescente, para longe da face
  const seq: number[] = []
  for (let i = inicio; i >= 0 && i < tal.length; i += passo) seq.push(i)
  if (seq.length < 2) return null

  const terreno = secao.terreno.map(([x, y]) => ({ x, y })).sort((a, b) => a.x - b.x)
  const fim = tal[seq[seq.length - 1]]
  const terminaNoPlato = Math.abs(fim[1] - zEmX(fim[0], terreno)) > 0.05

  const novos: XZ[] = []
  let H = secao.H

  if (!terminaNoPlato) {
    // (a) muro fixo; refaz a partir da face e acha o terreno no fim
    let cur: XZ = tal[seq[0]]
    novos.push(cur)
    // último trecho de talude da sequência — é o que encontra o terreno
    let ultimoTalude = -1
    for (let k = 0; k + 1 < seq.length; k++) if (ehTalude(tal[seq[k]], tal[seq[k + 1]], r0)) ultimoTalude = k
    for (let k = 0; k + 1 < seq.length; k++) {
      const a = tal[seq[k]]
      const b = tal[seq[k + 1]]
      const dz = b[1] - a[1]
      const sx = Math.sign(b[0] - a[0]) || passo
      if (!ehTalude(a, b, r0)) {
        cur = [cur[0] + (b[0] - a[0]), cur[1] + dz]
        novos.push(cur)
        continue
      }
      const dzPorDx = Math.sign(dz) / r
      if (k === ultimoTalude) {
        const p = interseccaoComTerreno(cur, sx, dzPorDx, terreno)
        if (!p) return null
        novos.push(p)
        break
      }
      // trecho intermediário: mesma altura, nova extensão — mas para no terreno se cruzar antes
      const proximo: XZ = [cur[0] + sx * r * Math.abs(dz), cur[1] + dz]
      const p = interseccaoComTerreno(cur, sx, dzPorDx, terreno)
      if (p && (p[0] - cur[0]) * sx < (proximo[0] - cur[0]) * sx) {
        novos.push(p)
        break
      }
      cur = proximo
      novos.push(cur)
    }
  } else {
    // (b) platô e x fixos; recalcula as cotas a partir da borda do platô até o topo do muro
    const rev = seq.slice().reverse() // da borda do platô para o muro
    let z = tal[rev[0]][1]
    const cotas = new Map<number, number>([[rev[0], z]])
    for (let k = 0; k + 1 < rev.length; k++) {
      const a = tal[rev[k]]
      const b = tal[rev[k + 1]]
      const dz = b[1] - a[1]
      if (ehTalude(a, b, r0)) z += Math.sign(dz) * (Math.abs(b[0] - a[0]) / r)
      else z += dz
      cotas.set(rev[k + 1], z)
    }
    for (const i of seq) novos.push([tal[i][0], cotas.get(i)!])
    H = cotas.get(seq[0])! - secao.pe_face[1]
  }

  // monta a linha inteira na ordem original do arquivo: o lado da face (e o
  // próprio muro) fica igual; no caso (b) o topo da face já veio com a nova cota
  const talude: XZ[] = passo > 0 ? [...tal.slice(0, inicio), ...novos] : [...novos.slice().reverse(), ...tal.slice(inicio + 1)]

  return { talude, H, terminaNoPlato, area: areaMovimento(talude, secao.terreno) }
}
