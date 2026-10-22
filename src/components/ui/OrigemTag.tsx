import type { Origem as OrigemZona } from '../../engine/zonaFundacao'

// CONSTANTE e CRITÉRIO entraram com o módulo CPTu
type Origem = OrigemZona | 'CONSTANTE' | 'CRITÉRIO'

const COR: Record<Origem, string> = {
  LIDO: 'border-accent-blue/50 text-accent-blue',
  CALCULADO: 'border-accent-green/50 text-accent-green',
  EMPÍRICO: 'border-accent-amber/50 text-accent-amber',
  HIPÓTESE: 'border-accent-red/50 text-accent-red',
  CONSTANTE: 'border-text-secondary/40 text-text-secondary',
  CRITÉRIO: 'border-text-primary/30 text-text-primary',
}

const DICA: Record<Origem, string> = {
  LIDO: 'Valor informado por você ou lido dos dados lançados',
  CALCULADO: 'Resultado calculado pelo motor',
  EMPÍRICO: 'Correlação empírica: calibrar com ensaio',
  HIPÓTESE: 'Valor assumido: precisa ser confirmado por você',
  CONSTANTE: 'Constante física ou da teoria',
  CRITÉRIO: 'Critério de cálculo adotado',
}

export function OrigemTag({ origem }: { origem: Origem }) {
  return (
    <span
      title={DICA[origem]}
      className={`ml-1 inline-block rounded border px-1 py-px align-middle font-sans text-[9px] font-semibold uppercase leading-none ${COR[origem]}`}
    >
      {origem}
    </span>
  )
}
