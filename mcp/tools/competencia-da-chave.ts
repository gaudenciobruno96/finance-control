/**
 * Extrai a competencia embutida na chave de sobreposicao.
 *
 * A chave e "tipo:id:AAAA-MM" (ver `src/domain/occurrence-key.ts`, `chaveDe`).
 * `marcar_pago` e `desfazer` (tipo pagamento) recebiam a chave mas projetavam
 * o mes a partir de `competenciaDe(data)` ou `competenciaDe(hoje)` -- ignorando
 * que a chave ja diz de que mes ela e. Pagar uma conta de setembro
 * antecipadamente, em 31/08, faz `competenciaDe(hoje)` projetar agosto, que
 * nao contem aquela chave: "nao encontrei a chave" para uma chave que a
 * propria ferramenta acabou de devolver.
 *
 * Compartilhado entre `marcar-pago.ts` e `desfazer.ts` para as duas ferramentas
 * pararem de adivinhar o mes e passarem a lê-lo da chave.
 */

import { ehCompetenciaValida } from '../../src/domain/guards.js'
import { ErroDeUsuario } from './erro-do-usuario.js'

export function competenciaDaChave(chave: string): string {
  const partes = chave.split(':')
  const competencia = partes[partes.length - 1]

  if (competencia === undefined || !ehCompetenciaValida(competencia)) {
    throw new ErroDeUsuario(
      `Nao entendi a chave "${chave}": nao consegui extrair a competencia dela ` +
        '(formato esperado tipo:id:AAAA-MM). Consulte a situacao do mes e use a ' +
        'chave que vier na resposta.',
    )
  }

  return competencia
}
