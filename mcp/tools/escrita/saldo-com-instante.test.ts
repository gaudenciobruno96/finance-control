import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { situacaoDoMes } from '../situacao-do-mes.js'
import { declararSaldo } from './declarar-saldo.js'
import { lancarAvulso } from './lancar-avulso.js'
import { marcarPago } from './marcar-pago.js'

const HOJE = '2026-09-01'

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
  for (const t of ['regras', 'ancoras', 'ocorrencias', 'parcelamentos']) {
    await pool.query(`delete from ${t}`)
  }
})

async function saldo(): Promise<number> {
  const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
  return m.saldoNaReferencia.valorCentavos
}

async function contaDe(nome: string) {
  const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
  // `jaResolvido` e um total (Dinheiro), nao uma lista -- SituacaoDoMes nao
  // expoe itens ja resolvidos. Toda chamada aqui busca a conta ANTES de
  // marca-la paga, entao ela ainda esta pendente em faltaPagar/aindaEntra.
  const o = [...m.faltaPagar, ...m.aindaEntra].find((x) => x.nome === nome)
  if (o === undefined) throw new Error(`${nome} nao encontrada`)
  return o
}

describe('as ferramentas gravam o instante', () => {
  it('declarar_saldo grava declaradaEm', async () => {
    await declararSaldo(app, { valor: '1000,00', hoje: HOJE })

    const [a] = await app.repos.ancoras.listar()
    expect(a?.declaradaEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  })

  it('marcar_pago grava pagamentoRegistradoEm', async () => {
    await lancarAvulso(app, { tipo: 'saida', nome: 'Sushi', valor: '111,00', hoje: HOJE })
    await marcarPago(app, { chave: (await contaDe('Sushi')).chave, hoje: HOJE })

    const [o] = await app.repos.ocorrencias.listar()
    expect(o?.pagamentoRegistradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  })

  // O cenario do usuario, ponta a ponta.
  it('declarar saldo e DEPOIS pagar deixa o saldo menor', async () => {
    await declararSaldo(app, { valor: '1000,00', hoje: HOJE })
    await lancarAvulso(app, { tipo: 'saida', nome: 'Sushi', valor: '111,00', hoje: HOJE })

    const antes = await saldo()
    await marcarPago(app, { chave: (await contaDe('Sushi')).chave, hoje: HOJE })

    expect(antes).toBe(100_000)
    expect(await saldo()).toBe(100_000 - 11_100)
  })

  // O caso oposto, que a RN-32 sempre protegeu. E a regressao que esta
  // mudanca arrisca: se o pagamento anterior a ancora passasse a descontar, o
  // app mostraria um saldo MENOR que o do extrato -- e o valor digitado pelo
  // usuario deixaria de ser o que ele ve.
  it('pagar e DEPOIS declarar saldo nao desconta de novo', async () => {
    await lancarAvulso(app, { tipo: 'saida', nome: 'Sushi', valor: '111,00', hoje: HOJE })
    await marcarPago(app, { chave: (await contaDe('Sushi')).chave, hoje: HOJE })
    await declararSaldo(app, { valor: '1000,00', hoje: HOJE })

    expect(await saldo()).toBe(100_000)
  })
})
