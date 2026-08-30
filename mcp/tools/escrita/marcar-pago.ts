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

import { competenciaDe } from '../../../src/domain/calendar.js'
import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import type { AppPg } from '../../app-pg.js'
import { montarRecibo, type Recibo } from '../../recibo.js'

export interface ArgsMarcarPago {
  readonly chave: string
  readonly valor?: string
  readonly data?: string
  readonly hoje: string
}

export async function marcarPago(app: AppPg, args: ArgsMarcarPago): Promise<Recibo> {
  const data = args.data ?? args.hoje
  const mes = await app.projecao.projetarMes(competenciaDe(data), args.hoje)

  const alvo = [...mes.faltaPagar, ...mes.aindaEntra, ...mes.jaResolvido].find(
    (o) => o.chave === args.chave,
  )

  if (alvo === undefined) {
    throw new Error(
      `Nao encontrei nenhuma ocorrencia com a chave informada em ${competenciaDe(data)}. ` +
        'Consulte a situacao do mes e use a chave que vier na resposta.',
    )
  }

  const valorPago =
    args.valor === undefined ? alvo.valorPrevistoCentavos : deEntradaUsuario(args.valor)

  if (valorPago === null) {
    throw new Error(`Nao entendi o valor "${String(args.valor)}".`)
  }

  await app.pagamento.registrarPagamento(alvo, data, valorPago)

  const verbo = alvo.tipo === 'entrada' ? 'Recebimento' : 'Pagamento'

  return montarRecibo(
    'pagamento',
    alvo.chave,
    `${verbo} registrado: ${alvo.nome}, ${formatarBRL(valorPago)}, em ${data}`,
  )
}
