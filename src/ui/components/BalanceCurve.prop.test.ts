/**
 * Testes por propriedade da curva (PROP-U05, PROP-U06).
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { calcularPontos } from './BalanceCurve.js'
import type { CurvaSaldo, PontoCurva } from '../../domain/types.js'

const curva = (): fc.Arbitrary<CurvaSaldo> =>
  fc
    .array(fc.integer({ min: -500_000, max: 500_000 }), { minLength: 1, maxLength: 31 })
    .map((saldos) => {
      const pontos: PontoCurva[] = saldos.map((saldoCentavos, i) => ({
        data: `2026-08-${String(i + 1).padStart(2, '0')}`,
        saldoCentavos,
      }))
      const diaMinimo = pontos.reduce((a, b) => (b.saldoCentavos < a.saldoCentavos ? b : a))
      return { pontos, diaMinimo, saldoRelativo: false }
    })

describe('BalanceCurve — propriedades', () => {
  /** PROP-U05 · Um ponto de tela por ponto da curva recebida. */
  it('PROP-U05: a polilinha tem um ponto por elemento da curva', () => {
    fc.assert(
      fc.property(curva(), (c) => {
        expect(calcularPontos(c)).toHaveLength(c.pontos.length)
      }),
    )
  })

  /**
   * PROP-U06 · Toda coordenada e finita.
   *
   * O caso que isto previne: curva de um unico ponto, ou com todos os saldos
   * iguais, tem amplitude zero. Uma normalizacao ingenua dividiria por zero,
   * produzindo NaN em toda coordenada -- e o SVG desapareceria em silencio.
   */
  it('PROP-U06: nenhuma coordenada e NaN ou infinita', () => {
    fc.assert(
      fc.property(curva(), (c) => {
        for (const p of calcularPontos(c)) {
          expect(Number.isFinite(p.x)).toBe(true)
          expect(Number.isFinite(p.y)).toBe(true)
        }
      }),
    )
  })

  it('PROP-U06: curva de saldos todos iguais nao produz NaN', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 1, max: 31 }),
        (saldo, quantidade) => {
          const pontos: PontoCurva[] = Array.from({ length: quantidade }, (_, i) => ({
            data: `2026-08-${String(i + 1).padStart(2, '0')}`,
            saldoCentavos: saldo,
          }))
          const c: CurvaSaldo = { pontos, diaMinimo: pontos[0]!, saldoRelativo: false }

          for (const p of calcularPontos(c)) {
            expect(Number.isFinite(p.x)).toBe(true)
            expect(Number.isFinite(p.y)).toBe(true)
          }
        },
      ),
    )
  })

  /** Invariante: toda coordenada fica dentro da area de desenho. */
  it('as coordenadas ficam dentro do viewBox', () => {
    fc.assert(
      fc.property(curva(), (c) => {
        for (const p of calcularPontos(c)) {
          expect(p.x).toBeGreaterThanOrEqual(0)
          expect(p.x).toBeLessThanOrEqual(320)
          expect(p.y).toBeGreaterThanOrEqual(0)
          expect(p.y).toBeLessThanOrEqual(120)
        }
      }),
    )
  })
})
