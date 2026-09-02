/**
 * Corrige os dados de uma conta que ainda nao foi paga.
 *
 * Valor e vencimento sao a mesma pergunta -- "essa conta esta errada" -- e por
 * isso vivem numa ferramenta so. Separa-las obrigaria o assistente a escolher
 * entre duas ferramentas quase homonimas.
 *
 * Numa conta JA PAGA a operacao e recusada: o valor pago prevalece sobre o
 * previsto (RN-31), entao mexer no previsto nao mudaria numero nenhum, e a
 * data que importa passa a ser a do pagamento. Quem quer corrigir o que
 * pagou chama `marcar_pago` de novo -- ele e idempotente (RN-51) e atualiza o
 * mesmo registro.
 */

import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import type { AppPg } from '../../app-pg.js'
import type { ReciboDeAjuste } from '../../recibo.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'
import { localizarConta } from './localizar-conta.js'

export interface ArgsAjustarConta {
  readonly chave: string
  readonly valor?: string
  readonly vencimento?: string
  readonly hoje: string
}

export async function ajustarConta(
  app: AppPg,
  args: ArgsAjustarConta,
): Promise<ReciboDeAjuste> {
  if (args.valor === undefined && args.vencimento === undefined) {
    throw new ErroDeUsuario(
      'Informe o novo valor, o novo vencimento, ou os dois. ' +
        'Sem nenhum dos dois nao ha o que ajustar.',
    )
  }

  const alvo = await localizarConta(app, args.chave, args.hoje)

  if (alvo.dataPagamento !== null) {
    throw new ErroDeUsuario(
      `"${alvo.nome}" ja esta paga, e numa conta paga o valor pago prevalece ` +
        'sobre o previsto -- ajustar aqui nao mudaria o numero. Para corrigir ' +
        'o que foi pago, chame marcar_pago de novo com o valor certo.',
    )
  }

  const partes: string[] = []
  const antes: string[] = []
  const depois: string[] = []

  if (args.valor !== undefined) {
    const centavos = deEntradaUsuario(args.valor)
    if (centavos === null) {
      throw new ErroDeUsuario(
        `Nao entendi o valor "${args.valor}". Use algo como 2000 ou 2.000,00.`,
      )
    }
    if (centavos <= 0) {
      throw new ErroDeUsuario(
        `O valor previsto precisa ser positivo. Recebi "${args.valor}".`,
      )
    }

    antes.push(formatarBRL(alvo.valorPrevistoCentavos))
    depois.push(formatarBRL(centavos))
    partes.push('valor')
    await app.pagamento.ajustarValorPrevisto(alvo, centavos)
  }

  if (args.vencimento !== undefined) {
    antes.push(alvo.dataVencimento)
    depois.push(args.vencimento)
    partes.push('vencimento')
    // Relocaliza: o ajuste de valor acima pode ter materializado a ocorrencia,
    // e aplicar sobre a versao antiga sobrescreveria aquela mudanca.
    const atual = await localizarConta(app, args.chave, args.hoje)
    await app.pagamento.adiarVencimento(atual, args.vencimento)
  }

  return {
    chave: args.chave,
    nome: alvo.nome,
    antes: antes.join(' / '),
    depois: depois.join(' / '),
    resumo: `${alvo.nome}: ${partes.join(' e ')} ajustado de ${antes.join(' / ')} para ${depois.join(' / ')}.`,
    avisos: [
      'Vale só para este mês. A recorrência que gerou a conta não foi alterada.',
      'Não há desfazer: para reverter, chame de novo com o valor anterior.',
    ],
  }
}
