import { describe, expect, it } from 'vitest'
import { ErroDeDominio, ehErroDeDominio, falhar } from './errors.js'

describe('ErroDeDominio', () => {
  it('carrega o codigo da invariante e o componente que a detectou', () => {
    const erro = new ErroDeDominio('VALOR_NAO_INTEIRO', 'money')

    expect(erro.codigo).toBe('VALOR_NAO_INTEIRO')
    expect(erro.componente).toBe('money')
    expect(erro).toBeInstanceOf(Error)
  })

  it('e distinguivel de um erro nativo', () => {
    expect(ehErroDeDominio(new ErroDeDominio('DATA_INVALIDA', 'calendar'))).toBe(true)
    expect(ehErroDeDominio(new Error('qualquer'))).toBe(false)
    expect(ehErroDeDominio('nem erro e')).toBe(false)
  })

  it('falhar sempre lanca', () => {
    expect(() => falhar('ANCORA_FUTURA', 'balanceProjector')).toThrow(ErroDeDominio)
  })

  /**
   * NFR-S05: a mensagem descreve QUAL invariante foi violada, jamais o valor
   * que a violou. Dado financeiro nao vaza por mensagem de erro.
   */
  it('nao expoe valores de dado na mensagem', () => {
    const erro = new ErroDeDominio('VALOR_NAO_INTEIRO', 'money')

    expect(erro.message).toContain('money')
    expect(erro.message).toContain('inteiro em centavos')
    expect(erro.message).not.toMatch(/\d/)
  })
})
