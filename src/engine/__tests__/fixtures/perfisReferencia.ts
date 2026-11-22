// Dados transcritos das análises de teste do usuário (miso4slope, 2026-10-27),
// usados como fixture de regressão da correção "comportamento por camada".
import type { FaceCoverage, FillMaterial, FillZone, Layer, SlopeGeometry } from '../../types'

export const geoReferencia: SlopeGeometry = {
  bench_height: 3.5,
  slope_ratio: 1.5,
  berm_width: 2.5,
  berm_slope_pct: 0,
  total_height: 3.5,
  water_table_depth: 0.5,
  gamma_water: 9.81,
  surcharge_q: 20,
}

export const aterroReferencia: FillMaterial = { c: 30, phi: 25, gamma: 18 }
export const coberturaReferencia: FaceCoverage = { type: 'grass', depth: 1.5 }
export const rachaoReferencia: FillZone[] = [
  { name: 'Rachão', anchor: 'base', thickness: 1, compaction_degree: 100, c: 0, phi: 40, gamma: 20 },
]

// Perfil B (com areia entre -1 e -5 m)
export const camadasPerfilB: Layer[] = [
  { name: 'Argila 1', y_top: 0, y_base: -1, c: 20, phi: 0, gamma: 17 },
  { name: 'Areia', y_top: -1, y_base: -5, c: 0, phi: 30, gamma: 17 },
  { name: 'Argila 2', y_top: -5, y_base: -10, c: 12, phi: 0, gamma: 17 },
  { name: 'Argila 3', y_top: -10, y_base: -15.8, c: 15, phi: 0, gamma: 17 },
  { name: 'Areia basal', y_top: -15.8, y_base: -17, c: 0, phi: 32, gamma: 19 },
]

// Perfil A (só argila): igual ao B, mas -1 a -5 com c 15 e φ 0 (φ inferido)
export const camadasPerfilA: Layer[] = camadasPerfilB.map((l, i) => (i === 1 ? { ...l, name: 'Argila 1b', c: 15, phi: 0 } : l))

export const circulos = {
  A: { xc: 3.26, yc: 3.95, R: 13.92 },
  B_drenado: { xc: 3.55, yc: 15.39, R: 29.17 },
  B_naoDrenado: { xc: 3.55, yc: 17.28, R: 31.35 },
}
