/**
 * INF-03 / PAD-09 — Atualizacao anunciada, nunca imposta.
 *
 * PWA instalado na tela de inicio raramente e fechado de vez. Sem intervencao,
 * o usuario ficaria semanas numa versao antiga; com atualizacao automatica, a
 * pagina poderia recarregar no meio do preenchimento de um valor.
 */

import { useRegisterSW } from 'virtual:pwa-register/react'
import estilos from './UpdateBanner.module.css'

export function UpdateBanner() {
  const {
    needRefresh: [precisaAtualizar, setPrecisaAtualizar],
    updateServiceWorker,
  } = useRegisterSW()

  if (!precisaAtualizar) return null

  return (
    <div className={estilos.faixa} role="status" data-testid="update-banner">
      <span>Nova versão disponível.</span>
      <button
        type="button"
        className={estilos.acao}
        onClick={() => void updateServiceWorker(true)}
        data-testid="atualizar-app"
      >
        Atualizar
      </button>
      <button
        type="button"
        className={estilos.depois}
        onClick={() => setPrecisaAtualizar(false)}
      >
        Depois
      </button>
    </div>
  )
}
