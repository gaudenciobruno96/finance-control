/**
 * Parte do valor ja entrou (ou ja saiu) antes do vencimento.
 *
 * O caso concreto: o salario e 18.000 no dia 30, veio 8.000 de adiantamento,
 * restam 10.000 a receber. Os 8.000 ja estao na conta -- e portanto no saldo
 * declarado --, e o que muda e quanto AINDA falta.
 *
 * Recebimento integral nao passa por aqui: e um pagamento confirmado, com
 * data, e vai por `marcar_pago`.
 */

import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import type { AppPg } from '../../app-pg.js'
import type { ReciboDeAjuste } from '../../recibo.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'
import { localizarConta } from './localizar-conta.js'

export interface ArgsRegistrarParte {
  readonly chave: string
  readonly valor: string
  readonly hoje: string
}

export async function registrarParte(
  app: AppPg,
  args: ArgsRegistrarParte,
): Promise<ReciboDeAjuste> {
  const parte = deEntradaUsuario(args.valor)
  if (parte === null) {
    throw new ErroDeUsuario(
      `Nao entendi o valor "${args.valor}". Use algo como 8000 ou 8.000,00.`,
    )
  }

  const alvo = await localizarConta(app, args.chave, args.hoje)

  if (alvo.dataPagamento !== null) {
    throw new ErroDeUsuario(
      `"${alvo.nome}" ja esta paga. Registrar uma parte reduz o que ainda falta, ` +
        'e numa conta paga nao falta nada -- para corrigir o valor pago, chame ' +
        'marcar_pago de novo.',
    )
  }

  // `registrarParteAntecipada` valida que a parte e positiva e menor que o
  // previsto, e levanta ErroDeDominio quando nao e.
  const tinhaObservacao = alvo.observacao !== null

  await app.pagamento.registrarParteAntecipada(alvo, parte)

  const restante = alvo.valorPrevistoCentavos - parte
  const verbo = alvo.tipo === 'entrada' ? 'recebido' : 'pago'

  const avisos: string[] = [
    'Vale só para este mês. A recorrência que gerou a conta não foi alterada.',
  ]

  // A operacao sobrescreve a observacao com o texto do adiantamento. Quem
  // tinha escrito algo ali perde -- melhor saber agora que descobrir depois.
  if (tinhaObservacao) {
    avisos.push(
      `A observação que havia nesta conta foi substituída por "${formatarBRL(parte)} ${verbo} adiantado".`,
    )
  }

  return {
    chave: args.chave,
    nome: alvo.nome,
    antes: formatarBRL(alvo.valorPrevistoCentavos),
    depois: formatarBRL(restante),
    resumo:
      `${formatarBRL(parte)} já ${verbo} de "${alvo.nome}". ` +
      `Ainda falta ${formatarBRL(restante)}.`,
    avisos,
  }
}
