/**
 * Desfaz uma escrita recente.
 *
 * Alcanca apenas as ultimas 24 horas. Desfazer algo de tres meses atras nao e
 * desfazer, e edicao -- e edicao de registro antigo deve ser explicita, nunca
 * efeito colateral de uma ferramenta chamada "desfazer".
 *
 * O significado difere por tipo, e a diferenca importa:
 * - recorrente: remove a regra, mas NAO as ocorrencias ja materializadas (RN-46)
 * - avulso: remove a ocorrencia
 * - pagamento: NAO apaga a conta nem o registro; limpa apenas o pagamento (RN-53)
 * - saldo: remove a ancora
 */

import { competenciaDe } from '../../src/domain/calendar.js'
import type { AppPg } from '../app-pg.js'
import { dentroDaJanela, type TipoDeEscrita } from '../recibo.js'
import type { TabelaAuditavel } from '../dados/auditoria.js'

export interface ArgsDesfazer {
  readonly tipo: TipoDeEscrita
  readonly id: string
  readonly agora: Date
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
}

async function exigirDentroDaJanela(
  app: AppPg,
  tabela: TabelaAuditavel,
  id: string,
  agora: Date,
): Promise<void> {
  const criadoEm = await app.auditoria.criadoEm(tabela, id)

  if (criadoEm === null) {
    throw new Error('Nao encontrei esse registro. Confira o identificador do recibo.')
  }

  if (!dentroDaJanela(criadoEm, agora)) {
    throw new Error(
      'Esse registro tem mais de 24 horas e esta fora da janela de desfazer. ' +
        'Para alterar algo antigo, use a ferramenta de edicao correspondente.',
    )
  }
}

export async function desfazer(app: AppPg, args: ArgsDesfazer): Promise<ResultadoDesfazer> {
  if (args.tipo === 'pagamento') {
    // O identificador aqui e a CHAVE, nao um id de linha: o pagamento pode ter
    // materializado o registro agora mesmo.
    const mes = await app.projecao.projetarMes(competenciaDe(args.hoje), args.hoje)
    const alvo = [...mes.faltaPagar, ...mes.aindaEntra, ...mes.jaResolvido].find(
      (o) => o.chave === args.id,
    )

    if (alvo === undefined) {
      throw new Error('Nao encontrei essa ocorrencia no mes corrente.')
    }

    if (alvo.idReal !== null) {
      await exigirDentroDaJanela(app, 'ocorrencias', alvo.idReal, args.agora)
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
  await exigirDentroDaJanela(app, tabela, args.id, args.agora)

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

  await app.repos.ancoras.remover(args.id)
  return {
    desfeito: true,
    descricao:
      'Saldo declarado removido. Sem outra ancora anterior, os valores projetados ' +
      'voltam a ser relativos.',
  }
}
