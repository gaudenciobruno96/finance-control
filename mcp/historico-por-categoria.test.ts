import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from './dados/conexao.js'
import { aplicarMigracoes } from './dados/migracoes.js'
import { criarAppPg, type AppPg } from './app-pg.js'
import { historicoDeGastos } from './tools/historico-de-gastos.js'
import { situacaoDoMes } from './tools/situacao-do-mes.js'
import { lancarAvulso } from './tools/escrita/lancar-avulso.js'
import { marcarPago } from './tools/escrita/marcar-pago.js'

const HOJE = '2026-09-15'

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

/** Lanca um avulso e ja o marca como pago -- o relatorio so conta pagos. */
async function gastoPago(
  nome: string,
  valor: string,
  categoria?: 'mercado' | 'alimentacao_fora',
): Promise<void> {
  await lancarAvulso(app, {
    tipo: 'saida',
    nome,
    valor,
    hoje: HOJE,
    ...(categoria === undefined ? {} : { categoria }),
  })
  const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
  const alvo = m.faltaPagar.find((i) => i.nome === nome)
  if (alvo === undefined) throw new Error(`${nome} nao encontrado`)
  await marcarPago(app, { chave: alvo.chave, hoje: HOJE })
}

describe('historicoDeGastos por categoria', () => {
  it('soma varios lancamentos do mesmo setor', async () => {
    await gastoPago('Supermercado A', '200,00', 'mercado')
    await gastoPago('Supermercado B', '150,00', 'mercado')
    await gastoPago('Jaguar Sushi', '111,00', 'alimentacao_fora')

    const h = await historicoDeGastos(app, { agruparPor: 'categoria', hoje: HOJE })

    const mercado = h.itens.find((i) => i.grupo === 'mercado')
    expect(mercado?.total.valorCentavos).toBe(35_000)
    const fora = h.itens.find((i) => i.grupo === 'alimentacao_fora')
    expect(fora?.total.valorCentavos).toBe(11_100)
  })

  // Um relatorio que soma parte do dinheiro e o apresenta como o todo e pior
  // que um que admite a lacuna.
  it('mostra os sem categoria numa linha propria, dentro do total geral', async () => {
    await gastoPago('Supermercado', '200,00', 'mercado')
    await gastoPago('Coisa nao classificada', '50,00')

    const h = await historicoDeGastos(app, { agruparPor: 'categoria', hoje: HOJE })

    const sem = h.itens.find((i) => i.grupo === 'sem_categoria')
    expect(sem?.total.valorCentavos).toBe(5_000)
    expect(h.totalGeral.valorCentavos).toBe(25_000)
  })

  it('agrupa por nome quando nao se pede categoria', async () => {
    await gastoPago('Supermercado A', '200,00', 'mercado')
    await gastoPago('Supermercado B', '150,00', 'mercado')

    const h = await historicoDeGastos(app, { hoje: HOJE })

    expect(h.itens.map((i) => i.grupo).sort()).toEqual(['Supermercado A', 'Supermercado B'])
  })
})
