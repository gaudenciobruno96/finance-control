import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { cadastrarRecorrente } from './cadastrar-recorrente.js'
import { declararSaldo } from './declarar-saldo.js'

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
  for (const t of ['regras', 'ancoras', 'ocorrencias']) {
    await pool.query(`delete from ${t}`)
  }
})

describe('cadastrarRecorrente', () => {
  it('grava a regra e devolve recibo com o valor formatado', async () => {
    const r = await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    expect(r.tipo).toBe('recorrente')
    expect(r.resumo).toContain('Aluguel')
    expect(r.resumo).toMatch(/R\$\s?1\.800,00/u)
    expect(r.resumo).toContain('10')

    const gravada = await app.repos.regras.obter(r.id)
    expect(gravada?.valorCentavos).toBe(180000)
  })

  it('aceita as formas que a pessoa fala', async () => {
    for (const [texto, esperado] of [
      ['80', 8000],
      ['80,00', 8000],
      ['1.234,56', 123456],
      ['1234.56', 123456],
    ] as const) {
      const r = await cadastrarRecorrente(app, {
        tipo: 'saida',
        nome: `Teste ${texto}`,
        valor: texto,
        diaDoMes: 5,
        vigenteDe: '2026-09',
      })
      const gravada = await app.repos.regras.obter(r.id)
      expect(gravada?.valorCentavos).toBe(esperado)
    }
  })

  it('recusa valor que nao representa dinheiro, sem gravar', async () => {
    await expect(
      cadastrarRecorrente(app, {
        tipo: 'saida',
        nome: 'Bobagem',
        valor: 'oitenta reais',
        diaDoMes: 5,
        vigenteDe: '2026-09',
      }),
    ).rejects.toThrow(/valor/i)

    expect(await app.repos.regras.listar()).toHaveLength(0)
  })

  it('recusa dia do mes invalido, sem gravar', async () => {
    await expect(
      cadastrarRecorrente(app, {
        tipo: 'saida',
        nome: 'Dia 40',
        valor: '10,00',
        diaDoMes: 40,
        vigenteDe: '2026-09',
      }),
    ).rejects.toThrow()

    expect(await app.repos.regras.listar()).toHaveLength(0)
  })

  it('usa ajuste padrao por tipo quando nao informado', async () => {
    const entrada = await cadastrarRecorrente(app, {
      tipo: 'entrada',
      nome: 'Salario',
      valor: '5000,00',
      diaDoMes: 5,
      vigenteDe: '2026-09',
    })

    const gravada = await app.repos.regras.obter(entrada.id)
    // Entrada antecipa quando cai em fim de semana; saida nao ajusta.
    expect(gravada?.ajusteFimDeSemana).toBe('antecipa')
  })
})

describe('declararSaldo', () => {
  it('grava a ancora e devolve recibo explicito', async () => {
    const r = await declararSaldo(app, { valor: '1200,00', hoje: '2026-09-05' })

    expect(r.tipo).toBe('saldo')
    expect(r.resumo).toMatch(/R\$\s?1\.200,00/u)
    expect(r.resumo).toContain('2026-09-05')

    const vigente = await app.repos.ancoras.vigenteEm('2026-09-05')
    expect(vigente?.saldoCentavos).toBe(120000)
  })

  it('usa hoje quando a data nao vem', async () => {
    await declararSaldo(app, { valor: '100,00', hoje: '2026-09-05' })

    const todas = await app.repos.ancoras.listar()
    expect(todas).toHaveLength(1)
    expect(todas[0]?.data).toBe('2026-09-05')
  })

  it('declarar de novo na mesma data substitui (RN-50)', async () => {
    await declararSaldo(app, { valor: '100,00', hoje: '2026-09-05' })
    await declararSaldo(app, { valor: '250,00', hoje: '2026-09-05' })

    const todas = await app.repos.ancoras.listar()
    expect(todas).toHaveLength(1)
    expect(todas[0]?.saldoCentavos).toBe(25000)
  })

  it('recusa data futura, sem gravar', async () => {
    await expect(
      declararSaldo(app, { valor: '100,00', data: '2027-01-01', hoje: '2026-09-05' }),
    ).rejects.toThrow()

    expect(await app.repos.ancoras.listar()).toHaveLength(0)
  })

  it('aceita saldo negativo', async () => {
    // Estar no vermelho e um estado valido, e declarar isso precisa funcionar.
    const r = await declararSaldo(app, { valor: '-300,00', hoje: '2026-09-05' })

    const todas = await app.repos.ancoras.listar()
    expect(todas[0]?.saldoCentavos).toBe(-30000)
    expect(r.resumo).toContain('300,00')
  })
})
