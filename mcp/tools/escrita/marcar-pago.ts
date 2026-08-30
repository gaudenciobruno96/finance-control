/**
 * Registra o pagamento de uma conta.
 *
 * A maior parte das contas NAO existe no banco: as geradas por regra sao
 * virtuais ate alguem interagir. Por isso a ferramenta nao recebe um
 * identificador de registro, e sim a CHAVE DE SOBREPOSICAO, que a consulta
 * devolve em cada item.
 *
 * O caminho e: projetar o mes, localizar a ocorrencia resolvida daquela chave,
 * e entregar ao PaymentService -- que busca o registro existente ou materializa
 * um novo (RN-51), tornando a operacao idempotente.
 */

import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import type { AppPg } from '../../app-pg.js'
import { montarRecibo, type Recibo } from '../../recibo.js'
import { competenciaDaChave } from '../competencia-da-chave.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'

export interface ArgsMarcarPago {
  readonly chave: string
  readonly valor?: string
  readonly data?: string
  readonly hoje: string
}

export async function marcarPago(app: AppPg, args: ArgsMarcarPago): Promise<Recibo> {
  const data = args.data ?? args.hoje

  // A propria chave diz de que mes ela e (RN-51 dela) -- projetar a partir da
  // data ou de hoje, como a versao anterior fazia, acha o mes ERRADO sempre
  // que a chave e de um mes diferente do dia em que se esta pagando (pagar
  // uma conta de setembro em 31/08, por exemplo).
  const competencia = competenciaDaChave(args.chave)
  const mes = await app.projecao.projetarMes(competencia, args.hoje)

  // `mes.ignorados` entra na busca porque `registrarPagamento` (via
  // PaymentService.aplicar) ja seta `ignorado: false` -- pagar uma conta
  // previamente ignorada e uma reativacao valida, nao um erro.
  const alvo = [
    ...mes.faltaPagar,
    ...mes.aindaEntra,
    ...mes.jaResolvido,
    ...mes.ignorados,
  ].find((o) => o.chave === args.chave)

  if (alvo === undefined) {
    throw new ErroDeUsuario(
      `Nao encontrei nenhuma ocorrencia com a chave informada em ${competencia}. ` +
        'Consulte a situacao do mes e use a chave que vier na resposta.',
    )
  }

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

  await app.pagamento.registrarPagamento(alvo, data, valorPago)

  const verbo = alvo.tipo === 'entrada' ? 'Recebimento' : 'Pagamento'

  return montarRecibo(
    'pagamento',
    alvo.chave,
    `${verbo} registrado: ${alvo.nome}, ${formatarBRL(valorPago)}, em ${data}`,
  )
}
