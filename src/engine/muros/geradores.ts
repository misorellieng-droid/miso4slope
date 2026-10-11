import type {
  DimConcreto,
  DimGabiao,
  DimGrampeado,
  MuroEntrada,
  MurosTipos,
  SecaoEntrada,
  TiposConcreto,
  TiposGabiao,
  TiposGrampeado,
  XZ,
} from './tipos'

// Réplica das regras de pré-dimensionamento do ME-DYN-TALUDE (v1.7.1), para
// a verificação poder testar outra inclinação ou outros fatores sem voltar
// ao Civil 3D. Tudo no sistema do arquivo (x para fora, z cota absoluta).
// A face do muro fica sempre no pé da face (pe_face) informado.
//
// concreto:  base = máx(base_min; base_fator·H; parede_base + 0,2)
//            parede_base = máx(espessura do topo; parede_base_fator·H)
//            ponta = ponta_fator·base;  sapata = máx(sapata_esp_min; sapata_esp_fator·H)
//            talão = base − parede_base − ponta; topo da sapata a "embutimento"
//            abaixo do terreno do lado aberto.
// gabião:    caixas de altura_camada a partir de "embutimento" abaixo do pé;
//            sobra até 0,5 m → meia caixa (0,5 m); sobra menor que TOL_SOBRA
//            é desprezada; base = base_fator·H arredondada para cima a 0,5 m;
//            cada caixa recua recuo_degrau do lado retido, sem ficar menor
//            que largura_topo.
// grampeado: grampo = máx(comprimento_min; comprimento_fator·H); linhas de
//            espacamento_v/2 até H − 0,25, inclinadas para dentro do maciço.
// Junto à divisa nada passa de x_divisa − folga_divisa.

const TOL_SOBRA = 0.1 // m — sobra de altura abaixo disso não ganha caixa (inferido do exemplo v1.7.1)

/** +1 se o lado aberto (frente do muro) é +x no arquivo; −1 se é −x. */
export function direcaoAberta(muro: Pick<MuroEntrada, 'lado_aberto'>): 1 | -1 {
  return muro.lado_aberto === 'fora' ? 1 : -1
}

function limiteDivisa(secao: SecaoEntrada, tipos: MurosTipos): number {
  return secao.x_divisa != null ? secao.x_divisa - (tipos.folga_divisa ?? 0) : Infinity
}

export interface CorpoGerado {
  corpo: XZ[][]
  grampos: [XZ, XZ][]
  dim: SecaoEntrada['dim']
  limitadoPelaDivisa: boolean
}

export function gerarConcreto(muro: MuroEntrada, secao: SecaoEntrada, H: number, t: TiposConcreto, tipos: MurosTipos): CorpoGerado {
  const d = direcaoAberta(muro)
  const [xf, zf] = secao.pe_face
  const topo = muro.espessura
  const parede_base = Math.max(topo, t.parede_base_fator * H)
  const base = Math.max(t.base_min, t.base_fator * H, parede_base + 0.2)
  let ponta = t.ponta_fator * base
  const sapata = Math.max(t.sapata_esp_min, t.sapata_esp_fator * H)
  let talao = base - parede_base - ponta
  const zSap = zf - t.embutimento
  const lim = limiteDivisa(secao, tipos)
  let limitado = false
  // a divisa fica do lado +x: corta a ponta (d = +1) ou o talão (d = −1)
  if (d > 0 && xf + ponta > lim) {
    ponta = Math.max(0, lim - xf)
    limitado = true
  }
  if (d < 0 && xf + parede_base + talao > lim) {
    talao = Math.max(0, lim - xf - parede_base)
    limitado = true
  }
  const xPonta = xf + d * ponta
  const xCostas = xf - d * parede_base
  const xTalao = xCostas - d * talao
  const corpo: XZ[][] = [
    [
      [xPonta, zSap],
      [xPonta, zSap - sapata],
      [xTalao, zSap - sapata],
      [xTalao, zSap],
      [xCostas, zSap],
      [xf - d * topo, zf + H],
      [xf, zf + H],
      [xf, zSap],
    ],
  ]
  const dim: DimConcreto = {
    H,
    base: ponta + parede_base + talao,
    sapata,
    parede_topo: topo,
    parede_base,
    ponta,
    talao,
    embutimento: t.embutimento,
  }
  return { corpo, grampos: [], dim, limitadoPelaDivisa: limitado }
}

export function gerarGabiao(muro: MuroEntrada, secao: SecaoEntrada, H: number, t: TiposGabiao, tipos: MurosTipos): CorpoGerado {
  const d = direcaoAberta(muro)
  const [xf, zf] = secao.pe_face
  const h = t.altura_camada
  const total = H + t.embutimento
  const cheias = Math.floor(total / h + 1e-9)
  const sobra = total - cheias * h
  const alturas = Array<number>(cheias).fill(h)
  if (sobra > TOL_SOBRA) alturas.push(sobra <= 0.5 + 1e-9 ? 0.5 : h)
  let base = Math.ceil((t.base_fator * H) / 0.5 - 1e-9) * 0.5
  const lim = limiteDivisa(secao, tipos)
  let limitado = false
  if (d < 0 && xf + base > lim) {
    base = Math.max(t.largura_topo, lim - xf)
    limitado = true
  }
  let z = zf - t.embutimento
  const corpo: XZ[][] = alturas.map((hc, i) => {
    const w = Math.max(t.largura_topo, base - i * t.recuo_degrau)
    const poly: XZ[] = [[xf, z], [xf - d * w, z], [xf - d * w, z + hc], [xf, z + hc]]
    z += hc
    return poly
  })
  const larguraTopo = Math.max(t.largura_topo, base - (alturas.length - 1) * t.recuo_degrau)
  const dim: DimGabiao = { H, camadas: alturas.length, altura_camada: h, base, topo: larguraTopo, embutimento: t.embutimento }
  return { corpo, grampos: [], dim, limitadoPelaDivisa: limitado }
}

export function gerarGrampeado(muro: MuroEntrada, secao: SecaoEntrada, H: number, t: TiposGrampeado, tipos: MurosTipos): CorpoGerado {
  const d = direcaoAberta(muro)
  const [xf, zf] = secao.pe_face
  const face = t.espessura_face
  const corpo: XZ[][] = [[[xf, zf], [xf, zf + H], [xf + d * face, zf + H], [xf + d * face, zf]]]
  const L0 = Math.max(t.comprimento_min, t.comprimento_fator * H)
  const inc = (t.inclinacao_graus * Math.PI) / 180
  const lim = limiteDivisa(secao, tipos)
  let limitado = false
  const grampos: [XZ, XZ][] = []
  for (let z = zf + t.espacamento_v / 2; z <= zf + H - 0.25 + 1e-9; z += t.espacamento_v) {
    let L = L0
    // o grampo entra no maciço (sentido oposto ao lado aberto)
    const xFim = xf - d * L * Math.cos(inc)
    if (xFim > lim) {
      L = Math.max(0, (lim - xf) / (-d * Math.cos(inc)))
      limitado = true
    }
    grampos.push([[xf, z], [xf - d * L * Math.cos(inc), z - L * Math.sin(inc)]])
  }
  const dim: DimGrampeado = {
    H,
    face,
    grampo: L0,
    linhas_grampos: grampos.length,
    espacamento_h: t.espacamento_h,
    espacamento_v: t.espacamento_v,
    inclinacao: t.inclinacao_graus,
  }
  return { corpo, grampos, dim, limitadoPelaDivisa: limitado }
}

export function gerarCorpo(muro: MuroEntrada, secao: SecaoEntrada, H: number, tipos: MurosTipos): CorpoGerado | null {
  if (muro.tipo === 'concreto' && tipos.concreto) return gerarConcreto(muro, secao, H, tipos.concreto, tipos)
  if (muro.tipo === 'gabiao' && tipos.gabiao) return gerarGabiao(muro, secao, H, tipos.gabiao, tipos)
  if (muro.tipo === 'grampeado' && tipos.grampeado) return gerarGrampeado(muro, secao, H, tipos.grampeado, tipos)
  return null
}

/** Maior distância entre vértices correspondentes do corpo/grampos gerado e o do arquivo (m). */
export function diferencaCorpo(secao: SecaoEntrada, gerado: CorpoGerado): number {
  let dmax = 0
  const cmp = (a: XZ[], b: XZ[]) => {
    if (a.length !== b.length) return Infinity
    let m = 0
    for (let i = 0; i < a.length; i++) m = Math.max(m, Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]))
    return m
  }
  if (secao.corpo.length !== gerado.corpo.length) return Infinity
  for (let i = 0; i < secao.corpo.length; i++) dmax = Math.max(dmax, cmp(secao.corpo[i], gerado.corpo[i]))
  if (secao.grampos.length !== gerado.grampos.length) return Infinity
  for (let i = 0; i < secao.grampos.length; i++) dmax = Math.max(dmax, cmp(secao.grampos[i], gerado.grampos[i]))
  return dmax
}
