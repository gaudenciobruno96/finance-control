import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../dados/conexao.js'
import { aplicarMigracoes } from '../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../app-pg.js'
import { VERSAO_SCHEMA } from '../../src/data/db.js'
import { migrarDocumento } from '../../src/data/backup-serializer.js'
import { declararSaldoEstrangeiro } from './escrita/declarar-saldo-estrangeiro.js'
import { simularCenario } from './simular-cenario.js'
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
  for (const t of [
    'regras',
    'parcelamentos',
    'ocorrencias',
    'ancoras',
    'configuracoes',
    'saldos_estrangeiros',
  ]) {
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
    expect(doc.saldosEstrangeiros).toEqual([])
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
      categoria: null,
    })
    await app.repos.ancoras.salvar(
      { id: 'a-1', data: '2026-09-01', saldoCentavos: 120000, declaradaEm: null },
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
      categoria: null,
    })

    const doc = await exportar(app, { hoje: '2026-09-15' })

    expect(migrarDocumento(doc)).toEqual(doc)
  })

  // Achado 2: `exportar` e a "unica copia sem depender da plataforma" -- se
  // uma escrita em `saldos_estrangeiros` nao aparecesse aqui, essa promessa
  // seria falsa para o saldo em dolar.
  it('inclui saldos em moeda estrangeira gravados', async () => {
    await declararSaldoEstrangeiro(app, {
      moeda: 'USD',
      valor: '5000',
      data: '2026-08-01',
      hoje: '2026-09-15',
    })

    const doc = await exportar(app, { hoje: '2026-09-15' })

    expect(doc.saldosEstrangeiros).toHaveLength(1)
    expect(doc.saldosEstrangeiros[0]).toEqual({
      moeda: 'USD',
      valorCentavos: 500000,
      data: '2026-08-01',
    })
  })

  // O documento que alimenta `simular_cenario` (ver o registro da ferramenta
  // em servidor-http.ts) precisa continuar sendo exatamente o que
  // `DocumentoBackup` espera -- `saldosEstrangeiros` e um campo IRMAO, extra,
  // que `simularCenario` nunca le. Esta prova, em vez de assumir: uma escrita
  // em moeda estrangeira nao muda o resultado da simulacao nem quebra a
  // chamada.
  it('simular_cenario funciona e nao e afetado por um saldo em moeda estrangeira', async () => {
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
      categoria: null,
    })
    await app.repos.ancoras.salvar(
      { id: 'a-1', data: '2026-09-01', saldoCentavos: 120000, declaradaEm: null },
      '2026-09-15',
    )

    const semMoedaEstrangeira = await exportar(app, { hoje: '2026-09-15' })
    const resultadoSemMoedaEstrangeira = await simularCenario(semMoedaEstrangeira, {
      lancamentos: [],
      ate: '2026-10',
      hoje: '2026-09-15',
    })

    await declararSaldoEstrangeiro(app, {
      moeda: 'USD',
      valor: '5000',
      data: '2026-08-01',
      hoje: '2026-09-15',
    })

    const comMoedaEstrangeira = await exportar(app, { hoje: '2026-09-15' })
    const resultadoComMoedaEstrangeira = await simularCenario(comMoedaEstrangeira, {
      lancamentos: [],
      ate: '2026-10',
      hoje: '2026-09-15',
    })

    expect(comMoedaEstrangeira.saldosEstrangeiros).toHaveLength(1)
    expect(resultadoComMoedaEstrangeira).toEqual(resultadoSemMoedaEstrangeira)
  })
})
