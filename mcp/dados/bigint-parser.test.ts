import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import pg, { type Pool } from 'pg'
import type { AncoraSaldo } from '../../src/domain/types.js'
import { aplicarMigracoes } from './migracoes.js'
import { criarRepositoriosPg } from './repositorios-pg.js'

/**
 * Prova que o parser de BIGINT (efeito colateral de `mcp/dados/conexao.ts`)
 * fica ativo mesmo para um Pool que NUNCA passa por `criarPool`.
 *
 * Este arquivo, de proposito, nao importa nada de `./conexao.js` -- nem
 * `criarPool`, nem sequer o modulo para efeito colateral. O Pool aqui e
 * construido direto com `new pg.Pool(...)`, como um chamador futuro (ex.: a
 * aplicacao da Task 3) poderia fazer sem saber do detalhe do parser.
 *
 * Se `repositorios-pg.ts` nao importar `./conexao.js` como efeito colateral,
 * o parser de BIGINT nunca e registrado neste grafo de modulos, e
 * saldoCentavos volta como STRING do driver -- a aritmetica do dominio
 * quebraria em silencio ('100' + 1 === '1001').
 */

let container: StartedPostgreSqlContainer
let pool: Pool

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  pool = new pg.Pool({ connectionString: container.getConnectionUri() })
  await aplicarMigracoes(pool)
}, 120_000)

afterAll(async () => {
  await pool.end()
  await container.stop()
})

describe('parser de BIGINT ativado independente de criarPool', () => {
  it('saldoCentavos volta como number mesmo com Pool construido sem criarPool', async () => {
    const repos = criarRepositoriosPg(pool)
    const ancora: AncoraSaldo = {
      id: 'a-bigint',
      data: '2026-03-01',
      saldoCentavos: 120000,
      declaradaEm: null,
    }

    await repos.ancoras.salvar(ancora, '2026-03-20')
    const lida = await repos.ancoras.vigenteEm('2026-03-20')

    expect(typeof lida?.saldoCentavos).toBe('number')
    expect(lida?.saldoCentavos).toBe(120000)
  })
})
