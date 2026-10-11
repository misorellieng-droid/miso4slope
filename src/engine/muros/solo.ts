import { soilAt, type SoilParams } from '../soil'
import type { FillMaterial, Layer, Point } from '../types'
import { paraMotor, type ModeloSecao } from './entrada'
import { zEmX } from './geometria2d'
import type { XZ } from './tipos'

// Solo de um muro: vem de uma análise salva do projeto ou de uma sondagem,
// escolhida na tela de importação (e trocável muro a muro). As camadas do
// miso4slope estão num referencial relativo (pé do talude daquela análise =
// 0, ou profundidade abaixo do terreno local); aqui elas são levadas para a
// cota absoluta da seção do Civil 3D e daí para o referencial do motor.

export interface SoloMuro {
  fonte: string                // descrição legível ("Análise SP-10 (projeto X)", "Sondagem SP-03")
  layers: Layer[]              // como estão na fonte (y relativo a refCota; depth_* relativo ao terreno local)
  refCota: number | null       // cota absoluta que corresponde a y=0 da fonte (cota do pé da análise)
  naProfundidade: number | null // N.A. abaixo de refCota (análise) ou do terreno local (sondagem sem cota)
  naCota: number | null        // N.A. em cota absoluta, quando conhecido diretamente
  fill: FillMaterial | null    // material do aterro (só a análise traz; na sondagem vem dos parâmetros)
  gammaWater: number
  avisos: string[]
}

/** Solo a partir de uma análise salva (snapshot do AnalysisPage). */
export function soloDeAnalise(
  nome: string,
  snap: { geometry: { toe_elevation?: number; water_table_depth: number; gamma_water?: number }; layers: Layer[]; fill: FillMaterial; fillZones?: unknown[] }
): SoloMuro {
  const avisos: string[] = []
  const refCota = snap.geometry.toe_elevation ?? null
  const temCota = snap.layers.some((l) => l.depth_top == null && l.depth_base == null) || snap.layers.some((l) => l.sondagem_collar != null)
  if (refCota == null && temCota) {
    avisos.push(
      'A análise não tem "cota do pé" — camadas por cota relativa e o N.A. foram posicionados tomando o terreno no pé da face do muro como y=0.'
    )
  }
  if (snap.fillZones && snap.fillZones.length) {
    avisos.push('Zonas de compactação diferenciada da análise foram ignoradas — o aterro usa o material do corpo.')
  }
  return {
    fonte: nome,
    layers: snap.layers.map(({ sondagem_x: _x, ...l }) => l), // x do furo está no referencial da outra análise
    refCota,
    naProfundidade: snap.geometry.water_table_depth,
    naCota: null,
    fill: snap.fill,
    gammaWater: snap.geometry.gamma_water ?? 9.81,
    avisos,
  }
}

/** Solo a partir de uma sondagem salva (camadas por profundidade abaixo da boca). */
export function soloDeSondagem(
  nome: string,
  sondagem: { cota_terreno: number | null; na_profundidade: number | null },
  layers: Layer[],
  aterro: FillMaterial | null
): SoloMuro {
  const avisos: string[] = []
  avisos.push('Camadas da sondagem medidas como profundidade abaixo do terreno natural de cada seção (como na Nova Análise).')
  let naCota: number | null = null
  let naProfundidade: number | null = null
  if (sondagem.na_profundidade != null) {
    if (sondagem.cota_terreno != null) naCota = sondagem.cota_terreno - sondagem.na_profundidade
    else {
      naProfundidade = sondagem.na_profundidade
      avisos.push('Sondagem sem cota da boca — N.A. tomado como profundidade abaixo do terreno no pé da face do muro.')
    }
  }
  return { fonte: nome, layers, refCota: null, naProfundidade, naCota, fill: aterro, gammaWater: 9.81, avisos }
}

/** Solo pronto para uma seção, no referencial do motor. */
export interface SoloSecao {
  layers: Layer[]
  fill: FillMaterial | null
  refTerrain: Point[]
  waterY: number   // −∞ (sem N.A.) ou y do N.A. no motor
  gammaWater: number
  /** Material no ponto (x', y) do motor. */
  materialEm(x: number, y: number): SoilParams
}

/**
 * Leva o solo para a seção. condicao 'corte' descarta o aterro (tudo abaixo
 * do terreno natural é solo natural, como no modo corte da Nova Análise).
 */
export function soloParaSecao(
  solo: SoloMuro,
  modelo: ModeloSecao,
  condicao: 'aterro' | 'corte',
  peFaceArquivo: XZ
): SoloSecao {
  // cota que corresponde ao y=0 da fonte
  const zTerrenoPe = zEmX(paraMotor(modelo, peFaceArquivo).x, modelo.terreno) + modelo.zDatum
  const refZ = solo.refCota ?? zTerrenoPe
  const shift = refZ - modelo.zDatum // y_motor = y_fonte + shift

  const layers: Layer[] = solo.layers.map((l) => ({
    ...l,
    y_top: l.y_top != null ? l.y_top + shift : undefined,
    y_base: l.y_base != null ? l.y_base + shift : undefined,
    sondagem_collar: l.sondagem_collar != null ? l.sondagem_collar + shift : undefined,
  }))

  let waterY = -Infinity
  if (solo.naCota != null) waterY = solo.naCota - modelo.zDatum
  else if (solo.naProfundidade != null) waterY = shift - solo.naProfundidade

  const fill = condicao === 'aterro' ? solo.fill : null
  const refTerrain = modelo.terreno

  return {
    layers,
    fill,
    refTerrain,
    waterY,
    gammaWater: solo.gammaWater,
    materialEm: (x, y) => soilAt(x, y, layers, fill, undefined, refTerrain),
  }
}
