import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/**
 * Alguns servidores estáticos (visto em produção no EasyPanel) não servem
 * .mjs com o Content-Type correto para módulos ES ("Failed to fetch
 * dynamically imported module") — tanto para o worker real quanto para o
 * fallback "fake worker" do pdfjs, que também precisa importar esse mesmo
 * arquivo. Busca o worker via fetch() (que não valida Content-Type) e
 * recria um Blob com o MIME certo, contornando o servidor mal configurado.
 * Resolvida uma única vez e reaproveitada nas chamadas seguintes.
 */
let workerBlobUrlPromise: Promise<string> | null = null
function getWorkerSrc(): Promise<string> {
  if (!workerBlobUrlPromise) {
    workerBlobUrlPromise = fetch(pdfWorkerUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Não foi possível baixar o worker do pdf.js (HTTP ${res.status}).`)
        return res.blob()
      })
      .then((blob) => URL.createObjectURL(new Blob([blob], { type: 'text/javascript' })))
      .catch((err) => {
        workerBlobUrlPromise = null // permite tentar de novo numa próxima chamada, em vez de falhar pra sempre
        throw err
      })
  }
  return workerBlobUrlPromise
}

/**
 * Extrai o texto de cada página de um PDF, no navegador (sem backend) — usada
 * pra detectar automaticamente quantas sondagens existem num relatório de
 * boletins com várias folhas, e qual página pertence a qual sondagem (ver
 * engine/sondagemDetection.ts). Não faz OCR: PDFs escaneados como imagem pura
 * (sem camada de texto) retornam string vazia para essas páginas — nesse
 * caso a detecção automática não funciona e o usuário precisa ajustar os
 * intervalos de página manualmente.
 */
export async function extractPdfPageTexts(file: File): Promise<string[]> {
  pdfjsLib.GlobalWorkerOptions.workerSrc = await getWorkerSrc()
  const buffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pages.push(content.items.map((it: any) => it.str ?? '').join(' '))
  }
  return pages
}
