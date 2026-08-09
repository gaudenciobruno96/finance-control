/**
 * Contexto da aplicacao: banco, repositorios e os quatro servicos.
 *
 * Existe para que as telas nao instanciem nada e para que os testes possam
 * injetar um banco isolado. A alternativa -- cada tela importar `obterBanco()`
 * -- tornaria os testes dependentes de estado global compartilhado.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { obterBanco, type BancoFinanceiro } from '../../data/db.js'
import { criarRepositorios, type Repositorios } from '../../data/repositories.js'
import {
  criarProjectionService,
  type ProjectionService,
} from '../../services/projection-service.js'
import { criarPaymentService, type PaymentService } from '../../services/payment-service.js'
import { criarRuleService, type RuleService } from '../../services/rule-service.js'
import { criarBackupService, type BackupService } from '../../services/backup-service.js'

export interface App {
  readonly db: BancoFinanceiro
  readonly repos: Repositorios
  readonly projecao: ProjectionService
  readonly pagamento: PaymentService
  readonly regras: RuleService
  readonly backup: BackupService
}

export function montarApp(db: BancoFinanceiro): App {
  const repos = criarRepositorios(db)
  return {
    db,
    repos,
    projecao: criarProjectionService(repos),
    pagamento: criarPaymentService(repos),
    regras: criarRuleService(db, repos),
    backup: criarBackupService(db, repos),
  }
}

const AppContext = createContext<App | null>(null)

export function AppProvider({
  children,
  db,
}: {
  children: ReactNode
  db?: BancoFinanceiro
}) {
  const app = useMemo(() => montarApp(db ?? obterBanco()), [db])
  return <AppContext.Provider value={app}>{children}</AppContext.Provider>
}

export function useApp(): App {
  const app = useContext(AppContext)
  if (app === null) {
    throw new Error('useApp precisa estar dentro de AppProvider')
  }
  return app
}
