/**
 * Testes por propriedade de DOM-12 (PROP-A01 a PROP-A03).
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { mediaDosUltimosPagos } from './estimation.js'
import { centavosPositivo, dataISO } from '../test-support/generators.js'
import type { Ocorrencia } from './types.js'

/** Historico de pagamentos de uma unica regra, com datas distintas. */
const historico = (quantidade: number): fc.Arbitrary<readonly Ocorrencia[]> =>
  fc
    .uniqueArray(fc.tuple(dataISO(), centavosPositivo()), {
      minLength: quantidade,
      maxLength: quantidade,
      selector: ([data]) => data,
    })
    .map((pares) =>
      pares.map(([data, valor], i) => ({
        id: `o${i}`,
        geradorTipo: 'regra' as const,
        geradorId: 'luz',
        competencia: data.slice(0, 7),
        tipo: 'saida' as const,
        nome: 'Conta de luz',
        valorPrevistoCentavos: 15_000,
        dataVencimento: data,
        dataPagamento: data,
        valorPagoCentavos: valor,
        ignorado: false,
        observacao: null,
      })),
    )

describe('estimation — propriedades', () => {
  /** PROP-A01 · A media fica entre o menor e o maior valor da amostra. */
  it('PROP-A01: a media fica dentro da faixa dos valores considerados', () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 12 }), (n) =>
        fc.assert(
          fc.property(historico(n), (ocorrencias) => {
            const resultado = mediaDosUltimosPagos(ocorrencias, 'luz', 3)
            expect(resultado).not.toBeNull()

            const consideradas = [...ocorrencias]
              .sort((a, b) => (b.dataPagamento! < a.dataPagamento! ? -1 : 1))
              .slice(0, 3)
              .map((o) => o.valorPagoCentavos as number)

            expect(resultado as number).toBeGreaterThanOrEqual(Math.min(...consideradas))
            expect(resultado as number).toBeLessThanOrEqual(Math.max(...consideradas))
          }),
          { numRuns: 20 },
        ),
      ),
      { numRuns: 5 },
    )
  })

  /** PROP-A02 · Amostra insuficiente devolve nulo (RN-38). */
  it('PROP-A02: amostra menor que o exigido devolve nulo', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (n) =>
        fc.assert(
          fc.property(historico(n), (ocorrencias) => {
            expect(mediaDosUltimosPagos(ocorrencias, 'luz', n + 1)).toBeNull()
          }),
          { numRuns: 10 },
        ),
      ),
      { numRuns: 6 },
    )
  })

  /** PROP-A03 · O resultado e sempre inteiro em centavos. */
  it('PROP-A03: a media e sempre inteira', () => {
    fc.assert(
      fc.property(historico(5), (ocorrencias) => {
        const resultado = mediaDosUltimosPagos(ocorrencias, 'luz', 3)
        expect(Number.isInteger(resultado)).toBe(true)
      }),
    )
  })

  /** Invariante: o resultado independe da ordem em que o historico chega. */
  it('o resultado independe da ordem do historico', () => {
    fc.assert(
      fc.property(historico(6), (ocorrencias) => {
        const normal = mediaDosUltimosPagos(ocorrencias, 'luz', 3)
        const invertido = mediaDosUltimosPagos([...ocorrencias].reverse(), 'luz', 3)

        expect(invertido).toBe(normal)
      }),
    )
  })

  /** Invariante: uma regra sem historico nunca produz sugestao. */
  it('regra sem historico nao produz sugestao', () => {
    fc.assert(
      fc.property(historico(6), (ocorrencias) => {
        expect(mediaDosUltimosPagos(ocorrencias, 'outra-regra', 3)).toBeNull()
      }),
    )
  })
})
