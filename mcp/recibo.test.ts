import { describe, expect, it } from 'vitest'
import {
  dentroDaJanela,
  JANELA_DE_DESFAZER_HORAS,
  montarRecibo,
  TOLERANCIA_DE_RELOGIO_MS,
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

  it('recusa criadoEm no futuro alem da tolerancia de relogio', () => {
    // Uma hora no futuro e muito mais que a tolerancia de 60s -- isso nao e
    // desvio de relogio entre banco e processo, e sinal de que algo esta
    // errado, e desfazer nao deve passar por cima disso.
    expect(dentroDaJanela(new Date('2026-08-29T13:00:00.000Z'), agora)).toBe(false)
  })

  it('a janela e de 24 horas', () => {
    expect(JANELA_DE_DESFAZER_HORAS).toBe(24)
  })

  it('a tolerancia de desvio de relogio e de 60 segundos', () => {
    expect(TOLERANCIA_DE_RELOGIO_MS).toBe(60_000)
  })

  it('aceita criadoEm ate 30s no futuro (desvio de relogio banco/processo)', () => {
    // `criadoEm` vem do now() do Postgres, `agora` do relogio do processo
    // Node -- no Railway sao containers distintos. Sem tolerancia, um
    // registro gravado ha poucos segundos apareceria como "criado no futuro"
    // sempre que o relogio do banco estiver um pouco adiantado.
    const criadoEm = new Date(agora.getTime() + 30_000)
    expect(dentroDaJanela(criadoEm, agora)).toBe(true)
  })

  it('aceita o limite exato da tolerancia de relogio', () => {
    const criadoEm = new Date(agora.getTime() + TOLERANCIA_DE_RELOGIO_MS)
    expect(dentroDaJanela(criadoEm, agora)).toBe(true)
  })

  it('recusa criadoEm 10 minutos no futuro, bem alem da tolerancia', () => {
    const criadoEm = new Date(agora.getTime() + 10 * 60 * 1000)
    expect(dentroDaJanela(criadoEm, agora)).toBe(false)
  })
})
