/**
 * Lanca um gasto ou uma entrada pontual.
 *
 * A competencia vem da data do lancamento, nao de hoje: um gasto retroativo
 * pertence ao mes em que aconteceu.
 */

import { competenciaDe } from '../../../src/domain/calendar.js'
import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import type { Ocorrencia } from '../../../src/domain/types.js'
import { novoId } from '../../../src/data/ids.js'
import type { AppPg } from '../../app-pg.js'
import { montarRecibo, type Recibo } from '../../recibo.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'

export interface ArgsLancarAvulso {
  readonly tipo: 'entrada' | 'saida'
  readonly nome: string
  readonly valor: string
  readonly data?: string
  readonly hoje: string
  readonly observacao?: string
}

export async function lancarAvulso(app: AppPg, args: ArgsLancarAvulso): Promise<Recibo> {
  const centavos = deEntradaUsuario(args.valor)
  if (centavos === null) {
    throw new ErroDeUsuario(`Nao entendi o valor "${args.valor}". Use algo como 80, 80,00 ou 1.234,56.`)
  }

  const data = args.data ?? args.hoje

  const ocorrencia: Ocorrencia = {
    id: novoId(),
    geradorTipo: 'avulso',
    geradorId: null,
    competencia: competenciaDe(data),
    tipo: args.tipo,
    nome: args.nome,
    valorPrevistoCentavos: centavos,
    dataVencimento: data,
    dataPagamento: null,
    valorPagoCentavos: null,
    // Nao ha pagamento na criacao de um avulso: null aqui e o valor real, nao
    // um placeholder. Passa a ter instante quando marcar_pago (Task 3) agir.
    pagamentoRegistradoEm: null,
    ignorado: false,
    observacao: args.observacao ?? null,
  }

  await app.repos.ocorrencias.salvar(ocorrencia)

  const sentido = args.tipo === 'entrada' ? 'Entrada' : 'Gasto'

  return montarRecibo(
    'avulso',
    ocorrencia.id,
    `${sentido} avulso: ${ocorrencia.nome}, ${formatarBRL(centavos)}, em ${data}`,
  )
}
