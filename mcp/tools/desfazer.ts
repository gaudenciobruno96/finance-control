/**
 * Desfaz uma escrita, de qualquer data.
 *
 * Nao ha janela de tempo. Recusar por idade obrigava a conviver com um erro ja
 * percebido, e nao havia ferramenta de edicao para onde mandar quem chegasse
 * tarde -- a recusa era um beco sem saida. O identificador explicito, que so
 * aparece num recibo ou numa consulta, e a protecao que resta.
 *
 * O significado difere por tipo, e a diferenca importa:
 * - recorrente: remove a regra, mas NAO as ocorrencias ja materializadas (RN-46)
 * - avulso: remove a ocorrencia
 * - pagamento: NAO apaga a conta nem o registro; limpa apenas o pagamento (RN-53)
 * - saldo: remove a ancora
 * - parcelamento: remove o parcelamento, mas NAO as parcelas ja materializadas
 */

import type { AppPg } from '../app-pg.js'
import type { TipoDeEscrita } from '../recibo.js'
import type { TabelaAuditavel } from '../dados/auditoria.js'
import { competenciaDaChave } from './competencia-da-chave.js'
import { ErroDeUsuario } from './erro-do-usuario.js'

export interface ArgsDesfazer {
  readonly tipo: TipoDeEscrita
  readonly id: string
  readonly hoje: string
}

export interface ResultadoDesfazer {
  readonly desfeito: true
  readonly descricao: string
}

const TABELA_POR_TIPO: Record<Exclude<TipoDeEscrita, 'pagamento'>, TabelaAuditavel> = {
  recorrente: 'regras',
  avulso: 'ocorrencias',
  saldo: 'ancoras',
  parcelamento: 'parcelamentos',
}

/**
 * Confirma que o registro existe antes de tentar remove-lo.
 *
 * Nao ha limite de tempo. A janela de 24 horas que existia aqui protegia
 * contra um identificador trocado apagar historia, mas o preco era obrigar a
 * pessoa a conviver com um erro que ela ja tinha visto -- e nao havia
 * ferramenta de edicao para onde mandar quem chegasse tarde demais, entao a
 * recusa era um beco sem saida. A protecao que resta e a que sempre fez o
 * trabalho: o id precisa ser dito explicitamente, e ele so aparece num recibo
 * ou numa consulta.
 */
async function exigirQueExista(
  app: AppPg,
  tabela: TabelaAuditavel,
  id: string,
): Promise<void> {
  const tocadoEm = await app.auditoria.tocadoEm(tabela, id)

  if (tocadoEm === null) {
    throw new ErroDeUsuario('Nao encontrei esse registro. Confira o identificador do recibo.')
  }
}

export async function desfazer(app: AppPg, args: ArgsDesfazer): Promise<ResultadoDesfazer> {
  if (args.tipo === 'pagamento') {
    // O identificador aqui e a CHAVE, nao um id de linha: o pagamento pode ter
    // materializado o registro agora mesmo.
    //
    // A competencia vem da PROPRIA CHAVE, nao de `hoje` -- projetar
    // `competenciaDe(args.hoje)` so acha pagamentos do mes corrente. Desfazer
    // um pagamento retroativo (de um mes anterior) sempre falhava para uma
    // ENTRADA: RN-33 empurra saida atrasada para dentro do mes atual (entao
    // aquele caso passava por coincidencia), RN-90 nao faz o mesmo para
    // entrada -- a mesma assimetria que ja pegou este branch em
    // `marcar_pago`.
    const competencia = competenciaDaChave(args.id)
    const mes = await app.projecao.projetarMes(competencia, args.hoje)
    const alvo = [...mes.faltaPagar, ...mes.aindaEntra, ...mes.jaResolvido].find(
      (o) => o.chave === args.id,
    )

    if (alvo === undefined) {
      throw new ErroDeUsuario(`Nao encontrei essa ocorrencia em ${competencia}.`)
    }

    if (alvo.idReal !== null) {
      await exigirQueExista(app, 'ocorrencias', alvo.idReal)
    }

    await app.pagamento.desfazerPagamento(alvo)

    return {
      desfeito: true,
      descricao:
        `Pagamento de ${alvo.nome} desfeito. A conta voltou a pendente; ` +
        'o registro foi mantido, com eventuais ajustes de valor ou vencimento.',
    }
  }

  const tabela = TABELA_POR_TIPO[args.tipo]
  await exigirQueExista(app, tabela, args.id)

  if (args.tipo === 'recorrente') {
    await app.repos.regras.remover(args.id)
    return {
      desfeito: true,
      descricao:
        'Recorrencia removida. As ocorrencias ja materializadas dela permanecem ' +
        'no historico e continuam aparecendo nos meses em que existem.',
    }
  }

  if (args.tipo === 'avulso') {
    await app.repos.ocorrencias.remover(args.id)
    return { desfeito: true, descricao: 'Lancamento avulso removido.' }
  }

  if (args.tipo === 'parcelamento') {
    await app.repos.parcelamentos.remover(args.id)
    return {
      desfeito: true,
      descricao:
        'Compra parcelada removida. As parcelas ja materializadas permanecem no ' +
        'historico e continuam aparecendo nos meses em que existem -- a remocao ' +
        'nao cascateia, do mesmo jeito que a de uma recorrencia.',
    }
  }

  await app.repos.ancoras.remover(args.id)
  return {
    desfeito: true,
    descricao:
      'Saldo declarado removido. Sem outra ancora anterior, os valores projetados ' +
      'voltam a ser relativos.',
  }
}
