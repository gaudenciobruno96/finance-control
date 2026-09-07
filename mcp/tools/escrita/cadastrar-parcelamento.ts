/**
 * Cadastra uma compra parcelada.
 *
 * Recebe o valor da PARCELA, nunca o total. O dominio guarda
 * `valorParcelaCentavos`, e pedir o total obrigaria alguem a dividir --
 * divisao de dinheiro raramente e exata (2.500 em 7x da 357,142857...), o
 * modelo arredondaria, e a soma nao fecharia com o total informado sem que
 * nada indicasse o problema.
 *
 * O total aparece no recibo, derivado, para o usuario conferir contra a
 * fatura.
 */

import { deEntradaUsuario, formatarBRL, multiplicarPorInteiro } from '../../../src/domain/money.js'
import type { Categoria, Parcelamento } from '../../../src/domain/types.js'
import { novoId } from '../../../src/data/ids.js'
import type { AppPg } from '../../app-pg.js'
import { montarRecibo, type Recibo } from '../../recibo.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'

export interface ArgsCadastrarParcelamento {
  readonly nome: string
  readonly valorParcela: string
  readonly quantidadeParcelas: number
  readonly primeiroVencimento: string
  readonly categoria?: Categoria
}

export async function cadastrarParcelamento(
  app: AppPg,
  args: ArgsCadastrarParcelamento,
): Promise<Recibo> {
  const centavos = deEntradaUsuario(args.valorParcela)
  if (centavos === null) {
    throw new ErroDeUsuario(
      `Nao entendi o valor da parcela "${args.valorParcela}". ` +
        'Use algo como 300, 300,00 ou 1.234,56 -- e informe o valor da PARCELA, nao o total.',
    )
  }

  const parcelamento: Parcelamento = {
    id: novoId(),
    nome: args.nome,
    valorParcelaCentavos: centavos,
    quantidadeParcelas: args.quantidadeParcelas,
    primeiroVencimento: args.primeiroVencimento,
    categoria: args.categoria ?? null,
  }

  // `salvar` chama `validarParcelamento`, que rejeita parcela nao positiva,
  // centavo fracionado, quantidade menor que 1 e data fora de AAAA-MM-DD.
  await app.repos.parcelamentos.salvar(parcelamento)

  const total = multiplicarPorInteiro(centavos, args.quantidadeParcelas)

  return montarRecibo(
    'parcelamento',
    parcelamento.id,
    `${parcelamento.nome}: ${String(args.quantidadeParcelas)}x de ${formatarBRL(centavos)}, ` +
      `total ${formatarBRL(total)}, primeira em ${args.primeiroVencimento}.` +
      (args.categoria !== undefined ? ` Categoria: ${args.categoria}.` : ''),
  )
}
