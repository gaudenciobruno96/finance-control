import { describe, expect, it } from 'vitest'
import { ErroDeDominio } from './errors.js'
import {
  deEntradaUsuario,
  formatarBRL,
  media,
  multiplicarPorInteiro,
  somar,
  subtrair,
} from './money.js'

describe('money', () => {
  /**
   * O caso que motiva RN-01 existir. Em ponto flutuante, 0.1 + 0.2 resulta em
   * 0.30000000000000004. Em centavos inteiros, 10 + 20 e exatamente 30.
   */
  it('soma centavos sem erro de representacao', () => {
    expect(somar(10, 20)).toBe(30)
    expect(0.1 + 0.2).not.toBe(0.3) // documenta por que centavos sao inteiros
  })

  it('soma lista vazia como zero', () => {
    expect(somar()).toBe(0)
  })

  it('rejeita valor fracionario', () => {
    expect(() => somar(10.5)).toThrow(ErroDeDominio)
    expect(() => subtrair(1, 0.5)).toThrow(ErroDeDominio)
  })

  it('subtrai de forma exata', () => {
    expect(subtrair(100_000, 33_333)).toBe(66_667)
  })

  it('multiplica apenas por inteiro', () => {
    expect(multiplicarPorInteiro(19_99, 3)).toBe(59_97)
    expect(() => multiplicarPorInteiro(1000, 2.5)).toThrow(ErroDeDominio)
  })

  describe('media', () => {
    it('devolve null para amostra vazia', () => {
      expect(media([])).toBeNull()
    })

    it('arredonda para o centavo mais proximo', () => {
      expect(media([100, 101])).toBe(101) // 100.5 arredonda para 101
      expect(media([100, 100, 101])).toBe(100) // 100.33 arredonda para 100
    })

    it('devolve sempre inteiro', () => {
      expect(Number.isInteger(media([1, 2, 3]))).toBe(true)
    })
  })

  describe('formatarBRL', () => {
    it('formata em moeda brasileira', () => {
      // O separador de milhar do Intl em pt-BR e um espaco estreito, nao ASCII.
      expect(formatarBRL(123_456)).toMatch(/^R\$\s?1\.234,56$/u)
      expect(formatarBRL(0)).toMatch(/^R\$\s?0,00$/u)
    })

    it('formata valores negativos', () => {
      expect(formatarBRL(-500)).toContain('5,00')
    })
  })

  describe('deEntradaUsuario', () => {
    it('aceita as formas usuais em portugues do Brasil', () => {
      expect(deEntradaUsuario('1.234,56')).toBe(123_456)
      expect(deEntradaUsuario('1234,56')).toBe(123_456)
      expect(deEntradaUsuario('1234.56')).toBe(123_456)
      expect(deEntradaUsuario('1234')).toBe(123_400)
      expect(deEntradaUsuario('0,01')).toBe(1)
    })

    it('completa a casa decimal faltante', () => {
      expect(deEntradaUsuario('10,5')).toBe(10_50)
    })

    it('aceita negativo', () => {
      expect(deEntradaUsuario('-25,00')).toBe(-25_00)
    })

    /**
     * O motivo de a conversao ser feita por manipulacao de digitos e nao por
     * parseFloat: 19.99 * 100 resulta em 1998.9999999999998.
     */
    it('nao reintroduz erro de ponto flutuante', () => {
      expect(deEntradaUsuario('19,99')).toBe(19_99)
      expect(deEntradaUsuario('0,07')).toBe(7)
      expect(deEntradaUsuario('1,10')).toBe(110)
    })

    it('rejeita entrada que nao e valor monetario', () => {
      expect(deEntradaUsuario('')).toBeNull()
      expect(deEntradaUsuario('   ')).toBeNull()
      expect(deEntradaUsuario('abc')).toBeNull()
      expect(deEntradaUsuario('12,345')).toBeNull() // tres casas decimais
      expect(deEntradaUsuario('R$ 10')).toBeNull()
    })
  })
})
