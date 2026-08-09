/**
 * DOM-06 — Expansao de faturas de cartao (RN-19, RN-21, RN-23).
 */

import { construirData, somarMeses } from './calendar.js'
import { parcelasDoCartaoEm } from './installment-expander.js'
import { chaveDe } from './occurrence-key.js'
import { somar } from './money.js'
import type {
  Cartao,
  Centavos,
  Competencia,
  OcorrenciaResolvida,
  Parcelamento,
} from './types.js'

/**
 * Valor estimado da fatura enquanto ela nao foi confirmada (RN-19):
 * soma das parcelas do cartao na competencia mais o gasto mensal tipico.
 *
 * Quando o usuario informa o valor real, ele SUBSTITUI integralmente esta
 * estimativa (RN-20) -- nada e somado, porque a fatura verdadeira ja contem as
 * parcelas. E aqui que um design ingenuo contaria as parcelas duas vezes.
 */
export function estimarFatura(
  cartao: Cartao,
  parcelamentos: readonly Parcelamento[],
  competencia: Competencia,
): Centavos {
  const parcelas = parcelasDoCartaoEm(parcelamentos, cartao.id, competencia)
  const valores = parcelas.map((p) => p.valorPrevistoCentavos)
  return somar(...valores, cartao.gastoMensalTipicoCentavos)
}

/**
 * Vencimento da fatura de uma competencia (RN-21).
 *
 * Quando o dia de vencimento e anterior ao de fechamento, a fatura fechada na
 * competencia vence no mes seguinte.
 */
export function vencimentoDaFatura(
  cartao: Cartao,
  competencia: Competencia,
): string {
  const mes =
    cartao.diaVencimento >= cartao.diaFechamento
      ? competencia
      : somarMeses(competencia, 1)
  return construirData(mes, cartao.diaVencimento)
}

/**
 * Produz uma ocorrencia de fatura por cartao por competencia.
 *
 * Faturas de valor zero sao suprimidas (RN-23). A supressao vale apenas para a
 * listagem: o cadastro de cartoes continua permitindo informar o valor real de
 * qualquer competencia, inclusive uma estimada como zero (RN-24).
 */
export function expandirFaturas(
  cartoes: readonly Cartao[],
  parcelamentos: readonly Parcelamento[],
  intervalo: readonly Competencia[],
): readonly OcorrenciaResolvida[] {
  const resultado: OcorrenciaResolvida[] = []

  for (const cartao of cartoes) {
    for (const competencia of intervalo) {
      const estimado = estimarFatura(cartao, parcelamentos, competencia)
      if (estimado === 0) continue

      resultado.push({
        chave: chaveDe('cartao', cartao.id, competencia),
        origem: 'virtual',
        idReal: null,
        situacao: 'previsto',
        ehComponenteDeFatura: false,
        numeroParcela: null,
        geradorTipo: 'cartao',
        geradorId: cartao.id,
        competencia,
        tipo: 'saida',
        nome: `Fatura ${cartao.nome}`,
        valorPrevistoCentavos: estimado,
        dataVencimento: vencimentoDaFatura(cartao, competencia),
        dataPagamento: null,
        valorPagoCentavos: null,
        ignorado: false,
        observacao: null,
      })
    }
  }

  return resultado
}
