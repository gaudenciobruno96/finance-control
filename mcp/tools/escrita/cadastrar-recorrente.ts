/**
 * Cadastra um lancamento recorrente: salario, aluguel, luz.
 *
 * Nao usa `criarRuleService`: ele recebe o `BancoFinanceiro` do Dexie por causa
 * da transacao em `editarRegra`, e criar nao precisa de transacao.
 */

import { ajustePadrao } from '../../../src/domain/calendar.js'
import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import type { Regra } from '../../../src/domain/types.js'
import { novoId } from '../../../src/data/ids.js'
import type { AppPg } from '../../app-pg.js'
import { montarRecibo, type Recibo } from '../../recibo.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'

export interface ArgsCadastrarRecorrente {
  readonly tipo: 'entrada' | 'saida'
  readonly nome: string
  readonly valor: string
  readonly diaDoMes: number
  readonly vigenteDe: string
  readonly ajusteFimDeSemana?: 'nenhum' | 'antecipa' | 'posterga'
  readonly valorEhEstimativa?: boolean
}

export async function cadastrarRecorrente(
  app: AppPg,
  args: ArgsCadastrarRecorrente,
): Promise<Recibo> {
  // O valor chega como a pessoa fala. `deEntradaUsuario` ja trata "80",
  // "80,00", "1.234,56" e "1234.56"; pedir centavos ao modelo abriria a porta
  // para errar por uma ordem de grandeza, em silencio.
  const centavos = deEntradaUsuario(args.valor)
  if (centavos === null) {
    throw new ErroDeUsuario(
      `Nao entendi o valor "${args.valor}". Use algo como 1800, 1800,00 ou 1.800,00.`,
    )
  }

  const regra: Regra = {
    id: novoId(),
    tipo: args.tipo,
    nome: args.nome,
    valorCentavos: centavos,
    valorEhEstimativa: args.valorEhEstimativa ?? false,
    diaDoMes: args.diaDoMes,
    ajusteFimDeSemana: args.ajusteFimDeSemana ?? ajustePadrao(args.tipo),
    vigenteDe: args.vigenteDe,
    vigenteAte: null,
    // Categorizar pela ferramenta chega na Task 3.
    categoria: null,
  }

  // `salvar` chama `validarRegra`, que rejeita dia 40 e centavo fracionado.
  await app.repos.regras.salvar(regra)

  const sentido = args.tipo === 'entrada' ? 'entra' : 'sai'

  return montarRecibo(
    'recorrente',
    regra.id,
    `${regra.nome}, ${formatarBRL(centavos)}, ${sentido} todo dia ${String(regra.diaDoMes)}, ` +
      `a partir de ${regra.vigenteDe}`,
  )
}
