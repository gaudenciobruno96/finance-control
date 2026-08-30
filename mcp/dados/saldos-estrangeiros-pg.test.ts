import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from './conexao.js'
import { aplicarMigracoes } from './migracoes.js'
import { criarSaldosEstrangeirosPg, type SaldosEstrangeirosRepo } from './saldos-estrangeiros-pg.js'

let container: StartedPostgreSqlContainer
let pool: Pool
let repo: SaldosEstrangeirosRepo

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  pool = criarPool(container.getConnectionUri())
  await aplicarMigracoes(pool)
  repo = criarSaldosEstrangeirosPg(pool)
}, 120_000)

afterAll(async () => {
  await pool.end()
  await container.stop()
})

beforeEach(async () => {
  await pool.query('delete from saldos_estrangeiros')
})

it('grava e le um saldo', async () => {
  await repo.salvar({ moeda: 'USD', valorCentavos: 500_000, data: '2026-08-30' })

  expect(await repo.listar()).toEqual([
    { moeda: 'USD', valorCentavos: 500_000, data: '2026-08-30' },
  ])
})

// `valor_centavos` e bigint, e o driver `pg` devolve bigint como STRING por
// padrao. Sem o parser de tipo, este teste veria "500000" e a soma do
// patrimonio concatenaria em vez de somar.
it('devolve o valor como numero, nao como string', async () => {
  await repo.salvar({ moeda: 'USD', valorCentavos: 500_000, data: '2026-08-30' })

  const [s] = await repo.listar()
  expect(typeof s?.valorCentavos).toBe('number')
})

it('declarar a mesma moeda de novo substitui, deixando uma linha so', async () => {
  await repo.salvar({ moeda: 'USD', valorCentavos: 500_000, data: '2026-08-01' })
  await repo.salvar({ moeda: 'USD', valorCentavos: 620_000, data: '2026-08-30' })

  expect(await repo.listar()).toEqual([
    { moeda: 'USD', valorCentavos: 620_000, data: '2026-08-30' },
  ])
})

it('mantem criado_em da primeira declaracao e avanca atualizado_em', async () => {
  await repo.salvar({ moeda: 'USD', valorCentavos: 500_000, data: '2026-08-01' })
  const antes = await pool.query<{ criado_em: Date; atualizado_em: Date }>(
    'select criado_em, atualizado_em from saldos_estrangeiros where moeda = $1',
    ['USD'],
  )

  await repo.salvar({ moeda: 'USD', valorCentavos: 620_000, data: '2026-08-30' })
  const depois = await pool.query<{ criado_em: Date; atualizado_em: Date }>(
    'select criado_em, atualizado_em from saldos_estrangeiros where moeda = $1',
    ['USD'],
  )

  expect(depois.rows[0]?.criado_em.getTime()).toBe(antes.rows[0]?.criado_em.getTime())
  expect(depois.rows[0]?.atualizado_em.getTime()).toBeGreaterThanOrEqual(
    antes.rows[0]?.atualizado_em.getTime() ?? 0,
  )
})

it('guarda moedas diferentes lado a lado, ordenadas por codigo', async () => {
  await repo.salvar({ moeda: 'USD', valorCentavos: 500_000, data: '2026-08-30' })
  await repo.salvar({ moeda: 'EUR', valorCentavos: 100_000, data: '2026-08-30' })

  expect((await repo.listar()).map((s) => s.moeda)).toEqual(['EUR', 'USD'])
})
