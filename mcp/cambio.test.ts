import { describe, expect, it } from 'vitest'
import { converter, formatarMoeda, normalizarMoeda, paraDezMilesimos } from './cambio.js'

describe('paraDezMilesimos', () => {
  it('aceita as formas em que uma cotacao e escrita', () => {
    expect(paraDezMilesimos('5,4321')).toBe(54321)
    expect(paraDezMilesimos('5.4321')).toBe(54321)
    expect(paraDezMilesimos('5,4')).toBe(54000)
    expect(paraDezMilesimos('5')).toBe(50000)
    expect(paraDezMilesimos('  5,40  ')).toBe(54000)
  })

  it('recusa o que nao e uma cotacao utilizavel', () => {
    expect(paraDezMilesimos('')).toBeNull()
    expect(paraDezMilesimos('   ')).toBeNull()
    expect(paraDezMilesimos('abc')).toBeNull()
    expect(paraDezMilesimos('0')).toBeNull()
    expect(paraDezMilesimos('0,00')).toBeNull()
    expect(paraDezMilesimos('-5,40')).toBeNull()
    expect(paraDezMilesimos('1,2,3')).toBeNull()
  })

  // Truncar em silencio descartaria precisao que o usuario informou de
  // proposito. Quatro casas e o formato usual de cotacao.
  it('recusa mais de quatro casas decimais em vez de truncar', () => {
    expect(paraDezMilesimos('5,43210')).toBeNull()
  })
})

describe('converter', () => {
  it('arredonda para o centavo mais proximo, para cima e para baixo', () => {
    // 1 cent a 5,5000 = 5,5 centavos de real -> 6
    expect(converter(1, 55000)).toBe(6)
    // 1 cent a 5,4000 = 5,4 centavos de real -> 5
    expect(converter(1, 54000)).toBe(5)
  })

  // Este e o caso que justifica a aritmetica inteira: em ponto flutuante o
  // produto perderia exatidao e o total do patrimonio sairia com centavos
  // fantasmas.
  it('mantem exatidao num valor grande', () => {
    // US$ 5.000,00 a 5,4321 = R$ 27.160,50
    expect(converter(500_000, 54321)).toBe(2_716_050)
  })

  it('converte zero em zero', () => {
    expect(converter(0, 54321)).toBe(0)
  })
})

describe('formatarMoeda', () => {
  it('formata na moeda pedida, nao em reais', () => {
    // O separador antes do numero pode ser espaco estreito (U+202F ou
    // U+00A0), nao ASCII -- por isso `\s?` em vez de um espaco literal.
    expect(formatarMoeda(500_000, 'USD')).toMatch(/US\$\s?5\.000,00/u)
    expect(formatarMoeda(12_345, 'EUR')).toMatch(/€\s?123,45/u)
  })
})

describe('normalizarMoeda', () => {
  it('aceita tres letras em qualquer caixa e devolve em maiusculas', () => {
    expect(normalizarMoeda('usd')).toBe('USD')
    expect(normalizarMoeda('  Eur ')).toBe('EUR')
  })

  it('recusa o que nao tem formato de codigo ISO 4217', () => {
    expect(normalizarMoeda('dolar')).toBeNull()
    expect(normalizarMoeda('US')).toBeNull()
    expect(normalizarMoeda('US1')).toBeNull()
    expect(normalizarMoeda('')).toBeNull()
  })
})
