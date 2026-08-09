/**
 * Chave de sobreposicao entre ocorrencias virtuais e reais.
 *
 * NOTA DE IMPLEMENTACAO: `chaveDe` estava listada como metodo de DOM-07 no
 * Application Design. Foi extraida para um modulo proprio porque os tres
 * expansores (DOM-04 a DOM-06) precisam dela para rotular as ocorrencias que
 * produzem. Mante-la no resolvedor criaria dependencia de expansor para
 * resolvedor, invertendo o sentido do pipeline
 * (expandir -> resolver -> projetar).
 */

import type { Competencia, TipoGerador } from './types.js'

/**
 * Chave unica de uma ocorrencia nao avulsa.
 *
 * A competencia usada aqui e sempre a determinada ANTES do ajuste de fim de
 * semana (RN-08). E o que mantem a chave estavel quando uma regra de dia 31
 * com `posterga` escorrega para o primeiro dia do mes seguinte -- sem isso, um
 * item ja pago reapareceria como pendente no mes seguinte.
 */
export function chaveDe(
  geradorTipo: TipoGerador,
  geradorId: string | null,
  competencia: Competencia,
): string {
  return `${geradorTipo}:${geradorId ?? ''}:${competencia}`
}
