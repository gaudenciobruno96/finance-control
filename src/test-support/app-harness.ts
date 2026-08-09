/**
 * Monta uma aplicacao completa em memoria: banco, repositorios e os quatro
 * servicos.
 *
 * Cada chamada cria um banco isolado, de modo que testes nao interferem uns
 * nos outros nem dependem de ordem de execucao.
 */

import { criarBanco, type BancoFinanceiro } from '../data/db.js'
import { criarRepositorios, type Repositorios } from '../data/repositories.js'
import { criarProjectionService, type ProjectionService } from '../services/projection-service.js'
import { criarPaymentService, type PaymentService } from '../services/payment-service.js'
import { criarRuleService, type RuleService } from '../services/rule-service.js'
import { criarBackupService, type BackupService } from '../services/backup-service.js'

export interface Harness {
  readonly db: BancoFinanceiro
  readonly repos: Repositorios
  readonly projecao: ProjectionService
  readonly pagamento: PaymentService
  readonly regras: RuleService
  readonly backup: BackupService
  readonly encerrar: () => Promise<void>
}

let contador = 0

export async function criarHarness(): Promise<Harness> {
  contador += 1
  const db = criarBanco(`teste-app-${contador}-${crypto.randomUUID()}`)
  await db.open()

  const repos = criarRepositorios(db)

  return {
    db,
    repos,
    projecao: criarProjectionService(repos),
    pagamento: criarPaymentService(repos),
    regras: criarRuleService(db, repos),
    backup: criarBackupService(db, repos),
    encerrar: async () => {
      db.close()
      await db.delete()
    },
  }
}
