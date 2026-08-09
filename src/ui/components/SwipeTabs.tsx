/**
 * UI-14 — Paineis lado a lado, trocados por arraste.
 *
 * Empilhar as secoes uma sob a outra fazia a tela do mes exigir rolagem longa
 * so para ver o que entra. Lado a lado, cada uma ocupa a tela inteira e a troca
 * custa um gesto.
 *
 * O arraste e do proprio navegador -- `scroll-snap` num container que rola na
 * horizontal --, nao um gesto reimplementado. Isso preserva a inercia, o
 * rubber-band e a rolagem vertical de dentro dos paineis, que uma implementacao
 * por evento de toque quebra no iOS.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import estilos from './SwipeTabs.module.css'

export interface Painel {
  readonly id: string
  readonly rotulo: string
  /** Linha secundaria da aba. Costuma ser o total daquele painel. */
  readonly detalhe?: string | undefined
  readonly conteudo: ReactNode
}

export interface SwipeTabsProps {
  readonly paineis: readonly Painel[]
  readonly rotuloDaLista: string
}

export function SwipeTabs({ paineis, rotuloDaLista }: SwipeTabsProps) {
  const trilho = useRef<HTMLDivElement | null>(null)
  const [ativo, setAtivo] = useState(0)
  const [altura, setAltura] = useState<number | null>(null)

  /**
   * A altura do trilho acompanha o painel visivel.
   *
   * Sem isso o container fica com a altura do painel MAIS ALTO, e o mais curto
   * ganha uma faixa vazia embaixo -- justamente o vazio que este componente
   * existe para eliminar.
   */
  useEffect(() => {
    const painel = trilho.current?.children[ativo]
    if (!(painel instanceof HTMLElement)) return

    const medir = () => setAltura(painel.scrollHeight)
    medir()

    // jsdom nao implementa ResizeObserver. Sem ela a altura fica so com a
    // medida inicial, o que basta para o teste e nunca ocorre no navegador.
    if (typeof ResizeObserver === 'undefined') return

    const observador = new ResizeObserver(medir)
    observador.observe(painel)
    return () => observador.disconnect()
  }, [ativo, paineis])

  const irPara = (indice: number) => {
    const el = trilho.current
    if (el === null) return

    setAtivo(indice)

    const destino = indice * el.clientWidth
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ left: destino, behavior: 'smooth' })
    } else {
      el.scrollLeft = destino
    }
  }

  // Mantem a aba marcada em sincronia com o arraste. Arredondar e o suficiente:
  // o snap sempre encerra num multiplo exato da largura.
  const aoRolar = () => {
    const el = trilho.current
    if (el === null || el.clientWidth === 0) return
    const indice = Math.round(el.scrollLeft / el.clientWidth)
    if (indice !== ativo && indice >= 0 && indice < paineis.length) setAtivo(indice)
  }

  // Uma aba so nao e escolha: exibe o painel direto, sem cabecalho inutil.
  if (paineis.length === 1) {
    return <>{paineis[0]?.conteudo}</>
  }

  return (
    <div className={estilos.bloco}>
      <div className={estilos.abas} role="tablist" aria-label={rotuloDaLista}>
        {paineis.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`aba-${p.id}`}
            aria-selected={i === ativo}
            aria-controls={`painel-${p.id}`}
            className={i === ativo ? estilos.abaAtiva : estilos.aba}
            onClick={() => irPara(i)}
            data-testid={`aba-${p.id}`}
          >
            <span className={estilos.rotulo}>{p.rotulo}</span>
            {p.detalhe !== undefined && (
              <span className={estilos.detalhe}>{p.detalhe}</span>
            )}
          </button>
        ))}
      </div>

      <div
        className={estilos.trilho}
        ref={trilho}
        onScroll={aoRolar}
        style={altura !== null && altura > 0 ? { height: altura } : undefined}
      >
        {/* Todos os paineis ficam montados. Esconder os inativos com `hidden`
            ou `inert` acabaria com o proprio arraste -- e nao ha o que
            esconder: eles estao ao lado, a um gesto de distancia. */}
        {paineis.map((p) => (
          <div
            key={p.id}
            className={estilos.painel}
            role="tabpanel"
            id={`painel-${p.id}`}
            aria-labelledby={`aba-${p.id}`}
          >
            {p.conteudo}
          </div>
        ))}
      </div>
    </div>
  )
}
