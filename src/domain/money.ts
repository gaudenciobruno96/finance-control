/**
 * DOM-02 — Aritmetica monetaria em centavos inteiros (RN-01 a RN-03).
 *
 * Todo valor e inteiro. Nao existe multiplicacao por fracao neste dominio:
 * nao ha juros compostos, percentuais nem rateio.
 */

import { exigirCentavos, exigirInteiro } from './guards.js'
import type { Centavos } from './types.js'

const COMPONENTE = 'money'

/** Soma exata. Rejeita qualquer parcela nao inteira (RN-02). */
export function somar(...valores: readonly Centavos[]): Centavos {
  let total = 0
  for (const v of valores) {
    exigirCentavos(v, COMPONENTE)
    total += v
  }
  return total
}

/** Diferenca exata. */
export function subtrair(a: Centavos, b: Centavos): Centavos {
  exigirCentavos(a, COMPONENTE)
  exigirCentavos(b, COMPONENTE)
  return a - b
}

/** Repeticao de parcela. O multiplicador deve ser inteiro (RN-03). */
export function multiplicarPorInteiro(valor: Centavos, n: number): Centavos {
  exigirCentavos(valor, COMPONENTE)
  exigirInteiro(n, COMPONENTE)
  return valor * n
}

/**
 * Media aritmetica de uma amostra, arredondada para o centavo mais proximo.
 *
 * Devolve null para amostra vazia em vez de lancar: media de nada nao e
 * violacao de invariante, e a ausencia de resultado e informacao util para o
 * chamador (RN-38).
 */
export function media(valores: readonly Centavos[]): Centavos | null {
  if (valores.length === 0) return null
  const total = somar(...valores)
  return Math.round(total / valores.length)
}

const FORMATADOR = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/** Formatacao para exibicao, em portugues do Brasil e moeda BRL. */
export function formatarBRL(valor: Centavos): string {
  exigirCentavos(valor, COMPONENTE)
  return FORMATADOR.format(valor / 100)
}

/**
 * Converte o que o usuario digitou em centavos. Devolve null quando a entrada
 * nao representa um valor monetario.
 *
 * Aceita as formas usuais em portugues do Brasil: "1.234,56", "1234,56",
 * "1234.56" e "1234". A conversao e feita por manipulacao de digitos, nunca
 * por `parseFloat` sobre o valor final -- multiplicar um float por 100
 * reintroduz exatamente o erro de representacao que RN-01 existe para evitar
 * (`19.99 * 100` resulta em `1998.9999999999998`).
 */
export function deEntradaUsuario(texto: string): Centavos | null {
  const limpo = texto.trim()
  if (limpo === '') return null

  const negativo = limpo.startsWith('-')
  const semSinal = negativo ? limpo.slice(1) : limpo

  if (!/^[\d.,]+$/.test(semSinal)) return null

  // O ultimo separador presente e o decimal; os demais sao de milhar.
  const ultimaVirgula = semSinal.lastIndexOf(',')
  const ultimoPonto = semSinal.lastIndexOf('.')
  const posSeparador = Math.max(ultimaVirgula, ultimoPonto)

  let inteiro: string
  let decimal: string

  if (posSeparador === -1) {
    inteiro = semSinal
    decimal = '00'
  } else {
    const parteDecimal = semSinal.slice(posSeparador + 1)
    // Mais de dois digitos apos o separador: nao e valor monetario.
    if (parteDecimal.length > 2) return null
    inteiro = semSinal.slice(0, posSeparador)
    decimal = parteDecimal.padEnd(2, '0')
  }

  const digitosInteiro = inteiro.replace(/[.,]/g, '')
  if (!/^\d*$/.test(digitosInteiro)) return null
  if (!/^\d{2}$/.test(decimal)) return null
  if (digitosInteiro === '' && posSeparador === -1) return null

  const centavos = Number(`${digitosInteiro || '0'}${decimal}`)
  if (!Number.isSafeInteger(centavos)) return null

  return negativo ? -centavos : centavos
}
