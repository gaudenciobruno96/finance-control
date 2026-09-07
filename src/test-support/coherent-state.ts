/**
 * SUP-05 — Gerador de estado coerente.
 *
 * As propriedades de projecao (PROP-P01 a PROP-P07) nao podem ser verificadas
 * com entidades avulsas. Testar que "o saldo final e a ancora mais todos os
 * movimentos" exige um estado que faca sentido como um todo: datas dentro da
 * competencia, pagamentos coerentes, componentes de fatura marcados.
 *
 * Sem este gerador, as sete propriedades mais valiosas da unidade seriam
 * inverificaveis.
 */

import fc from 'fast-check'
import { diasNoMes } from '../domain/guards.js'
import { chaveDe } from '../domain/occurrence-key.js'
import type {
  AncoraSaldo,
  Competencia,
  DataISO,
  OcorrenciaResolvida,
} from '../domain/types.js'
import { centavosPositivo, competencia, tipoMovimento } from './generators.js'

export interface CenarioDeProjecao {
  readonly competencia: Competencia
  readonly hoje: DataISO
  readonly ancora: AncoraSaldo | null
  readonly ocorrencias: readonly OcorrenciaResolvida[]
}

function dataNaCompetencia(c: Competencia, dia: number): DataISO {
  const ano = Number(c.slice(0, 4))
  const mes = Number(c.slice(5, 7))
  const limite = diasNoMes(ano, mes)
  return `${c}-${String(Math.min(dia, limite)).padStart(2, '0')}`
}

/**
 * Ocorrencia resolvida cujas datas caem dentro de uma competencia.
 *
 * Mantem as invariantes que importam para a projecao: pagamento tem data e
 * valor juntos, item ignorado nao tem pagamento, e a data de pagamento fica
 * dentro do mesmo mes.
 */
function ocorrenciaNaCompetencia(
  c: Competencia,
  indice: number,
): fc.Arbitrary<OcorrenciaResolvida> {
  return fc
    .record({
      tipo: tipoMovimento(),
      valorPrevistoCentavos: centavosPositivo(),
      diaVencimento: fc.integer({ min: 1, max: 31 }),
      pagamento: fc.option(
        fc.record({
          dia: fc.integer({ min: 1, max: 31 }),
          valor: centavosPositivo(),
        }),
        { nil: null },
      ),
      ignorado: fc.boolean(),
    })
    .map((r) => {
      const geradorId = `g${indice}`
      const pago = !r.ignorado && r.pagamento !== null

      return {
        chave: chaveDe('regra', geradorId, c),
        origem: 'virtual' as const,
        idReal: null,
        situacao: r.ignorado ? ('ignorado' as const) : ('previsto' as const),
        numeroParcela: null,
        geradorTipo: 'regra' as const,
        geradorId,
        competencia: c,
        tipo: r.tipo,
        nome: `Item ${indice}`,
        valorPrevistoCentavos: r.valorPrevistoCentavos,
        dataVencimento: dataNaCompetencia(c, r.diaVencimento),
        dataPagamento: pago ? dataNaCompetencia(c, r.pagamento!.dia) : null,
        valorPagoCentavos: pago ? r.pagamento!.valor : null,
        // O instante nao e o foco destas propriedades; fica sempre nulo, o
        // que preserva a RN-32 original (comparacao so por data).
        pagamentoRegistradoEm: null,
        ignorado: r.ignorado,
        observacao: null,
        categoria: null,
      }
    })
}

/**
 * Cenario com ancora no primeiro dia da competencia.
 *
 * Ancorar no dia 1 mantem a curva cobrindo o mes inteiro, o que e o que
 * permite comparar o saldo final contra a soma direta de todos os movimentos.
 */
export const cenarioDeProjecao = (): fc.Arbitrary<CenarioDeProjecao> =>
  competencia().chain((c) =>
    fc
      .record({
        quantidade: fc.integer({ min: 0, max: 12 }),
        saldoAncora: fc.integer({ min: -500_000, max: 500_000 }),
        temAncora: fc.boolean(),
      })
      .chain(({ quantidade, saldoAncora, temAncora }) =>
        fc
          .tuple(
            ...Array.from({ length: quantidade }, (_, i) =>
              ocorrenciaNaCompetencia(c, i),
            ),
          )
          .map((ocorrencias) => ({
            competencia: c,
            // "Hoje" no ultimo dia do mes: todas as ocorrencias do mes ja
            // venceram, o que exercita a derivacao de situacao sem introduzir
            // atrasados de meses anteriores.
            hoje: dataNaCompetencia(c, 31),
            ancora: temAncora
              ? {
                  id: 'ancora-1',
                  data: dataNaCompetencia(c, 1),
                  saldoCentavos: saldoAncora,
                  declaradaEm: null,
                }
              : null,
            ocorrencias,
          })),
      ),
  )
