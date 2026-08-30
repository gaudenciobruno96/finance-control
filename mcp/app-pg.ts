/**
 * A aplicacao sobre Postgres.
 *
 * `criarProjectionService` e `criarPaymentService` recebem apenas
 * `Repositorios`, entao funcionam sem alteracao. `criarRuleService` NAO e
 * usado: ele recebe o `BancoFinanceiro` do Dexie por causa da transacao em
 * `editarRegra`, e editar regra nao esta no escopo deste projeto.
 */

import type { Pool } from 'pg'
import type { Repositorios } from '../src/data/repositories.js'
import {
  criarProjectionService,
  type ProjectionService,
} from '../src/services/projection-service.js'
import { criarPaymentService, type PaymentService } from '../src/services/payment-service.js'
import { criarRepositoriosPg } from './dados/repositorios-pg.js'
import { criarAuditoria } from './dados/auditoria.js'

export interface AppPg {
  readonly repos: Repositorios
  readonly projecao: ProjectionService
  readonly pagamento: PaymentService
  readonly auditoria: ReturnType<typeof criarAuditoria>
}

export function criarAppPg(pool: Pool): AppPg {
  const repos = criarRepositoriosPg(pool)

  return {
    repos,
    projecao: criarProjectionService(repos),
    pagamento: criarPaymentService(repos),
    auditoria: criarAuditoria(pool),
  }
}
