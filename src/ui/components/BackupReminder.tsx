/** UI-10 — Aviso discreto apos 14 dias sem exportar (RF-31). */

import { Link } from 'react-router'
import { useBackupReminder } from '../hooks/useProjection.js'
import estilos from './BackupReminder.module.css'

export function BackupReminder() {
  if (!useBackupReminder()) return null

  return (
    <div className={estilos.faixa} data-testid="backup-reminder">
      <span>Faz um tempo que você não exporta um backup.</span>
      <Link to="/ajustes" className={estilos.acao}>
        Exportar
      </Link>
    </div>
  )
}
