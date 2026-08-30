import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from './dados/conexao.js'
import { aplicarMigracoes } from './dados/migracoes.js'
import { criarAppPg, type AppPg } from './app-pg.js'
import { cadastrarRecorrente } from './tools/escrita/cadastrar-recorrente.js'
import { lancarAvulso } from './tools/escrita/lancar-avulso.js'
import { marcarPago } from './tools/escrita/marcar-pago.js'
import { situacaoDoMes } from './tools/situacao-do-mes.js'
import { oQueVence } from './tools/o-que-vence.js'
import { historicoDeGastos } from './tools/historico-de-gastos.js'

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

describe('oQueVence sobre Postgres', () => {
  it('enxerga uma conta cadastrada pela ferramenta de escrita', async () => {
    // O porte e de uma linha; o risco e ninguem verificar que a linha certa
    // foi trocada. Este teste passa pela escrita real, nao por fixture.
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    const r = await oQueVence(app, { dias: 15, hoje: '2026-09-05' })

    expect(r.aPagar.map((i) => i.nome)).toContain('Aluguel')
  })

  it('nao lista o que vence depois da janela', async () => {
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    const r = await oQueVence(app, { dias: 1, hoje: '2026-09-05' })

    expect(r.aPagar.map((i) => i.nome)).not.toContain('Aluguel')
  })

  it('separa entrada a confirmar de saida atrasada (RN-90)', async () => {
    await cadastrarRecorrente(app, {
      tipo: 'entrada',
      nome: 'Salario',
      valor: '5000,00',
      diaDoMes: 5,
      vigenteDe: '2026-09',
    })
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    const r = await oQueVence(app, { dias: 7, hoje: '2026-09-20' })

    // A checagem `every` sozinha passa vazia: sem provar que `atrasado`
    // efetivamente contem o Aluguel, uma implementacao que devolvesse tudo
    // vazio passaria igual.
    expect(r.atrasado.map((i) => i.nome)).toContain('Aluguel')
    expect(r.atrasado.every((i) => i.tipo === 'saida')).toBe(true)
    expect(r.aConfirmar.map((i) => i.nome)).toContain('Salario')
  })
})

describe('historicoDeGastos sobre Postgres', () => {
  it('conta o que foi pago pela ferramenta de escrita', async () => {
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Luz',
      valor: '220,00',
      diaDoMes: 15,
      vigenteDe: '2026-08',
      valorEhEstimativa: true,
    })

    const agosto = await situacaoDoMes(app, { competencia: '2026-08', hoje: '2026-09-20' })
    const luz = agosto.faltaPagar.find((i) => i.nome === 'Luz')
    expect(luz).toBeDefined()
    await marcarPago(app, { chave: luz!.chave, valor: '245,90', data: '2026-08-14', hoje: '2026-09-20' })

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-09-20' })
    const serie = r.itens.find((i) => i.nome === 'Luz')

    // O valor PAGO prevalece sobre o previsto.
    expect(serie?.total.valorCentavos).toBe(24590)
  })

  it('ignora o que ainda nao foi pago', async () => {
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-09-20' })

    expect(r.itens.map((i) => i.nome)).not.toContain('Aluguel')
  })

  it('ignora entradas: salario nao e gasto', async () => {
    await lancarAvulso(app, {
      tipo: 'entrada',
      nome: 'Freela',
      valor: '900,00',
      data: '2026-09-03',
      hoje: '2026-09-20',
    })
    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-20' })
    const freela = s.aindaEntra.find((i) => i.nome === 'Freela')
    expect(freela).toBeDefined()
    await marcarPago(app, { chave: freela!.chave, hoje: '2026-09-20' })

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-09-20' })

    expect(r.itens.map((i) => i.nome)).not.toContain('Freela')
  })

  it('filtra por nome sem diferenciar maiuscula', async () => {
    // Um segundo item pago, de nome diferente, e o que torna este teste uma
    // prova de FILTRAGEM: sem ele, uma implementacao que ignorasse `nome`
    // por completo tambem devolveria exatamente um item e passaria.
    await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Mercado',
      valor: '80,00',
      data: '2026-09-02',
      hoje: '2026-09-20',
    })
    await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Farmacia',
      valor: '45,00',
      data: '2026-09-03',
      hoje: '2026-09-20',
    })
    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-20' })
    await marcarPago(app, {
      chave: s.faltaPagar.find((i) => i.nome === 'Mercado')!.chave,
      hoje: '2026-09-20',
    })
    await marcarPago(app, {
      chave: s.faltaPagar.find((i) => i.nome === 'Farmacia')!.chave,
      hoje: '2026-09-20',
    })

    const r = await historicoDeGastos(app, { meses: 6, nome: 'mercado', hoje: '2026-09-20' })

    expect(r.itens).toHaveLength(1)
    expect(r.itens[0]?.nome).toBe('Mercado')
  })
})
