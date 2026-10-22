// Extrai da planilha de referência (CPTu_01a10_com_formulas.xlsx, Misorelli
// Engenharia, 26.22.2 EREA Meli Biguaçu) os valores com precisão total que
// servem de fixture para os testes do módulo CPTu, e os textos de apoio
// (linhas 1 a 5 da aba "CPTu01 fórmulas") para src/modules/cptu/textos.ts.
//
// Uso: node scripts/extrair-referencia-cptu.cjs "<caminho do xlsx>"
// Lê os valores já calculados (cache) que o Excel gravou no arquivo.
const path = require('node:path')
const fs = require('node:fs')
const XLSX = require('xlsx')

const arquivo = process.argv[2]
if (!arquivo) throw new Error('Informe o caminho do xlsx.')
const wb = XLSX.readFile(arquivo)
const raiz = path.resolve(__dirname, '..')

const num = (v) => (typeof v === 'number' ? Number(v.toPrecision(15)) : null)
const val = (ws, ref) => {
  const c = ws[ref]
  if (!c || c.v === '' || c.v == null) return null
  return typeof c.v === 'number' ? num(c.v) : c.v
}

// Coluna da planilha -> chave usada no motor
const ENTRADA = { A: 'z', B: 'qt', C: 'Rf', D: 'u2', E: 'gamma', Z: 'SuRel', AA: 'OCRRel', AC: 'SuAmolgRel' }
const SAIDA = {
  F: 'qtKPa', G: 'fs', H: 'sigmaV0', I: 'u0', J: 'sigmaV0Ef', K: 'qnet', L: 'Fr', M: 'Bq',
  N: 'Qtn1', O: 'Ic1', P: 'n', Q: 'Qtn', R: 'Ic', S: 'material', T: 'Su', U: 'sigmaP', V: 'OCR',
  W: 'SuSigmaV0', X: 'M', Y: 'gammaFormula', AB: 'SuRazaoRel', AD: 'St', AE: 'StRel',
  AF: 'OCRnec', AG: 'situacao', AH: 'sigmaF', AI: 'recalqueCcCr', AJ: 'recalqueM',
}

const par = wb.Sheets['Parametros']
const resumo = wb.Sheets['Resumo']
const tempo = wb.Sheets['Tempo e drenos']

const parametros = {
  gammaW: val(par, 'B3'), pa: val(par, 'B4'), Nkt: val(par, 'B5'), kSigmaP: val(par, 'B6'),
  hAterro: val(par, 'B7'), gammaAterro: val(par, 'B8'), q: val(par, 'B9'), deltaSigma: val(par, 'B10'),
  CcN: val(par, 'B11'), CrN: val(par, 'B12'),
}

const furos = []
for (let i = 1; i <= 10; i++) {
  const nome = 'CPTu' + String(i).padStart(2, '0')
  const ws = wb.Sheets[nome + ' fórmulas']
  const ultima = XLSX.utils.decode_range(ws['!ref']).e.r + 1
  const entrada = Object.fromEntries(Object.values(ENTRADA).map((k) => [k, []]))
  const esperado = Object.fromEntries(Object.values(SAIDA).map((k) => [k, []]))
  for (let r = 6; r <= ultima; r++) {
    if (val(ws, 'A' + r) == null) continue
    for (const [col, k] of Object.entries(ENTRADA)) entrada[k].push(val(ws, col + r))
    for (const [col, k] of Object.entries(SAIDA)) esperado[k].push(val(ws, col + r))
  }
  const lp = 15 + i // linha do furo na aba Parametros
  const lr = 4 + i  // linha do furo na aba Resumo
  furos.push({
    nome,
    cabecalho: {
      NA: val(par, 'B' + lp), profApoio: val(par, 'C' + lp), espArgilaMole: val(par, 'D' + lp),
      profTotal: val(par, 'E' + lp), recalqueGuia: val(resumo, 'F' + lr),
    },
    entrada,
    esperado,
    resumo: {
      recalqueCcCrApoio: val(resumo, 'C' + lr), recalqueMApoio: val(resumo, 'D' + lr),
      recalqueCcCrTotal: val(resumo, 'E' + lr), suMedio: val(resumo, 'G' + lr),
      suMin: val(resumo, 'H' + lr), ocrMin: val(resumo, 'I' + lr),
      espessuraPassa: val(resumo, 'J' + lr), Hdr: val(resumo, 'L' + lr),
      t90: val(resumo, 'M' + lr), stMedio: val(resumo, 'N' + lr),
    },
  })
}

// Tempo e drenos: valores de referência das tabelas
const drenos = []
for (let r = 32; r <= 40; r++) drenos.push({ s: val(tempo, 'A' + r), meses: ['B', 'C', 'D'].map((c) => val(tempo, c + r)) })
const tempoRef = {
  T90: val(tempo, 'B8'), cv: val(tempo, 'B9'), T50: val(tempo, 'B13'), r: val(tempo, 'B14'), Ir: val(tempo, 'B15'),
  dw: val(tempo, 'B27'), U: val(tempo, 'B28'), chDrenos: ['B', 'C', 'D'].map((c) => val(tempo, c + '31')),
  chPorT50: [21, 22, 23, 24].map((r) => ({ t50: val(tempo, 'A' + r), ch: val(tempo, 'B' + r) })),
  drenos,
}

const fixture = { fonte: path.basename(arquivo), parametros, tempo: tempoRef, furos }
const destino = path.join(raiz, 'src/modules/cptu/calc/__tests__/fixtures/referencia_cptu.json')
fs.writeFileSync(destino, JSON.stringify(fixture))
console.log('fixture:', destino, (fs.statSync(destino).size / 1024).toFixed(0) + ' kB')

// Textos de apoio: linhas 1 a 5 da aba CPTu01 fórmulas, sem reescrever
const ws1 = wb.Sheets['CPTu01 fórmulas']
const txt = (ref) => {
  const v = val(ws1, ref)
  return v == null ? '' : String(v).replace(/\r\n/g, '\n')
}
const colunas = []
for (let c = 0; c < 36; c++) {
  const col = XLSX.utils.encode_col(c)
  colunas.push({
    coluna: col,
    chave: ENTRADA[col] ?? SAIDA[col] ?? null,
    tipo: txt(col + '1'), titulo: txt(col + '2'), descricao: txt(col + '3'),
    usoPratico: txt(col + '4'), faixas: txt(col + '5'),
  })
}
const ts = `// GERADO por scripts/extrair-referencia-cptu.cjs a partir da aba "CPTu01 fórmulas"
// da planilha de referência (${path.basename(arquivo)}). Linhas 1 a 5:
// tipo, título, descrição/fórmula, "Uso prático" e "Faixas orientativas".
// Textos copiados sem reescrever. Não editar à mão: rode o script de novo.

export interface TextoColuna {
  /** Coluna na planilha de referência (A..AJ) */
  coluna: string
  /** Chave do campo no motor (entrada ou resultado); null quando não há */
  chave: string | null
  tipo: string
  titulo: string
  descricao: string
  usoPratico: string
  faixas: string
}

export const TEXTOS_COLUNAS: TextoColuna[] = ${JSON.stringify(colunas, null, 2)}

export const TEXTO_POR_CHAVE: Record<string, TextoColuna> = Object.fromEntries(
  TEXTOS_COLUNAS.filter((t) => t.chave).map((t) => [t.chave as string, t]),
)
`
fs.writeFileSync(path.join(raiz, 'src/modules/cptu/textos.ts'), ts)
console.log('textos: src/modules/cptu/textos.ts')
