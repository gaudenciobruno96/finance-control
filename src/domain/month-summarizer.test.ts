import { describe, expect, it } from 'vitest'
import { projetarCurva } from './balance-projector.js'
import { resumirMes } from './month-summarizer.js'
import type { AncoraSaldo, OcorrenciaResolvida } from './types.js'

const ANCORA: AncoraSaldo = { id: 'a1', data: '2026-08-01', saldoCentavos: 100_000 }

function item(over: Partial<OcorrenciaResolvida> = {}): OcorrenciaResolvida {
  return {
    chave: 'regra:r1:2026-08',
    origem: 'virtual',
    idReal: null,
    situacao: 'previsto',
    ehComponenteDeFatura: false,
    numeroParcela: null,
    geradorTipo: 'regra',
    geradorId: 'r1',
    competencia: '2026-08',
    tipo: 'saida',
    nome: 'Item',
    valorPrevistoCentavos: 50_000,
    dataVencimento: '2026-08-10',
    dataPagamento: null,
    valorPagoCentavos: null,
    ignorado: false,
    observacao: null,
    ...over,
  }
}

function resumir(ocorrencias: OcorrenciaResolvida[]) {
  const curva = projetarCurva(ocorrencias, ANCORA, '2026-08', '2026-08-15')
  return resumirMes(ocorrencias, curva, '2026-08')
}

describe('month-summarizer', () => {
  it('separa a receber de a pagar', () => {
    const resumo = resumir([
      item({ chave: 'k1', tipo: 'entrada', valorPrevistoCentavos: 300_000 }),
      item({ chave: 'k2', tipo: 'saida', valorPrevistoCentavos: 180_000 }),
      item({ chave: 'k3', tipo: 'saida', valorPrevistoCentavos: 20_000 }),
    ])

    expect(resumo.aReceberCentavos).toBe(300_000)
    expect(resumo.aPagarCentavos).toBe(200_000)
    expect(resumo.balancoPrevistoCentavos).toBe(100_000)
  })

  it('distingue o que ja foi pago do que falta', () => {
    const resumo = resumir([
      item({
        chave: 'k1',
        valorPrevistoCentavos: 50_000,
        dataPagamento: '2026-08-09',
        valorPagoCentavos: 50_000,
        situacao: 'pago',
      }),
      item({ chave: 'k2', valorPrevistoCentavos: 30_000 }),
    ])

    expect(resumo.aPagarCentavos).toBe(80_000)
    expect(resumo.jaPagoCentavos).toBe(50_000)
    expect(resumo.faltaPagarCentavos).toBe(30_000)
  })

  /**
   * Sem isto, uma conta prevista em R$ 500 e paga com juros por R$ 550
   * apareceria no resumo como R$ 500, e o total nao bateria com o que
   * efetivamente saiu da conta.
   */
  it('usa o valor efetivamente pago quando ha pagamento', () => {
    const resumo = resumir([
      item({
        valorPrevistoCentavos: 50_000,
        dataPagamento: '2026-08-09',
        valorPagoCentavos: 55_000,
        situacao: 'pago',
      }),
    ])

    expect(resumo.aPagarCentavos).toBe(55_000)
    expect(resumo.jaPagoCentavos).toBe(55_000)
    expect(resumo.faltaPagarCentavos).toBe(0)
  })

  it('ignora itens marcados como ignorados', () => {
    const resumo = resumir([
      item({ chave: 'k1', valorPrevistoCentavos: 50_000 }),
      item({ chave: 'k2', valorPrevistoCentavos: 99_999, ignorado: true, situacao: 'ignorado' }),
    ])

    expect(resumo.aPagarCentavos).toBe(50_000)
  })

  it('nao conta componentes de fatura, que ja estao na fatura', () => {
    const resumo = resumir([
      item({ chave: 'k1', nome: 'Fatura', valorPrevistoCentavos: 80_000 }),
      item({ chave: 'k2', nome: 'Parcela', valorPrevistoCentavos: 30_000, ehComponenteDeFatura: true }),
    ])

    expect(resumo.aPagarCentavos).toBe(80_000)
  })

  /**
   * O resumo agrupa por COMPETENCIA, nao por data efetiva: o usuario pensa em
   * "as contas de agosto", ainda que uma tenha sido paga em setembro.
   */
  it('considera apenas itens da competencia pedida', () => {
    const resumo = resumir([
      item({ chave: 'k1', competencia: '2026-08', valorPrevistoCentavos: 50_000 }),
      item({ chave: 'k2', competencia: '2026-07', valorPrevistoCentavos: 99_999, dataVencimento: '2026-07-10' }),
    ])

    expect(resumo.aPagarCentavos).toBe(50_000)
  })

  it('devolve zeros para um mes sem lancamentos', () => {
    const resumo = resumir([])

    expect(resumo.aReceberCentavos).toBe(0)
    expect(resumo.aPagarCentavos).toBe(0)
    expect(resumo.balancoPrevistoCentavos).toBe(0)
    expect(resumo.faltaPagarCentavos).toBe(0)
  })

  it('o saldo final projetado vem do ultimo ponto da curva', () => {
    const ocorrencias = [item({ tipo: 'saida', valorPrevistoCentavos: 40_000 })]
    const curva = projetarCurva(ocorrencias, ANCORA, '2026-08', '2026-08-15')
    const resumo = resumirMes(ocorrencias, curva, '2026-08')

    expect(resumo.saldoFinalProjetadoCentavos).toBe(60_000)
    expect(resumo.saldoFinalProjetadoCentavos).toBe(
      curva.pontos[curva.pontos.length - 1]?.saldoCentavos,
    )
  })
})
