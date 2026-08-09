/**
 * UI-15 — Folha que sobe do rodape.
 *
 * O formulario de edicao ficava no fim da tela: tocar numa receita e ter de
 * rolar ate embaixo para achar o campo -- e depois rolar de volta -- e o
 * caminho mais longo possivel entre a intencao e a acao.
 *
 * Extraida do padrao que a folha de pagamento e a de confirmacao ja usavam,
 * porque agora sao tres.
 */

import type { ReactNode } from 'react'
import estilos from './Sheet.module.css'

export interface SheetProps {
  readonly titulo: string
  readonly idDoTitulo: string
  readonly children: ReactNode
  readonly onFechar: () => void
  readonly testId?: string | undefined
}

export function Sheet({ titulo, idDoTitulo, children, onFechar, testId }: SheetProps) {
  return (
    <div className={estilos.fundo} onClick={onFechar} data-testid={testId}>
      <div
        className={estilos.folha}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idDoTitulo}
        // Sem isto, o toque em qualquer campo do formulario borbulha ate o
        // fundo e fecha a folha no meio da edicao.
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={estilos.titulo} id={idDoTitulo}>
          {titulo}
        </h2>

        {children}

        <button type="button" className={estilos.fechar} onClick={onFechar}>
          Fechar
        </button>
      </div>
    </div>
  )
}
