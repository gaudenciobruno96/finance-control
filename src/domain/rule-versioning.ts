/**
 * DOM-11 — Vigencia na edicao de regras (RN-13 a RN-15).
 *
 * E o que impede um reajuste de aluguel de reescrever o historico de meses ja
 * pagos.
 */

import { compararCompetencias, somarMeses } from './calendar.js'
import { falhar } from './errors.js'
import { exigirCompetencia } from './guards.js'
import type { AlteracaoRegra, Competencia, Regra } from './types.js'

const COMPONENTE = 'ruleVersioning'

/**
 * Edicao com escopo "a partir deste mes" (RN-13).
 *
 * Devolve o par [regra encerrada, regra nova]. As duas precisam ser gravadas
 * na MESMA transacao: uma falha entre as duas escritas deixaria um mes
 * descoberto ou duplicado.
 *
 * Quando a competencia alcanca a propria vigencia inicial, nao ha historico a
 * preservar -- devolve apenas a regra alterada, evitando criar uma regra
 * encerrada de vigencia vazia.
 */
export function editarAPartirDe(
  regra: Regra,
  alteracao: AlteracaoRegra,
  competencia: Competencia,
  novoId: string,
): readonly Regra[] {
  exigirCompetencia(competencia, COMPONENTE)

  if (regra.vigenteAte !== null) {
    if (compararCompetencias(regra.vigenteDe, regra.vigenteAte) > 0) {
      falhar('VIGENCIA_INVERTIDA', COMPONENTE)
    }
  }

  if (compararCompetencias(competencia, regra.vigenteDe) <= 0) {
    return [{ ...regra, ...alteracao }]
  }

  // A regra encerrada nao pode ultrapassar o fim de vigencia original.
  if (
    regra.vigenteAte !== null &&
    compararCompetencias(competencia, regra.vigenteAte) > 0
  ) {
    return [regra]
  }

  const encerrada: Regra = {
    ...regra,
    vigenteAte: somarMeses(competencia, -1),
  }

  const nova: Regra = {
    ...regra,
    ...alteracao,
    id: novoId,
    vigenteDe: competencia,
    vigenteAte: regra.vigenteAte,
  }

  return [encerrada, nova]
}

/**
 * Edicao com escopo "desde sempre" (RN-14).
 *
 * Altera a regra em lugar. As ocorrencias JA MATERIALIZADAS nao sao tocadas --
 * quem ja foi pago permanece com o valor que foi pago, e e por isso que o
 * historico sobrevive a um reajuste.
 */
export function editarDesdeSempre(
  regra: Regra,
  alteracao: AlteracaoRegra,
): Regra {
  return { ...regra, ...alteracao }
}
