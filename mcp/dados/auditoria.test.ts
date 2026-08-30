import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import type { Regra } from '../../src/domain/types.js'
import { criarPool } from './conexao.js'
import { aplicarMigracoes } from './migracoes.js'
import { criarRepositoriosPg } from './repositorios-pg.js'
import { criarAuditoria, type TabelaAuditavel } from './auditoria.js'

const REGRA: Regra = {
  id: 'r-1',
  tipo: 'saida',
  nome: 'Aluguel',
  valorCentavos: 180000,
  valorEhEstimativa: false,
  diaDoMes: 10,
  ajusteFimDeSemana: 'nenhum',
  vigenteDe: '2026-01',
  vigenteAte: null,
}

let container: StartedPostgreSqlContainer
let pool: Pool

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  pool = criarPool(container.getConnectionUri())
  await aplicarMigracoes(pool)
}, 120_000)

afterAll(async () => {
  await pool.end()
  await container.stop()
})

beforeEach(async () => {
  await pool.query('delete from regras')
})

describe('auditoria', () => {
  it('devolve a data de criacao de um registro existente', async () => {
    const repos = criarRepositoriosPg(pool)
    const auditoria = criarAuditoria(pool)

    await repos.regras.salvar(REGRA)

    const criadoEm = await auditoria.criadoEm('regras', 'r-1')

    expect(criadoEm).toBeInstanceOf(Date)
  })

  it('devolve null para id inexistente', async () => {
    const auditoria = criarAuditoria(pool)

    expect(await auditoria.criadoEm('regras', 'nao-existe')).toBeNull()
  })

  it('rejeita tabela fora da lista fechada, mesmo contornando o TypeScript', async () => {
    const auditoria = criarAuditoria(pool)

    // O `as never` simula um chamador que burla o tipo TabelaAuditavel -- o
    // guard em runtime, nao o TypeScript, e o que protege a posicao de
    // identificador no SQL contra um nome de tabela arbitrario.
    await expect(
      auditoria.criadoEm('regras; drop table regras;--' as unknown as TabelaAuditavel, 'r-1'),
    ).rejects.toThrow()
  })
})
