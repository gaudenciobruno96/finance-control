/**
 * SUP-02 — Guardas de invariante reutilizaveis (PAD-04).
 *
 * Validacao acontece nas funcoes publicas de cada modulo; as auxiliares
 * internas confiam na entrada. Validar em toda camada interna produziria
 * verificacao redundante em lacos que percorrem dezenas de itens por dia da
 * competencia.
 *
 * Centralizadas porque a mesma verificacao aparece em calendar, nos tres
 * expansores e no projetor. Duplica-la produziria divergencia silenciosa entre
 * validacoes que deveriam ser identicas.
 */

import { falhar } from './errors.js'
import type { Centavos, Competencia, DataISO } from './types.js'

const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/
const PADRAO_COMPETENCIA = /^\d{4}-\d{2}$/

// ---------------------------------------------------------------------------
// Predicados
// ---------------------------------------------------------------------------

export function ehCentavosValido(v: unknown): v is Centavos {
  return typeof v === 'number' && Number.isInteger(v)
}

export function ehDataValida(v: unknown): v is DataISO {
  if (typeof v !== 'string' || !PADRAO_DATA.test(v)) return false

  const ano = Number(v.slice(0, 4))
  const mes = Number(v.slice(5, 7))
  const dia = Number(v.slice(8, 10))

  if (mes < 1 || mes > 12) return false
  if (dia < 1) return false
  return dia <= diasNoMes(ano, mes)
}

export function ehCompetenciaValida(v: unknown): v is Competencia {
  if (typeof v !== 'string' || !PADRAO_COMPETENCIA.test(v)) return false
  const mes = Number(v.slice(5, 7))
  return mes >= 1 && mes <= 12
}

export function ehDiaDoMesValido(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31
}

/**
 * Numero de dias do mes. Base de todo truncamento de dia inexistente (RN-05).
 *
 * A regra de ano bissexto e implementada por extenso em vez de delegada a
 * `Date`, coerente com RN-04: nenhuma operacao de calendario passa por tipo
 * com semantica de fuso.
 */
export function diasNoMes(ano: number, mes: number): number {
  if (mes === 2) return ehBissexto(ano) ? 29 : 28
  if (mes === 4 || mes === 6 || mes === 9 || mes === 11) return 30
  return 31
}

export function ehBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
}

// ---------------------------------------------------------------------------
// Asercoes
// ---------------------------------------------------------------------------

export function exigirCentavos(v: unknown, componente: string): asserts v is Centavos {
  if (!ehCentavosValido(v)) falhar('VALOR_NAO_INTEIRO', componente)
}

export function exigirCentavosPositivo(v: unknown, componente: string): asserts v is Centavos {
  exigirCentavos(v, componente)
  if ((v as number) <= 0) falhar('VALOR_NAO_POSITIVO', componente)
}

export function exigirData(v: unknown, componente: string): asserts v is DataISO {
  if (!ehDataValida(v)) falhar('DATA_INVALIDA', componente)
}

export function exigirCompetencia(v: unknown, componente: string): asserts v is Competencia {
  if (!ehCompetenciaValida(v)) falhar('COMPETENCIA_INVALIDA', componente)
}

export function exigirDiaDoMes(v: unknown, componente: string): asserts v is number {
  if (!ehDiaDoMesValido(v)) falhar('DIA_DO_MES_INVALIDO', componente)
}

export function exigirInteiro(v: unknown, componente: string): asserts v is number {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    falhar('MULTIPLICADOR_NAO_INTEIRO', componente)
  }
}

export function exigirQuantidadeParcelas(v: unknown, componente: string): asserts v is number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    falhar('QUANTIDADE_PARCELAS_INVALIDA', componente)
  }
}
