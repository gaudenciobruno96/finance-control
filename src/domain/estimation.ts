/**
 * DOM-12 — Media dos ultimos pagamentos, para sugestao de estimativa
 * (RN-37 a RN-39).
 *
 * Este componente nao constava do Application Design. Foi acrescentado no
 * Functional Design da unidade, quando a decisao de "sugerir a media" revelou
 * que o CALCULO e regra de negocio (Unidade 1) enquanto a SUGESTAO no campo e
 * comportamento de interface (Unidade 3).
 *
 * A funcao apenas calcula. Apresentar o resultado como sugestao, e decidir se
 * o usuario a aceita, nao pertence ao dominio.
 */

import { comparar } from './calendar.js'
import { media } from './money.js'
import type { Centavos, Ocorrencia } from './types.js'

/** Quantidade de meses considerada por padrao. */
export const MESES_PADRAO = 3

/**
 * Media dos valores efetivamente pagos nas ultimas ocorrencias de uma regra.
 *
 * Devolve null quando nao ha amostras suficientes (RN-38): sugerir uma media
 * de um unico mes daria falsa impressao de tendencia.
 *
 * Usa o valor PAGO, nao o previsto (RN-39). O que interessa e quanto a conta
 * de luz realmente custou, nao quanto se esperava que custasse.
 */
export function mediaDosUltimosPagos(
  ocorrencias: readonly Ocorrencia[],
  regraId: string,
  quantidadeMeses: number = MESES_PADRAO,
): Centavos | null {
  const pagas = ocorrencias
    .filter(
      (o) =>
        o.geradorId === regraId &&
        o.dataPagamento !== null &&
        o.valorPagoCentavos !== null &&
        !o.ignorado,
    )
    .sort((a, b) => comparar(b.dataPagamento as string, a.dataPagamento as string))

  if (pagas.length < quantidadeMeses) return null

  const amostra = pagas.slice(0, quantidadeMeses).map((o) => o.valorPagoCentavos as Centavos)

  return media(amostra)
}
