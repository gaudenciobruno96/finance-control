/**
 * Monta a aplicacao inteira em memoria a partir de um documento de backup.
 *
 * O banco vive apenas enquanto o processo vive. E isso que torna o servidor
 * MCP somente-leitura por construcao, e nao por disciplina: nao existe
 * caminho de codigo daqui de volta para os dados reais.
 *
 * Espelha `src/test-support/app-harness.ts`, com a diferenca de comecar
 * populado em vez de vazio.
 */

import 'fake-indexeddb/auto'

import { criarBanco, type BancoFinanceiro } from '../src/data/db.js'
import { criarRepositorios, type Repositorios } from '../src/data/repositories.js'
import {
  escrever,
  migrarDocumento,
  type DocumentoBackup,
} from '../src/data/backup-serializer.js'
import {
  criarProjectionService,
  type ProjectionService,
} from '../src/services/projection-service.js'

export interface AppEmMemoria {
  readonly db: BancoFinanceiro
  readonly repos: Repositorios
  readonly projecao: ProjectionService
  readonly encerrar: () => void
}

/**
 * Nome unico por instancia.
 *
 * Dois bancos de mesmo nome compartilham estado mesmo em memoria, e uma
 * simulacao vazaria para a consulta seguinte -- o defeito exato que a
 * ferramenta de cenario existe para nao ter.
 */
function nomeUnico(): string {
  return `mcp-${crypto.randomUUID()}`
}

export async function criarAppDoBackup(
  doc: DocumentoBackup,
): Promise<AppEmMemoria> {
  const db = criarBanco(nomeUnico())
  await db.open()

  // migrarDocumento antes de escrever: um backup de schema anterior traz
  // campos que o validador de escrita rejeita.
  await escrever(db, migrarDocumento(doc))

  const repos = criarRepositorios(db)

  return {
    db,
    repos,
    projecao: criarProjectionService(repos),
    encerrar: () => db.close(),
  }
}
