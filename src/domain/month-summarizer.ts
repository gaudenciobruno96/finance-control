/**
 * DOM-09 — Resumo do mes (RF-22).
 */

import { somar, subtrair } from './money.js'
import type {
  Centavos,
  Competencia,
  CurvaSaldo,
  OcorrenciaResolvida,
  ResumoMes,
} from './types.js'

/**
 * Itens que contam no resumo.
 *
 * Mesmas exclusoes da curva: ignorados nao contam (RN-35) e componentes de
 * fatura nao contam sozinhos (RN-18), pois ja estao dentro da fatura.
 */
function conta(o: OcorrenciaResolvida): boolean {
  return !o.ignorado && !o.ehComponenteDeFatura
}

/**
 * Consolida os numeros do topo da tela do mes.
 *
 * Diferente da curva, o resumo agrupa por COMPETENCIA, nao por data efetiva:
 * o usuario pensa em "as contas de agosto", ainda que uma delas tenha sido
 * paga em setembro.
 */
export function resumirMes(
  ocorrencias: readonly OcorrenciaResolvida[],
  curva: CurvaSaldo,
  competencia: Competencia,
): ResumoMes {
  const doMes = ocorrencias.filter((o) => o.competencia === competencia && conta(o))

  const entradas = doMes.filter((o) => o.tipo === 'entrada')
  const saidas = doMes.filter((o) => o.tipo === 'saida')

  const aReceberCentavos = somar(...entradas.map(valorConsiderado))
  const aPagarCentavos = somar(...saidas.map(valorConsiderado))

  const jaPagoCentavos = somar(
    ...saidas
      .filter((o) => o.dataPagamento !== null)
      .map((o) => o.valorPagoCentavos as Centavos),
  )

  const ultimoPonto = curva.pontos[curva.pontos.length - 1]

  return {
    aReceberCentavos,
    aPagarCentavos,
    balancoPrevistoCentavos: subtrair(aReceberCentavos, aPagarCentavos),
    saldoFinalProjetadoCentavos: ultimoPonto?.saldoCentavos ?? 0,
    jaPagoCentavos,
    faltaPagarCentavos: subtrair(aPagarCentavos, jaPagoCentavos),
  }
}

/**
 * Valor considerado no resumo: o efetivamente pago quando ja houve pagamento,
 * o previsto caso contrario.
 *
 * Sem isso, uma conta prevista em R$ 100 e paga com juros por R$ 110 apareceria
 * no resumo como R$ 100, e o total nao bateria com o que saiu da conta.
 */
function valorConsiderado(o: OcorrenciaResolvida): Centavos {
  return o.valorPagoCentavos ?? o.valorPrevistoCentavos
}
