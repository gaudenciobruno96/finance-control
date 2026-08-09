import { describe, expect, it } from 'vitest'
import { ErroDeDominio } from './errors.js'
import {
  diasNoMes,
  ehBissexto,
  ehCentavosValido,
  ehCompetenciaValida,
  ehDataValida,
  ehDiaDoMesValido,
  exigirCentavosPositivo,
  exigirData,
} from './guards.js'

describe('guards', () => {
  describe('ehCentavosValido', () => {
    it('aceita inteiros, inclusive zero e negativos', () => {
      expect(ehCentavosValido(0)).toBe(true)
      expect(ehCentavosValido(1234)).toBe(true)
      expect(ehCentavosValido(-500)).toBe(true)
    })

    it('rejeita fracao e nao numeros', () => {
      expect(ehCentavosValido(10.5)).toBe(false)
      expect(ehCentavosValido(NaN)).toBe(false)
      expect(ehCentavosValido(Infinity)).toBe(false)
      expect(ehCentavosValido('100')).toBe(false)
      expect(ehCentavosValido(null)).toBe(false)
    })
  })

  describe('ehDataValida', () => {
    it('aceita datas reais', () => {
      expect(ehDataValida('2026-08-10')).toBe(true)
      expect(ehDataValida('2028-02-29')).toBe(true) // bissexto
    })

    it('rejeita dias que nao existem', () => {
      expect(ehDataValida('2026-02-29')).toBe(false) // nao bissexto
      expect(ehDataValida('2026-04-31')).toBe(false)
      expect(ehDataValida('2026-13-01')).toBe(false)
      expect(ehDataValida('2026-00-10')).toBe(false)
    })

    it('rejeita formatos diferentes', () => {
      expect(ehDataValida('10/08/2026')).toBe(false)
      expect(ehDataValida('2026-8-10')).toBe(false)
      expect(ehDataValida('2026-08')).toBe(false)
      expect(ehDataValida(20260810)).toBe(false)
    })
  })

  describe('ehCompetenciaValida', () => {
    it('aceita competencias bem formadas', () => {
      expect(ehCompetenciaValida('2026-08')).toBe(true)
      expect(ehCompetenciaValida('2026-12')).toBe(true)
    })

    it('rejeita mes fora da faixa e formatos diferentes', () => {
      expect(ehCompetenciaValida('2026-13')).toBe(false)
      expect(ehCompetenciaValida('2026-00')).toBe(false)
      expect(ehCompetenciaValida('2026-08-10')).toBe(false)
    })
  })

  describe('ehDiaDoMesValido', () => {
    it('aceita a faixa de 1 a 31', () => {
      expect(ehDiaDoMesValido(1)).toBe(true)
      expect(ehDiaDoMesValido(31)).toBe(true)
    })

    it('rejeita fora da faixa', () => {
      expect(ehDiaDoMesValido(0)).toBe(false)
      expect(ehDiaDoMesValido(32)).toBe(false)
      expect(ehDiaDoMesValido(15.5)).toBe(false)
    })
  })

  describe('diasNoMes e ehBissexto', () => {
    it('aplica a regra completa do ano bissexto', () => {
      expect(ehBissexto(2028)).toBe(true) // divisivel por 4
      expect(ehBissexto(2026)).toBe(false)
      expect(ehBissexto(1900)).toBe(false) // seculo nao divisivel por 400
      expect(ehBissexto(2000)).toBe(true) // divisivel por 400
    })

    it('devolve o tamanho correto de cada mes', () => {
      expect(diasNoMes(2026, 1)).toBe(31)
      expect(diasNoMes(2026, 2)).toBe(28)
      expect(diasNoMes(2028, 2)).toBe(29)
      expect(diasNoMes(2026, 4)).toBe(30)
      expect(diasNoMes(2026, 12)).toBe(31)
    })
  })

  describe('asercoes', () => {
    it('lancam ErroDeDominio com o codigo correspondente', () => {
      expect(() => exigirData('2026-02-30', 'teste')).toThrowError(
        expect.objectContaining({ codigo: 'DATA_INVALIDA', componente: 'teste' }),
      )
      expect(() => exigirCentavosPositivo(0, 'teste')).toThrowError(
        expect.objectContaining({ codigo: 'VALOR_NAO_POSITIVO' }),
      )
      expect(() => exigirCentavosPositivo(1.5, 'teste')).toThrowError(
        expect.objectContaining({ codigo: 'VALOR_NAO_INTEIRO' }),
      )
    })

    it('nao lancam para entrada valida', () => {
      expect(() => exigirData('2026-08-10', 'teste')).not.toThrow()
      expect(() => exigirCentavosPositivo(1, 'teste')).not.toThrow()
    })

    it('lancam sempre ErroDeDominio, nunca erro nativo', () => {
      try {
        exigirData('invalida', 'teste')
        expect.unreachable('deveria ter lancado')
      } catch (e) {
        expect(e).toBeInstanceOf(ErroDeDominio)
      }
    })
  })
})
