/**
 * SUP-08 / UI-14 — Faixa de erro no topo (RN-80, RN-81).
 *
 * A tela permanece utilizavel. A mensagem diz o que fazer, nao apenas que
 * falhou, e nunca expoe detalhe interno.
 */

import { useErro } from '../hooks/useErro.js'
import estilos from './ErrorBanner.module.css'

export function ErrorBanner() {
  const { mensagem, limpar } = useErro()
  if (mensagem === null) return null

  return (
    <div className={estilos.faixa} role="alert" data-testid="error-banner">
      <p className={estilos.mensagem}>{mensagem}</p>
      <button
        type="button"
        className={estilos.fechar}
        onClick={limpar}
        aria-label="Fechar aviso"
        data-testid="error-banner-fechar"
      >
        ✕
      </button>
    </div>
  )
}
