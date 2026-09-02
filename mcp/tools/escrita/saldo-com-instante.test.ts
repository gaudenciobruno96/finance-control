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

/**
 * Revisao final: o instante so pode contar a ordem do que de fato aconteceu.
 *
 * Carimbar `new Date()` em toda escrita move o instante para depois da ancora
 * em duas situacoes rotineiras -- e nas duas o app passa a mostrar MENOS que o
 * banco, que e exatamente o erro que a RN-32 existe para nao cometer.
 */
describe('o instante nao se move sozinho', () => {
  /**
   * Instantes tem resolucao de milissegundo. Sem esta pausa, as tres escritas
   * podem cair no mesmo milissegundo e o teste passaria mesmo com o defeito.
   */
  const umInstanteDepois = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, 5))

  /**
   * I1: `marcar_pago` e idempotente de proposito (RN-51), entao corrigir o
   * valor e uma segunda chamada. Pagou as 08h, declarou o saldo as 09h (o
   * extrato ja mostrava o pagamento), e as 10h corrigiu o valor. O instante
   * pulava para 10h e o pagamento passava a ser descontado de um saldo que ja
   * o continha.
   */
  it('corrigir o valor depois de declarar o saldo nao desconta de novo', async () => {
    await lancarAvulso(app, { tipo: 'saida', nome: 'Sushi', valor: '111,00', hoje: HOJE })
    const chave = (await contaDe('Sushi')).chave

    await marcarPago(app, { chave, hoje: HOJE })
    const registradoNaPrimeiraVez = (await app.repos.ocorrencias.listar())[0]
      ?.pagamentoRegistradoEm

    await declararSaldo(app, { valor: '1000,00', hoje: HOJE })
    await umInstanteDepois()
    await marcarPago(app, { chave, valor: '115,00', hoje: HOJE })

    expect(await saldo()).toBe(100_000)

    // O valor novo vale; o instante continua sendo o do registro original,
    // anterior a ancora.
    const [o] = await app.repos.ocorrencias.listar()
    expect(o?.valorPagoCentavos).toBe(11_500)
    expect(o?.pagamentoRegistradoEm).toBe(registradoNaPrimeiraVez)
  })

  /**
   * I2: `data` existe para lancar retroativo. Registrar no dia 3 um pagamento
   * datado no dia 1 -- a data da ancora vigente -- dava a ele instante maior
   * que `declaradaEm`, e ele passava a descontar. Antes desta mudanca, nunca
   * descontava.
   */
  it('pagamento lancado com data passada nao carimba instante nem desconta', async () => {
    await declararSaldo(app, { valor: '1000,00', hoje: HOJE })
    await lancarAvulso(app, { tipo: 'saida', nome: 'Sushi', valor: '111,00', hoje: HOJE })
    await umInstanteDepois()

    await marcarPago(app, {
      chave: (await contaDe('Sushi')).chave,
      data: HOJE,
      hoje: '2026-09-03',
    })

    const [o] = await app.repos.ocorrencias.listar()
    expect(o?.dataPagamento).toBe(HOJE)
    expect(o?.pagamentoRegistradoEm).toBeNull()
    expect(await saldo()).toBe(100_000)
  })

  /**
   * A mesma razao do outro lado: o instante de uma ancora declarada
   * retroativamente diz quando a pessoa digitou, nao o que o extrato daquele
   * dia mostrava. Ordenar um pagamento contra ele produziria uma ordem que
   * nunca aconteceu.
   */
  it('saldo declarado com data passada nao carimba instante', async () => {
    await declararSaldo(app, { valor: '1000,00', data: HOJE, hoje: '2026-09-03' })

    const [a] = await app.repos.ancoras.listar()
    expect(a?.data).toBe(HOJE)
    expect(a?.declaradaEm).toBeNull()
  })
})
