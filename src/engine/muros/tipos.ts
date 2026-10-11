// Tipos da verificação de muros (integração com o ME-DYN-TALUDE, Civil 3D).
//
// Entrada: <nome>_muros_secoes.json, um por platô, gerado pelo ME-DYN-TALUDE.
// Saída:   <nome>_muros_verificacao.json, lido pelo ME-DYN-TALUDE na rodada
//          seguinte. Os nomes de parâmetro em "sugestao" são exatamente os
//          do ME-DYN-TALUDE.
//
// Convenção do arquivo de entrada: x = distância horizontal (m) a partir do
// limite do platô, positiva para fora, na seção perpendicular à base do
// muro; z = cota absoluta (m), a mesma do Civil 3D.

export type XZ = [number, number]

export type TipoMuro = 'concreto' | 'gabiao' | 'grampeado'

export interface DimConcreto {
  H: number
  base: number
  sapata: number
  parede_topo: number
  parede_base: number
  ponta: number
  talao: number
  embutimento: number
}

export interface DimGabiao {
  H: number
  camadas: number
  altura_camada: number
  base: number
  topo: number
  embutimento: number
}

export interface DimGrampeado {
  H: number
  face: number
  grampo: number
  linhas_grampos: number
  espacamento_h: number
  espacamento_v: number
  inclinacao: number
}

export interface SecaoEntrada {
  s: number           // estaca/progressiva da seção (m)
  H: number           // altura do muro acima do terreno do lado aberto (m)
  talude: XZ[]        // linha de projeto da seção
  terreno: XZ[]       // terreno natural na mesma seção
  corpo: XZ[][]       // polígonos do corpo do muro
  grampos: [XZ, XZ][] // só no grampeado: [cabeça na face, ponta no maciço]
  dim: Partial<DimConcreto & DimGabiao & DimGrampeado>
  pe_face: XZ         // pé da face do muro no terreno do lado aberto
  x_divisa?: number | null
}

export interface MuroEntrada {
  id: string
  tipo: TipoMuro
  condicao: 'aterro' | 'corte'
  posicao: 'pe' | 'crista'
  junto: 'divisa' | 'plato'
  talude_h_por_v: number
  face_h_por_v: number
  espessura: number
  recuo?: number
  lado_aberto: 'fora' | 'plato'
  secoes: SecaoEntrada[]
}

export interface TiposConcreto {
  base_fator: number
  base_min: number
  ponta_fator: number
  sapata_esp_fator: number
  sapata_esp_min: number
  parede_base_fator: number
  embutimento: number
  taxa_aco_kg_m3?: number
}

export interface TiposGabiao {
  altura_camada: number
  largura_topo: number
  base_fator: number
  recuo_degrau: number
  embutimento: number
}

export interface TiposGrampeado {
  espessura_face: number
  espacamento_h: number
  espacamento_v: number
  comprimento_fator: number
  comprimento_min: number
  inclinacao_graus: number
  taxa_tela_kg_m2?: number
}

export interface MurosTipos {
  concreto?: TiposConcreto
  gabiao?: TiposGabiao
  grampeado?: TiposGrampeado
  folga_divisa?: number
}

export interface MurosSecoesArquivo {
  versao: number
  plato: string
  convencao?: string
  muros_tipos?: MurosTipos
  muros: MuroEntrada[]
}

// ---------------------------------------------------------------------------
// Parâmetros de cálculo (editáveis na tela; valores padrão em PARAMETROS_PADRAO)

export type MetodoEmpuxo = 'rankine' | 'coulomb'

export interface ParametrosMuros {
  n_fatias: number
  gama_concreto: number        // kN/m³
  gama_gabiao: number          // kN/m³ (pedra + vazios)
  metodo_empuxo: MetodoEmpuxo
  delta_coulomb_fator: number  // δ = fator × φ' no plano virtual (só Coulomb)
  sobrecarga: number           // kPa, no terreno do lado retido
  atrito_base_fator: number    // δ_base = fator × φ' do solo de fundação
  adesao_base_fator: number    // c_a = fator × c' do solo de fundação
  considerar_passivo: boolean  // empuxo passivo do embutimento na frente
  tensao_admissivel: number    // kPa, na base
  fs_global_min: number        // NBR 11682
  fs_tombamento_min: number
  fs_deslizamento_min: number
  // grampeado
  qs_grampo: number            // resistência ao arrancamento por metro de grampo (kN/m)
  t_barra: number              // resistência à tração do grampo (kN)
  lambda_grampo: number        // T_max = λ·Ka·γ·H·Sh·Sv (envoltória FHWA)
  fs_arrancamento_min: number
  // sugestões
  inclinacoes_teste: number[]  // H:V testados para o talude junto ao muro
}

export const PARAMETROS_PADRAO: ParametrosMuros = {
  n_fatias: 30,
  gama_concreto: 25,
  gama_gabiao: 17,
  metodo_empuxo: 'rankine',
  delta_coulomb_fator: 2 / 3,
  sobrecarga: 0,
  atrito_base_fator: 2 / 3,
  adesao_base_fator: 0,
  considerar_passivo: false,
  tensao_admissivel: 200,
  fs_global_min: 1.5,
  fs_tombamento_min: 2.0,
  fs_deslizamento_min: 1.5,
  qs_grampo: 30,
  t_barra: 120,
  lambda_grampo: 0.75,
  fs_arrancamento_min: 2.0,
  inclinacoes_teste: [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0],
}

// ---------------------------------------------------------------------------
// Saída (<nome>_muros_verificacao.json)

export interface FsSaida {
  global: number | null
  tombamento?: number | null
  deslizamento?: number | null
  arrancamento?: number | null
}

export interface SugestaoSaida {
  talude_h_por_v?: number
  muros_tipos?: {
    concreto?: Partial<Pick<TiposConcreto, 'base_fator' | 'ponta_fator' | 'sapata_esp_fator' | 'parede_base_fator' | 'embutimento'>>
    gabiao?: Partial<Pick<TiposGabiao, 'base_fator' | 'altura_camada' | 'recuo_degrau'>>
    grampeado?: Partial<Pick<TiposGrampeado, 'comprimento_fator' | 'espacamento_h' | 'espacamento_v'>>
  }
}

export interface SecaoSaida {
  s: number
  H: number
  ok: boolean
  fs: FsSaida
}

export interface MuroSaida {
  id: string
  ok: boolean
  fs: FsSaida
  sugestao: SugestaoSaida
  secao_critica: number
  avisos: string[]
  secoes: SecaoSaida[]
}

export interface MurosVerificacaoArquivo {
  versao: 1
  plato: string
  gerado_em: string
  muros: MuroSaida[]
}
