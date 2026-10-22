import { deltaSigma } from './parametros'
import type { CabecalhoFuro, LeituraCptu, LinhaCptu, Material, ParametrosCptu, Situacao } from './tipos'

// Cálculo por profundidade: colunas F a AJ da aba "CPTuXX fórmulas".
// Logaritmo sempre na base 10. Onde a planilha deixa a célula vazia, aqui
// sai null (nunca zero).

/** Espessura da primeira fatia: fixa em 0,1 m, como na planilha. */
const DZ_PRIMEIRA = 0.1

/** γ usado: o do relatório, ou o padrão; sempre limitado entre γmin e γmax. */
export function gammaUsado(gamma: number | null | undefined, p: ParametrosCptu): number {
  const g = gamma ?? p.gammaPadrao
  return Math.min(p.gammaMax, Math.max(p.gammaMin, g))
}

export function classificarMaterial(Ic: number): Material {
  if (Ic < 2.05) return 'Areia'
  if (Ic < 2.6) return 'Areia com silte'
  if (Ic < 2.95) return 'Silte argiloso / argila siltosa'
  if (Ic < 3.6) return 'Argila'
  return 'Orgânico'
}

/** Ic de Robertson (2009) a partir de Qtn e Fr (%). */
export function indiceIc(Qtn: number, Fr: number): number {
  return Math.sqrt((3.47 - Math.log10(Qtn)) ** 2 + (Math.log10(Fr) + 1.22) ** 2)
}

/**
 * Calcula todas as colunas para as leituras de um furo. As leituras são
 * ordenadas por z crescente. Linhas sem qt continuam na sequência: entram na
 * integração de σv0 e no dz da linha seguinte, como na planilha.
 */
export function calcularLinhas(
  leituras: LeituraCptu[],
  cab: CabecalhoFuro,
  p: ParametrosCptu,
): LinhaCptu[] {
  const ordenadas = [...leituras].sort((a, b) => a.z - b.z)
  const ds = deltaSigma(p)
  const linhas: LinhaCptu[] = []

  ordenadas.forEach((l, i) => {
    const ant = i > 0 ? linhas[i - 1] : null
    const gamma = gammaUsado(l.gamma, p)
    const dz = ant ? l.z - ant.z : DZ_PRIMEIRA

    // H: γ integrado pelo trapézio entre leituras (na 1ª linha, γ × z)
    const sigmaV0 = ant ? ant.sigmaV0 + ((ant.gamma + gamma) / 2) * (l.z - ant.z) : gamma * l.z
    // I, J
    const u0 = l.z > cab.NA ? p.gammaW * (l.z - cab.NA) : 0
    const sigmaV0Ef = Math.max(sigmaV0 - u0, 1)

    const valida = l.qt != null && l.Rf != null && l.Rf > 0
    const qtKPa = l.qt != null ? l.qt * 1000 : null                     // F
    const fs = valida ? (qtKPa as number) * (l.Rf as number) / 100 : null // G
    const qnet = valida ? (qtKPa as number) - sigmaV0 : null            // K

    const linha: LinhaCptu = {
      z: l.z, entrada: l, gamma, dz, qtKPa, fs, sigmaV0, u0, sigmaV0Ef, qnet,
      Fr: null, Bq: null, Qtn1: null, Ic1: null, n: null, Qtn: null, Ic: null,
      material: null, Su: null, sigmaP: null, OCR: null, SuSigmaV0: null, M: null,
      gammaFormula: null, SuRazaoRel: null, St: null, StRel: null,
      OCRnec: null, situacao: null, sigmaF: null, recalqueCcCr: null, recalqueM: null,
    }

    // Y: γ pela fórmula (conferência), só linha válida
    if (valida && (qtKPa as number) > 0) {
      linha.gammaFormula =
        p.gammaW * (0.27 * Math.log10(l.Rf as number) + 0.36 * Math.log10((qtKPa as number) / p.pa) + 1.236)
    }

    // L a R: exige linha válida e qnet > 0
    if (valida && fs != null && qnet != null && qnet > 0) {
      const Fr = (fs / qnet) * 100
      linha.Fr = Fr
      linha.Bq = l.u2 != null ? (l.u2 - u0) / qnet : null
      const Qtn1 = (qnet / p.pa) * (p.pa / sigmaV0Ef)
      const Ic1 = indiceIc(Qtn1, Fr)
      // n e Ic: uma iteração apenas, igual à planilha
      const n = Math.min(1, Math.max(0.5, 0.381 * Ic1 + (0.05 * sigmaV0Ef) / p.pa - 0.15))
      const Qtn = (qnet / p.pa) * (p.pa / sigmaV0Ef) ** n
      const Ic = indiceIc(Qtn, Fr)
      Object.assign(linha, { Qtn1, Ic1, n, Qtn, Ic, material: classificarMaterial(Ic) })

      // T a X: só em argila (IcArgilaMin ≤ Ic < IcArgilaMax)
      if (Ic >= p.IcArgilaMin && Ic < p.IcArgilaMax) {
        const Su = qnet / p.Nkt
        const sigmaP = p.kSigmaP * qnet
        const M = (Math.min(Qtn, p.MqtnMax) * qnet) / 1000
        linha.Su = Su
        linha.sigmaP = sigmaP
        linha.OCR = sigmaP / sigmaV0Ef
        linha.SuSigmaV0 = Su / sigmaV0Ef
        linha.M = M

        // Conferências com o relatório
        if (l.SuRel != null && l.SuRel !== 0) linha.SuRazaoRel = Su / l.SuRel
        if (fs > 0) linha.St = Su / fs

        // Aterro
        const OCRnec = 1 + ds / sigmaV0Ef
        const situacao: Situacao = linha.OCR >= OCRnec ? 'Dentro da memória do solo' : 'Passa da memória do solo'
        const sigmaF = sigmaV0Ef + ds
        const sigmaPEf = Math.max(sigmaP, sigmaV0Ef)
        linha.OCRnec = OCRnec
        linha.situacao = situacao
        linha.sigmaF = sigmaF
        linha.recalqueCcCr =
          sigmaF <= sigmaPEf
            ? p.CrN * dz * Math.log10(sigmaF / sigmaV0Ef)
            : p.CrN * dz * Math.log10(sigmaPEf / sigmaV0Ef) + p.CcN * dz * Math.log10(sigmaF / sigmaPEf)
        linha.recalqueM = (ds * dz) / (M * 1000)
      }
    }

    // AE: sensibilidade do relatório (independe do Ic)
    if (l.SuRel != null && l.SuAmolgRel != null && l.SuAmolgRel > 0) {
      linha.StRel = l.SuRel / l.SuAmolgRel
    }

    linhas.push(linha)
  })

  return linhas
}
