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

  // O instante e do servidor, em UTC. Pedir ao modelo que informe o horario
  // seria pedir que ele inventasse um.
  //
  // So vale para a ancora de HOJE. `data` existe justamente para declarar
  // retroativamente, e o instante de uma declaracao retroativa nao descreve a
  // leitura do extrato daquele dia -- diz apenas quando a pessoa digitou.
  // Comparado (RN-32) contra o instante de um pagamento, produz uma ordem que
  // nunca aconteceu: um pagamento do dia 1 registrado no dia 4 ficaria
  // "depois" de uma ancora do dia 1 declarada no dia 3, e passaria a descontar
  // de um saldo que ja o continha. Nulo devolve a comparacao por datas, que e
  // o que se sabe de fato.
  const declaradaEm = data === args.hoje ? new Date().toISOString() : null

  // `salvar` chama `validarAncora`, que rejeita data futura. O segundo
  // argumento e a data corrente -- diferente das outras entidades.
  await app.repos.ancoras.salvar(
    { id, data, saldoCentavos: centavos, declaradaEm },
    args.hoje,
  )

  return montarRecibo(
    'saldo',
    id,
    `Saldo de ${data} declarado como ${formatarBRL(centavos)}. ` +
      'A partir daqui os valores projetados deixam de ser relativos.',
  )
}
