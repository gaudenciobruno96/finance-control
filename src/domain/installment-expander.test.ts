import { describe, expect, it } from 'vitest'
import { expandirParcelamentos } from './installment-expander.js'
import { intervaloDeCompetencias } from './calendar.js'
import type { Parcelamento } from './types.js'

function parcelamento(over: Partial<Parcelamento> = {}): Parcelamento {
  return {
    id: 'p1',
    nome: 'Geladeira',
    valorParcelaCentavos: 25_000,
    quantidadeParcelas: 10,
    primeiroVencimento: '2026-08-15',
    categoria: null,
    ...over,
  }
}

describe('installment-expander', () => {
  it('produz exatamente uma ocorrencia por parcela (RN-16)', () => {
    const p = parcelamento({ quantidadeParcelas: 10 })
    const ocorrencias = expandirParcelamentos([p], intervaloDeCompetencias('2026-08', '2027-12'))

    expect(ocorrencias).toHaveLength(10)
    expect(ocorrencias.map((o) => o.numeroParcela)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('numera as parcelas no nome', () => {
    const ocorrencias = expandirParcelamentos([parcelamento({ quantidadeParcelas: 3 })], [
      '2026-08',
      '2026-09',
      '2026-10',
    ])

    expect(ocorrencias.map((o) => o.nome)).toEqual([
      'Geladeira (1/3)',
      'Geladeira (2/3)',
      'Geladeira (3/3)',
    ])
  })

  it('recorta pelo intervalo consultado sem renumerar', () => {
    const p = parcelamento({ quantidadeParcelas: 10, primeiroVencimento: '2026-08-15' })
    const ocorrencias = expandirParcelamentos([p], ['2026-10'])

    expect(ocorrencias).toHaveLength(1)
    expect(ocorrencias[0]?.numeroParcela).toBe(3)
  })

  /**
   * RN-17 combinado com o cuidado registrado no algoritmo: o dia BASE e
   * preservado, nao o dia truncado.
   *
   * Um parcelamento iniciado em 31 de janeiro vence em 28 de fevereiro e VOLTA
   * a 31 de marco. Propagar o dia truncado faria todas as parcelas seguintes
   * migrarem para o dia 28 -- erro cumulativo que so apareceria meses depois.
   */
  it('nao erode o dia base ao atravessar meses curtos', () => {
    const p = parcelamento({ quantidadeParcelas: 4, primeiroVencimento: '2026-01-31' })
    const ocorrencias = expandirParcelamentos(
      [p],
      intervaloDeCompetencias('2026-01', '2026-04'),
    )

    expect(ocorrencias.map((o) => o.dataVencimento)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('trata parcelamento de uma unica parcela', () => {
    const ocorrencias = expandirParcelamentos([parcelamento({ quantidadeParcelas: 1 })], ['2026-08'])

    expect(ocorrencias).toHaveLength(1)
    expect(ocorrencias[0]?.nome).toBe('Geladeira (1/1)')
  })


  it('sempre produz saida, nunca entrada', () => {
    const ocorrencias = expandirParcelamentos([parcelamento()], ['2026-08'])

    expect(ocorrencias.every((o) => o.tipo === 'saida')).toBe(true)
  })
})
