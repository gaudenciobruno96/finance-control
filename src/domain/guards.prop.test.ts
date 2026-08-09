/**
 * Testes por propriedade de SUP-02 (PROP-E01).
 *
 * Verificam que os geradores de dominio produzem valores validos POR
 * CONSTRUCAO -- se esta propriedade falhar, todos os demais testes por
 * propriedade estao exercitando entradas que o dominio jamais receberia.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  diasNoMes,
  ehCentavosValido,
  ehCompetenciaValida,
  ehDataValida,
  ehDiaDoMesValido,
} from './guards.js'
import {
  ancoraSaldo,
  centavos,
  centavosPositivo,
  competencia,
  dataISO,
  diaDoMes,
  ocorrencia,
  parcelamentoAvulso,
  regra,
} from '../test-support/generators.js'
import { compararCompetencias } from './calendar.js'

describe('guards — propriedades', () => {
  /** PROP-E01 · Toda entidade gerada satisfaz suas invariantes. */

  it('PROP-E01: o gerador de centavos produz sempre inteiros', () => {
    fc.assert(
      fc.property(centavos(), (v) => {
        expect(ehCentavosValido(v)).toBe(true)
      }),
    )
  })

  it('PROP-E01: o gerador de datas produz sempre datas reais', () => {
    fc.assert(
      fc.property(dataISO(), (d) => {
        expect(ehDataValida(d)).toBe(true)
      }),
    )
  })

  it('PROP-E01: o gerador de datas nunca produz 30 de fevereiro', () => {
    fc.assert(
      fc.property(dataISO(), (d) => {
        const ano = Number(d.slice(0, 4))
        const mes = Number(d.slice(5, 7))
        const dia = Number(d.slice(8, 10))
        expect(dia).toBeLessThanOrEqual(diasNoMes(ano, mes))
      }),
    )
  })

  it('PROP-E01: o gerador de competencias produz sempre competencias validas', () => {
    fc.assert(
      fc.property(competencia(), (c) => {
        expect(ehCompetenciaValida(c)).toBe(true)
      }),
    )
  })

  it('PROP-E01: o gerador de dia do mes cobre a faixa completa 1 a 31', () => {
    fc.assert(
      fc.property(diaDoMes(), (d) => {
        expect(ehDiaDoMesValido(d)).toBe(true)
      }),
    )
  })

  it('PROP-E01: regras geradas tem vigencia coerente e valor positivo', () => {
    fc.assert(
      fc.property(regra(), (r) => {
        expect(ehCentavosValido(r.valorCentavos)).toBe(true)
        expect(r.valorCentavos).toBeGreaterThan(0)
        expect(ehDiaDoMesValido(r.diaDoMes)).toBe(true)
        expect(ehCompetenciaValida(r.vigenteDe)).toBe(true)

        if (r.vigenteAte !== null) {
          expect(ehCompetenciaValida(r.vigenteAte)).toBe(true)
          expect(compararCompetencias(r.vigenteDe, r.vigenteAte)).toBeLessThanOrEqual(0)
        }
      }),
    )
  })

  it('PROP-E01: parcelamentos gerados tem ao menos uma parcela', () => {
    fc.assert(
      fc.property(parcelamentoAvulso(), (p) => {
        expect(Number.isInteger(p.quantidadeParcelas)).toBe(true)
        expect(p.quantidadeParcelas).toBeGreaterThanOrEqual(1)
        expect(p.valorParcelaCentavos).toBeGreaterThan(0)
        expect(ehDataValida(p.primeiroVencimento)).toBe(true)
      }),
    )
  })


  /**
   * PROP-E03 · Invariante: dataPagamento e valorPagoCentavos sao
   * simultaneamente nulos ou simultaneamente preenchidos.
   *
   * Um pagamento sem valor, ou um valor sem data, e um estado meio-registrado
   * que corromperia a curva de saldo.
   */
  it('PROP-E03: pagamento tem data e valor juntos, ou nenhum dos dois', () => {
    fc.assert(
      fc.property(ocorrencia(), (o) => {
        const temData = o.dataPagamento !== null
        const temValor = o.valorPagoCentavos !== null
        expect(temData).toBe(temValor)
      }),
    )
  })

  it('PROP-E01: ocorrencia ignorada nunca tem data de pagamento', () => {
    fc.assert(
      fc.property(ocorrencia(), (o) => {
        if (o.ignorado) expect(o.dataPagamento).toBeNull()
      }),
    )
  })

  it('PROP-E01: ocorrencia avulsa nao tem gerador, e as demais tem', () => {
    fc.assert(
      fc.property(ocorrencia(), (o) => {
        if (o.geradorTipo === 'avulso') {
          expect(o.geradorId).toBeNull()
        } else {
          expect(o.geradorId).not.toBeNull()
        }
      }),
    )
  })

  it('PROP-E01: ancoras geradas tem data valida e saldo inteiro', () => {
    fc.assert(
      fc.property(ancoraSaldo(), (a) => {
        expect(ehDataValida(a.data)).toBe(true)
        expect(ehCentavosValido(a.saldoCentavos)).toBe(true)
      }),
    )
  })

  it('PROP-E01: o gerador de valores positivos nunca produz zero', () => {
    fc.assert(
      fc.property(centavosPositivo(), (v) => {
        expect(v).toBeGreaterThan(0)
      }),
    )
  })
})
