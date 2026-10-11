/// <reference lib="webworker" />
import { paraSerial, type DetalheSerial } from '../engine/muros/serial'
import type { SoloMuro } from '../engine/muros/solo'
import type { MurosSecoesArquivo, ParametrosMuros } from '../engine/muros/tipos'
import { verificarMuro } from '../engine/muros/verificar'

// Roda a verificação dos muros fora da thread da tela: a busca do círculo
// crítico e os testes de inclinação levam dezenas de segundos por muro e
// travariam a interface.

export interface PedidoVerificacao {
  arquivo: MurosSecoesArquivo
  ids: string[]                           // muros a verificar (vazio = todos)
  solos: Record<string, SoloMuro | null>  // por id de muro
  params: ParametrosMuros
}

export type RespostaWorker =
  | { tipo: 'progresso'; id: string; mensagem: string; fracao: number }
  | { tipo: 'muro'; detalhe: DetalheSerial }
  | { tipo: 'fim' }
  | { tipo: 'erro'; mensagem: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope
const enviar = (r: RespostaWorker) => ctx.postMessage(r)

ctx.onmessage = (e: MessageEvent<PedidoVerificacao>) => {
  const { arquivo, ids, solos, params } = e.data
  try {
    const muros = arquivo.muros.filter((m) => ids.length === 0 || ids.includes(m.id))
    muros.forEach((m) => {
      const d = verificarMuro(m, solos[m.id] ?? null, params, arquivo.muros_tipos, (mensagem, fracao) =>
        enviar({ tipo: 'progresso', id: m.id, mensagem, fracao })
      )
      enviar({ tipo: 'muro', detalhe: paraSerial(d) })
    })
    enviar({ tipo: 'fim' })
  } catch (err) {
    enviar({ tipo: 'erro', mensagem: err instanceof Error ? err.message : String(err) })
  }
}
