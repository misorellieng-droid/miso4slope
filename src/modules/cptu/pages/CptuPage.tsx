import { useCallback, useMemo } from 'react'
import { usePersistedState } from '../../../lib/persist'
import type { FuroCptu, LeituraCptu, ParametrosCptu } from '../calc/tipos'
import { AbaFuros } from '../components/AbaFuros'
import { AbaLeituras } from '../components/AbaLeituras'
import { AbaParametros } from '../components/AbaParametros'
import { BarraAnaliseCptu } from '../components/BarraAnaliseCptu'
import { analiseNova, type EstadoAnaliseCptu } from '../estado'
import { opcoesDeDb, parametrosDeDb, premissasTempoDeDb } from '../serializacao'

// Módulo de interpretação de CPTu. Reproduz a planilha de referência
// CPTu_01a10_com_formulas.xlsx. A análise em edição fica no navegador
// (rascunho) até ser salva no projeto e na revisão ativos.

const P = 'miso4slope.cptu.'

type Aba = 'parametros' | 'furos' | 'leituras'
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'parametros', rotulo: 'Parâmetros' },
  { id: 'furos', rotulo: 'Furos' },
  { id: 'leituras', rotulo: 'Leituras' },
]

/** Rascunho salvo por uma versão antiga ganha os campos novos com o padrão. */
function normalizarRascunho(e: EstadoAnaliseCptu): EstadoAnaliseCptu {
  return {
    ...analiseNova(),
    ...e,
    parametros: parametrosDeDb(e.parametros),
    premissasTempo: premissasTempoDeDb(e.premissasTempo),
    opcoes: opcoesDeDb(e.opcoes),
    furos: Array.isArray(e.furos) ? e.furos : [],
    removidos: Array.isArray(e.removidos) ? e.removidos : [],
  }
}

export function CptuPage() {
  const [rascunho, setRascunho] = usePersistedState<EstadoAnaliseCptu>(P + 'rascunho', analiseNova())
  const [alterado, setAlterado] = usePersistedState(P + 'alterado', false)
  const [aba, setAba] = usePersistedState<Aba>(P + 'aba', 'parametros')
  const [furoIndice, setFuroIndice] = usePersistedState(P + 'furo', 0)

  const atual = useMemo(() => normalizarRascunho(rascunho), [rascunho])
  const indiceValido = Math.min(furoIndice, Math.max(0, atual.furos.length - 1))

  const editar = useCallback(
    (fn: (e: EstadoAnaliseCptu) => EstadoAnaliseCptu) => {
      setRascunho((e) => fn(normalizarRascunho(e)))
      setAlterado(true)
    },
    [setRascunho, setAlterado],
  )

  const atualizarLeituras = useCallback(
    (fn: (ls: LeituraCptu[]) => LeituraCptu[]) =>
      editar((e) => ({
        ...e,
        furos: e.furos.map((f, i) => (i === indiceValido ? { ...f, leituras: fn(f.leituras) } : f)),
      })),
    [editar, indiceValido],
  )

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4">
        <h1 className="font-sans text-xl font-bold text-text-primary">Interpretação de CPTu</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Digite, cole ou importe as leituras do ensaio; o app calcula σv0, Ic, Su, OCR, M e o recalque sob o aterro, como a planilha de referência.
        </p>
      </div>

      <BarraAnaliseCptu
        estado={atual}
        alterado={alterado}
        aoTrocar={(e) => {
          setRascunho(e)
          setAlterado(false)
          setFuroIndice(0)
        }}
        aoSalvar={(id, nome, idsFuros) => {
          setRascunho((e) => ({
            ...e,
            id,
            nome,
            removidos: [],
            furos: e.furos.map((f, i) => ({ ...f, id: idsFuros[i] || f.id })),
          }))
          setAlterado(false)
        }}
      />

      <div className="mb-4 flex w-fit rounded-md border border-border bg-surface p-0.5">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`rounded px-4 py-1.5 text-sm font-medium ${aba === a.id ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'}`}
          >
            {a.rotulo}
            {a.id === 'furos' && atual.furos.length > 0 && <span className="ml-1.5 font-mono text-xs opacity-80">{atual.furos.length}</span>}
          </button>
        ))}
      </div>

      {aba === 'parametros' && (
        <AbaParametros parametros={atual.parametros} onChange={(p: ParametrosCptu) => editar((e) => ({ ...e, parametros: p }))} />
      )}

      {aba === 'furos' && (
        <AbaFuros
          furos={atual.furos}
          parametros={atual.parametros}
          onChange={(furos: FuroCptu[], removidoId?: string) =>
            editar((e) => ({ ...e, furos, removidos: removidoId ? [...e.removidos, removidoId] : e.removidos }))
          }
          aoAbrirLeituras={(i) => {
            setFuroIndice(i)
            setAba('leituras')
          }}
        />
      )}

      {aba === 'leituras' && (
        <AbaLeituras
          furos={atual.furos}
          indice={indiceValido}
          parametros={atual.parametros}
          aoEscolherFuro={setFuroIndice}
          atualizarLeituras={atualizarLeituras}
        />
      )}
    </div>
  )
}
