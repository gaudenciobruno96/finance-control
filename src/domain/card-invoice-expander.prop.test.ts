/**
 * Testes por propriedade de DOM-06 (PROP-X06, PROP-X07).
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { estimarFatura, expandirFaturas, vencimentoDaFatura } from './card-invoice-expander.js'
import { parcelasDoCartaoEm } from './installment-expander.js'
import { competenciaDe, somarMeses, ultimoDiaDoMes } from './calendar.js'
import { somar } from './money.js'
import { cartao, competencia, parcelamentoDeCartao } from '../test-support/generators.js'

/** Um cartao com um conjunto de parcelamentos vinculados a ele. */
const cartaoComParcelas = () =>
  cartao().chain((c) =>
    fc
      .uniqueArray(parcelamentoDeCartao(c.id), { maxLength: 5, selector: (p) => p.id })
      .map((parcelamentos) => ({ cartao: c, parcelamentos })),
  )

describe('card-invoice-expander — propriedades', () => {
  /**
   * PROP-X06 · A fatura estimada e sempre igual a soma das parcelas do cartao
   * na competencia mais o gasto tipico -- nem mais, nem menos.
   *
   * E a propriedade que impede a dupla contagem: se a implementacao somasse as
   * parcelas duas vezes, ou somasse parcelas de outro cartao, esta igualdade
   * quebraria.
   */
  it('PROP-X06: a estimativa e a soma das parcelas mais o gasto tipico', () => {
    fc.assert(
      fc.property(cartaoComParcelas(), competencia(), ({ cartao: c, parcelamentos }, comp) => {
        const parcelas = parcelasDoCartaoEm(parcelamentos, c.id, comp)
        const esperado = somar(
          ...parcelas.map((p) => p.valorPrevistoCentavos),
          c.gastoMensalTipicoCentavos,
        )

        expect(estimarFatura(c, parcelamentos, comp)).toBe(esperado)
      }),
    )
  })

  /** PROP-X07 · Nenhuma fatura de valor zero e emitida (RN-23). */
  it('PROP-X07: fatura de valor zero nunca aparece', () => {
    fc.assert(
      fc.property(cartaoComParcelas(), competencia(), ({ cartao: c, parcelamentos }, comp) => {
        for (const fatura of expandirFaturas([c], parcelamentos, [comp])) {
          expect(fatura.valorPrevistoCentavos).not.toBe(0)
        }
      }),
    )
  })

  /** Invariante: a estimativa nunca e menor que o gasto tipico do cartao. */
  it('a estimativa nunca fica abaixo do gasto tipico', () => {
    fc.assert(
      fc.property(cartaoComParcelas(), competencia(), ({ cartao: c, parcelamentos }, comp) => {
        expect(estimarFatura(c, parcelamentos, comp)).toBeGreaterThanOrEqual(
          c.gastoMensalTipicoCentavos,
        )
      }),
    )
  })

  /**
   * Invariante: parcelas vinculadas a outro cartao nunca entram na estimativa.
   */
  it('parcelas de outro cartao nao afetam a estimativa', () => {
    fc.assert(
      fc.property(cartaoComParcelas(), competencia(), ({ cartao: c, parcelamentos }, comp) => {
        const deOutroCartao = parcelamentos.map((p) => ({ ...p, cartaoId: 'outro-cartao' }))

        expect(estimarFatura(c, deOutroCartao, comp)).toBe(c.gastoMensalTipicoCentavos)
      }),
    )
  })

  /**
   * PROP-C02 aplicada ao vencimento da fatura: o dia nunca excede o tamanho do
   * mes, e o mes e o da competencia ou o seguinte, nunca outro (RN-21).
   */
  it('o vencimento cai na competencia ou no mes seguinte, com dia valido', () => {
    fc.assert(
      fc.property(cartao(), competencia(), (c, comp) => {
        const vencimento = vencimentoDaFatura(c, comp)
        const mesDoVencimento = competenciaDe(vencimento)
        const esperado =
          c.diaVencimento >= c.diaFechamento ? comp : somarMeses(comp, 1)

        expect(mesDoVencimento).toBe(esperado)
        expect(Number(vencimento.slice(8, 10))).toBeLessThanOrEqual(
          ultimoDiaDoMes(mesDoVencimento),
        )
      }),
    )
  })

  /** Invariante: a fatura em si nunca e componente de fatura. */
  it('a fatura nao e componente de fatura e e sempre saida', () => {
    fc.assert(
      fc.property(cartaoComParcelas(), competencia(), ({ cartao: c, parcelamentos }, comp) => {
        for (const fatura of expandirFaturas([c], parcelamentos, [comp])) {
          expect(fatura.ehComponenteDeFatura).toBe(false)
          expect(fatura.tipo).toBe('saida')
        }
      }),
    )
  })
})
