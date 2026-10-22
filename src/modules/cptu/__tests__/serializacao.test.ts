import { describe, expect, test } from 'vitest'
import { PREMISSAS_TEMPO_PADRAO } from '../calc/adensamento'
import { OPCOES_PADRAO, PARAMETROS_PADRAO } from '../calc/parametros'
import type { FuroCptu } from '../calc/tipos'
import { furoDeDb, furoParaDb, leituraParaJson, opcoesDeDb, parametrosDeDb, premissasTempoDeDb } from '../serializacao'

const furo: FuroCptu = {
  id: null,
  cabecalho: { nome: 'CPTu01', NA: 0.86, profApoio: 11.1, espArgilaMole: 7.2, profTotal: 17.88, recalqueGuia: 0.12 },
  t50: null,
  leituras: [
    { z: 0.1, qt: 0.7159, Rf: 4.217, u2: 1.9, gamma: 15.44, SuRel: null, OCRRel: null, SuAmolgRel: null },
    { z: 0, qt: 0.0678, Rf: 0.858, u2: 0, gamma: 13.71 },
    { z: 0.2, qt: null, Rf: null, u2: null, gamma: 17.09, SuRel: 84.59 },
  ],
  zonas: [{ nome: 'Crosta', de: 0.5, ate: 3.5, material: 'Areia siltosa', comentario: '' }],
}

describe('serialização do furo', () => {
  test('ida e volta preserva o furo (leituras ordenadas por z)', () => {
    const linha = furoParaDb(furo, 'a1', 0)
    const volta = furoDeDb({ ...linha, id: 'f1' })
    expect(volta.id).toBe('f1')
    expect(volta.cabecalho).toMatchObject(furo.cabecalho)
    expect(volta.leituras.map((l) => l.z)).toEqual([0, 0.1, 0.2])
    expect(volta.leituras[2]).toEqual({
      z: 0.2, qt: null, Rf: null, u2: null, gamma: 17.09, SuRel: 84.59, OCRRel: null, SuAmolgRel: null,
    })
    expect(volta.zonas).toEqual(furo.zonas)
  })

  test('jsonb compacto: campos vazios não são gravados', () => {
    expect(leituraParaJson({ z: 0.2, qt: null, Rf: null, u2: null, gamma: 17.09 })).toEqual({ z: 0.2, gamma: 17.09 })
  })

  test('aceita numeric como texto e descarta leitura sem z', () => {
    const f = furoDeDb({
      ...furoParaDb(furo, 'a1', 0),
      na: '0.86', prof_apoio: '11.1',
      leituras: [{ z: '1.5', qt: '0.48' }, { qt: 1 }, 'lixo'],
      zonas: null,
    })
    expect(f.cabecalho.NA).toBe(0.86)
    expect(f.cabecalho.profApoio).toBe(11.1)
    expect(f.leituras).toHaveLength(1)
    expect(f.leituras[0].qt).toBe(0.48)
    expect(f.zonas).toEqual([])
  })
})

describe('configuração da análise', () => {
  test('vazio ou inválido volta aos padrões', () => {
    expect(parametrosDeDb(null)).toEqual(PARAMETROS_PADRAO)
    expect(premissasTempoDeDb({})).toEqual(PREMISSAS_TEMPO_PADRAO)
    expect(opcoesDeDb(undefined)).toEqual(OPCOES_PADRAO)
  })

  test('mantém o que foi salvo e completa o que falta', () => {
    const p = parametrosDeDb({ Nkt: 12, kSigmaP: 'x', campoVelho: 3 })
    expect(p.Nkt).toBe(12)
    expect(p.kSigmaP).toBe(PARAMETROS_PADRAO.kSigmaP)
    expect('campoVelho' in p).toBe(false)

    const t = premissasTempoDeDb({ cv: 3, drenagemDupla: false, t50: 1200, chDrenos: [4, 'x', -1] })
    expect([t.cv, t.drenagemDupla, t.t50]).toEqual([3, false, 1200])
    expect(t.chDrenos).toEqual([4])

    const o = opcoesDeDb({ ignorarRaso: { ativo: true }, icIterativo: true })
    expect(o.ignorarRaso).toEqual({ ativo: true, zMin: 0.5, acimaNA: false })
    expect(o.icIterativo).toBe(true)
    expect(o.deltaSigmaVariavel).toBe(false)
  })
})
