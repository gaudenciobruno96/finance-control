/**
 * PAD-12 — Fronteira de erro global.
 *
 * E o ULTIMO recurso, nao o caminho normal: falhas de escrita sao capturadas
 * no ponto de chamada e viram faixa, mantendo a tela utilizavel (RN-81). Esta
 * fronteira existe para o que escapar disso.
 *
 * A mensagem nunca expoe rastreamento de pilha, nome de tabela ou codigo
 * tecnico (RN-82, SECURITY-09).
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import estilos from './ErrorBoundary.module.css'

interface Props {
  readonly children: ReactNode
}

interface Estado {
  readonly falhou: boolean
}

export class ErrorBoundary extends Component<Props, Estado> {
  override state: Estado = { falhou: false }

  static getDerivedStateFromError(): Estado {
    return { falhou: true }
  }

  override componentDidCatch(erro: Error, info: ErrorInfo): void {
    // Diagnostico fica no console, em uso local. Nao ha telemetria: nenhum
    // dado sai do aparelho (RNF-04).
    console.error('Falha não tratada na interface:', erro, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.falhou) return this.props.children

    return (
      <div className={estilos.tela} role="alert" data-testid="error-boundary">
        <h1 className={estilos.titulo}>Algo deu errado</h1>
        <p className={estilos.mensagem}>
          O app encontrou um problema inesperado. Seus dados continuam salvos neste
          aparelho.
        </p>
        <button
          type="button"
          className={estilos.recarregar}
          onClick={() => window.location.reload()}
        >
          Recarregar
        </button>
      </div>
    )
  }
}
