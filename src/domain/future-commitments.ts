/**
 * DOM-10 — Compromissos dos proximos meses (RF-26).
 */

import { somar } from './money.js'
import type {
  Competencia,
  OcorrenciaResolvida,
  ResumoFuturo,
} from './types.js'

/**
 * Resume, por competencia, quanto ha a pagar e quanto disso vem de
 * parcelamentos.
 *
 * `deParcelamentos` contabiliza as parcelas de cartao MESMO estando embutidas
 * na fatura. O objetivo desta tela e justamente revelar o peso dos
 * parcelamentos, que de outro modo ficaria escondido dentro do valor da
 * fatura -- e e o que da sentido a cadastrar uma compra em 10x.
 */
export function resumirMeses(
  ocorrencias: readonly OcorrenciaResolvida[],
  intervalo: readonly Competencia[],
): readonly ResumoFuturo[] {
  return intervalo.map((competencia) => {
    const doMes = ocorrencias.filter(
      (o) => o.competencia === competencia && !o.ignorado && o.tipo === 'saida',
    )

    // O total a pagar exclui componentes de fatura, que ja estao somados
    // dentro da fatura do cartao (RN-18).
    const totalAPagarCentavos = somar(
      ...doMes.filter((o) => !o.ehComponenteDeFatura).map(valorConsiderado),
    )

    const deParcelamentosCentavos = somar(
      ...doMes.filter((o) => o.geradorTipo === 'parcelamento').map(valorConsiderado),
    )

    return { competencia, totalAPagarCentavos, deParcelamentosCentavos }
  })
}

function valorConsiderado(o: OcorrenciaResolvida): number {
  return o.valorPagoCentavos ?? o.valorPrevistoCentavos
}
