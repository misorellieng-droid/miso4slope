// Tipos do motor de cálculo de estabilidade de taludes (Bishop Simplificado).
// Todas as elevações y são relativas ao pé do talude (y=0), positivo para cima.

export interface Point {
  x: number
  y: number
}

export type SoilClass = 'granular' | 'coesivo'

export interface Layer {
  id?: string
  name: string
  y_top?: number       // elevação do topo (m), relativo ao pé=0 — usado quando depth_top não informado
  y_base?: number      // elevação da base (m), negativo = fundação — usado quando depth_base não informado
  c: number            // coesão efetiva (kPa)
  phi: number           // ângulo de atrito efetivo (graus)
  gamma: number        // peso específico (kN/m³)
  n_spt?: number       // N_SPT de referência (golpes), se c/phi/gamma vieram de correlação
  soil_class?: SoilClass // granular ou coesivo, usado na correlação a partir do N_SPT
  depth_top?: number   // profundidade do topo abaixo do terreno natural local (m) — se definido, tem prioridade sobre y_top
  depth_base?: number  // profundidade da base abaixo do terreno natural local (m) — se definido, tem prioridade sobre y_base
  sondagem_x?: number  // posição x (m, mesmo referencial do perfil, pé=0) do furo de sondagem que originou esta
                        // camada — informação geral do furo (a mesma para todas as camadas que vieram dele),
                        // não um dado por camada; usada como referência de posição e, na ausência de
                        // sondagem_collar, como x fixo pra avaliar o terreno natural (ver layerReferenceGround)
  sondagem_collar?: number // cota absoluta da boca do furo (m) — medida real e pontual do furo, que não precisa
                        // bater com o terreno natural informado (uma generalização/aproximação do perfil); quando
                        // definida, tem prioridade sobre o terreno natural pra medir depth_top/depth_base, e a
                        // camada vira uma faixa reta nessa cota, independente do formato do terreno em outro ponto
}

export interface FillMaterial {
  c: number
  phi: number
  gamma: number
  compaction_degree?: number // GC (%), se c/phi/gamma vieram do material de referência
}

// Material de referência do aterro, com c'/φ'/γ obtidos a 100% do grau de
// compactação (ensaio de laboratório na energia de projeto, ou por
// correlação com N_SPT da jazida). A partir dele, o corpo do aterro e as
// zonas de compactação diferenciada calculam seus próprios c'/φ'/γ conforme
// o GC efetivamente especificado para cada uma.
export interface CompactionReference {
  c: number
  phi: number
  gamma: number
  n_spt?: number         // N_SPT da jazida, se c/phi/gamma vieram de correlação
  soil_class?: SoilClass // granular ou coesivo, usado na correlação a partir do N_SPT
}

// Zona de compactação diferenciada perto da plataforma (ex.: últimas
// camadas de aterro, compactadas a um GC mais alto que o corpo). Medida por
// espessura a partir do topo da zona anterior (ou da plataforma, na primeira).
export interface FillZone {
  id?: string
  name: string
  thickness: number         // espessura desta zona (m)
  compaction_degree: number // GC (%)
  c: number
  phi: number
  gamma: number
}

export type CoverageType = 'none' | 'grass' | 'shrub' | 'rigid'

export interface FaceCoverage {
  type: CoverageType
  depth: number // profundidade da zona de influência a partir da face (m)
}

export interface SlopeGeometry {
  bench_height: number       // altura por bancada (m)
  slope_ratio: number        // fator H:V (ex: 1.5 para 1:1,5)
  berm_width: number         // largura da berma (m)
  berm_slope_pct?: number    // declividade da berma (%) — positivo sobe (para dentro), negativo desce
                              // (para fora, drenagem); 0/indefinido = berma plana (padrão)
  total_height: number       // altura total do aterro (m)
  water_table_depth: number  // profundidade do NA abaixo do pé (m)
  gamma_water?: number       // peso esp. da água (padrão: 9.81)
  toe_elevation?: number     // cota absoluta do pé do talude (m), datum para importar sondagens
  min_arc_width?: number               // largura mínima (m) da superfície de ruptura; descarta mecanismos locais (padrão 3 m)
  curtains?: CurtainForce[]            // cortinas de estacas: força T aplicada onde a ruptura cruza a cortina
  improvement?: ImprovementStrip[]     // faixas de solo melhorado (colunas CMC/brita), na fundação
  reinforcement?: ReinforcementLayer[] // geossintéticos horizontais (colchão sobre colunas ou na base do aterro)
  surcharge_q?: number       // sobrecarga uniforme na plataforma (kPa); 0/indefinido = sem sobrecarga
  surcharge_width?: number   // extensão carregada a partir da crista (m); indefinido = toda a plataforma
  analysis_condition?: AnalysisCondition // padrão: 'drained' (comportamento original)
  ru?: number                // razão de poropressão (u/γh), só na condição drenada; > 0 substitui o N.A.
  natural_terrain?: Point[]  // perfil real do terreno natural (x,y relativos ao pé=0,0), substitui o
                              // trecho plano padrão e serve de referência de profundidade para camadas
                              // com depth_top/depth_base (aterro/fundação separados por essa superfície,
                              // não mais por y=0)
}

// Drenada (longo prazo): c', φ' e poropressão (N.A. ou ru). Não drenada (fim de
// construção): análise em tensões totais — c = su, φ = 0, sem poropressão.
export type AnalysisCondition = 'drained' | 'undrained'

// Faixa de solo melhorado por colunas: dentro do retângulo (x, y) o solo é
// tratado como material composto (solo + colunas), pela razão de área
// m = A_coluna / A_malha. 'brita': coluna granular (atrito, com concentração
// de tensão n); 'cmc': coluna rígida de concreto, com resistência ao
// cisalhamento tau (kPa) mobilizável na superfície de ruptura.
export interface ImprovementStrip {
  x_start: number
  x_end: number
  y_top: number
  y_base: number
  kind: 'brita' | 'cmc'
  area_ratio: number     // m, 0 a 1
  gamma_col: number      // kN/m³
  phi_col?: number       // graus (brita)
  n_stress?: number      // razão de concentração de tensão coluna/solo (brita)
  tau_col?: number       // kPa (cmc)
}

// Cortina de estacas em x: se a superfície de ruptura a cruza entre y_tip e
// y_top, passa a atuar uma força horizontal T (kN/m de cortina) que resiste ao
// movimento da massa. Círculos que passam abaixo da ponta não a mobilizam.
export interface CurtainForce {
  x: number
  T: number
  y_top: number
  y_tip: number
}

// Reforço horizontal em y = y; atua onde a superfície de ruptura o cruza no
// lado da massa que escorrega (x_end), com ancoragem a partir daí até x_end.
export interface ReinforcementLayer {
  y: number
  x_start: number
  x_end: number
  T: number              // resistência de projeto à tração (kN/m)
  mu?: number            // coeficiente de interação solo-reforço (arrancamento), padrão 0,6
  gamma_cover?: number   // γ do material sobre o reforço, padrão 18 kN/m³
}

export interface CircleParams {
  xc: number
  yc: number
  R: number
}

// Um trecho de material dentro da altura de uma fatia — usado para colorir
// no croqui exatamente as camadas/zonas/aterro que aquela fatia atravessa,
// na ordem em que aparecem (topo→base).
export interface MaterialSegment {
  key: string    // 'layer:<índice>', 'zone:<índice>', 'fill' ou 'none' — mesmo índice usado para colorir a camada no desenho geral
  name: string
  height: number // espessura exata deste trecho dentro da fatia (m)
}

export interface SliceResult {
  index: number
  xm: number
  y_top: number
  y_base: number
  h: number
  h_aterro: number     // parcela da altura acima do terreno natural (material do aterro)
  h_fundacao: number   // parcela da altura abaixo do terreno natural (material da fundação)
  materialSegments: MaterialSegment[] // decomposição exata da altura por material (para o croqui)
  c: number
  phi: number
  gamma: number
  b: number
  L: number             // comprimento da base da fatia ao longo do arco (b/cosα)
  W: number
  W_aterro: number      // parcela do peso vinda do material de aterro
  W_fundacao: number    // parcela do peso vinda do material de fundação
  W_sobrecarga?: number // parcela do peso vinda da sobrecarga na plataforma (q × largura carregada da fatia)
  alpha_rad: number
  alpha_deg: number
  u: number
  cb: number                   // c' × comprimento da base (b no Bishop, L no Fellenius)
  w_u_tanphi: number           // (W - u×comprimento da base) × tan(φ')
  w_sin_alpha: number          // W × sen(α)
  m_alpha: number
  numerator_term: number
}

export type StabilityMethod = 'bishop' | 'fellenius'

// Aterro: talude construído com material importado (FillMaterial) sobre a
// fundação natural. Corte: talude escavado direto no terreno natural — não
// há material importado, a face exposta e tudo abaixo dela são as próprias
// camadas (layers) já cadastradas. A mesma geometria construtiva (bancadas/
// bermas, perfil de terreno natural) serve para os dois modos; o que muda é
// só se um FillMaterial é considerado no cálculo (aterro) ou não (corte).
export type AnalysisMode = 'aterro' | 'corte'

export interface AnalysisResult {
  FS: number
  circle: CircleParams
  slices: SliceResult[]
  x_left: number
  x_right: number
  converged: boolean
  iterations: number
  is_adequate: boolean         // FS >= fs_min_nbr (1.5)
  fs_min_nbr: number           // critério NBR 11682
  method: StabilityMethod
  condition?: AnalysisCondition
  surcharge_q?: number
  surcharge_x_start?: number
  surcharge_x_end?: number
  // círculo desce abaixo da base da última camada definida: o material ali é
  // desconhecido (o cálculo assume o da última camada) — nunca ignorar
  crosses_base?: boolean
  y_min?: number               // cota mais baixa do arco entre as fatias (m)
  base_y?: number | null       // cota da base do perfil definido (m); null = indefinida
  // preenchidos só pela busca automática
  worst_circles?: WorstCircle[]
  search_warnings?: string[]
}

export interface WorstCircle {
  rank: number
  circle: CircleParams
  FS: number
  x_left: number
  x_right: number
}

// Camada extraída de um boletim de sondagem (SPT), em profundidade relativa
// à boca do furo — antes de converter para o datum de elevação do talude.
export interface SondagemLayer {
  depth_top: number    // profundidade do topo (m, positiva, a partir da boca do furo)
  depth_base: number   // profundidade da base (m, positiva)
  description: string  // descrição do material, como consta no boletim
  n_spt: number         // N_SPT representativo da camada (golpes)
  soil_class: SoilClass // inferido da descrição, revisável
}

export interface SondagemExtractionResult {
  layers: SondagemLayer[]
  water_table_depth?: number // profundidade do N.A. abaixo da boca do furo (m), se identificado
  source_note: string          // rastreabilidade: como o dado foi obtido (ex.: "extração simulada")
}
