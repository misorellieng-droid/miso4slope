import { memo, useCallback, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { AlertTriangle, ArrowDownWideNarrow, ClipboardPaste, Eraser, FileUp, ListOrdered, Plus, Trash2 } from 'lucide-react'
import { gammaUsado } from '../calc/linhas'
import type { FuroCptu, LeituraCptu, ParametrosCptu } from '../calc/tipos'
import {
  COLUNAS_LEITURA,
  blocoParaLeituras,
  colarNaGrade,
  conferirFuro,
  lerTabelaTexto,
  leituraVazia,
  mapearColunas,
} from '../entrada'
import { importarArquivo } from '../importacao'
import { CelulaNumero, formatarBR } from './CelulaNumero'

// Grade de leituras tipo planilha: Ctrl+V do Excel (tab e vírgula decimal),
// importar CSV/XLSX, setas e Enter para andar. Colunas lidas em azul.

const BTN =
  'flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40'

type AtualizarLeituras = (fn: (ls: LeituraCptu[]) => LeituraCptu[]) => void

interface Props {
  furos: FuroCptu[]
  indice: number
  parametros: ParametrosCptu
  aoEscolherFuro: (i: number) => void
  atualizarLeituras: AtualizarLeituras
}

export function AbaLeituras({ furos, indice, parametros, aoEscolherFuro, atualizarLeituras }: Props) {
  const furo = furos[indice]
  const gradeRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // leituras atuais para as confirmações (fora do atualizador de estado)
  const leiturasRef = useRef<LeituraCptu[]>([])
  leiturasRef.current = furo?.leituras ?? []
  const substituir = (novas: LeituraCptu[], origem: string) => {
    const n = leiturasRef.current.length
    if (n && !window.confirm(`Substituir as ${n} leituras do furo pelas ${novas.length} ${origem}?`)) return false
    atualizarLeituras(() => novas)
    return true
  }

  const avisos = useMemo(() => (furo ? conferirFuro(furo, parametros) : []), [furo, parametros])
  const linhasComErro = useMemo(() => new Set(avisos.filter((a) => a.linha != null).map((a) => a.linha!)), [avisos])

  const focar = (r: number, c: number) => {
    const el = gradeRef.current?.querySelector<HTMLInputElement>(`input[data-linha="${r}"][data-coluna="${c}"]`)
    el?.focus()
  }

  /** Cola um bloco do Excel. Com cabeçalho, substitui o furo; sem, cola a partir do cursor. */
  const colar = useCallback(
    (texto: string, r: number, c: number) => {
      const bloco = lerTabelaTexto(texto)
      const mapa = mapearColunas(bloco, c)
      if (mapa.temCabecalho) {
        const { leituras, ignoradas } = blocoParaLeituras(bloco, mapa)
        if (leituras.length === 0) return setMsg('Não achei a coluna de profundidade (z) no cabeçalho colado.')
        if (!substituir(leituras, 'coladas')) return
        setMsg(`${leituras.length} leituras coladas (colunas pelo cabeçalho)${ignoradas ? `; ${ignoradas} linha(s) sem z ignorada(s)` : ''}.`)
      } else {
        atualizarLeituras((atuais) => colarNaGrade(atuais, bloco, r, c))
        setMsg(`${bloco.length} linha(s) × ${Math.max(...bloco.map((l) => l.length))} coluna(s) coladas a partir da linha ${r + 1}.`)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atualizarLeituras],
  )

  const aoColarCelula = useCallback(
    (e: ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
      const texto = e.clipboardData.getData('text/plain')
      if (!/[\t\n]/.test(texto.replace(/\r?\n$/, ''))) return // um valor só: colagem normal
      e.preventDefault()
      colar(texto, r, c)
    },
    [colar],
  )

  const aoTeclar = useCallback((e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault()
      focar(r + 1, c)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focar(r - 1, c)
    }
  }, [])

  const mudarCelula = useCallback(
    (r: number, chave: string, v: number | null) =>
      atualizarLeituras((ls) => ls.map((l, i) => (i === r ? { ...l, [chave]: chave === 'z' ? v ?? NaN : v } : l))),
    [atualizarLeituras],
  )

  const removerLinha = useCallback((r: number) => atualizarLeituras((ls) => ls.filter((_, i) => i !== r)), [atualizarLeituras])

  const adicionarLinha = () =>
    atualizarLeituras((ls) => {
      const ult = ls[ls.length - 1]
      const passo = ls.length >= 2 ? ult.z - ls[ls.length - 2].z : 0.1
      return [...ls, leituraVazia(ult && Number.isFinite(ult.z) ? Number((ult.z + (passo || 0.1)).toFixed(6)) : 0)]
    })

  const preencherZ = () => {
    const ini = window.prompt('Profundidade da primeira linha (m):', '0')
    if (ini == null) return
    const passo = window.prompt('Passo entre leituras (m):', '0,1')
    if (passo == null) return
    const z0 = Number(ini.replace(',', '.'))
    const dz = Number(passo.replace(',', '.'))
    if (!Number.isFinite(z0) || !Number.isFinite(dz) || dz <= 0) return setMsg('Início ou passo inválido.')
    atualizarLeituras((ls) => ls.map((l, i) => ({ ...l, z: Number((z0 + i * dz).toFixed(6)) })))
    setMsg(`z preenchido de ${formatarBR(z0)} m com passo ${formatarBR(dz)} m.`)
  }

  const ordenar = () => atualizarLeituras((ls) => [...ls].sort((a, b) => (a.z || 0) - (b.z || 0)))

  const limpar = () => {
    if (!furo?.leituras.length || !window.confirm(`Apagar as ${furo.leituras.length} leituras de ${furo.cabecalho.nome}?`)) return
    atualizarLeituras(() => [])
    setMsg(null)
  }

  const importar = async (arquivo: File) => {
    setMsg(null)
    try {
      const r = await importarArquivo(arquivo)
      let leituras: LeituraCptu[]
      if (r.tipo === 'furos') {
        const mesmo = r.furos.find((f) => f.cabecalho.nome.toUpperCase() === furo.cabecalho.nome.toUpperCase())
        if (!mesmo) return setMsg(`A planilha tem vários furos (${r.furos.map((f) => f.cabecalho.nome).join(', ')}): importe pela aba Furos.`)
        leituras = mesmo.leituras
      } else leituras = r.leituras
      if (!substituir(leituras, 'do arquivo')) return
      setMsg(`${leituras.length} leituras lidas de ${arquivo.name}.`)
    } catch (e) {
      setMsg(`Não foi possível importar: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (!furo) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-text-secondary">
        Crie ou importe um furo na aba <b>Furos</b> primeiro.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {furos.map((f, i) => (
          <button
            key={f.id ?? `novo-${i}`}
            onClick={() => aoEscolherFuro(i)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              i === indice ? 'border-brand bg-brand text-white' : 'border-border bg-surface text-text-secondary hover:text-text-primary'
            }`}
          >
            {f.cabecalho.nome || '(sem nome)'} <span className="font-mono opacity-70">{f.leituras.length}</span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="mr-auto">
            <h2 className="text-sm font-semibold text-text-primary">Leituras de {furo.cabecalho.nome}</h2>
            <p className="text-xs text-text-secondary">
              Copie do Excel e cole (Ctrl+V) numa célula: o bloco entra a partir dela. Com a linha de títulos junto, as colunas são achadas pelo nome.
            </p>
          </div>
          {msg && <span className="max-w-md text-xs text-text-secondary">{msg}</span>}
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
            <FileUp size={14} /> Importar CSV/XLSX
          </button>
          <button className={BTN} onClick={preencherZ} disabled={!furo.leituras.length} title="Preenche z com início e passo">
            <ListOrdered size={14} /> Preencher z
          </button>
          <button className={BTN} onClick={ordenar} disabled={furo.leituras.length < 2}>
            <ArrowDownWideNarrow size={14} /> Ordenar por z
          </button>
          <button className={BTN} onClick={limpar} disabled={!furo.leituras.length}>
            <Eraser size={14} /> Limpar
          </button>
        </div>

        {avisos.length > 0 && (
          <ul className="space-y-0.5 border-b border-border px-4 py-2 text-xs">
            {avisos.slice(0, 8).map((a, k) => (
              <li key={k} className={`flex items-center gap-1.5 ${a.nivel === 'erro' ? 'text-accent-red' : 'text-accent-amber'}`}>
                <AlertTriangle size={12} />
                {a.linha != null && (
                  <button className="font-mono underline" onClick={() => focar(a.linha!, 0)}>
                    linha {a.linha + 1}
                  </button>
                )}
                {a.texto}
              </li>
            ))}
            {avisos.length > 8 && <li className="text-text-secondary">… e mais {avisos.length - 8}.</li>}
          </ul>
        )}

        {furo.leituras.length === 0 ? (
          <div className="p-4">
            <textarea
              aria-label="Área para colar as leituras"
              placeholder="Clique aqui e cole (Ctrl+V) as colunas copiadas do Excel: z, qt (MPa), Rf (%), u2 (kPa), γ, Su rel., OCR rel., Su amolg. rel. — ou copie junto a linha de títulos."
              className="h-32 w-full rounded-md border border-dashed border-border bg-elevated p-3 text-sm text-text-secondary focus:border-brand focus:outline-none"
              value=""
              onChange={() => undefined}
              onPaste={(e) => {
                e.preventDefault()
                colar(e.clipboardData.getData('text/plain'), 0, 0)
              }}
            />
            <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
              <ClipboardPaste size={14} /> ou
              <button className="underline" onClick={adicionarLinha}>
                comece digitando linha a linha
              </button>
            </div>
          </div>
        ) : (
          <div ref={gradeRef} className="max-h-[65vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_var(--color-border)]">
                <tr className="text-left text-xs">
                  <th className="w-10 px-2 py-2 text-right font-medium text-text-secondary">#</th>
                  {COLUNAS_LEITURA.map((c) => (
                    <th key={c.chave} className="min-w-[5.5rem] px-1.5 py-2 font-medium whitespace-nowrap text-accent-blue">
                      {c.rotulo}
                      {c.unidade && <span className="ml-1 font-normal text-text-secondary">{c.unidade}</span>}
                      {c.obrigatoria && <span className="text-accent-red">*</span>}
                    </th>
                  ))}
                  <th className="px-1.5 py-2 font-medium whitespace-nowrap text-text-primary" title="γ usado no cálculo: o do relatório ou o padrão, limitado entre γmín e γmáx">
                    γ usado
                  </th>
                  <th className="px-1.5 py-2 font-medium text-text-primary">Situação</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {furo.leituras.map((l, r) => (
                  <LinhaGrade
                    key={r}
                    r={r}
                    l={l}
                    erro={linhasComErro.has(r)}
                    parametros={parametros}
                    mudarCelula={mudarCelula}
                    removerLinha={removerLinha}
                    aoColar={aoColarCelula}
                    aoTeclar={aoTeclar}
                  />
                ))}
              </tbody>
            </table>
            <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-surface px-4 py-2 text-xs text-text-secondary">
              <button onClick={adicionarLinha} className="flex items-center gap-1 hover:text-text-primary">
                <Plus size={14} /> Adicionar linha
              </button>
              <span className="ml-auto font-mono">{furo.leituras.length} leituras</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface LinhaProps {
  r: number
  l: LeituraCptu
  erro: boolean
  parametros: ParametrosCptu
  mudarCelula: (r: number, chave: string, v: number | null) => void
  removerLinha: (r: number) => void
  aoColar: (e: ClipboardEvent<HTMLInputElement>, r: number, c: number) => void
  aoTeclar: (e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => void
}

const LinhaGrade = memo(function LinhaGrade({ r, l, erro, parametros, mudarCelula, removerLinha, aoColar, aoTeclar }: LinhaProps) {
  const valida = l.qt != null && l.Rf != null && l.Rf > 0
  const situacao = l.qt == null ? 'sem qt' : !valida ? 'Rf ≤ 0' : 'válida'
  const g = gammaUsado(l.gamma, parametros)
  const gammaAjustado = l.gamma == null || g !== l.gamma
  return (
    <tr className={`border-b border-border/50 ${erro ? 'bg-red-50' : r % 2 ? 'bg-elevated/30' : ''}`}>
      <td className="px-2 text-right font-mono text-[11px] text-text-secondary">{r + 1}</td>
      {COLUNAS_LEITURA.map((c, j) => (
        <td key={c.chave} className="px-0.5">
          <CelulaNumero
            rotulo={`${c.rotulo} linha ${r + 1}`}
            valor={l[c.chave as keyof LeituraCptu] as number | null}
            aoMudar={(v) => mudarCelula(r, c.chave, v)}
            onPaste={(e) => aoColar(e, r, j)}
            onKeyDown={(e) => aoTeclar(e, r, j)}
            dataLinha={r}
            dataColuna={j}
            className="text-accent-blue"
          />
        </td>
      ))}
      <td
        className={`px-1.5 font-mono text-[13px] ${gammaAjustado ? 'text-accent-amber' : 'text-text-primary'}`}
        title={l.gamma == null ? 'Sem γ no relatório: usado o padrão' : gammaAjustado ? 'γ fora da faixa: valor limitado' : undefined}
      >
        {formatarBR(g)}
      </td>
      <td className={`px-1.5 text-xs whitespace-nowrap ${valida ? 'text-text-secondary' : 'text-accent-amber'}`}>{situacao}</td>
      <td className="px-1">
        <button aria-label={`Remover linha ${r + 1}`} onClick={() => removerLinha(r)} className="rounded p-0.5 text-text-secondary/60 hover:text-accent-red">
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  )
})
