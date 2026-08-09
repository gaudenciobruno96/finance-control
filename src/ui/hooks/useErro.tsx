/**
 * SUP-08 — Contexto da faixa de erro.
 *
 * A falha de escrita nao passa pela fronteira de erro global: e capturada no
 * ponto de chamada e vira faixa, mantendo a tela utilizavel (RN-81). A
 * fronteira e o ultimo recurso, nao o caminho normal.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { ehErroDeDominio } from '../../domain/errors.js'

interface ContextoErro {
  readonly mensagem: string | null
  readonly reportar: (e: unknown) => void
  readonly limpar: () => void
}

const Contexto = createContext<ContextoErro | null>(null)

/**
 * Traduz a falha em mensagem que diz O QUE FAZER, nao apenas o que falhou
 * (RN-80). Nunca expoe rastreamento de pilha, nome de tabela ou codigo
 * tecnico (RN-82, SECURITY-09).
 */
function traduzir(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === 'QuotaExceededError') {
      return 'Não foi possível salvar: o armazenamento do aparelho parece estar cheio. Exporte um backup em Ajustes e libere espaço.'
    }
    return 'Não foi possível salvar. Feche e abra o app; se persistir, exporte um backup em Ajustes.'
  }

  if (ehErroDeDominio(e)) {
    return 'Não foi possível concluir: algum dado informado é inválido. Confira os campos e tente de novo.'
  }

  return 'Algo deu errado. Tente de novo; se persistir, exporte um backup em Ajustes.'
}

export function ErroProvider({ children }: { children: ReactNode }) {
  const [mensagem, setMensagem] = useState<string | null>(null)

  const reportar = useCallback((e: unknown) => {
    setMensagem(traduzir(e))
  }, [])

  const limpar = useCallback(() => setMensagem(null), [])

  return (
    <Contexto.Provider value={{ mensagem, reportar, limpar }}>
      {children}
    </Contexto.Provider>
  )
}

export function useErro(): ContextoErro {
  const ctx = useContext(Contexto)
  if (ctx === null) throw new Error('useErro precisa estar dentro de ErroProvider')
  return ctx
}

/** Envolve uma operacao de escrita, reportando falha como faixa. */
export function useAcao(): (operacao: () => Promise<void>) => Promise<void> {
  const { reportar } = useErro()
  return useCallback(
    async (operacao) => {
      try {
        await operacao()
      } catch (e) {
        reportar(e)
      }
    },
    [reportar],
  )
}
