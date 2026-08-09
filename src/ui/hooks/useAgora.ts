/**
 * SUP-09 — Data corrente, em um unico ponto do app.
 *
 * Existe para preservar PAD-03: o dominio nunca le o relogio, e a camada de
 * servico o recebe por parametro. Se cada tela chamasse o relogio por conta
 * propria, duas leituras na mesma interacao poderiam cair em dias diferentes a
 * meia-noite -- e o motor deterministico deixaria de se-lo na pratica.
 */

import { useMemo } from 'react'
import type { DataISO } from '../../domain/types.js'

/** Data local no formato AAAA-MM-DD, sem passar por UTC. */
export function hojeLocal(): DataISO {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

/**
 * Estavel durante a montagem do componente.
 *
 * Usa os metodos locais de `Date`, nunca `toISOString()`, que converte para
 * UTC e trocaria o dia a partir das 21h no horario de Brasilia.
 */
export function useAgora(): DataISO {
  return useMemo(() => hojeLocal(), [])
}
