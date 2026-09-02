import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from './dados/conexao.js'
import { aplicarMigracoes } from './dados/migracoes.js'
import { criarAppPg, type AppPg } from './app-pg.js'
import { situacaoDoMes } from './tools/situacao-do-mes.js'

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
  for (const t of ['regras', 'parcelamentos', 'ocorrencias', 'ancoras', 'configuracoes']) {
    await pool.query(`delete from ${t}`)
  }
})

describe('situacaoDoMes sobre Postgres', () => {
  it('projeta a partir de uma regra gravada', async () => {
    await app.repos.regras.salvar({
      id: 'r-aluguel',
      tipo: 'saida',
      nome: 'Aluguel',
      valorCentavos: 180000,
      valorEhEstimativa: false,
      diaDoMes: 10,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-03',
      vigenteAte: null,
    })

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-05' })

    expect(r.faltaPagar.map((i) => i.nome)).toContain('Aluguel')
    expect(r.totalFaltaPagar.valorCentavos).toBe(180000)
  })

  it('marca saldoRelativo sem ancora e emite o aviso', async () => {
    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-05' })

    expect(r.saldoRelativo).toBe(true)
    expect(r.avisoSaldoRelativo).not.toBeNull()
  })

  it('deixa de ser relativo quando ha ancora', async () => {
    await app.repos.ancoras.salvar(
      { id: 'a-1', data: '2026-03-01', saldoCentavos: 120000, declaradaEm: null },
      '2026-03-05',
    )

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-05' })

    expect(r.saldoRelativo).toBe(false)
    expect(r.avisoSaldoRelativo).toBeNull()
  })

  it('expoe a chave de cada item, para a escrita poder referenciar', async () => {
    await app.repos.regras.salvar({
      id: 'r-luz',
      tipo: 'saida',
      nome: 'Luz',
      valorCentavos: 22000,
      valorEhEstimativa: true,
      diaDoMes: 15,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-03',
      vigenteAte: null,
    })

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-05' })
    const luz = r.faltaPagar.find((i) => i.nome === 'Luz')

    // Sem a chave, `marcar_pago` nao teria como referenciar uma ocorrencia que
    // ainda nao existe no banco.
    expect(luz?.chave).toBeTypeOf('string')
    expect(luz?.chave.length).toBeGreaterThan(0)
  })

  it('nao expoe idReal, que e detalhe de persistencia', async () => {
    await app.repos.ocorrencias.salvar({
      id: 'o-1',
      geradorTipo: 'avulso',
      geradorId: null,
      competencia: '2026-03',
      tipo: 'saida',
      nome: 'Pneu',
      valorPrevistoCentavos: 85000,
      dataVencimento: '2026-03-12',
      dataPagamento: null,
      valorPagoCentavos: null,
      pagamentoRegistradoEm: null,
      ignorado: false,
      observacao: null,
    })

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-05' })
    const pneu = r.faltaPagar.find((i) => i.nome === 'Pneu')

    expect(pneu).toBeDefined()
    expect(pneu).not.toHaveProperty('idReal')
  })
})
