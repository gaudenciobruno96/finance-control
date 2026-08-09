/**
 * Testes por propriedade de DOM-08 (PROP-P01 a PROP-P07).
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { projetarCurva } from './balance-projector.js'
import { diasDaCompetencia } from './calendar.js'
import { somar } from './money.js'
import { cenarioDeProjecao } from '../test-support/coherent-state.js'
import type { Centavos, OcorrenciaResolvida } from './types.js'

/**
 * Oraculo: soma direta dos movimentos, por um caminho completamente diferente
 * do acumulador incremental do projetor.
 */
function somaDireta(ocorrencias: readonly OcorrenciaResolvida[]): Centavos {
  const valores = ocorrencias
    .filter((o) => !o.ignorado && !o.ehComponenteDeFatura)
    .map((o) => {
      const valor = o.valorPagoCentavos ?? o.valorPrevistoCentavos
      return o.tipo === 'entrada' ? valor : -valor
    })
  return somar(...valores)
}

describe('balance-projector — propriedades', () => {
  /**
   * PROP-P01 · O saldo do ultimo ponto e igual a ancora somada a todos os
   * movimentos do periodo.
   *
   * E a propriedade central do projetor: se qualquer movimento for contado a
   * mais, a menos, ou com sinal trocado, esta igualdade quebra.
   */
  it('PROP-P01: saldo final = ancora + soma de todos os movimentos', () => {
    fc.assert(
      fc.property(cenarioDeProjecao(), (cenario) => {
        const curva = projetarCurva(
          cenario.ocorrencias,
          cenario.ancora,
          cenario.competencia,
          cenario.hoje,
        )

        const base = cenario.ancora?.saldoCentavos ?? 0
        const esperado = base + somaDireta(cenario.ocorrencias)
        const ultimo = curva.pontos[curva.pontos.length - 1]

        expect(ultimo?.saldoCentavos).toBe(esperado)
      }),
    )
  })

  /**
   * PROP-P02 · A curva e contigua, sem lacuna nem repeticao, e termina no
   * ultimo dia da competencia.
   *
   * O enunciado original era "um ponto por dia da competencia". O teste
   * stateful da Unidade 2 expos a contradicao: quando a ancora cai DENTRO do
   * mes exibido, a curva comeca no dia da ancora, nao no dia 1 -- desenhar os
   * dias anteriores seria inventar saldo que o usuario nunca declarou.
   *
   * O comportamento esta correto; o enunciado e que estava errado.
   */
  it('PROP-P02: a curva e contigua e termina no ultimo dia do mes', () => {
    fc.assert(
      fc.property(cenarioDeProjecao(), (cenario) => {
        const curva = projetarCurva(
          cenario.ocorrencias,
          cenario.ancora,
          cenario.competencia,
          cenario.hoje,
        )

        const dias = diasDaCompetencia(cenario.competencia)
        const esperados = [...dias].slice(dias.length - curva.pontos.length)

        expect(curva.pontos.length).toBeGreaterThan(0)
        expect(curva.pontos.map((p) => p.data)).toEqual(esperados)
      }),
    )
  })

  /**
   * Complemento de PROP-P02: com ancora dentro do mes, a curva comeca
   * exatamente no dia da ancora.
   *
   * Caso que o gerador de cenario nao alcanca, por ancorar sempre no dia 1.
   */
  it('PROP-P02: com ancora no meio do mes, a curva comeca na ancora', () => {
    fc.assert(
      fc.property(
        cenarioDeProjecao(),
        fc.integer({ min: 1, max: 28 }),
        (cenario, diaDaAncora) => {
          const data = `${cenario.competencia}-${String(diaDaAncora).padStart(2, '0')}`
          const curva = projetarCurva(
            cenario.ocorrencias,
            { id: 'a', data, saldoCentavos: 100_000 },
            cenario.competencia,
            cenario.hoje,
          )

          expect(curva.pontos[0]?.data).toBe(data)
          expect(curva.saldoRelativo).toBe(false)
        },
      ),
    )
  })

  /** PROP-P03 · O dia de saldo minimo tem saldo menor ou igual a todos. */
  it('PROP-P03: o dia minimo e realmente o menor saldo', () => {
    fc.assert(
      fc.property(cenarioDeProjecao(), (cenario) => {
        const curva = projetarCurva(
          cenario.ocorrencias,
          cenario.ancora,
          cenario.competencia,
          cenario.hoje,
        )

        for (const p of curva.pontos) {
          expect(curva.diaMinimo.saldoCentavos).toBeLessThanOrEqual(p.saldoCentavos)
        }
      }),
    )
  })

  /** PROP-P03b · Em caso de empate, o minimo e o mais cedo (RN-36). */
  it('PROP-P03: em caso de empate, o dia minimo e o mais cedo', () => {
    fc.assert(
      fc.property(cenarioDeProjecao(), (cenario) => {
        const curva = projetarCurva(
          cenario.ocorrencias,
          cenario.ancora,
          cenario.competencia,
          cenario.hoje,
        )

        const primeiroComMinimo = curva.pontos.find(
          (p) => p.saldoCentavos === curva.diaMinimo.saldoCentavos,
        )
        expect(curva.diaMinimo.data).toBe(primeiroComMinimo?.data)
      }),
    )
  })

  /** PROP-P04 · Ocorrencias ignoradas nao alteram a curva (RN-35). */
  it('PROP-P04: itens ignorados nao afetam a curva', () => {
    fc.assert(
      fc.property(cenarioDeProjecao(), (cenario) => {
        const comIgnorados = projetarCurva(
          cenario.ocorrencias,
          cenario.ancora,
          cenario.competencia,
          cenario.hoje,
        )
        const semIgnorados = projetarCurva(
          cenario.ocorrencias.filter((o) => !o.ignorado),
          cenario.ancora,
          cenario.competencia,
          cenario.hoje,
        )

        expect(comIgnorados.pontos).toEqual(semIgnorados.pontos)
      }),
    )
  })

  /**
   * PROP-P05 · Componentes de fatura nao alteram a curva por si sos (RN-18).
   *
   * E a propriedade que impede a dupla contagem: se uma parcela de cartao
   * entrasse na curva alem de estar somada na fatura, remove-la mudaria o
   * resultado.
   */
  it('PROP-P05: componentes de fatura nao afetam a curva', () => {
    fc.assert(
      fc.property(cenarioDeProjecao(), (cenario) => {
        const comTodos = projetarCurva(
          cenario.ocorrencias,
          cenario.ancora,
          cenario.competencia,
          cenario.hoje,
        )
        const semComponentes = projetarCurva(
          cenario.ocorrencias.filter((o) => !o.ehComponenteDeFatura),
          cenario.ancora,
          cenario.competencia,
          cenario.hoje,
        )

        expect(comTodos.pontos).toEqual(semComponentes.pontos)
      }),
    )
  })

  /** PROP-P06 · Oraculo: cada ponto equivale a soma dos movimentos ate ali. */
  it('PROP-P06: cada ponto equivale a soma direta dos movimentos ate o dia', () => {
    fc.assert(
      fc.property(cenarioDeProjecao(), (cenario) => {
        const curva = projetarCurva(
          cenario.ocorrencias,
          cenario.ancora,
          cenario.competencia,
          cenario.hoje,
        )
        const base = cenario.ancora?.saldoCentavos ?? 0

        for (const ponto of curva.pontos) {
          const ateOdia = cenario.ocorrencias.filter(
            (o) => (o.dataPagamento ?? o.dataVencimento) <= ponto.data,
          )
          expect(ponto.saldoCentavos).toBe(base + somaDireta(ateOdia))
        }
      }),
    )
  })

  /**
   * PROP-P07 · Sem ancora, a FORMA da curva e identica; apenas o nivel se
   * desloca (RN-30).
   *
   * E o que justifica exibir a curva antes de o usuario informar seu saldo: o
   * dia de aperto ja esta correto.
   */
  it('PROP-P07: sem ancora, a forma da curva e preservada', () => {
    fc.assert(
      fc.property(cenarioDeProjecao(), (cenario) => {
        const ancora = {
          id: 'a',
          data: `${cenario.competencia}-01`,
          saldoCentavos: 123_456,
        }

        const comAncora = projetarCurva(
          cenario.ocorrencias,
          ancora,
          cenario.competencia,
          cenario.hoje,
        )
        const semAncora = projetarCurva(
          cenario.ocorrencias,
          null,
          cenario.competencia,
          cenario.hoje,
        )

        expect(semAncora.saldoRelativo).toBe(true)
        expect(comAncora.saldoRelativo).toBe(false)

        // Toda diferenca entre pontos correspondentes e constante.
        for (let i = 0; i < comAncora.pontos.length; i += 1) {
          const a = comAncora.pontos[i]
          const b = semAncora.pontos[i]
          expect((a?.saldoCentavos ?? 0) - (b?.saldoCentavos ?? 0)).toBe(123_456)
        }

        // E o dia de aperto e o mesmo, com ou sem ancora.
        expect(semAncora.diaMinimo.data).toBe(comAncora.diaMinimo.data)
      }),
    )
  })
})
