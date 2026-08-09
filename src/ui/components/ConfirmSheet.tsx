/**
 * SUP-07 / UI-13 — Confirmacao de acao destrutiva (RN-74).
 *
 * Cada acao declara sua propria mensagem, explicando a consequencia real.
 * Dialogo nativo (`confirm`) e proibido: bloqueia a pagina inteira no iOS.
 */

import estilos from './ConfirmSheet.module.css'

export interface ConfirmSheetProps {
  readonly titulo: string
  readonly mensagem: string
  readonly rotuloConfirmar: string
  readonly destrutivo?: boolean
  readonly onConfirmar: () => void
  readonly onCancelar: () => void
}

export function ConfirmSheet({
  titulo,
  mensagem,
  rotuloConfirmar,
  destrutivo = false,
  onConfirmar,
  onCancelar,
}: ConfirmSheetProps) {
  return (
    <div className={estilos.fundo} onClick={onCancelar} data-testid="confirm-sheet">
      <div
        className={estilos.folha}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={estilos.titulo} id="confirm-titulo">
          {titulo}
        </h2>
        <p className={estilos.mensagem}>{mensagem}</p>

        <div className={estilos.acoes}>
          <button
            type="button"
            className={destrutivo ? estilos.destrutivo : estilos.principal}
            onClick={onConfirmar}
            data-testid="confirm-sheet-confirmar"
          >
            {rotuloConfirmar}
          </button>
          <button
            type="button"
            className={estilos.cancelar}
            onClick={onCancelar}
            data-testid="confirm-sheet-cancelar"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
