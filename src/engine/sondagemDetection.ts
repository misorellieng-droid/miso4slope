// Detecção automática de quantas sondagens existem dentro de um relatório em
// PDF com várias folhas, e quais páginas pertencem a cada uma — heurística
// baseada em texto (sem visão computacional): procura, em cada página, um
// cabeçalho típico de boletim brasileiro identificando o furo ("SONDAGEM
// SP-01", "FURO Nº 02", "SP-03" etc.). Páginas sem nenhum cabeçalho
// reconhecido são tratadas como continuação da sondagem da página anterior —
// o caso comum de uma sondagem que se estende por duas folhas (a segunda
// folha normalmente só continua a tabela, sem repetir o cabeçalho).
//
// É best-effort: PDFs escaneados como imagem (sem texto) ou com layouts
// muito fora do padrão não têm cabeçalho nenhum reconhecido — nesse caso
// cada página vira um grupo "não identificado" (autoDetected: false),
// revisável manualmente pelo usuário antes de salvar.

const ID_PATTERNS: RegExp[] = [
  /\bSONDAGEM\s*(?:A\s*PERCUSS[ÃA]O)?\s*(?:N[ºO°]?\.?)?\s*[:\-]?\s*([A-Z]{0,4}[\s\-]?\d{1,4}[A-Z]?)/i,
  /\bFURO\s*(?:DE\s*SONDAGEM)?\s*(?:N[ºO°]?\.?)?\s*[:\-]?\s*([A-Z]{0,4}[\s\-]?\d{1,4}[A-Z]?)/i,
  /\b(SP|ST|SM|SPT|TRADO|MISTA?|POÇO)[\s\-]?(\d{1,4}[A-Z]?)\b/i,
]

function findIdentifier(text: string): string | null {
  for (const re of ID_PATTERNS) {
    const m = text.match(re)
    if (!m) continue
    const raw = m[2] ? `${m[1]}-${m[2]}` : m[1]
    if (raw) return raw.replace(/\s+/g, '').toUpperCase()
  }
  return null
}

export interface SondagemPageGroup {
  identifier: string // ex.: "SP-01" — ou "Sondagem N" quando nenhum cabeçalho foi reconhecido
  pageStart: number // 1-based
  pageEnd: number
  autoDetected: boolean // false = nome genérico atribuído, nenhum cabeçalho reconhecido nessas páginas
}

export function detectSondagemGroups(pageTexts: string[]): SondagemPageGroup[] {
  const groups: SondagemPageGroup[] = []
  let current: SondagemPageGroup | null = null

  pageTexts.forEach((text, i) => {
    const pageNum = i + 1
    const id = findIdentifier(text)

    if (id && (!current || current.identifier !== id)) {
      current = { identifier: id, pageStart: pageNum, pageEnd: pageNum, autoDetected: true }
      groups.push(current)
    } else if (current) {
      // sem cabeçalho novo nesta página — continuação da sondagem corrente
      // (cobre o caso de uma sondagem dividida em duas folhas)
      current.pageEnd = pageNum
    } else {
      current = { identifier: `Sondagem ${groups.length + 1}`, pageStart: pageNum, pageEnd: pageNum, autoDetected: false }
      groups.push(current)
    }
  })

  return groups
}
