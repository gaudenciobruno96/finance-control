/**
 * UI-16 — Envio automatico do backup.
 *
 * Observa o conteudo do backup pelo mesmo mecanismo reativo das telas: quando
 * qualquer tabela muda, o conteudo muda, e o envio e reagendado.
 *
 * O atraso nao e detalhe. Sem ele, cada tecla digitada num valor viraria um
 * commit -- e o historico, que e a melhor parte disto, ficaria inutil.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { lerCredencial, type CredencialSync } from '../../data/sync-credentials.js'
import { useApp } from './useApp.js'
import { useAgora } from './useAgora.js'
import type { ResultadoEnvio } from '../../services/sync-service.js'

const ESPERA_MS = 8_000

export type EstadoSync =
  | { readonly tipo: 'desligado' }
  | { readonly tipo: 'aguardando' }
  | { readonly tipo: 'enviando' }
  | { readonly tipo: 'salvo' }
  | { readonly tipo: 'offline' }
  | { readonly tipo: 'conflito'; readonly shaRemoto: string }
  | { readonly tipo: 'erro'; readonly mensagem: string }

export function useSync(): {
  readonly estado: EstadoSync
  readonly credencial: CredencialSync | null
  readonly enviarAgora: () => Promise<void>
  readonly recarregarCredencial: () => void
} {
  const { backup, sync } = useApp()
  const agora = useAgora()

  const [credencial, setCredencial] = useState<CredencialSync | null>(() =>
    lerCredencial(),
  )
  const [estado, setEstado] = useState<EstadoSync>({ tipo: 'desligado' })

  const conteudo = useLiveQuery(() => backup.gerarConteudo(agora), [backup, agora])

  // O conteudo mais recente fica numa ref para o envio manual poder usa-lo sem
  // virar dependencia do efeito -- que reagendaria o temporizador a cada
  // mudanca de identidade da funcao.
  const conteudoAtual = useRef<string | undefined>(undefined)
  conteudoAtual.current = conteudo

  const despachar = useCallback(
    async (texto: string, c: CredencialSync): Promise<void> => {
      setEstado({ tipo: 'enviando' })

      const r: ResultadoEnvio = await sync.enviar(
        c,
        texto,
        `Backup automático de ${agora}`,
      )

      switch (r.tipo) {
        case 'enviado':
        case 'semMudanca':
          setEstado({ tipo: 'salvo' })
          return
        case 'offline':
          setEstado({ tipo: 'offline' })
          return
        case 'conflito':
          setEstado({ tipo: 'conflito', shaRemoto: r.shaRemoto })
          return
        case 'erro':
          setEstado({ tipo: 'erro', mensagem: r.mensagem })
          return
      }
    },
    [sync, agora],
  )

  useEffect(() => {
    if (credencial === null || !credencial.ativo) {
      setEstado({ tipo: 'desligado' })
      return
    }
    if (conteudo === undefined) return

    setEstado({ tipo: 'aguardando' })

    const t = setTimeout(() => {
      void despachar(conteudo, credencial)
    }, ESPERA_MS)

    // Toda mudanca nova cancela o envio anterior: o que sobe e sempre o estado
    // final, nunca um intermediario.
    return () => clearTimeout(t)
  }, [conteudo, credencial, despachar])

  const enviarAgora = useCallback(async (): Promise<void> => {
    const c = lerCredencial()
    const texto = conteudoAtual.current
    if (c === null || texto === undefined) return
    await despachar(texto, c)
  }, [despachar])

  return {
    estado,
    credencial,
    enviarAgora,
    recarregarCredencial: () => setCredencial(lerCredencial()),
  }
}
