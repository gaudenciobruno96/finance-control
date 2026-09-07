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
  categoria: null,
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

    const tocadoEm = await auditoria.tocadoEm('regras', 'r-1')

    expect(tocadoEm).toBeInstanceOf(Date)
  })

  it('devolve null para id inexistente', async () => {
    const auditoria = criarAuditoria(pool)

    expect(await auditoria.tocadoEm('regras', 'nao-existe')).toBeNull()
  })

  it('rejeita tabela fora da lista fechada, mesmo contornando o TypeScript', async () => {
    const auditoria = criarAuditoria(pool)

    // O `as never` simula um chamador que burla o tipo TabelaAuditavel -- o
    // guard em runtime, nao o TypeScript, e o que protege a posicao de
    // identificador no SQL contra um nome de tabela arbitrario.
    await expect(
      auditoria.tocadoEm('regras; drop table regras;--' as unknown as TabelaAuditavel, 'r-1'),
    ).rejects.toThrow()
  })

  it('reflete atualizacao, nao so criacao: salvar de novo avanca tocadoEm', async () => {
    // A distincao com criado_em e o ponto inteiro do achado 5: uma linha
    // atualizada (nao recriada) precisa que o instante mude tambem.
    const repos = criarRepositoriosPg(pool)
    const auditoria = criarAuditoria(pool)

    await repos.regras.salvar(REGRA)
    await pool.query(`update regras set atualizado_em = now() - interval '2 days' where id = 'r-1'`)
    const antesDeAtualizar = await auditoria.tocadoEm('regras', 'r-1')

    await repos.regras.salvar({ ...REGRA, nome: 'Aluguel novo' })
    const depoisDeAtualizar = await auditoria.tocadoEm('regras', 'r-1')

    expect(depoisDeAtualizar).not.toBeNull()
    expect(antesDeAtualizar).not.toBeNull()
    expect(depoisDeAtualizar!.getTime()).toBeGreaterThan(antesDeAtualizar!.getTime())
  })
})
