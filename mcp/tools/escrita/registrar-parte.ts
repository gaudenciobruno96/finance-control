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

  // `deEntradaUsuario('-100')` devolve -10000 sem erro: o sinal e sintaxe
  // valida para `declarar_saldo`, que aceita saldo negativo. Aqui nao ha
  // parte negativa de coisa alguma. Sem a guarda, o valor so seria barrado la
  // dentro de `registrarParteAntecipada`, como o codigo interno
  // VALOR_NAO_POSITIVO -- e a mesma razao pela qual `marcar_pago` mantem a sua
  // guarda de sinal nesta camada.
  if (parte <= 0) {
    throw new ErroDeUsuario(
      `A parte ja recebida ou paga precisa ser positiva. Recebi "${args.valor}".`,
    )
  }

  const alvo = await localizarConta(app, args.chave, args.hoje)

  // Ignorada e fora da projecao: reduzir o previsto de uma conta invisivel
  // nao move numero algum, e esta operacao nao reativa a conta.
  if (alvo.ignorado) {
    throw new ErroDeUsuario(
      `"${alvo.nome}" esta ignorada neste mes e fora da projecao -- registrar ` +
        'uma parte aqui nao mudaria numero nenhum. Traga a conta de volta com ' +
        'ignorar_conta(ignorar: false) e registre depois.',
    )
  }

  if (alvo.dataPagamento !== null) {
    throw new ErroDeUsuario(
      `"${alvo.nome}" ja esta paga. Registrar uma parte reduz o que ainda falta, ` +
        'e numa conta paga nao falta nada -- para corrigir o valor pago, chame ' +
        'marcar_pago de novo.',
    )
  }

  // "Veio tudo" e o engano mais provavel desta ferramenta: `registrar_parte`
  // com o valor cheio. `registrarParteAntecipada` recusa -- mas com
  // `VALOR_NAO_POSITIVO / restanteAposParte`, um codigo interno que fala do
  // resto da subtracao, nao do que a pessoa fez. Traduzido aqui, o erro diz a
  // mesma coisa que a descricao da ferramenta ja diz: recebimento ou
  // pagamento INTEGRAL e um pagamento confirmado e vai por `marcar_pago`.
  if (parte >= alvo.valorPrevistoCentavos) {
    throw new ErroDeUsuario(
      `${formatarBRL(parte)} nao e uma PARTE de "${alvo.nome}": o previsto e ` +
        `${formatarBRL(alvo.valorPrevistoCentavos)}. Se veio tudo, isso e um ` +
        'pagamento confirmado -- use marcar_pago. Se veio so um pedaco, ' +
        'informe um valor menor que o previsto.',
    )
  }

  // `registrarParteAntecipada` revalida o mesmo par de condicoes no dominio.
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
