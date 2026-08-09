import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { AppShell } from './ui/AppShell.js'
import { ErrorBoundary } from './ui/ErrorBoundary.js'
import { AppProvider } from './ui/hooks/useApp.js'
import { ErroProvider } from './ui/hooks/useErro.js'
import { solicitarPersistencia } from './data/storage-persistence.js'
import './ui/styles/tokens.css'
import './ui/styles/base.css'

/**
 * Solicita armazenamento persistente. O app NUNCA depende do resultado --
 * a protecao real dos dados e o backup (RF-28 a RF-31).
 */
void solicitarPersistencia()

const raiz = document.getElementById('root')
if (raiz === null) throw new Error('elemento root não encontrado')

createRoot(raiz).render(
  <StrictMode>
    <ErrorBoundary>
      <ErroProvider>
        <AppProvider>
          {/* Hash router: hospedagem estatica nao reescreve rotas. */}
          <HashRouter>
            <AppShell />
          </HashRouter>
        </AppProvider>
      </ErroProvider>
    </ErrorBoundary>
  </StrictMode>,
)
