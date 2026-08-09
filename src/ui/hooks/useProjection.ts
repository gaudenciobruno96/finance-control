/**
 * UI-11 — Ligação reativa entre banco e telas.
 *
 * Estes sao os UNICOS arquivos do app que conhecem `dexie-react-hooks`
 * (RN-84). Nenhum componente de tela o importa, de modo que trocar a
 * estrategia de reatividade tocaria apenas aqui.
 *
 * E a concessao consciente a regra de camadas, registrada no Application
 * Design: em troca, elimina a camada de estado global inteira e a classe de
 * defeito "escrevi mas a tela nao atualizou".
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from './useApp.js'
import { useAgora } from './useAgora.js'
import type { Competencia, ResumoFuturo } from '../../domain/types.js'
import type { MesProjetado } from '../../services/projection-service.js'

/**
 * Projeção de um mês, recalculada a cada escrita nas tabelas relevantes.
 *
 * `useLiveQuery` observa as tabelas tocadas pela consulta e reexecuta a função
 * quando qualquer uma muda — por isso nenhuma tela precisa recarregar
 * manualmente (RN-83).
 */
export function useMonthProjection(competencia: Competencia): MesProjetado | undefined {
  const { projecao } = useApp()
  const agora = useAgora()

  return useLiveQuery(
    () => projecao.projetarMes(competencia, agora),
    [competencia, agora, projecao],
  )
}

export function useFutureCommitments(
  de: Competencia,
  meses: number,
): readonly ResumoFuturo[] | undefined {
  const { projecao } = useApp()
  const agora = useAgora()

  return useLiveQuery(
    () => projecao.projetarFuturo(de, meses, agora),
    [de, meses, agora, projecao],
  )
}

/** Verdadeiro quando o aviso de backup deve aparecer (RF-31). */
export function useBackupReminder(): boolean {
  const { backup } = useApp()
  const agora = useAgora()

  return (
    useLiveQuery(() => backup.precisaAvisarBackup(agora), [agora, backup]) ?? false
  )
}
