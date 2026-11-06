import { useMemo, useRef, useState } from 'react'
import { Download, FileUp, Trash2, ClipboardPaste, Wand2 } from 'lucide-react'
import { usePersistedState } from '../../../lib/persist'
import {
  CATEGORIAS, conferirFuros, cotasDoFuro, linhasCsv, numeroDoFuro, PARAMETROS_PADRAO, sugerirSuporte, textoCsv,
  type FuroSpt, type ParametrosSpt,
} from '../calc'
import { furosDeTexto, ORDEM_PADRAO, TITULOS } from '../entrada'

// Superfícies de sondagem: cola a tabela (Nº, E, N, cota da boca e profundidades
// do boletim) e baixa os 4 CSVs de cota (Top Soil, N.A., Suporte, FIM SPT)
// para criar as superfícies no Civil 3D.

const P = 'miso4slope.sondagemCsv.'
const BTN =
  'flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40'
const f3 = (v: number | null) => (v == null ? '—' : v.toFixed(3))

function baixar(nome: string, texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

export function SuperficiesSptPage() {
  const [furos, setFuros] = usePersistedState<FuroSpt[]>(P + 'furos', [])
  const [param, setParam] = usePersistedState<ParametrosSpt>(P + 'param', PARAMETROS_PADRAO)
  const [msg, setMsg] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const avisos = useMemo(() => conferirFuros(furos, param), [furos, param])
  const erros = avisos.filter((a) => a.nivel === 'erro').length
  const contagem = useMemo(
    () => Object.fromEntries(CATEGORIAS.map((c) => [c.id, linhasCsv(furos, c.id).length])),
    [furos],
  )

  const receber = (texto: string, origem: 'colar' | 'csv', nomeFonte: string) => {
    const r = furosDeTexto(texto, origem)
    if (!r.furos.length) {
      setMsg(`Nada reconhecido em ${nomeFonte}. Confira as colunas: ${ORDEM_PADRAO.map((c) => TITULOS[c]).join(' | ')}.`)
      return
    }
    if (furos.length && !window.confirm(`Substituir os ${furos.length} furos atuais por ${r.furos.length} furos?`)) return
    setFuros(r.furos)
    setMsg(
      `${r.furos.length} furos lidos de ${nomeFonte}${r.comCabecalho ? ' (colunas pelo cabeçalho)' : ' (colunas na ordem padrão)'}` +
        (r.ignoradas ? `; ${r.ignoradas} linha(s) sem identificação ignorada(s)` : '') + '.',
    )
  }

  const colar = async () => {
    try {
      receber(await navigator.clipboard.readText(), 'colar', 'área de transferência')
    } catch {
      setMsg('O navegador não deixou ler a área de transferência. Importe um CSV.')
    }
  }

  const importar = async (arq: File) => receber(await arq.text(), 'csv', arq.name)

  const sugerirTodos = () => {
    let n = 0
    setFuros(
      furos.map((f) => {
        if (f.profSuporte != null || !f.spt.length) return f
        const s = sugerirSuporte(f.spt, param.nMinSuporte)
        if (s == null) return f
        n++
        return { ...f, profSuporte: s }
      }),
    )
    setMsg(`Suporte sugerido pelo SPT (N ≥ ${param.nMinSuporte}) em ${n} furo(s) sem Suporte.`)
  }

  const principais = furos.filter((f) => numeroDoFuro(f.nome) != null).length

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4">
        <h1 className="font-sans text-xl font-bold text-text-primary">Superfícies de sondagem</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Cole a tabela dos furos (Nº, Easting, Northing, cota da boca e as profundidades lidas do boletim). O app calcula as
          cotas e gera os CSVs de Top Soil, N.A., Suporte e FIM SPT para importar no Civil 3D.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <label className="text-xs text-text-secondary">
          N mínimo do Suporte
          <input
            type="number"
            min={1}
            value={param.nMinSuporte}
            onChange={(e) => setParam({ ...param, nMinSuporte: Math.max(1, Number(e.target.value) || 1) })}
            className="mt-1 block w-28 rounded-md border border-border bg-transparent px-2 py-1 text-sm text-text-primary"
          />
        </label>
        <label className="text-xs text-text-secondary">
          Cota da plataforma (m)
          <input
            type="number"
            step="0.01"
            value={param.cotaPlataforma ?? ''}
            onChange={(e) => setParam({ ...param, cotaPlataforma: e.target.value === '' ? null : Number(e.target.value) })}
            className="mt-1 block w-32 rounded-md border border-border bg-transparent px-2 py-1 text-sm text-text-primary"
          />
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const a = e.target.files?.[0]
              if (a) importar(a)
              e.target.value = ''
            }}
          />
          <button className={BTN} onClick={colar}>
            <ClipboardPaste size={14} /> Colar do Excel
          </button>
          <button className={BTN} onClick={() => inputRef.current?.click()}>
            <FileUp size={14} /> Importar CSV
          </button>
          <button className={BTN} onClick={sugerirTodos} disabled={!furos.some((f) => f.profSuporte == null && f.spt.length)}>
            <Wand2 size={14} /> Sugerir Suporte pelo SPT
          </button>
          <button
            className={BTN}
            disabled={!furos.length}
            onClick={() => window.confirm('Limpar todos os furos?') && (setFuros([]), setMsg(null))}
          >
            <Trash2 size={14} /> Limpar
          </button>
        </div>
      </div>

      {msg && <p className="mb-3 text-xs text-text-secondary">{msg}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {CATEGORIAS.map((c) => (
          <div key={c.id} className="rounded-lg border border-border bg-surface p-3">
            <div className="text-sm font-semibold text-text-primary">{c.rotulo}</div>
            <div className="mb-2 text-xs text-text-secondary">
              {contagem[c.id]} de {principais} furos
            </div>
            <button
              className={BTN + ' w-full justify-center'}
              disabled={!contagem[c.id]}
              onClick={() => baixar(c.arquivo, textoCsv(furos, c.id))}
            >
              <Download size={14} /> {c.arquivo}
            </button>
          </div>
        ))}
      </div>
      {erros > 0 && (
        <p className="mb-3 text-xs text-red-500">
          {erros} erro(s) na tabela: os CSVs saem mesmo assim, mas confira antes de importar no Civil 3D.
        </p>
      )}

      {furos.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-text-secondary">
          Nenhum furo ainda. Copie as colunas no Excel e clique em <b>Colar do Excel</b>.
          <br />
          Colunas: {ORDEM_PADRAO.map((c) => TITULOS[c]).join(' | ')}. Pode colar a planilha de avaliação inteira: as colunas
          calculadas são ignoradas.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                {['Furo', 'E', 'N', 'Cota boca', 'Prof. N.A.', 'Esp. Top Soil', 'Prof. Suporte', 'Prof. FIM', 'Cota Top Soil', 'Cota N.A.', 'Cota Suporte', 'Cota FIM', 'Avisos'].map((t) => (
                  <th key={t} className="whitespace-nowrap px-2 py-2 font-medium">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {furos.map((f, i) => {
                const c = cotasDoFuro(f)
                const meus = avisos.filter((a) => a.nome === (f.nome || '(sem nome)'))
                return (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="px-2 py-1.5 font-medium text-text-primary">{f.nome}</td>
                    <td className="px-2 py-1.5">{f3(f.e)}</td>
                    <td className="px-2 py-1.5">{f3(f.n)}</td>
                    <td className="px-2 py-1.5">{f3(f.cotaBoca)}</td>
                    <td className="px-2 py-1.5">{f.seco ? 'Seco' : f3(f.profNA)}</td>
                    <td className="px-2 py-1.5">{f.espTopSoil == null ? 'n/d' : f3(f.espTopSoil)}</td>
                    <td className="px-2 py-1.5">{f3(f.profSuporte)}</td>
                    <td className="px-2 py-1.5">{f3(f.profFimSpt)}</td>
                    <td className="px-2 py-1.5">{f3(c.topsoil)}</td>
                    <td className="px-2 py-1.5">{f3(c.na)}</td>
                    <td className="px-2 py-1.5">{f3(c.suporte)}</td>
                    <td className="px-2 py-1.5">{f3(c.fimSpt)}</td>
                    <td className="px-2 py-1.5">
                      {meus.map((a, k) => (
                        <div key={k} className={a.nivel === 'erro' ? 'text-red-500' : 'text-amber-600'}>
                          {a.texto}
                        </div>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
