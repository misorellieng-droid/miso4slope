import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, FileUp, Plus, Table2, Trash2 } from 'lucide-react'
import type { CabecalhoFuro, FuroCptu, ParametrosCptu } from '../calc/tipos'
import { conferirFuro } from '../entrada'
import { furoNovo, mesclarFuros, proximoNomeFuro } from '../estado'
import { importarArquivo } from '../importacao'
import { CelulaNumero } from './CelulaNumero'

// Lista de furos com o cabeçalho de cada CPTu, editável como planilha.

const BTN =
  'flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40'

type CampoNum = 'NA' | 'profApoio' | 'espArgilaMole' | 'profTotal' | 'recalqueGuia' | 'E' | 'N' | 'cotaBoca'

const CAMPOS: { chave: CampoNum | 't50'; titulo: string; dica: string; obrigatorio?: boolean }[] = [
  { chave: 'NA', titulo: 'N.A. (m)', dica: 'Nível d\'água lido no cabeçalho do relatório', obrigatorio: true },
  { chave: 'profApoio', titulo: 'Apoio (m)', dica: 'Topo da areia de apoio: limite da soma do recalque', obrigatorio: true },
  { chave: 'espArgilaMole', titulo: 'Argila mole (m)', dica: 'Espessura de argila mole (entra no t90)', obrigatorio: true },
  { chave: 'profTotal', titulo: 'Prof. total (m)', dica: 'Profundidade final do ensaio' },
  { chave: 'recalqueGuia', titulo: 'Guia (m)', dica: 'Recalque de referência do guia, só para comparar' },
  { chave: 't50', titulo: 't50 (s)', dica: 'Ensaio de dissipação, quando houver' },
  { chave: 'E', titulo: 'E (m)', dica: 'Coordenada leste (opcional)' },
  { chave: 'N', titulo: 'N (m)', dica: 'Coordenada norte (opcional)' },
  { chave: 'cotaBoca', titulo: 'Cota boca (m)', dica: 'Cota da boca do furo (opcional)' },
]

interface Props {
  furos: FuroCptu[]
  parametros: ParametrosCptu
  onChange: (furos: FuroCptu[], removidoId?: string) => void
  aoAbrirLeituras: (indice: number) => void
}

export function AbaFuros({ furos, parametros, onChange, aoAbrirLeituras }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const mudarCabecalho = (i: number, campo: keyof CabecalhoFuro, v: string | number | null) => {
    const novos = [...furos]
    novos[i] = { ...novos[i], cabecalho: { ...novos[i].cabecalho, [campo]: v } }
    onChange(novos)
  }

  const mudarT50 = (i: number, v: number | null) => {
    const novos = [...furos]
    novos[i] = { ...novos[i], t50: v }
    onChange(novos)
  }

  const mover = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= furos.length) return
    const novos = [...furos]
    ;[novos[i], novos[j]] = [novos[j], novos[i]]
    onChange(novos)
  }

  const remover = (i: number) => {
    const f = furos[i]
    const texto = f.leituras.length
      ? `Remover o furo ${f.cabecalho.nome} e as ${f.leituras.length} leituras? Só sai do banco quando você salvar.`
      : `Remover o furo ${f.cabecalho.nome}?`
    if (!window.confirm(texto)) return
    onChange(furos.filter((_, k) => k !== i), f.id ?? undefined)
  }

  const importar = async (arquivo: File) => {
    setMsg(null)
    try {
      const r = await importarArquivo(arquivo)
      if (r.tipo === 'furos') {
        const { furos: novos, substituidos } = mesclarFuros(furos, r.furos)
        if (substituidos.length && !window.confirm(`Substituir as leituras e o cabeçalho de ${substituidos.join(', ')}?`)) return
        onChange(novos)
        setMsg(`${r.furos.length} furo(s) importado(s) de ${arquivo.name}${substituidos.length ? ` (${substituidos.length} substituído(s))` : ''}.`)
      } else {
        const nome = proximoNomeFuro(furos)
        onChange([...furos, { ...furoNovo(nome), leituras: r.leituras }])
        setMsg(`Furo ${nome} criado com ${r.leituras.length} leituras de ${arquivo.name}. Preencha o cabeçalho.`)
      }
    } catch (e) {
      setMsg(`Não foi possível importar: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold text-text-primary">Furos</h2>
          <p className="text-xs text-text-secondary">
            Cabeçalho de cada CPTu. Importar aceita a planilha de referência (todos os furos de uma vez), XLSX ou CSV.
          </p>
        </div>
        {msg && <span className="text-xs text-text-secondary">{msg}</span>}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importar(f)
            e.target.value = ''
          }}
        />
        <button className={BTN} onClick={() => inputRef.current?.click()}>
          <FileUp size={14} /> Importar
        </button>
        <button className={BTN} onClick={() => onChange([...furos, furoNovo(proximoNomeFuro(furos))])}>
          <Plus size={14} /> Novo furo
        </button>
      </div>

      {furos.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-text-secondary">
          Nenhum furo ainda. Clique em <b>Novo furo</b> ou <b>Importar</b>.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-secondary">
                <th className="px-2 py-2 font-medium">Furo</th>
                {CAMPOS.map((c) => (
                  <th key={c.chave} title={c.dica} className="px-2 py-2 font-medium whitespace-nowrap">
                    {c.titulo}
                    {c.obrigatorio && <span className="text-accent-red">*</span>}
                  </th>
                ))}
                <th className="px-2 py-2 font-medium whitespace-nowrap">Leituras</th>
                <th className="px-2 py-2 font-medium">Conferência</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {furos.map((f, i) => {
                const zs = f.leituras.map((l) => l.z).filter(Number.isFinite)
                const av = conferirFuro(f, parametros)
                const erros = av.filter((a) => a.nivel === 'erro').length
                const avisos = av.length - erros
                return (
                  <tr key={f.id ?? `novo-${i}`} className="border-b border-border/60 last:border-0 hover:bg-elevated/40">
                    <td className="px-2 py-1">
                      <input
                        aria-label="Nome do furo"
                        value={f.cabecalho.nome}
                        onChange={(e) => mudarCabecalho(i, 'nome', e.target.value)}
                        className="w-24 rounded bg-transparent px-1.5 py-0.5 font-medium text-text-primary focus:bg-white focus:outline focus:outline-1 focus:outline-brand"
                      />
                    </td>
                    {CAMPOS.map((c) => (
                      <td key={c.chave} className="px-1 py-1">
                        <div className="w-20">
                          <CelulaNumero
                            rotulo={`${c.titulo} de ${f.cabecalho.nome}`}
                            valor={c.chave === 't50' ? f.t50 : (f.cabecalho[c.chave] as number | null | undefined)}
                            aoMudar={(v) => (c.chave === 't50' ? mudarT50(i, v) : mudarCabecalho(i, c.chave, c.obrigatorio ? v ?? 0 : v))}
                            className="text-accent-blue"
                          />
                        </div>
                      </td>
                    ))}
                    <td className="px-2 py-1 whitespace-nowrap font-mono text-xs text-text-secondary">
                      {f.leituras.length}
                      {zs.length > 0 && ` · ${String(Math.min(...zs)).replace('.', ',')} a ${String(Math.max(...zs)).replace('.', ',')} m`}
                    </td>
                    <td className="px-2 py-1 text-xs whitespace-nowrap">
                      {erros > 0 && <span className="mr-2 text-accent-red">{erros} erro(s)</span>}
                      {avisos > 0 && <span className="text-accent-amber">{avisos} aviso(s)</span>}
                      {erros + avisos === 0 && <span className="text-accent-green">ok</span>}
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-0.5 text-text-secondary">
                        <button aria-label="Abrir leituras" title="Abrir leituras" onClick={() => aoAbrirLeituras(i)} className="rounded p-1 hover:text-brand">
                          <Table2 size={15} />
                        </button>
                        <button aria-label="Subir" onClick={() => mover(i, -1)} disabled={i === 0} className="rounded p-1 hover:text-text-primary disabled:opacity-30">
                          <ArrowUp size={15} />
                        </button>
                        <button aria-label="Descer" onClick={() => mover(i, 1)} disabled={i === furos.length - 1} className="rounded p-1 hover:text-text-primary disabled:opacity-30">
                          <ArrowDown size={15} />
                        </button>
                        <button aria-label="Remover furo" onClick={() => remover(i)} className="rounded p-1 hover:text-accent-red">
                          <Trash2 size={15} />
                        </button>
                      </div>
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
