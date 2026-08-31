import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../dados/conexao.js'
import { aplicarMigracoes } from '../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../app-pg.js'
import { ErroDeUsuario } from './erro-do-usuario.js'
import { situacaoDoMes } from './situacao-do-mes.js'
import { declararSaldo } from './escrita/declarar-saldo.js'
import { declararSaldoEstrangeiro } from './escrita/declarar-saldo-estrangeiro.js'
import { cadastrarRecorrente } from './escrita/cadastrar-recorrente.js'
import { patrimonio } from './patrimonio.js'

const HOJE = '2026-08-30'

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
  for (const t of ['regras', 'ancoras', 'ocorrencias', 'parcelamentos', 'saldos_estrangeiros']) {
    await pool.query(`delete from ${t}`)
  }
})

describe('patrimonio', () => {
  it('sem moeda estrangeira, devolve o mesmo saldo que situacao_do_mes', async () => {
    await declararSaldo(app, { valor: '10000,00', data: HOJE, hoje: HOJE })

    const p = await patrimonio(app, { hoje: HOJE })
    const s = await situacaoDoMes(app, { hoje: HOJE })

    expect(p.emReais.valorCentavos).toBe(s.saldoNaReferencia.valorCentavos)
    expect(p.total.valorCentavos).toBe(s.saldoNaReferencia.valorCentavos)
    expect(p.emMoedaEstrangeira).toEqual([])
    expect(p.avisoConversao).toBeNull()
  })

  // O saldo vem da PROJECAO, nao da ancora crua: a ancora e o que foi
  // declarado numa data, e entre ela e hoje ha movimentos. `dataDaReferencia`
  // e o que prova de onde o numero saiu -- se viesse da ancora, seria a data
  // da ancora e nao a de hoje.
  it('parte do saldo projetado de hoje, nao do valor cru da ancora', async () => {
    await declararSaldo(app, { valor: '10000,00', data: '2026-08-01', hoje: HOJE })
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-08',
    })

    const p = await patrimonio(app, { hoje: HOJE })
    const s = await situacaoDoMes(app, { hoje: HOJE })

    expect(p.emReais.valorCentavos).toBe(s.saldoNaReferencia.valorCentavos)
    expect(p.dataDaReferencia).toBe(s.dataDaReferencia)
    expect(p.dataDaReferencia).not.toBe('2026-08-01')
  })

  it('soma o saldo em dolar pela cotacao informada e mostra qual usou', async () => {
    await declararSaldo(app, { valor: '10000,00', data: HOJE, hoje: HOJE })
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: HOJE })

    const p = await patrimonio(app, { cotacoes: { USD: '5,4321' }, hoje: HOJE })

    expect(p.emMoedaEstrangeira).toHaveLength(1)
    const [linha] = p.emMoedaEstrangeira
    expect(linha?.moeda).toBe('USD')
    expect(linha?.valor).toMatch(/US\$\s?5\.000,00/u)
    expect(linha?.cotacao).toBe('5,4321')
    // US$ 5.000,00 a 5,4321 = R$ 27.160,50
    expect(linha?.equivalenteEmReais.valorCentavos).toBe(2_716_050)

    expect(p.emReais.valorCentavos).toBe(1_000_000)
    expect(p.total.valorCentavos).toBe(1_000_000 + 2_716_050)
    expect(p.avisoConversao).not.toBeNull()
  })

  it('aceita a moeda da cotacao em minusculas', async () => {
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: HOJE })

    const p = await patrimonio(app, { cotacoes: { usd: '5,4321' }, hoje: HOJE })

    expect(p.emMoedaEstrangeira[0]?.equivalenteEmReais.valorCentavos).toBe(2_716_050)
  })

  it('ordena as linhas por codigo de moeda', async () => {
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: HOJE })
    await declararSaldoEstrangeiro(app, { moeda: 'EUR', valor: '1000', hoje: HOJE })

    const p = await patrimonio(app, { cotacoes: { USD: '5,40', EUR: '6,20' }, hoje: HOJE })

    expect(p.emMoedaEstrangeira.map((l) => l.moeda)).toEqual(['EUR', 'USD'])
  })

  // Um total que descarta uma moeda em silencio e um numero errado com cara
  // de certo.
  it('falha nomeando a moeda quando falta cotacao', async () => {
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: HOJE })

    await expect(patrimonio(app, { hoje: HOJE })).rejects.toThrow(ErroDeUsuario)
    await expect(patrimonio(app, { hoje: HOJE })).rejects.toThrow(/USD/u)
  })

  it('falha quando a cotacao informada e ilegivel', async () => {
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: HOJE })

    await expect(
      patrimonio(app, { cotacoes: { USD: 'cinco e pouco' }, hoje: HOJE }),
    ).rejects.toThrow(ErroDeUsuario)
  })

  it('ignora cotacao de moeda sem saldo', async () => {
    await declararSaldo(app, { valor: '10000,00', data: HOJE, hoje: HOJE })

    const p = await patrimonio(app, { cotacoes: { JPY: '0,0350' }, hoje: HOJE })

    expect(p.emMoedaEstrangeira).toEqual([])
    expect(p.total.valorCentavos).toBe(1_000_000)
  })

  it('sem ancora, marca o total como relativo e avisa', async () => {
    const p = await patrimonio(app, { hoje: HOJE })

    expect(p.saldoRelativo).toBe(true)
    expect(p.avisoSaldoRelativo).not.toBeNull()
  })

  // A garantia que sustenta a decisao central do desenho, verificada em vez
  // de assumida: o dolar nao pode aparecer na projecao do mes.
  it('nao altera situacao_do_mes', async () => {
    await declararSaldo(app, { valor: '10000,00', data: HOJE, hoje: HOJE })
    const antes = await situacaoDoMes(app, { hoje: HOJE })

    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: HOJE })
    const depois = await situacaoDoMes(app, { hoje: HOJE })

    expect(depois).toEqual(antes)
  })
})
