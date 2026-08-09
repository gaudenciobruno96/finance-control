/**
 * Testes por propriedade de DOM-04 (PROP-X01, PROP-X02, PROP-X04, PROP-X05).
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { expandirRegras, regraVigenteEm } from './rule-expander.js'
import {
  competenciaDe,
  intervaloDeCompetencias,
  somarMeses,
  ultimoDiaDoMes,
} from './calendar.js'
import { competencia, regra } from '../test-support/generators.js'

/**
 * Conjunto de regras com identificadores distintos.
 *
 * `fc.array` poderia produzir duas regras com o mesmo id, e a propriedade de
 * unicidade de chave falharia por defeito do proprio teste, nao do codigo. Um
 * estado real nunca tem duas entidades com o mesmo identificador.
 */
const conjuntoDeRegras = () =>
  fc.uniqueArray(regra(), { maxLength: 8, selector: (r) => r.id })

/** Intervalo de tamanho controlado, para manter as execucoes rapidas. */
const intervalo = () =>
  fc
    .tuple(competencia(), fc.integer({ min: 0, max: 18 }))
    .map(([de, n]) => intervaloDeCompetencias(de, somarMeses(de, n)))

describe('rule-expander — propriedades', () => {
  /** PROP-X01 · Toda ocorrencia expandida cai dentro do intervalo pedido. */
  it('PROP-X01: nenhuma ocorrencia fora do intervalo', () => {
    fc.assert(
      fc.property(conjuntoDeRegras(), intervalo(), (regras, meses) => {
        const dentro = new Set(meses)
        for (const o of expandirRegras(regras, meses)) {
          expect(dentro.has(o.competencia)).toBe(true)
        }
      }),
    )
  })

  /** PROP-X02 · Uma regra produz no maximo uma ocorrencia por competencia. */
  it('PROP-X02: no maximo uma ocorrencia por regra por competencia', () => {
    fc.assert(
      fc.property(conjuntoDeRegras(), intervalo(), (regras, meses) => {
        const chaves = expandirRegras(regras, meses).map((o) => o.chave)
        expect(new Set(chaves).size).toBe(chaves.length)
      }),
    )
  })

  /**
   * PROP-X04 · A competencia independe do ajuste de fim de semana aplicado.
   *
   * E a propriedade que protege RN-08. Expandir a mesma regra com os tres
   * ajustes possiveis produz vencimentos potencialmente diferentes, mas SEMPRE
   * a mesma competencia e a mesma chave.
   */
  it('PROP-X04: a competencia nao muda com o ajuste de fim de semana', () => {
    fc.assert(
      fc.property(regra(), competencia(), (r, c) => {
        if (!regraVigenteEm(r, c)) return

        const [semAjuste] = expandirRegras([{ ...r, ajusteFimDeSemana: 'nenhum' }], [c])
        const [antecipado] = expandirRegras([{ ...r, ajusteFimDeSemana: 'antecipa' }], [c])
        const [postergado] = expandirRegras([{ ...r, ajusteFimDeSemana: 'posterga' }], [c])

        expect(semAjuste?.competencia).toBe(c)
        expect(antecipado?.competencia).toBe(c)
        expect(postergado?.competencia).toBe(c)

        expect(antecipado?.chave).toBe(semAjuste?.chave)
        expect(postergado?.chave).toBe(semAjuste?.chave)
      }),
    )
  })

  /** PROP-X05 · Nenhuma ocorrencia e emitida fora da vigencia da regra. */
  it('PROP-X05: nada e emitido fora da vigencia', () => {
    fc.assert(
      fc.property(conjuntoDeRegras(), intervalo(), (regras, meses) => {
        const porId = new Map(regras.map((r) => [r.id, r]))

        for (const o of expandirRegras(regras, meses)) {
          const r = porId.get(o.geradorId as string)
          expect(r).toBeDefined()
          expect(regraVigenteEm(r!, o.competencia)).toBe(true)
        }
      }),
    )
  })

  /**
   * Invariante complementar: sem ajuste, o vencimento fica sempre dentro da
   * competencia, e o dia nunca excede o tamanho do mes (RN-05).
   */
  it('sem ajuste, o vencimento permanece na competencia e respeita o mes', () => {
    fc.assert(
      fc.property(regra(), competencia(), (r, c) => {
        const semAjuste = { ...r, ajusteFimDeSemana: 'nenhum' as const }
        const [o] = expandirRegras([semAjuste], [c])
        if (!o) return

        expect(competenciaDe(o.dataVencimento)).toBe(c)
        expect(Number(o.dataVencimento.slice(8, 10))).toBeLessThanOrEqual(ultimoDiaDoMes(c))
      }),
    )
  })

  /** Invariante complementar: o valor previsto vem da regra, sem alteracao. */
  it('o valor previsto e exatamente o da regra vigente', () => {
    fc.assert(
      fc.property(conjuntoDeRegras(), intervalo(), (regras, meses) => {
        const porId = new Map(regras.map((r) => [r.id, r]))

        for (const o of expandirRegras(regras, meses)) {
          expect(o.valorPrevistoCentavos).toBe(porId.get(o.geradorId as string)?.valorCentavos)
        }
      }),
    )
  })
})
