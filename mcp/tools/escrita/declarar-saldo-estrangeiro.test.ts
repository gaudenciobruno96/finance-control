import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'
import { declararSaldoEstrangeiro } from './declarar-saldo-estrangeiro.js'

let container: StartedPostgreSqlContainer
let pool: Pool
let app: AppPg

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  pool = criarPool(container.getConnectionUri())
  await aplicarMigracoes(pool)
  app = criarAppPg(pool)
}, 120_000)

afterAll(async () => {
  await pool.end()
  await container.stop()
})

beforeEach(async () => {
  await pool.query('delete from saldos_estrangeiros')
})

describe('declararSaldoEstrangeiro', () => {
  it('grava e devolve o valor formatado na moeda de origem', async () => {
    const r = await declararSaldoEstrangeiro(app, {
      moeda: 'USD',
      valor: '5000',
      hoje: '2026-08-30',
    })

    expect(r.moeda).toBe('USD')
    expect(r.valorCentavos).toBe(500_000)
    expect(r.data).toBe('2026-08-30')
    expect(r.valor).toMatch(/US\$\s?5\.000,00/u)

    expect(await app.saldosEstrangeiros.listar()).toEqual([
      { moeda: 'USD', valorCentavos: 500_000, data: '2026-08-30' },
    ])
  })

  it('normaliza a moeda para maiusculas', async () => {
    const r = await declararSaldoEstrangeiro(app, {
      moeda: 'usd',
      valor: '5000',
      hoje: '2026-08-30',
    })

    expect(r.moeda).toBe('USD')
    expect((await app.saldosEstrangeiros.listar())[0]?.moeda).toBe('USD')
  })

  it('usa a data informada em vez de hoje', async () => {
    const r = await declararSaldoEstrangeiro(app, {
      moeda: 'USD',
      valor: '5000',
      data: '2026-08-15',
      hoje: '2026-08-30',
    })

    expect(r.data).toBe('2026-08-15')
  })

  it('aceita as formas em que a pessoa fala o valor', async () => {
    for (const [texto, esperado] of [
      ['80', 8000],
      ['80,00', 8000],
      ['1.234,56', 123456],
      ['1234.56', 123456],
    ] as const) {
      await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: texto, hoje: '2026-08-30' })
      expect((await app.saldosEstrangeiros.listar())[0]?.valorCentavos).toBe(esperado)
    }
  })

  it('declarar de novo substitui', async () => {
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: '2026-08-30' })
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '6200', hoje: '2026-08-30' })

    expect(await app.saldosEstrangeiros.listar()).toEqual([
      { moeda: 'USD', valorCentavos: 620_000, data: '2026-08-30' },
    ])
  })

  it('avisa que nao ha desfazer e que o valor nao entra na projecao', async () => {
    const r = await declararSaldoEstrangeiro(app, {
      moeda: 'USD',
      valor: '5000',
      hoje: '2026-08-30',
    })

    expect(r.avisos.join(' ')).toMatch(/desfazer/iu)
    expect(r.avisos.join(' ')).toMatch(/convert/iu)
  })

  it('recusa moeda mal formada sem gravar', async () => {
    await expect(
      declararSaldoEstrangeiro(app, { moeda: 'dolar', valor: '5000', hoje: '2026-08-30' }),
    ).rejects.toThrow(ErroDeUsuario)

    expect(await app.saldosEstrangeiros.listar()).toEqual([])
  })

  it('recusa valor ilegivel sem gravar', async () => {
    await expect(
      declararSaldoEstrangeiro(app, { moeda: 'USD', valor: 'muito', hoje: '2026-08-30' }),
    ).rejects.toThrow(ErroDeUsuario)

    expect(await app.saldosEstrangeiros.listar()).toEqual([])
  })

  // Uma reserva em moeda estrangeira negativa nao tem significado -- ao
  // contrario da ancora em reais, que pode estar no vermelho.
  it('recusa valor negativo sem gravar', async () => {
    await expect(
      declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '-100', hoje: '2026-08-30' }),
    ).rejects.toThrow(ErroDeUsuario)

    expect(await app.saldosEstrangeiros.listar()).toEqual([])
  })
})
