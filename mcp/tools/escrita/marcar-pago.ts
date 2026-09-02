/**
 * Registra o pagamento de uma conta.
 *
 * A localizacao da conta pela chave de sobreposicao mora em
 * `localizar-conta.ts` -- e entrega ao PaymentService, que busca o registro
 * existente ou materializa um novo (RN-51), tornando a operacao idempotente.
 */

import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import type { OcorrenciaResolvida } from '../../../src/domain/types.js'
import type { AppPg } from '../../app-pg.js'
import { montarRecibo, type Recibo } from '../../recibo.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'
import { localizarConta } from './localizar-conta.js'

export interface ArgsMarcarPago {
  readonly chave: string
  readonly valor?: string
  readonly data?: string
  readonly hoje: string
}

/**
 * O instante que vai gravado com o pagamento -- ou nenhum.
 *
 * Ele so existe para desempatar contra `AncoraSaldo.declaradaEm` quando os
 * dois caem no mesmo dia (RN-32 revisada). Carimbar "agora" sem condicao
 * inverte essa ordem em dois casos, e nos dois o app passa a mostrar MENOS que
 * o banco:
 *
 * 1. Reregistro. `marcar_pago` e idempotente de proposito (RN-51), entao
 *    corrigir o valor e uma segunda chamada. Pagar as 08h, declarar o saldo as
 *    09h (o extrato ja mostra o pagamento) e corrigir o valor as 10h movia o
 *    instante para 10h -- depois da ancora --, e o pagamento passava a ser
 *    descontado de um saldo que ja o continha. Preservar o instante do
 *    registro original mantem a ordem que de fato aconteceu.
 *
 * 2. Lancamento retroativo. A ferramenta aceita `data` justamente para
 *    registrar algo de outro dia. Um pagamento datado no dia da ancora, mas
 *    lancado dois dias depois, ganhava instante maior que `declaradaEm` e
 *    passava a descontar -- antes desta mudanca, nunca descontava.
 *
 * Sem instante, a RN-32 compara so datas: e o comportamento anterior, que para
 * dado retroativo e o correto.
 */
function instanteDoRegistro(
  alvo: OcorrenciaResolvida,
  data: string,
  hoje: string,
): string | undefined {
  // Ja registrado nesta mesma data: a escrita de agora e correcao, nao um
  // pagamento novo. O que estava la vale -- inclusive nulo.
  if (alvo.dataPagamento === data) return alvo.pagamentoRegistradoEm ?? undefined

  // O instante e do servidor, em UTC. Pedir ao modelo que informe o horario
  // seria pedir que ele inventasse um -- e diferente de `hoje`, que a pessoa
  // pode legitimamente querer sobrescrever para lancar algo retroativo.
  return data === hoje ? new Date().toISOString() : undefined
}

export async function marcarPago(app: AppPg, args: ArgsMarcarPago): Promise<Recibo> {
  const data = args.data ?? args.hoje

  const alvo = await localizarConta(app, args.chave, args.hoje)

  const valorPago =
    args.valor === undefined ? alvo.valorPrevistoCentavos : deEntradaUsuario(args.valor)

  if (valorPago === null) {
    throw new ErroDeUsuario(`Nao entendi o valor "${String(args.valor)}".`)
  }

  // `validarOcorrencia` (src/data/invariants.ts) so exige inteiro para
  // valorPagoCentavos, sem checagem de sinal -- diferente de
  // valorPrevistoCentavos, que exige positivo. src/ esta congelado neste
  // projeto, entao a guarda fica aqui: sem ela, um valor negativo (ex.:
  // "-50") passa por `deEntradaUsuario` sem erro e o projetor de saldo usa
  // `valorPagoCentavos ?? valorPrevistoCentavos` como a magnitude do
  // movimento -- um pagamento negativo de uma saida vira ENTRADA de dinheiro.
  if (valorPago <= 0) {
    throw new ErroDeUsuario(
      `Valor de pagamento invalido: "${String(args.valor)}". Informe um valor positivo.`,
    )
  }

  await app.pagamento.registrarPagamento(
    alvo,
    data,
    valorPago,
    instanteDoRegistro(alvo, data, args.hoje),
  )

  const verbo = alvo.tipo === 'entrada' ? 'Recebimento' : 'Pagamento'

  return montarRecibo(
    'pagamento',
    alvo.chave,
    `${verbo} registrado: ${alvo.nome}, ${formatarBRL(valorPago)}, em ${data}`,
  )
}
