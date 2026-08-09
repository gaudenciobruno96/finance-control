import { describe, expect, it } from 'vitest'
import { resumirMeses } from './future-commitments.js'
import type { OcorrenciaResolvida } from './types.js'

function item(over: Partial<OcorrenciaResolvida> = {}): OcorrenciaResolvida {
  return {
    chave: 'regra:r1:2026-08',
    origem: 'virtual',
    idReal: null,
    situacao: 'previsto',
    ehComponenteDeFatura: false,
    cartaoId: null,
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

describe('future-commitments', () => {
  it('produz uma linha por competencia do intervalo', () => {
    const resumos = resumirMeses([], ['2026-08', '2026-09', '2026-10'])

    expect(resumos.map((r) => r.competencia)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(resumos.every((r) => r.totalAPagarCentavos === 0)).toBe(true)
  })

  it('totaliza as saidas de cada competencia', () => {
    const resumos = resumirMeses(
      [
        item({ chave: 'k1', competencia: '2026-08', valorPrevistoCentavos: 50_000 }),
        item({ chave: 'k2', competencia: '2026-08', valorPrevistoCentavos: 30_000 }),
        item({ chave: 'k3', competencia: '2026-09', valorPrevistoCentavos: 20_000 }),
      ],
      ['2026-08', '2026-09'],
    )

    expect(resumos[0]?.totalAPagarCentavos).toBe(80_000)
    expect(resumos[1]?.totalAPagarCentavos).toBe(20_000)
  })

  it('nao conta entradas', () => {
    const resumos = resumirMeses(
      [item({ tipo: 'entrada', valorPrevistoCentavos: 500_000 })],
      ['2026-08'],
    )

    expect(resumos[0]?.totalAPagarCentavos).toBe(0)
  })

  it('nao conta itens ignorados', () => {
    const resumos = resumirMeses(
      [item({ ignorado: true, situacao: 'ignorado' })],
      ['2026-08'],
    )

    expect(resumos[0]?.totalAPagarCentavos).toBe(0)
  })

  /**
   * O total exclui componentes de fatura, que ja estao somados na fatura --
   * mas `deParcelamentos` os INCLUI de proposito.
   *
   * O objetivo desta tela e revelar o peso dos parcelamentos, que de outro
   * modo ficaria escondido dentro do valor da fatura. E o que da sentido a
   * cadastrar uma compra em 10x.
   */
  it('revela o peso das parcelas mesmo quando embutidas na fatura', () => {
    const resumos = resumirMeses(
      [
        item({
          chave: 'cartao:c1:2026-08',
          geradorTipo: 'cartao',
          nome: 'Fatura',
          valorPrevistoCentavos: 80_000,
        }),
        item({
          chave: 'parcelamento:p1:2026-08',
          geradorTipo: 'parcelamento',
          nome: 'Notebook (3/10)',
          valorPrevistoCentavos: 30_000,
          ehComponenteDeFatura: true,
        }),
      ],
      ['2026-08'],
    )

    expect(resumos[0]?.totalAPagarCentavos).toBe(80_000)
    expect(resumos[0]?.deParcelamentosCentavos).toBe(30_000)
  })

  it('conta parcelamento avulso no total e no recorte de parcelas', () => {
    const resumos = resumirMeses(
      [
        item({
          chave: 'parcelamento:p1:2026-08',
          geradorTipo: 'parcelamento',
          valorPrevistoCentavos: 25_000,
          ehComponenteDeFatura: false,
        }),
      ],
      ['2026-08'],
    )

    expect(resumos[0]?.totalAPagarCentavos).toBe(25_000)
    expect(resumos[0]?.deParcelamentosCentavos).toBe(25_000)
  })

  it('usa o valor pago quando ha pagamento', () => {
    const resumos = resumirMeses(
      [
        item({
          valorPrevistoCentavos: 50_000,
          dataPagamento: '2026-08-10',
          valorPagoCentavos: 52_000,
          situacao: 'pago',
        }),
      ],
      ['2026-08'],
    )

    expect(resumos[0]?.totalAPagarCentavos).toBe(52_000)
  })
})
