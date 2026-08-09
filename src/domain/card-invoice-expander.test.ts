import { describe, expect, it } from 'vitest'
import {
  estimarFatura,
  expandirFaturas,
  vencimentoDaFatura,
} from './card-invoice-expander.js'
import type { Cartao, Parcelamento } from './types.js'

function cartao(over: Partial<Cartao> = {}): Cartao {
  return {
    id: 'c1',
    nome: 'Cartao principal',
    diaFechamento: 20,
    diaVencimento: 28,
    gastoMensalTipicoCentavos: 50_000,
    ...over,
  }
}

function parcelamento(over: Partial<Parcelamento> = {}): Parcelamento {
  return {
    id: 'p1',
    nome: 'Notebook',
    valorParcelaCentavos: 30_000,
    quantidadeParcelas: 10,
    primeiroVencimento: '2026-08-28',
    cartaoId: 'c1',
    ...over,
  }
}

describe('card-invoice-expander', () => {
  describe('estimativa (RN-19)', () => {
    it('soma as parcelas do cartao ao gasto mensal tipico', () => {
      const estimado = estimarFatura(cartao(), [parcelamento()], '2026-08')

      expect(estimado).toBe(30_000 + 50_000)
    })

    it('soma varias parcelas do mesmo cartao', () => {
      const a = parcelamento({ id: 'p1', valorParcelaCentavos: 30_000 })
      const b = parcelamento({ id: 'p2', valorParcelaCentavos: 15_000 })

      expect(estimarFatura(cartao(), [a, b], '2026-08')).toBe(30_000 + 15_000 + 50_000)
    })

    it('ignora parcelas de outros cartoes e parcelamentos avulsos', () => {
      const deOutro = parcelamento({ id: 'p2', cartaoId: 'c2' })
      const avulso = parcelamento({ id: 'p3', cartaoId: null })

      expect(estimarFatura(cartao(), [deOutro, avulso], '2026-08')).toBe(50_000)
    })

    it('devolve apenas o gasto tipico quando nao ha parcelas', () => {
      expect(estimarFatura(cartao(), [], '2026-08')).toBe(50_000)
    })

    it('devolve zero quando nao ha parcelas nem gasto tipico', () => {
      expect(estimarFatura(cartao({ gastoMensalTipicoCentavos: 0 }), [], '2026-08')).toBe(0)
    })
  })

  describe('vencimento (RN-21)', () => {
    it('vence na propria competencia quando o vencimento vem depois do fechamento', () => {
      const c = cartao({ diaFechamento: 20, diaVencimento: 28 })

      expect(vencimentoDaFatura(c, '2026-08')).toBe('2026-08-28')
    })

    it('vence no mes seguinte quando o vencimento vem antes do fechamento', () => {
      const c = cartao({ diaFechamento: 25, diaVencimento: 5 })

      expect(vencimentoDaFatura(c, '2026-08')).toBe('2026-09-05')
    })

    it('trunca dia inexistente no ultimo dia do mes', () => {
      const c = cartao({ diaFechamento: 1, diaVencimento: 31 })

      expect(vencimentoDaFatura(c, '2026-02')).toBe('2026-02-28')
    })

    it('atravessa a virada do ano', () => {
      const c = cartao({ diaFechamento: 25, diaVencimento: 5 })

      expect(vencimentoDaFatura(c, '2026-12')).toBe('2027-01-05')
    })
  })

  describe('expansao', () => {
    it('produz uma fatura por cartao por competencia', () => {
      const faturas = expandirFaturas([cartao()], [parcelamento()], ['2026-08', '2026-09'])

      expect(faturas).toHaveLength(2)
      expect(faturas.map((f) => f.competencia)).toEqual(['2026-08', '2026-09'])
    })

    /** RN-23: fatura de valor zero nao polui a lista do mes. */
    it('suprime fatura de valor zero', () => {
      const semGasto = cartao({ gastoMensalTipicoCentavos: 0 })
      const faturas = expandirFaturas([semGasto], [], ['2026-08'])

      expect(faturas).toHaveLength(0)
    })

    it('nao suprime fatura composta so por parcelas', () => {
      const semGasto = cartao({ gastoMensalTipicoCentavos: 0 })
      const faturas = expandirFaturas([semGasto], [parcelamento()], ['2026-08'])

      expect(faturas).toHaveLength(1)
      expect(faturas[0]?.valorPrevistoCentavos).toBe(30_000)
    })

    it('a fatura em si nao e componente de fatura', () => {
      const [fatura] = expandirFaturas([cartao()], [], ['2026-08'])

      expect(fatura?.ehComponenteDeFatura).toBe(false)
      expect(fatura?.tipo).toBe('saida')
      expect(fatura?.chave).toBe('cartao:c1:2026-08')
    })

    it('nomeia a fatura com o nome do cartao', () => {
      const [fatura] = expandirFaturas([cartao({ nome: 'Nubank' })], [], ['2026-08'])

      expect(fatura?.nome).toBe('Fatura Nubank')
    })

    it('expande varios cartoes', () => {
      const a = cartao({ id: 'c1', nome: 'A' })
      const b = cartao({ id: 'c2', nome: 'B' })

      const faturas = expandirFaturas([a, b], [], ['2026-08'])

      expect(faturas).toHaveLength(2)
      expect(new Set(faturas.map((f) => f.chave)).size).toBe(2)
    })
  })
})
