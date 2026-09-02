import { describe, expect, it } from 'vitest'
import {
  montarRecibo,
} from './recibo.js'

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

