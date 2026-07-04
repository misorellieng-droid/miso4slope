import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

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
