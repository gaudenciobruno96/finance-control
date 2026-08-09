import { describe, expect, it } from 'vitest'
import { projetarCurva } from './balance-projector.js'
import type { AncoraSaldo, OcorrenciaResolvida } from './types.js'

const ANCORA: AncoraSaldo = { id: 'a1', data: '2026-08-01', saldoCentavos: 100_000 }

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
    nome: 'Aluguel',
    valorPrevistoCentavos: 50_000,
    dataVencimento: '2026-08-10',
    dataPagamento: null,
    valorPagoCentavos: null,
    ignorado: false,
    observacao: null,
    ...over,
  }
}

function saldoEm(curva: ReturnType<typeof projetarCurva>, data: string): number {
  return curva.pontos.find((p) => p.data === data)?.saldoCentavos ?? NaN
}

describe('balance-projector', () => {
  it('parte da ancora e cobre todos os dias do mes', () => {
    const curva = projetarCurva([], ANCORA, '2026-08', '2026-08-15')

    expect(curva.pontos).toHaveLength(31)
    expect(curva.pontos[0]?.data).toBe('2026-08-01')
    expect(curva.pontos[0]?.saldoCentavos).toBe(100_000)
    expect(curva.saldoRelativo).toBe(false)
  })

  it('entrada soma e saida subtrai no dia do vencimento', () => {
    const curva = projetarCurva(
      [
        item({ chave: 'k1', tipo: 'entrada', valorPrevistoCentavos: 300_000, dataVencimento: '2026-08-05' }),
        item({ chave: 'k2', tipo: 'saida', valorPrevistoCentavos: 50_000, dataVencimento: '2026-08-10' }),
      ],
      ANCORA,
      '2026-08',
      '2026-08-15',
    )

    expect(saldoEm(curva, '2026-08-04')).toBe(100_000)
    expect(saldoEm(curva, '2026-08-05')).toBe(400_000)
    expect(saldoEm(curva, '2026-08-10')).toBe(350_000)
  })

  /** RN-31: o dinheiro saiu quando saiu, e no montante em que saiu. */
  it('item pago entra pela data e pelo valor efetivos', () => {
    const curva = projetarCurva(
      [
        item({
          dataVencimento: '2026-08-10',
          dataPagamento: '2026-08-14',
          valorPagoCentavos: 55_000,
          situacao: 'pago',
        }),
      ],
      ANCORA,
      '2026-08',
      '2026-08-20',
    )

    expect(saldoEm(curva, '2026-08-10')).toBe(100_000)
    expect(saldoEm(curva, '2026-08-13')).toBe(100_000)
    expect(saldoEm(curva, '2026-08-14')).toBe(45_000)
  })

  describe('atrasados', () => {
    /** RN-33: a divida existe e precisa afundar o saldo de hoje. */
    it('conta vencida ha dois meses aparece no inicio da curva', () => {
      const curva = projetarCurva(
        [item({ competencia: '2026-06', dataVencimento: '2026-06-10' })],
        ANCORA,
        '2026-08',
        '2026-08-15',
      )

      expect(saldoEm(curva, '2026-08-01')).toBe(50_000)
    })

    /** RN-34: a busca por atrasados recua no maximo 12 meses. */
    it('conta vencida ha treze meses nao aparece', () => {
      const curva = projetarCurva(
        [item({ competencia: '2025-07', dataVencimento: '2025-07-10' })],
        ANCORA,
        '2026-08',
        '2026-08-15',
      )

      expect(saldoEm(curva, '2026-08-01')).toBe(100_000)
    })

    it('conta vencida ha exatamente doze meses ainda aparece', () => {
      const curva = projetarCurva(
        [item({ competencia: '2025-08', dataVencimento: '2025-08-10' })],
        ANCORA,
        '2026-08',
        '2026-08-15',
      )

      expect(saldoEm(curva, '2026-08-01')).toBe(50_000)
    })

    /** RN-32: ja pago antes da ancora, presume-se refletido no saldo. */
    it('conta antiga JA PAGA nao entra na curva', () => {
      const curva = projetarCurva(
        [
          item({
            competencia: '2026-06',
            dataVencimento: '2026-06-10',
            dataPagamento: '2026-06-11',
            valorPagoCentavos: 50_000,
            situacao: 'pago',
          }),
        ],
        ANCORA,
        '2026-08',
        '2026-08-15',
      )

      expect(saldoEm(curva, '2026-08-01')).toBe(100_000)
    })
  })

  describe('exclusoes', () => {
    it('item ignorado nao afeta a curva (RN-35)', () => {
      const curva = projetarCurva(
        [item({ ignorado: true, situacao: 'ignorado' })],
        ANCORA,
        '2026-08',
        '2026-08-15',
      )

      expect(saldoEm(curva, '2026-08-31')).toBe(100_000)
    })

    /**
     * RN-18: a parcela ja esta somada dentro da fatura do cartao. Conta-la
     * aqui seria contar o mesmo dinheiro duas vezes.
     */
    it('componente de fatura nao afeta a curva sozinho', () => {
      const curva = projetarCurva(
        [item({ ehComponenteDeFatura: true, valorPrevistoCentavos: 30_000 })],
        ANCORA,
        '2026-08',
        '2026-08-15',
      )

      expect(saldoEm(curva, '2026-08-31')).toBe(100_000)
    })

    /**
     * Uma ocorrencia de competencia agosto postergada para 1o de setembro
     * afeta o dinheiro de setembro, nao o de agosto.
     */
    it('vencimento que escorrega para o mes seguinte nao entra nesta curva', () => {
      const curva = projetarCurva(
        [item({ competencia: '2026-08', dataVencimento: '2026-09-01' })],
        ANCORA,
        '2026-08',
        '2026-08-15',
      )

      expect(saldoEm(curva, '2026-08-31')).toBe(100_000)
    })
  })

  describe('dia de saldo minimo (RN-36)', () => {
    it('identifica o ponto mais baixo do mes', () => {
      const curva = projetarCurva(
        [
          item({ chave: 'k1', valorPrevistoCentavos: 90_000, dataVencimento: '2026-08-10' }),
          item({ chave: 'k2', tipo: 'entrada', valorPrevistoCentavos: 200_000, dataVencimento: '2026-08-20' }),
        ],
        ANCORA,
        '2026-08',
        '2026-08-01',
      )

      expect(curva.diaMinimo.data).toBe('2026-08-10')
      expect(curva.diaMinimo.saldoCentavos).toBe(10_000)
    })

    it('em caso de empate, escolhe o dia mais cedo', () => {
      const curva = projetarCurva([], ANCORA, '2026-08', '2026-08-01')

      expect(curva.diaMinimo.data).toBe('2026-08-01')
    })
  })

  describe('sem ancora (RN-30)', () => {
    it('parte de zero e marca o saldo como relativo', () => {
      const curva = projetarCurva(
        [item({ valorPrevistoCentavos: 50_000, dataVencimento: '2026-08-10' })],
        null,
        '2026-08',
        '2026-08-15',
      )

      expect(curva.saldoRelativo).toBe(true)
      expect(saldoEm(curva, '2026-08-01')).toBe(0)
      expect(saldoEm(curva, '2026-08-10')).toBe(-50_000)
    })
  })

  describe('ancora fora do mes exibido', () => {
    it('mes futuro parte do saldo ancorado, nao de zero', () => {
      const curva = projetarCurva([], ANCORA, '2026-09', '2026-08-15')

      expect(curva.pontos).toHaveLength(30)
      expect(curva.saldoRelativo).toBe(false)
      expect(saldoEm(curva, '2026-09-01')).toBe(100_000)
    })

    /**
     * O defeito que este teste previne: ao projetar setembro com ancora em 1o
     * de agosto, os movimentos de agosto precisam compor o saldo de partida de
     * setembro. Descarta-los faria setembro comecar com o saldo de agosto,
     * ignorando tudo que acontece no meio -- e o mes futuro apareceria bem
     * mais folgado do que sera.
     */
    it('incorpora ao saldo de partida os movimentos entre a ancora e o mes', () => {
      const curva = projetarCurva(
        [
          item({ chave: 'k1', valorPrevistoCentavos: 30_000, competencia: '2026-08', dataVencimento: '2026-08-20' }),
          item({ chave: 'k2', tipo: 'entrada', valorPrevistoCentavos: 500_000, competencia: '2026-08', dataVencimento: '2026-08-05' }),
        ],
        ANCORA,
        '2026-09',
        '2026-08-15',
      )

      // 100.000 - 30.000 + 500.000
      expect(saldoEm(curva, '2026-09-01')).toBe(570_000)
    })

    it('mes anterior a ancora tem saldo relativo', () => {
      const curva = projetarCurva([], ANCORA, '2026-07', '2026-08-15')

      expect(curva.saldoRelativo).toBe(true)
      expect(saldoEm(curva, '2026-07-01')).toBe(0)
    })
  })
})
