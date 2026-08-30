/**
 * Conversao entre moedas sem ponto flutuante.
 *
 * Multiplicar centavos por uma cotacao decimal reintroduziria float na unica
 * parte do sistema que o evita em todo lugar onde ha dinheiro. A cotacao vira
 * inteiro em decimos de milesimo (quatro casas), a conta e inteira, e o
 * arredondamento acontece uma vez, explicito, no fim.
 */

/** Casas decimais de uma cotacao. `5,4321` -> `54321`. */
const ESCALA = 10_000

/**
 * Le uma cotacao escrita como texto e devolve decimos de milesimo.
 *
 * `null` quando o texto nao e uma cotacao utilizavel. Cotacao entra como
 * texto pelo mesmo motivo que os valores entram: tirar aritmetica das maos do
 * modelo.
 */
export function paraDezMilesimos(texto: string): number | null {
  // `replace` sem flag global troca so o primeiro separador -- entao "1,2,3"
  // vira "1.2,3" e e recusado pela expressao abaixo, como deve ser.
  const limpo = texto.trim().replace(',', '.')

  // Ate quatro casas decimais. Truncar em silencio descartaria precisao
  // informada de proposito.
  if (!/^\d+(\.\d{1,4})?$/u.test(limpo)) return null

  const [inteira = '0', decimal = ''] = limpo.split('.')
  const valor = Number(inteira) * ESCALA + Number(decimal.padEnd(4, '0'))

  return valor > 0 ? valor : null
}

/**
 * Converte um valor na menor unidade da moeda de origem para centavos de
 * real, arredondando para o centavo mais proximo.
 *
 * O produto de um saldo alto por uma cotacao fica na casa de 10^10 -- muito
 * abaixo de `Number.MAX_SAFE_INTEGER`, entao a multiplicacao e exata.
 */
export function converter(valorCentavos: number, cotacaoEmDezMilesimos: number): number {
  return Math.round((valorCentavos * cotacaoEmDezMilesimos) / ESCALA)
}

/**
 * Formata na moeda de origem.
 *
 * Fica aqui e nao em `src/domain/money.ts` porque `src/` esta congelado e
 * `formatarBRL` continua sendo a funcao do dominio, fixa em BRL.
 */
export function formatarMoeda(centavos: number, moeda: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(
    centavos / 100,
  )
}

/**
 * Normaliza um codigo de moeda para maiusculas.
 *
 * Valida so o formato ISO 4217 (tres letras). Uma lista fechada de moedas
 * validas seria manutencao sem ganho: o formato ja recusa lixo, e o saldo
 * gravado com um codigo inexistente aparece no proprio resultado.
 */
export function normalizarMoeda(texto: string): string | null {
  const limpo = texto.trim().toUpperCase()
  return /^[A-Z]{3}$/u.test(limpo) ? limpo : null
}
