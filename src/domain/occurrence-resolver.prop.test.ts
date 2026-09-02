/**
 * Testes por propriedade de DOM-07 (PROP-R01 a PROP-R05).
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { resolver } from './occurrence-resolver.js'
import { expandirRegras } from './rule-expander.js'
import { competencia, dataISO, ocorrencia, regra } from '../test-support/generators.js'

const conjunto = () => fc.uniqueArray(regra(), { maxLength: 6, selector: (r) => r.id })
const reais = () => fc.uniqueArray(ocorrencia(), { maxLength: 8, selector: (o) => o.id })

describe('occurrence-resolver — propriedades', () => {
  /** PROP-R01 · Idempotencia: resolver o resultado nao muda nada. */
  it('PROP-R01: resolver e idempotente', () => {
    fc.assert(
      fc.property(conjunto(), competencia(), reais(), dataISO(), (regras, c, rs, hoje) => {
        const virtuais = expandirRegras(regras, [c])
        const primeira = resolver(virtuais, rs, hoje)
        const segunda = resolver(virtuais, rs, hoje)

        expect(segunda).toEqual(primeira)
      }),
    )
  })

  /** PROP-R02 · Nenhuma virtual sobrevive quando existe real de mesma chave. */
  it('PROP-R02: real sempre sobrepoe virtual de mesma chave', () => {
    fc.assert(
      fc.property(conjunto(), competencia(), dataISO(), (regras, c, hoje) => {
        const virtuais = expandirRegras(regras, [c])
        if (virtuais.length === 0) return

        const alvo = virtuais[0]!
        const realCorrespondente = {
          id: 'real-1',
          geradorTipo: 'regra' as const,
          geradorId: alvo.geradorId,
          competencia: alvo.competencia,
          tipo: alvo.tipo,
          nome: alvo.nome,
          valorPrevistoCentavos: 99_999,
          dataVencimento: alvo.dataVencimento,
          dataPagamento: null,
          valorPagoCentavos: null,
          pagamentoRegistradoEm: null,
          ignorado: false,
          observacao: null,
        }

        const resolvidas = resolver(virtuais, [realCorrespondente], hoje)
        const daChave = resolvidas.filter((o) => o.chave === alvo.chave)

        expect(daChave).toHaveLength(1)
        expect(daChave[0]?.origem).toBe('real')
        expect(daChave[0]?.valorPrevistoCentavos).toBe(99_999)
      }),
    )
  })

  /** PROP-R03 · Toda ocorrencia avulsa aparece no resultado. */
  it('PROP-R03: avulsas nunca somem', () => {
    fc.assert(
      fc.property(conjunto(), competencia(), reais(), dataISO(), (regras, c, rs, hoje) => {
        const avulsas = rs.filter((o) => o.geradorTipo === 'avulso')
        const resolvidas = resolver(expandirRegras(regras, [c]), rs, hoje)
        const avulsasResolvidas = resolvidas.filter((o) => o.geradorTipo === 'avulso')

        expect(avulsasResolvidas).toHaveLength(avulsas.length)
      }),
    )
  })

  /** PROP-R04 · O resultado nao contem chaves duplicadas entre nao avulsas. */
  it('PROP-R04: sem chaves duplicadas', () => {
    fc.assert(
      fc.property(conjunto(), competencia(), reais(), dataISO(), (regras, c, rs, hoje) => {
        const resolvidas = resolver(expandirRegras(regras, [c]), rs, hoje)
        const chaves = resolvidas
          .filter((o) => o.geradorTipo !== 'avulso')
          .map((o) => o.chave)

        expect(new Set(chaves).size).toBe(chaves.length)
      }),
    )
  })

  /**
   * PROP-R05 · Comutatividade: o resultado independe da ordem das entradas.
   *
   * E a propriedade que o indice de PAD-06 compra. Uma implementacao com busca
   * aninhada sensivel a ordem falharia aqui.
   */
  it('PROP-R05: o resultado independe da ordem das entradas', () => {
    fc.assert(
      fc.property(conjunto(), competencia(), reais(), dataISO(), (regras, c, rs, hoje) => {
        const virtuais = expandirRegras(regras, [c])

        const normal = resolver(virtuais, rs, hoje)
        const invertida = resolver([...virtuais].reverse(), [...rs].reverse(), hoje)

        expect(invertida).toEqual(normal)
      }),
    )
  })

  /** Invariante: toda entrada aparece exatamente uma vez na saida. */
  it('nenhuma ocorrencia e perdida nem duplicada', () => {
    fc.assert(
      fc.property(conjunto(), competencia(), dataISO(), (regras, c, hoje) => {
        const virtuais = expandirRegras(regras, [c])
        const resolvidas = resolver(virtuais, [], hoje)

        expect(resolvidas).toHaveLength(virtuais.length)
      }),
    )
  })
})
