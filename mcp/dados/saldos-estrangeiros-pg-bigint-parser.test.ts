import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import pg, { type Pool } from 'pg'
import { aplicarMigracoes } from './migracoes.js'
import { criarSaldosEstrangeirosPg } from './saldos-estrangeiros-pg.js'

/**
 * Prova que o parser de BIGINT (efeito colateral de `mcp/dados/conexao.ts`)
 * fica ativo mesmo para um Pool que NUNCA passa por `criarPool`, para
 * `criarSaldosEstrangeirosPg` especificamente.
 *
 * Este arquivo, de proposito, nao importa nada de `./conexao.js` -- nem
 * `criarPool`, nem sequer o modulo para efeito colateral -- e, tao importante
 * quanto isso, NAO importa `./repositorios-pg.ts`. Aquele modulo tambem
 * importa `./conexao.js` por efeito colateral (ver `bigint-parser.test.ts`),
 * e o vitest carrega todos os imports estaticos de um arquivo de teste antes
 * de rodar qualquer `it`. Se este caso vivesse no MESMO arquivo que o teste
 * de `criarRepositoriosPg`, o import de `repositorios-pg.ts` registraria o
 * parser globalmente de qualquer forma, e remover o import de
 * `saldos-estrangeiros-pg.ts` NAO faria nenhum teste falhar -- o mesmo
 * defeito que este arquivo existe para evitar, so que trocado de lugar. Por
 * isso o caso mora em arquivo proprio: `criarSaldosEstrangeirosPg` precisa
 * ser a UNICA fonte do parser no grafo de modulos deste arquivo.
 *
 * O Pool aqui e construido direto com `new pg.Pool(...)`, como um chamador
 * futuro poderia fazer sem saber do detalhe do parser.
 *
 * Se `saldos-estrangeiros-pg.ts` nao importar `./conexao.js` como efeito
 * colateral, o parser de BIGINT nunca e registrado neste grafo de modulos, e
 * valorCentavos volta como STRING do driver -- a soma do patrimonio
 * quebraria em silencio ('500000' + 1 === '5000001').
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

describe('parser de BIGINT ativado independente de criarPool (saldos estrangeiros)', () => {
  it('valorCentavos volta como number mesmo com Pool construido sem criarPool', async () => {
    const repo = criarSaldosEstrangeirosPg(pool)

    await repo.salvar({ moeda: 'USD', valorCentavos: 500_000, data: '2026-08-30' })
    const [s] = await repo.listar()

    expect(typeof s?.valorCentavos).toBe('number')
    expect(s?.valorCentavos).toBe(500_000)
  })
})
