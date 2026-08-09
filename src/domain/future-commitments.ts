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
 * `deParcelamentos` isola quanto do total vem de compras parceladas -- e o
 * que da sentido a cadastrar uma compra em 10x.
 */
export function resumirMeses(
  ocorrencias: readonly OcorrenciaResolvida[],
  intervalo: readonly Competencia[],
): readonly ResumoFuturo[] {
  return intervalo.map((competencia) => {
    const doMes = ocorrencias.filter(
      (o) => o.competencia === competencia && !o.ignorado && o.tipo === 'saida',
    )

    const totalAPagarCentavos = somar(...doMes.map(valorConsiderado))

    const deParcelamentosCentavos = somar(
      ...doMes.filter((o) => o.geradorTipo === 'parcelamento').map(valorConsiderado),
    )

    return { competencia, totalAPagarCentavos, deParcelamentosCentavos }
  })
}

function valorConsiderado(o: OcorrenciaResolvida): number {
  return o.valorPagoCentavos ?? o.valorPrevistoCentavos
}
