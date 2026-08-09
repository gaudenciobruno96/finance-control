/**
 * Testes por propriedade de DOM-05 (PROP-X03, PROP-X08).
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { expandirParcelamentos } from './installment-expander.js'
import { competenciaDe, intervaloDeCompetencias, somarMeses } from './calendar.js'
import { parcelamentoAvulso } from '../test-support/generators.js'

/** Conjunto de parcelamentos com identificadores distintos. */
const conjuntoDeParcelamentos = () =>
  fc.uniqueArray(parcelamentoAvulso(), { maxLength: 5, selector: (p) => p.id })

/** Intervalo largo o bastante para conter todas as parcelas geradas. */
function intervaloCompleto(primeiroVencimento: string, quantidade: number) {
  const inicial = competenciaDe(primeiroVencimento)
  return intervaloDeCompetencias(inicial, somarMeses(inicial, quantidade))
}

describe('installment-expander — propriedades', () => {
  /**
   * PROP-X03 · Um parcelamento de N parcelas produz no maximo N ocorrencias,
   * numeradas de 1 a N sem repeticao.
   */
  it('PROP-X03: produz exatamente N parcelas numeradas de 1 a N', () => {
    fc.assert(
      fc.property(parcelamentoAvulso(), (p) => {
        const meses = intervaloCompleto(p.primeiroVencimento, p.quantidadeParcelas)
        const ocorrencias = expandirParcelamentos([p], meses)

        expect(ocorrencias).toHaveLength(p.quantidadeParcelas)

        const numeros = ocorrencias.map((o) => o.numeroParcela)
        expect(numeros).toEqual(
          Array.from({ length: p.quantidadeParcelas }, (_, i) => i + 1),
        )
      }),
    )
  })

  /**
   * PROP-X08 · O dia base nao sofre erosao ao atravessar meses curtos.
   *
   * O defeito que esta propriedade previne: propagar o dia truncado em vez do
   * dia original faria um parcelamento iniciado em 31 de janeiro migrar
   * permanentemente para o dia 28 a partir de fevereiro.
   *
   * A propriedade correta e: o dia de cada parcela e o minimo entre o dia base
   * e o tamanho do mes daquela parcela -- nunca menos que isso.
   */
  it('PROP-X08: o dia base nao erode ao atravessar meses curtos', () => {
    fc.assert(
      fc.property(parcelamentoAvulso(), (p) => {
        const diaBase = Number(p.primeiroVencimento.slice(8, 10))
        const meses = intervaloCompleto(p.primeiroVencimento, p.quantidadeParcelas)

        for (const o of expandirParcelamentos([p], meses)) {
          const diaDaParcela = Number(o.dataVencimento.slice(8, 10))
          // Oraculo independente: `Date` em UTC calcula o ultimo dia do mes por
          // um caminho completamente diferente da nossa aritmetica de
          // calendario. Usar a propria implementacao como referencia validaria
          // apenas que ela e consistente consigo mesma.
          const ano = Number(o.competencia.slice(0, 4))
          const mes = Number(o.competencia.slice(5, 7))
          const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()

          expect(diaDaParcela).toBe(Math.min(diaBase, ultimoDia))
        }
      }),
    )
  })

  /** PROP-X01 aplicado a parcelamentos: nada fora do intervalo pedido. */
  it('PROP-X01: nenhuma parcela fora do intervalo consultado', () => {
    fc.assert(
      fc.property(
        conjuntoDeParcelamentos(),
        fc.integer({ min: 0, max: 6 }),
        (parcelamentos, n) => {
          const meses = intervaloDeCompetencias('2026-01', somarMeses('2026-01', n))
          const dentro = new Set(meses)

          for (const o of expandirParcelamentos(parcelamentos, meses)) {
            expect(dentro.has(o.competencia)).toBe(true)
          }
        },
      ),
    )
  })

  /** Invariante: a competencia da parcela sempre bate com a do vencimento. */
  it('a competencia da parcela corresponde ao mes do vencimento', () => {
    fc.assert(
      fc.property(parcelamentoAvulso(), (p) => {
        const meses = intervaloCompleto(p.primeiroVencimento, p.quantidadeParcelas)

        for (const o of expandirParcelamentos([p], meses)) {
          expect(competenciaDe(o.dataVencimento)).toBe(o.competencia)
        }
      }),
    )
  })

  /** Invariante: todas as parcelas tem o mesmo valor, o da parcela contratada. */
  it('todas as parcelas tem o valor contratado', () => {
    fc.assert(
      fc.property(parcelamentoAvulso(), (p) => {
        const meses = intervaloCompleto(p.primeiroVencimento, p.quantidadeParcelas)

        for (const o of expandirParcelamentos([p], meses)) {
          expect(o.valorPrevistoCentavos).toBe(p.valorParcelaCentavos)
          expect(o.tipo).toBe('saida')
        }
      }),
    )
  })

  /** Invariante: chaves nao se repetem entre parcelas. */
  it('as chaves das parcelas sao unicas', () => {
    fc.assert(
      fc.property(conjuntoDeParcelamentos(), (parcelamentos) => {
        const meses = intervaloDeCompetencias('2026-01', '2029-12')
        const chaves = expandirParcelamentos(parcelamentos, meses).map((o) => o.chave)

        expect(new Set(chaves).size).toBe(chaves.length)
      }),
    )
  })
})
