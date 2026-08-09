/**
 * Testes por propriedade do campo monetario (PROP-U01 a PROP-U04).
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { digitosParaCentavos } from './MoneyInput.js'
import { formatarBRL } from '../../domain/money.js'

const valor = () => fc.integer({ min: 0, max: 99_999_999 })

describe('MoneyInput — propriedades', () => {
  /**
   * PROP-U01 · Ida e volta: formatar um valor e reinterpretar os digitos
   * devolve o valor original.
   */
  it('PROP-U01: formatar e reinterpretar devolve o valor original', () => {
    fc.assert(
      fc.property(valor(), (v) => {
        expect(digitosParaCentavos(formatarBRL(v))).toBe(v)
      }),
    )
  })

  /** PROP-U02 · A mascara nunca produz valor nao inteiro. */
  it('PROP-U02: o resultado e sempre inteiro', () => {
    fc.assert(
      fc.property(fc.string(), (texto) => {
        expect(Number.isInteger(digitosParaCentavos(texto))).toBe(true)
      }),
    )
  })

  /** PROP-U03 · A mascara nunca produz valor negativo. */
  it('PROP-U03: o resultado nunca e negativo', () => {
    fc.assert(
      fc.property(fc.string(), (texto) => {
        expect(digitosParaCentavos(texto)).toBeGreaterThanOrEqual(0)
      }),
    )
  })

  /** PROP-U04 · Idempotencia: reaplicar a formatacao nao altera o valor. */
  it('PROP-U04: reformatar e idempotente', () => {
    fc.assert(
      fc.property(valor(), (v) => {
        const umaVez = formatarBRL(digitosParaCentavos(formatarBRL(v)))
        const duasVezes = formatarBRL(digitosParaCentavos(umaVez))
        expect(duasVezes).toBe(umaVez)
      }),
    )
  })

  /** Invariante: texto sem digito algum devolve zero, nunca NaN. */
  it('texto sem digitos devolve zero', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[^\d]*$/u), (texto) => {
        expect(digitosParaCentavos(texto)).toBe(0)
      }),
    )
  })
})
