/**
 * Testes por propriedade de DOM-02 (PROP-M01 a PROP-M05).
 *
 * Semente aleatoria a cada execucao; o fast-check reporta a semente na saida
 * quando uma propriedade falha, tornando qualquer falha reproduzivel (PBT-08).
 * O shrinking e nativo e nao esta desabilitado.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  deEntradaUsuario,
  formatarBRL,
  media,
  multiplicarPorInteiro,
  somar,
  subtrair,
} from './money.js'
import { centavos, centavosPositivo } from '../test-support/generators.js'

describe('money — propriedades', () => {
  /** PROP-M01 · Invariante: a soma de quaisquer centavos e inteira. */
  it('PROP-M01: soma de centavos e sempre inteira', () => {
    fc.assert(
      fc.property(fc.array(centavos(), { maxLength: 50 }), (valores) => {
        expect(Number.isInteger(somar(...valores))).toBe(true)
      }),
    )
  })

  /** PROP-M02 · Comutatividade. */
  it('PROP-M02: somar e comutativa', () => {
    fc.assert(
      fc.property(centavos(), centavos(), (a, b) => {
        expect(somar(a, b)).toBe(somar(b, a))
      }),
    )
  })

  /** PROP-M03 · Invariante: subtrair desfaz somar. */
  it('PROP-M03: subtrair(somar(a, b), b) devolve a', () => {
    fc.assert(
      fc.property(centavos(), centavos(), (a, b) => {
        expect(subtrair(somar(a, b), b)).toBe(a)
      }),
    )
  })

  /**
   * PROP-M04 · Ida e volta: formatar e reinterpretar devolve o valor original.
   *
   * O simbolo de moeda e removido antes da reinterpretacao: converter texto
   * formatado de volta e responsabilidade da camada de interface, que recebe
   * apenas digitos e separadores do campo de entrada.
   */
  it('PROP-M04: deEntradaUsuario(formatarBRL(v)) devolve v', () => {
    fc.assert(
      fc.property(centavos(), (v) => {
        const semSimbolo = formatarBRL(v).replace(/[^\d.,-]/gu, '')
        expect(deEntradaUsuario(semSimbolo)).toBe(v)
      }),
    )
  })

  /** PROP-M05 · Invariante: multiplicar equivale a somar repetidamente. */
  it('PROP-M05: multiplicarPorInteiro equivale a soma repetida', () => {
    fc.assert(
      fc.property(
        centavosPositivo(),
        fc.integer({ min: 0, max: 24 }),
        (valor, n) => {
          const repetido = somar(...Array.from({ length: n }, () => valor))
          expect(multiplicarPorInteiro(valor, n)).toBe(repetido)
        },
      ),
    )
  })

  /** PROP-A01 · A media esta entre o menor e o maior valor da amostra. */
  it('PROP-A01: a media fica dentro da faixa da amostra', () => {
    fc.assert(
      fc.property(
        fc.array(centavosPositivo(), { minLength: 1, maxLength: 24 }),
        (valores) => {
          const m = media(valores)
          expect(m).not.toBeNull()
          expect(m as number).toBeGreaterThanOrEqual(Math.min(...valores))
          expect(m as number).toBeLessThanOrEqual(Math.max(...valores))
        },
      ),
    )
  })

  /** PROP-A03 · A media devolvida e sempre inteira em centavos. */
  it('PROP-A03: a media e sempre inteira', () => {
    fc.assert(
      fc.property(
        fc.array(centavos(), { minLength: 1, maxLength: 24 }),
        (valores) => {
          expect(Number.isInteger(media(valores))).toBe(true)
        },
      ),
    )
  })
})
