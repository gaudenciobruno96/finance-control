/**
 * Pula uma conta neste mes, ou a traz de volta.
 *
 * Um booleano, e nao duas ferramentas: ignorar e reativar sao o mesmo botao em
 * duas posicoes, e separa-los obrigaria o assistente a distinguir dois nomes
 * quase homonimos.
 *
 * Vale so para o mes: a recorrencia que gerou a conta nao e tocada, e o mes
 * seguinte segue prevendo-a.
 */

import { formatarBRL } from '../../../src/domain/money.js'
import type { AppPg } from '../../app-pg.js'
import type { ReciboDeAjuste } from '../../recibo.js'
import { localizarConta } from './localizar-conta.js'

export interface ArgsIgnorarConta {
  readonly chave: string
  readonly ignorar: boolean
  readonly hoje: string
}

export async function ignorarConta(
  app: AppPg,
  args: ArgsIgnorarConta,
): Promise<ReciboDeAjuste> {
  const alvo = await localizarConta(app, args.chave, args.hoje)

  const avisos: string[] = [
    'Vale só para este mês. A recorrência que gerou a conta não foi alterada.',
  ]

  // `ignorarNoMes` limpa o pagamento junto com o flag -- e coerente com "esse
  // mes nao teve", mas destroi um registro. A operacao continua permitida:
  // recusa-la deixaria sem saida quem marcou pago por engano. O recibo diz o
  // que foi apagado, com o valor, para a pessoa poder recompor.
  if (args.ignorar && alvo.dataPagamento !== null) {
    const valor = formatarBRL(alvo.valorPagoCentavos ?? alvo.valorPrevistoCentavos)
    avisos.push(
      `O pagamento registrado de ${valor} em ${alvo.dataPagamento} foi apagado. ` +
        'Para recompô-lo, reative a conta e marque como paga de novo.',
    )
  }

  if (args.ignorar) {
    await app.pagamento.ignorarNoMes(alvo)
  } else {
    await app.pagamento.reativarNoMes(alvo)
  }

  const antes = alvo.ignorado ? 'ignorada' : 'ativa'
  const depois = args.ignorar ? 'ignorada' : 'ativa'

  return {
    chave: args.chave,
    nome: alvo.nome,
    antes,
    depois,
    resumo: args.ignorar
      ? `"${alvo.nome}" foi ignorada neste mês e saiu da projeção.`
      : `"${alvo.nome}" voltou para a projeção deste mês.`,
    avisos,
  }
}
