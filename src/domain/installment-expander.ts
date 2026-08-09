/**
 * DOM-05 — Expansao de parcelamentos em ocorrencias virtuais
 * (RN-16 a RN-18).
 */

import { competenciaDe, construirData, somarMeses } from './calendar.js'
import { chaveDe } from './occurrence-key.js'
import { exigirQuantidadeParcelas } from './guards.js'
import type {
  Competencia,
  OcorrenciaResolvida,
  Parcelamento,
} from './types.js'

const COMPONENTE = 'installmentExpander'

/**
 * Expande parcelamentos, produzindo uma ocorrencia por parcela (RN-16).
 *
 * Parcelas vinculadas a cartao sao marcadas como componentes de fatura e NAO
 * viram saida independente (RN-18) -- e a unica barreira contra contar o mesmo
 * dinheiro duas vezes, uma na parcela e outra dentro da fatura.
 */
export function expandirParcelamentos(
  parcelamentos: readonly Parcelamento[],
  intervalo: readonly Competencia[],
): readonly OcorrenciaResolvida[] {
  const dentroDoIntervalo = new Set(intervalo)
  const resultado: OcorrenciaResolvida[] = []

  for (const p of parcelamentos) {
    exigirQuantidadeParcelas(p.quantidadeParcelas, COMPONENTE)

    const competenciaInicial = competenciaDe(p.primeiroVencimento)
    // O dia BASE e preservado, nao o dia truncado. Um parcelamento com
    // primeiro vencimento em 31 de janeiro vence em 28 de fevereiro e VOLTA a
    // 31 de marco. Propagar o dia truncado faria todas as parcelas seguintes
    // migrarem para o dia 28 -- erro cumulativo silencioso.
    const diaBase = Number(p.primeiroVencimento.slice(8, 10))

    for (let n = 1; n <= p.quantidadeParcelas; n += 1) {
      const competencia = somarMeses(competenciaInicial, n - 1)
      if (!dentroDoIntervalo.has(competencia)) continue

      resultado.push({
        chave: chaveDe('parcelamento', p.id, competencia),
        origem: 'virtual',
        idReal: null,
        situacao: 'previsto',
        ehComponenteDeFatura: p.cartaoId !== null,
        cartaoId: p.cartaoId,
        numeroParcela: n,
        geradorTipo: 'parcelamento',
        geradorId: p.id,
        competencia,
        tipo: 'saida',
        nome: `${p.nome} (${n}/${p.quantidadeParcelas})`,
        valorPrevistoCentavos: p.valorParcelaCentavos,
        dataVencimento: construirData(competencia, diaBase),
        dataPagamento: null,
        valorPagoCentavos: null,
        ignorado: false,
        observacao: null,
      })
    }
  }

  return resultado
}

/**
 * Parcelas de um cartao especifico em uma competencia. Insumo da estimativa de
 * fatura (RN-19).
 */
export function parcelasDoCartaoEm(
  parcelamentos: readonly Parcelamento[],
  cartaoId: string,
  competencia: Competencia,
): readonly OcorrenciaResolvida[] {
  const doCartao = parcelamentos.filter((p) => p.cartaoId === cartaoId)
  return expandirParcelamentos(doCartao, [competencia])
}
