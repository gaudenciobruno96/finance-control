/**
 * Testes por propriedade de DOM-03 (PROP-C01 a PROP-C07).
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  aplicarAjuste,
  competenciaDe,
  compararCompetencias,
  construirData,
  diasDaCompetencia,
  ehFimDeSemana,
  intervaloDeCompetencias,
  somarDias,
  somarMeses,
  ultimoDiaDoMes,
} from './calendar.js'
import {
  ajusteFimDeSemana,
  competencia,
  dataISO,
  diaDoMes,
} from '../test-support/generators.js'

describe('calendar — propriedades', () => {
  /** PROP-C01 · Ida e volta: avancar e retroceder devolve a data original. */
  it('PROP-C01: somarDias e reversivel', () => {
    fc.assert(
      fc.property(dataISO(), fc.integer({ min: -1000, max: 1000 }), (d, n) => {
        expect(somarDias(somarDias(d, n), -n)).toBe(d)
      }),
    )
  })

  /**
   * PROP-C02 · Invariante: construirData nunca devolve data de outro mes.
   *
   * E a garantia de que o truncamento de RN-05 nunca transborda: dia 31 em
   * abril e 30 de abril, jamais 1o de maio.
   */
  it('PROP-C02: construirData permanece dentro da competencia', () => {
    fc.assert(
      fc.property(competencia(), diaDoMes(), (c, dia) => {
        expect(construirData(c, dia).slice(0, 7)).toBe(c)
      }),
    )
  })

  /** PROP-C03 · Invariante: o dia devolvido nunca excede o tamanho do mes. */
  it('PROP-C03: o dia construido nunca excede o ultimo dia do mes', () => {
    fc.assert(
      fc.property(competencia(), diaDoMes(), (c, dia) => {
        const construido = Number(construirData(c, dia).slice(8, 10))
        expect(construido).toBeLessThanOrEqual(ultimoDiaDoMes(c))
        expect(construido).toBeGreaterThanOrEqual(1)
        expect(construido).toBe(Math.min(dia, ultimoDiaDoMes(c)))
      }),
    )
  })

  /** PROP-C04 · Invariante: antecipar ou postergar nunca resulta em fim de semana. */
  it('PROP-C04: ajuste ativo nunca deixa a data em fim de semana', () => {
    fc.assert(
      fc.property(dataISO(), fc.constantFrom('antecipa' as const, 'posterga' as const), (d, a) => {
        expect(ehFimDeSemana(aplicarAjuste(d, a))).toBe(false)
      }),
    )
  })

  /** PROP-C05 · Idempotencia: aplicar o mesmo ajuste duas vezes nao muda nada. */
  it('PROP-C05: aplicarAjuste e idempotente', () => {
    fc.assert(
      fc.property(dataISO(), ajusteFimDeSemana(), (d, a) => {
        const umaVez = aplicarAjuste(d, a)
        expect(aplicarAjuste(umaVez, a)).toBe(umaVez)
      }),
    )
  })

  /** PROP-C06 · Invariante: a competencia sobrevive a ida e volta. */
  it('PROP-C06: competenciaDe(construirData(c, dia)) devolve c', () => {
    fc.assert(
      fc.property(competencia(), diaDoMes(), (c, dia) => {
        expect(competenciaDe(construirData(c, dia))).toBe(c)
      }),
    )
  })

  /** PROP-C07 · Oraculo: o intervalo e contiguo, ordenado e sem repeticao. */
  it('PROP-C07: intervaloDeCompetencias e contiguo e sem repeticao', () => {
    fc.assert(
      fc.property(competencia(), fc.integer({ min: 0, max: 36 }), (de, n) => {
        const ate = somarMeses(de, n)
        const intervalo = intervaloDeCompetencias(de, ate)

        expect(intervalo).toHaveLength(n + 1)
        expect(intervalo[0]).toBe(de)
        expect(intervalo[intervalo.length - 1]).toBe(ate)
        expect(new Set(intervalo).size).toBe(intervalo.length)

        for (let i = 1; i < intervalo.length; i += 1) {
          const anterior = intervalo[i - 1] as string
          const atual = intervalo[i] as string
          expect(somarMeses(anterior, 1)).toBe(atual)
          expect(compararCompetencias(anterior, atual)).toBeLessThan(0)
        }
      }),
    )
  })

  /** Invariante adicional: diasDaCompetencia cobre exatamente o mes. */
  it('diasDaCompetencia lista exatamente os dias do mes, em ordem', () => {
    fc.assert(
      fc.property(competencia(), (c) => {
        const dias = diasDaCompetencia(c)

        expect(dias).toHaveLength(ultimoDiaDoMes(c))
        expect(dias[0]).toBe(`${c}-01`)
        for (let i = 1; i < dias.length; i += 1) {
          expect(somarDias(dias[i - 1] as string, 1)).toBe(dias[i] as string)
        }
      }),
    )
  })

  /** Invariante adicional: somarMeses e reversivel. */
  it('somarMeses e reversivel', () => {
    fc.assert(
      fc.property(competencia(), fc.integer({ min: -60, max: 60 }), (c, n) => {
        expect(somarMeses(somarMeses(c, n), -n)).toBe(c)
      }),
    )
  })
})
