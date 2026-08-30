import { describe, expect, it } from 'vitest'
import { dentroDaJanela, JANELA_DE_DESFAZER_HORAS, montarRecibo } from './recibo.js'

describe('montarRecibo', () => {
  it('carrega tipo, id e resumo', () => {
    const r = montarRecibo('recorrente', 'r-1', 'Aluguel, R$ 1.800,00, todo dia 10')

    expect(r.tipo).toBe('recorrente')
    expect(r.id).toBe('r-1')
    expect(r.resumo).toContain('Aluguel')
    expect(r.avisos).toEqual([])
  })

  it('carrega avisos quando existem', () => {
    const r = montarRecibo('recorrente', 'r-1', 'x', ['ocorrencias permanecem'])

    expect(r.avisos).toEqual(['ocorrencias permanecem'])
  })
})

describe('dentroDaJanela', () => {
  const agora = new Date('2026-08-29T12:00:00.000Z')

  it('aceita o que foi criado ha uma hora', () => {
    expect(dentroDaJanela(new Date('2026-08-29T11:00:00.000Z'), agora)).toBe(true)
  })

  it('aceita o limite exato', () => {
    expect(dentroDaJanela(new Date('2026-08-28T12:00:00.000Z'), agora)).toBe(true)
  })

  it('recusa o que passou da janela', () => {
    // Desfazer algo de tres meses atras nao e desfazer, e edicao.
    expect(dentroDaJanela(new Date('2026-05-29T12:00:00.000Z'), agora)).toBe(false)
  })

  it('recusa um segundo alem do limite', () => {
    expect(dentroDaJanela(new Date('2026-08-28T11:59:59.000Z'), agora)).toBe(false)
  })

  it('a janela e de 24 horas', () => {
    expect(JANELA_DE_DESFAZER_HORAS).toBe(24)
  })
})
