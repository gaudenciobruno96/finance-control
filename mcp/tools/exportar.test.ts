import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../dados/conexao.js'
import { aplicarMigracoes } from '../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../app-pg.js'
import { VERSAO_SCHEMA } from '../../src/data/db.js'
import { migrarDocumento } from '../../src/data/backup-serializer.js'
import { exportar } from './exportar.js'

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

describe('exportar', () => {
  it('devolve o formato DocumentoBackup, com a versao corrente', async () => {
    const doc = await exportar(app, { hoje: '2026-09-15' })

    expect(doc.versaoSchema).toBe(VERSAO_SCHEMA)
    expect(doc.exportadoEm).toBe('2026-09-15')
    expect(doc.regras).toEqual([])
    expect(doc.parcelamentos).toEqual([])
    expect(doc.ocorrencias).toEqual([])
    expect(doc.ancoras).toEqual([])
  })

  it('inclui o que foi gravado', async () => {
    await app.repos.regras.salvar({
      id: 'r-1',
      tipo: 'entrada',
      nome: 'Salario',
      valorCentavos: 500000,
      valorEhEstimativa: false,
      diaDoMes: 5,
      ajusteFimDeSemana: 'antecipa',
      vigenteDe: '2026-09',
      vigenteAte: null,
    })
    await app.repos.ancoras.salvar(
      { id: 'a-1', data: '2026-09-01', saldoCentavos: 120000 },
      '2026-09-15',
    )

    const doc = await exportar(app, { hoje: '2026-09-15' })

    expect(doc.regras).toHaveLength(1)
    expect(doc.regras[0]?.valorCentavos).toBe(500000)
    expect(doc.ancoras[0]?.saldoCentavos).toBe(120000)
  })

  it('o documento atravessa migrarDocumento sem mudar', async () => {
    // Prova que o formato exportado e o que o resto do sistema reconhece: se
    // divergir, a migracao mexeria nele.
    await app.repos.regras.salvar({
      id: 'r-1',
      tipo: 'saida',
      nome: 'Aluguel',
      valorCentavos: 180000,
      valorEhEstimativa: false,
      diaDoMes: 10,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-09',
      vigenteAte: null,
    })

    const doc = await exportar(app, { hoje: '2026-09-15' })

    expect(migrarDocumento(doc)).toEqual(doc)
  })
})
