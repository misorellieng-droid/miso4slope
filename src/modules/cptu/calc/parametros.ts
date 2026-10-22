import type { OrigemCptu, ParametrosCptu } from './tipos'

/** Valores padrão: os da planilha de referência (aba Parametros). */
export const PARAMETROS_PADRAO: ParametrosCptu = {
  gammaW: 9.81,
  pa: 100,
  Nkt: 14,
  kSigmaP: 0.33,
  hAterro: 2.5,
  gammaAterro: 18,
  q: 20,
  CcN: 0.2,
  CrN: 0.025,
  gammaPadrao: 17,
  gammaMin: 12,
  gammaMax: 21,
  IcArgilaMin: 2.6,
  IcArgilaMax: 3.6,
  MqtnMax: 14,
}

export interface DescricaoParametro {
  chave: keyof ParametrosCptu | 'deltaSigma'
  rotulo: string
  unidade: string
  origem: OrigemCptu
  nota: string
}

/** Descrição de cada parâmetro para a tela (rótulo, unidade e origem). */
export const DESCRICAO_PARAMETROS: DescricaoParametro[] = [
  { chave: 'gammaW', rotulo: 'γ água', unidade: 'kN/m³', origem: 'CONSTANTE', nota: '' },
  { chave: 'pa', rotulo: 'Pressão atmosférica pa', unidade: 'kPa', origem: 'CONSTANTE', nota: '' },
  { chave: 'Nkt', rotulo: 'Nkt (fator de cone para Su)', unidade: '', origem: 'EMPÍRICO', nota: 'Calibrar com palheta (vane)' },
  { chave: 'kSigmaP', rotulo: "k (para σ'p)", unidade: '', origem: 'EMPÍRICO', nota: 'Calibrar com adensamento (oedômetro)' },
  { chave: 'hAterro', rotulo: 'Altura do aterro', unidade: 'm', origem: 'HIPÓTESE', nota: 'Confirmar com a cota final de projeto' },
  { chave: 'gammaAterro', rotulo: 'γ do aterro', unidade: 'kN/m³', origem: 'HIPÓTESE', nota: 'Confirmar com ensaio do material de empréstimo' },
  { chave: 'q', rotulo: 'Sobrecarga q', unidade: 'kPa', origem: 'HIPÓTESE', nota: 'Carga de piso, pavimento ou tráfego' },
  { chave: 'deltaSigma', rotulo: 'Δσ = h × γ + q', unidade: 'kPa', origem: 'CALCULADO', nota: 'Aterro largo: carga igual em toda a profundidade' },
  { chave: 'CcN', rotulo: 'Cc/(1+e0)', unidade: '', origem: 'HIPÓTESE', nota: 'Só o ensaio de adensamento mede' },
  { chave: 'CrN', rotulo: 'Cr/(1+e0)', unidade: '', origem: 'HIPÓTESE', nota: 'Só o ensaio de adensamento mede' },
  { chave: 'gammaPadrao', rotulo: 'γ quando o relatório não traz', unidade: 'kN/m³', origem: 'HIPÓTESE', nota: '' },
  { chave: 'gammaMin', rotulo: 'γ mínimo', unidade: 'kN/m³', origem: 'CRITÉRIO', nota: '' },
  { chave: 'gammaMax', rotulo: 'γ máximo', unidade: 'kN/m³', origem: 'CRITÉRIO', nota: '' },
  { chave: 'IcArgilaMin', rotulo: 'Ic mínimo de argila (vale Su)', unidade: '', origem: 'CRITÉRIO', nota: 'Inclusivo' },
  { chave: 'IcArgilaMax', rotulo: 'Ic máximo de argila (vale Su)', unidade: '', origem: 'CRITÉRIO', nota: 'Exclusivo' },
  { chave: 'MqtnMax', rotulo: 'Teto do Qtn no módulo M', unidade: '', origem: 'EMPÍRICO', nota: '' },
]

/** Δσ = hAterro × γ aterro + q (aterro largo). */
export function deltaSigma(p: ParametrosCptu): number {
  return p.hAterro * p.gammaAterro + p.q
}
