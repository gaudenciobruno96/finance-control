/**
 * Declara quanto ha em uma moeda estrangeira.
 *
 * Este dinheiro NAO entra na projecao do mes. Ele so vira capacidade de pagar
 * contas quando convertido, a uma cotacao que ainda nao aconteceu -- somar na
 * ancora faria o app afirmar que o mes fecha com dinheiro indisponivel.
 */

import { deEntradaUsuario } from '../../../src/domain/money.js'
import type { AppPg } from '../../app-pg.js'
import { formatarMoeda, normalizarMoeda } from '../../cambio.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'

export interface ArgsDeclararSaldoEstrangeiro {
  readonly moeda: string
  readonly valor: string
  readonly data?: string
  readonly hoje: string
}

export interface ReciboSaldoEstrangeiro {
  readonly moeda: string
  readonly valor: string
  readonly valorCentavos: number
  readonly data: string
  readonly resumo: string
  readonly avisos: readonly string[]
}

export async function declararSaldoEstrangeiro(
  app: AppPg,
  args: ArgsDeclararSaldoEstrangeiro,
): Promise<ReciboSaldoEstrangeiro> {
  const moeda = normalizarMoeda(args.moeda)
  if (moeda === null) {
    throw new ErroDeUsuario(
      `Nao reconheci a moeda "${args.moeda}". Use o codigo de tres letras, como USD ou EUR.`,
    )
  }

  const centavos = deEntradaUsuario(args.valor)
  if (centavos === null) {
    throw new ErroDeUsuario(
      `Nao entendi o valor "${args.valor}". Use algo como 5000 ou 5.000,00.`,
    )
  }

  // Diferente da ancora em reais, que pode ser negativa: uma reserva em moeda
  // estrangeira negativa nao tem significado.
  if (centavos < 0) {
    throw new ErroDeUsuario(
      `O saldo em ${moeda} nao pode ser negativo. Recebi "${args.valor}".`,
    )
  }

  const data = args.data ?? args.hoje

  await app.saldosEstrangeiros.salvar({ moeda, valorCentavos: centavos, data })

  const valor = formatarMoeda(centavos, moeda)

  return {
    moeda,
    valor,
    valorCentavos: centavos,
    data,
    resumo: `Saldo em ${moeda} na data ${data} declarado como ${valor}.`,
    avisos: [
      'Este valor não entra na projeção do mês: ele só paga contas depois de convertido em reais.',
      'Não há desfazer para esta escrita. Para corrigir, declare o saldo de novo — o valor anterior é substituído.',
    ],
  }
}
