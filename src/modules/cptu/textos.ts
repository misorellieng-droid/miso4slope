// GERADO por scripts/extrair-referencia-cptu.cjs a partir da aba "CPTu01 fórmulas"
// da planilha de referência (CPTu_01a10_com_formulas.xlsx). Linhas 1 a 5:
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

export const TEXTOS_COLUNAS: TextoColuna[] = [
  {
    "coluna": "A",
    "chave": "z",
    "tipo": "LIDO",
    "titulo": "Prof. z (m)",
    "descricao": "Profundidade do ponto",
    "usoPratico": "Uso prático: Localiza cada camada. Todas as cotas de corte, aterro e dreno referem-se a ela.",
    "faixas": "Faixas (orientativas):\nSem faixa. Serve para localizar as camadas."
  },
  {
    "coluna": "B",
    "chave": "qt",
    "tipo": "LIDO",
    "titulo": "qt (MPa)",
    "descricao": "Resistência de ponta corrigida (medida)",
    "usoPratico": "Uso prático: Separa areia (qt alto) de argila (qt baixo). Base de Su, OCR e do critério de trafegabilidade.",
    "faixas": "Faixas (orientativas):\nMenor que 0,5 MPa: argila muito mole.\n0,5 a 1,5: argila ou silte.\n1,5 a 5: areia fofa ou argila rija.\nMaior que 5: areia compacta."
  },
  {
    "coluna": "C",
    "chave": "Rf",
    "tipo": "LIDO",
    "titulo": "Rf (%)",
    "descricao": "Razão de atrito = fs/qt×100 (medida)",
    "usoPratico": "Uso prático: Vem junto com qt para classificar o solo. Rf alto indica argila; Rf baixo indica areia.",
    "faixas": "Faixas (orientativas):\nMenor que 1%: areia.\n1 a 3%: silte ou mistura.\nMaior que 3%: argila.\nMuito alto: orgânico."
  },
  {
    "coluna": "D",
    "chave": "u2",
    "tipo": "LIDO",
    "titulo": "u2 (kPa)",
    "descricao": "Poropressão atrás da ponta (medida)",
    "usoPratico": "Uso prático: Mostra se a água está presa. Define se o aterro vai gerar poropressão e quanto tempo o solo leva para adensar.",
    "faixas": "Faixas (orientativas):\nPerto de u0: areia (água escapa).\nMuito acima de u0: argila saturada.\nAbaixo de u0: areia densa ou silte dilatante."
  },
  {
    "coluna": "E",
    "chave": "gamma",
    "tipo": "LIDO",
    "titulo": "γ do relatório (kN/m³)",
    "descricao": "Peso específico estimado pelo software",
    "usoPratico": "Uso prático: Entra no peso das camadas acima de cada ponto. Sem ele não se calcula a tensão do solo.",
    "faixas": "Faixas (orientativas):\n13 a 15: argila mole ou orgânica.\n16 a 18: silte, areia siltosa, argila rija.\n19 a 21: areia compacta ou argila dura."
  },
  {
    "coluna": "F",
    "chave": "qtKPa",
    "tipo": "CALC",
    "titulo": "qt (kPa)",
    "descricao": "Fórmula: B×1000",
    "usoPratico": "Uso prático: Só converte unidade para trabalhar tudo em kPa.",
    "faixas": "Faixas (orientativas):\nSem faixa (conversão de unidade)."
  },
  {
    "coluna": "G",
    "chave": "fs",
    "tipo": "CALC",
    "titulo": "fs (kPa)",
    "descricao": "Fórmula: qt×Rf/100",
    "usoPratico": "Uso prático: Atrito lateral medido. Usado no Ic e no atrito negativo em estacas sob aterro.",
    "faixas": "Faixas (orientativas):\nSem faixa. Dado de apoio."
  },
  {
    "coluna": "H",
    "chave": "sigmaV0",
    "tipo": "CALC",
    "titulo": "σv0 (kPa)",
    "descricao": "Soma de γ×Δz até a profundidade z",
    "usoPratico": "Uso prático: Tensão total do peso do solo. Sustenta a conta de Su, OCR e de quanto o aterro acrescenta.",
    "faixas": "Faixas (orientativas):\nSem faixa. Cresce com a profundidade."
  },
  {
    "coluna": "I",
    "chave": "u0",
    "tipo": "CALC",
    "titulo": "u0 (kPa)",
    "descricao": "Fórmula: γw×(z−NA), só abaixo do N.A.",
    "usoPratico": "Uso prático: Pressão da água em repouso. Separa o que o solo sustenta do que a água sustenta.",
    "faixas": "Faixas (orientativas):\nZero acima do N.A. Cresce 9,81 kPa por metro abaixo dele."
  },
  {
    "coluna": "J",
    "chave": "sigmaV0Ef",
    "tipo": "CALC",
    "titulo": "σ'v0 (kPa)",
    "descricao": "Fórmula: σv0−u0",
    "usoPratico": "Uso prático: Tensão efetiva: a que realmente comprime o solo. Base do cálculo de recalque e de OCR.",
    "faixas": "Faixas (orientativas):\nSem faixa. Compare com a tensão que o aterro soma (Δσ)."
  },
  {
    "coluna": "K",
    "chave": "qnet",
    "tipo": "CALC",
    "titulo": "qt−σv0 (kPa)",
    "descricao": "Resistência líquida",
    "usoPratico": "Uso prático: Resistência só do solo, sem o peso que já estava lá. É o numerador de Su e de OCR.",
    "faixas": "Faixas (orientativas):\nSem faixa. Numerador de Su e OCR."
  },
  {
    "coluna": "L",
    "chave": "Fr",
    "tipo": "CALC",
    "titulo": "Fr (%)",
    "descricao": "Fórmula: fs/(qt−σv0)×100",
    "usoPratico": "Uso prático: Eixo do Ic. Ajuda a separar silte de argila e a ver se há matéria orgânica.",
    "faixas": "Faixas (orientativas):\nMenor que 0,5%: areia.\n0,5 a 2%: mistura.\nMaior que 2%: argila."
  },
  {
    "coluna": "M",
    "chave": "Bq",
    "tipo": "CALC",
    "titulo": "Bq",
    "descricao": "Fórmula: (u2−u0)/(qt−σv0)",
    "usoPratico": "Uso prático: Diz se o solo é mole saturado (próximo de 1) ou areia/argila dura (próximo de 0). Aponta onde o aterro gera mais poropressão e recalque lento.",
    "faixas": "Faixas (orientativas):\nPerto de zero ou negativo: areia, ou argila muito dura. A água escapa.\n0,2 a 0,4: silte ou argila rija.\n0,5 a 1: argila mole saturada, onde a água fica presa e a pressão sobe."
  },
  {
    "coluna": "N",
    "chave": "Qtn1",
    "tipo": "CALC",
    "titulo": "Qtn (n=1)",
    "descricao": "Fórmula: ((qt−σv0)/pa)×(pa/σ'v0)",
    "usoPratico": "Uso prático: Passo intermediário do Ic. Não precisa ser interpretado.",
    "faixas": "Faixas (orientativas):\nSem faixa. Passo intermediário."
  },
  {
    "coluna": "O",
    "chave": "Ic1",
    "tipo": "CALC",
    "titulo": "Ic (1ª passada)",
    "descricao": "Fórmula: √[(3,47−log Qtn)²+(log Fr+1,22)²]",
    "usoPratico": "Uso prático: Passo intermediário do Ic. Não precisa ser interpretado.",
    "faixas": "Faixas (orientativas):\nSem faixa. Passo intermediário."
  },
  {
    "coluna": "P",
    "chave": "n",
    "tipo": "CALC",
    "titulo": "n",
    "descricao": "Fórmula: 0,381×Ic+0,05×σ'v0/pa−0,15 (entre 0,5 e 1)",
    "usoPratico": "Uso prático: Ajusta o Qtn ao tipo de solo. Passo intermediário.",
    "faixas": "Faixas (orientativas):\nSem faixa. Passo intermediário."
  },
  {
    "coluna": "Q",
    "chave": "Qtn",
    "tipo": "CALC",
    "titulo": "Qtn",
    "descricao": "Fórmula: ((qt−σv0)/pa)×(pa/σ'v0)^n",
    "usoPratico": "Uso prático: Normaliza qt pela tensão do local. Eixo do Ic e base do módulo M.",
    "faixas": "Faixas (orientativas):\nSem faixa. Passo intermediário."
  },
  {
    "coluna": "R",
    "chave": "Ic",
    "tipo": "CALC",
    "titulo": "Ic (Robertson 2009)",
    "descricao": "Fórmula: √[(3,47−log Qtn)²+(log Fr+1,22)²]",
    "usoPratico": "Uso prático: Classifica o solo: define onde vale Su (argila) e onde vale ângulo de atrito (areia). Define a camada de apoio e a espessura mole a tratar.",
    "faixas": "Faixas (orientativas):\nMenor que 2,05: areia.\n2,05 a 2,6: areia com silte.\n2,6 a 2,95: silte argiloso ou argila siltosa.\n2,95 a 3,6: argila.\nMaior que 3,6: orgânico."
  },
  {
    "coluna": "S",
    "chave": "material",
    "tipo": "CALC",
    "titulo": "Material",
    "descricao": "Faixas de Ic",
    "usoPratico": "Uso prático: Nome da camada para a reunião e para o relatório.",
    "faixas": "Faixas (orientativas):\nTexto vem do Ic."
  },
  {
    "coluna": "T",
    "chave": "Su",
    "tipo": "CALC (EMPÍRICO)",
    "titulo": "Su (kPa)",
    "descricao": "Fórmula: (qt−σv0)/Nkt, só se 2,6≤Ic<3,6 (argila)",
    "usoPratico": "Uso prático: Resistência não drenada. Define trafegabilidade (esteira ≥ 10, escavadeira ≥ 20 kPa), estabilidade de aterro, vala e túnel, e empuxo passivo na ficha do muro.",
    "faixas": "Faixas (orientativas):\nMenor que 12: argila muito mole.\n12 a 25: mole.\n25 a 50: média.\n50 a 100: rija.\nMaior que 100: muito rija.\nTrafegar: esteira ≥ 10, escavadeira ≥ 20."
  },
  {
    "coluna": "U",
    "chave": "sigmaP",
    "tipo": "CALC (EMPÍRICO)",
    "titulo": "σ'p (kPa)",
    "descricao": "Fórmula: k×(qt−σv0), só em argila",
    "usoPratico": "Uso prático: Maior tensão que o solo já suportou. Compara com a tensão que o aterro vai impor: se passar, o recalque cresce muito.",
    "faixas": "Faixas (orientativas):\nSem faixa. Compare com σ'v0 + Δσ do aterro."
  },
  {
    "coluna": "V",
    "chave": "OCR",
    "tipo": "CALC",
    "titulo": "OCR",
    "descricao": "Fórmula: σ'p/σ'v0",
    "usoPratico": "Uso prático: Mostra a memória do solo. OCR próximo de 1 indica argila mole que vai recalcar muito com aterro novo; OCR alto indica solo que recalca pouco.",
    "faixas": "Faixas (orientativas):\nCerca de 1: normalmente adensada (recalca muito).\n1 a 2: levemente pré-adensada.\n2 a 4: pré-adensada.\nMaior que 4: muito pré-adensada.\nMeta: OCR maior que 1 + Δσ/σ'v0."
  },
  {
    "coluna": "W",
    "chave": "SuSigmaV0",
    "tipo": "CALC",
    "titulo": "Su/σ'v0",
    "descricao": "Fórmula: Su/σ'v0",
    "usoPratico": "Uso prático: Confere se o Su faz sentido para a tensão do local. Valores baixos indicam argila mole.",
    "faixas": "Faixas (orientativas):\nCerca de 0,2 a 0,3: argila normalmente adensada, mole.\nMaior que 0,5: pré-adensada, mais firme."
  },
  {
    "coluna": "X",
    "chave": "M",
    "tipo": "CALC (EMPÍRICO)",
    "titulo": "M (MPa)",
    "descricao": "Fórmula: min(Qtn;14)×(qt−σv0)",
    "usoPratico": "Uso prático: Dá o recalque de cada camada (s = Δσ×H/M) e serve de conferência do cálculo por Cc e Cr.",
    "faixas": "Faixas (orientativas):\nMenor que 3: muito compressível.\n3 a 10: média.\nMaior que 10: pouco compressível."
  },
  {
    "coluna": "Y",
    "chave": "gammaFormula",
    "tipo": "CALC",
    "titulo": "γ pela fórmula (kN/m³)",
    "descricao": "Fórmula: γw×[0,27 log Rf+0,36 log(qt/pa)+1,236] (só conferência)",
    "usoPratico": "Uso prático: Conferência de γ. Se divergir muito do relatório, o σv0 pode estar errado.",
    "faixas": "Faixas (orientativas):\nDiferença menor que 1 kN/m³ em relação ao relatório: tudo certo."
  },
  {
    "coluna": "Z",
    "chave": "SuRel",
    "tipo": "LIDO",
    "titulo": "Su do relatório (kPa)",
    "descricao": "Lido da curva do relatório",
    "usoPratico": "Uso prático: Referência do relatório para comparar com o Su calculado.",
    "faixas": "Faixas (orientativas):\nMesma faixa do Su calculado."
  },
  {
    "coluna": "AA",
    "chave": "OCRRel",
    "tipo": "LIDO",
    "titulo": "OCR do relatório",
    "descricao": "Lido da curva do relatório",
    "usoPratico": "Uso prático: Referência do relatório para comparar com o OCR calculado.",
    "faixas": "Faixas (orientativas):\nMesma faixa do OCR calculado."
  },
  {
    "coluna": "AB",
    "chave": "SuRazaoRel",
    "tipo": "CONFERÊNCIA",
    "titulo": "Su meu ÷ Su relatório",
    "descricao": "Deve ficar perto de 1",
    "usoPratico": "Uso prático: Se ficar longe de 1, rever σv0, Nkt ou a leitura da curva.",
    "faixas": "Faixas (orientativas):\n0,9 a 1,1: confere.\nMaior que 1,2: meu Su está acima do relatório (lado contra a segurança)."
  },
  {
    "coluna": "AC",
    "chave": "SuAmolgRel",
    "tipo": "LIDO",
    "titulo": "Su amolgado do relatório (kPa)",
    "descricao": "Lido da curva do relatório (argila remoldada)",
    "usoPratico": "Uso prático: Referência do relatório para o St.",
    "faixas": "Faixas (orientativas):\nMesma faixa do Su amolgado calculado."
  },
  {
    "coluna": "AD",
    "chave": "St",
    "tipo": "CALC",
    "titulo": "St = Su ÷ fs",
    "descricao": "Su de pico ÷ Su amolgado, com Su amolgado ≈ fs",
    "usoPratico": "Uso prático: Mede o quanto a argila perde de resistência quando é remexida (corte, escavação, tráfego, cravação). Define o cuidado com a camada depois de aberta.",
    "faixas": "Faixas (orientativas):\nMenor que 2: pouco sensível.\n2 a 4: sensível.\n4 a 8: muito sensível.\nMaior que 8: extra sensível (perde muito ao remexer)."
  },
  {
    "coluna": "AE",
    "chave": "StRel",
    "tipo": "CALC",
    "titulo": "St do relatório",
    "descricao": "Fórmula: Su do relatório ÷ Su amolgado do relatório",
    "usoPratico": "Uso prático: Mesmo conceito do St anterior, com os valores do relatório, para comparar.",
    "faixas": "Faixas (orientativas):\nMesma faixa do St anterior."
  },
  {
    "coluna": "AF",
    "chave": "OCRnec",
    "tipo": "CALC",
    "titulo": "OCR necessário",
    "descricao": "Fórmula: 1 + Δσ/σ'v0",
    "usoPratico": "Uso prático: Tensão que o solo precisaria ter guardado na memória para o aterro não passar dela. Se o OCR medido for menor, o aterro gera recalque grande.",
    "faixas": "Faixas (orientativas):\nCompare com o OCR medido. OCR medido maior ou igual: o aterro fica dentro da memória (recalque pequeno)."
  },
  {
    "coluna": "AG",
    "chave": "situacao",
    "tipo": "CALC",
    "titulo": "Situação frente ao aterro",
    "descricao": "Compara OCR medido com OCR necessário",
    "usoPratico": "Uso prático: Diz em palavras se o aterro fica dentro da memória do solo ou passa dela. Aponta onde pensar em pré-carga, drenos ou alívio da carga.",
    "faixas": "Faixas (orientativas):\nSem faixa. É um texto."
  },
  {
    "coluna": "AH",
    "chave": "sigmaF",
    "tipo": "CALC",
    "titulo": "σ'f = σ'v0 + Δσ (kPa)",
    "descricao": "Tensão efetiva final após o aterro",
    "usoPratico": "Uso prático: Tensão que o solo terá depois do aterro. Entra na conta do recalque.",
    "faixas": "Faixas (orientativas):\nSem faixa. Dado de apoio."
  },
  {
    "coluna": "AI",
    "chave": "recalqueCcCr",
    "tipo": "CALC (EMPÍRICO)",
    "titulo": "Recalque Cc/Cr da fatia (m)",
    "descricao": "Cr/(1+e0)×dz×log(σ'p/σ'v0) + Cc/(1+e0)×dz×log(σ'f/σ'p)",
    "usoPratico": "Uso prático: Recalque de cada fatia de 0,1 m. A soma por camada dá o recalque da camada, e a soma total dá o recalque do aterro neste furo.",
    "faixas": "Faixas (orientativas):\nEm cada fatia, valores pequenos (menos de 0,01 m) são normais. A soma da camada é que importa. Recalque total acima de 0,3 m pede pré-carga, drenos ou faseamento."
  },
  {
    "coluna": "AJ",
    "chave": "recalqueM",
    "tipo": "CALC (EMPÍRICO)",
    "titulo": "Recalque por M da fatia (m)",
    "descricao": "Fórmula: Δσ×dz/M (conferência)",
    "usoPratico": "Uso prático: Segunda conta de recalque, usando o módulo M. Se ficar parecida com a anterior, os dois caminhos confirmam o resultado.",
    "faixas": "Faixas (orientativas):\nDeve ficar na mesma ordem de grandeza do outro cálculo. Diferença acima de 2 vezes pede rever Cc, Cr ou M."
  }
]

export const TEXTO_POR_CHAVE: Record<string, TextoColuna> = Object.fromEntries(
  TEXTOS_COLUNAS.filter((t) => t.chave).map((t) => [t.chave as string, t]),
)
