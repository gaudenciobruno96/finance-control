/**
 * Declara o saldo real de uma data -- a ancora da projecao.
 *
 * Esta e a escrita mais consequente das quatro. Errar um lancamento afeta um
 * item; errar a ancora desloca a curva inteira e todos os numeros derivados
 * dela. Por isso o recibo e o mais explicito de todos.
 */

import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import { novoId } from '../../../src/data/ids.js'
import type { AppPg } from '../../app-pg.js'
import { montarRecibo, type Recibo } from '../../recibo.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'

export interface ArgsDeclararSaldo {
  readonly valor: string
  readonly data?: string
  readonly hoje: string
}

export async function declararSaldo(app: AppPg, args: ArgsDeclararSaldo): Promise<Recibo> {
  const centavos = deEntradaUsuario(args.valor)
  if (centavos === null) {
    throw new ErroDeUsuario(
      `Nao entendi o valor "${args.valor}". Use algo como 1200, 1200,00 ou -300,00.`,
    )
  }

  const data = args.data ?? args.hoje
  const id = novoId()

  // `salvar` chama `validarAncora`, que rejeita data futura. O segundo
  // argumento e a data corrente -- diferente das outras entidades.
  //
  // O instante e do servidor, em UTC. Pedir ao modelo que informe o horario
  // seria pedir que ele inventasse um -- e diferente de `hoje`, que a pessoa
  // pode legitimamente querer sobrescrever para lancar algo retroativo.
  await app.repos.ancoras.salvar(
    { id, data, saldoCentavos: centavos, declaradaEm: new Date().toISOString() },
    args.hoje,
  )

  return montarRecibo(
    'saldo',
    id,
    `Saldo de ${data} declarado como ${formatarBRL(centavos)}. ` +
      'A partir daqui os valores projetados deixam de ser relativos.',
  )
}
