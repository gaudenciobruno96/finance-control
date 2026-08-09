/**
 * UI-01 — Casca da aplicacao.
 *
 * Hash router (decisao 3 do Infrastructure Design): hospedagem estatica nao
 * reescreve rotas, e o hash funciona em qualquer provedor sem configuracao. O
 * gesto de deslizar para voltar do iOS continua funcionando, porque o
 * historico do navegador e alimentado normalmente.
 */

import { NavLink, Route, Routes } from 'react-router'
import { ErrorBanner } from './components/ErrorBanner.js'
import { BackupReminder } from './components/BackupReminder.js'
import { UpdateBanner } from './components/UpdateBanner.js'
import { MonthScreen } from './screens/MonthScreen.js'
import { RegistrationsScreen } from './screens/RegistrationsScreen.js'
import { FutureScreen } from './screens/FutureScreen.js'
import { SettingsScreen } from './screens/SettingsScreen.js'
import { AvulsoScreen } from './screens/AvulsoScreen.js'
import estilos from './AppShell.module.css'

const ABAS = [
  { para: '/', rotulo: 'Mês', icone: '◫' },
  { para: '/cadastros', rotulo: 'Receitas', icone: '☰' },
  { para: '/futuro', rotulo: 'Futuro', icone: '↗' },
  { para: '/ajustes', rotulo: 'Ajustes', icone: '⚙' },
]

export function AppShell() {
  return (
    <div className={estilos.app}>
      <UpdateBanner />
      <ErrorBanner />
      <BackupReminder />

      <main className={estilos.conteudo}>
        <Routes>
          <Route path="/" element={<MonthScreen />} />
          <Route path="/cadastros" element={<RegistrationsScreen />} />
          <Route path="/futuro" element={<FutureScreen />} />
          <Route path="/ajustes" element={<SettingsScreen />} />
          <Route path="/avulso" element={<AvulsoScreen />} />
        </Routes>
      </main>

      <nav className={estilos.barra} aria-label="Navegação principal">
        {ABAS.map((aba) => (
          <NavLink
            key={aba.para}
            to={aba.para}
            end={aba.para === '/'}
            className={({ isActive }) => (isActive ? estilos.abaAtiva : estilos.aba)}
            data-testid={`aba-${aba.rotulo.toLowerCase()}`}
          >
            <span aria-hidden="true">{aba.icone}</span>
            <span className={estilos.abaRotulo}>{aba.rotulo}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
