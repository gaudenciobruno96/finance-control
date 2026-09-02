import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'
import { situacaoDoMes } from '../situacao-do-mes.js'
import { cadastrarRecorrente } from './cadastrar-recorrente.js'
import { marcarPago } from './marcar-pago.js'
import { localizarConta } from './localizar-conta.js'

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

async function chaveDoAluguel(): Promise<string> {
  await cadastrarRecorrente(app, {
    tipo: 'saida',
    nome: 'Aluguel',
    valor: '1800,00',
    diaDoMes: 10,
    vigenteDe: '2026-09',
  })
  const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
  return m.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave
}

describe('localizarConta', () => {
  it('acha uma conta que ainda e virtual', async () => {
    const chave = await chaveDoAluguel()

    const o = await localizarConta(app, chave, HOJE)

    expect(o.nome).toBe('Aluguel')
    // Virtual: nao existe linha no banco ate alguem interagir.
    expect(o.idReal).toBeNull()
  })

  // A competencia vem da PROPRIA chave, nao de `hoje`. Sem isso, mexer numa
  // conta de outro mes projeta o mes errado e nunca encontra.
  it('acha uma conta de mes diferente do de hoje', async () => {
    const chave = await chaveDoAluguel()

    const o = await localizarConta(app, chave, '2026-10-20')

    expect(o.nome).toBe('Aluguel')
    expect(o.competencia).toBe('2026-09')
  })

  // Conta paga resolve no balde `jaResolvido` (situacao === 'pago'), nao em
  // `ignorados`. Este teste cobre que `jaResolvido` entra na busca.
  it('acha uma conta ja paga', async () => {
    const chave = await chaveDoAluguel()
    await marcarPago(app, { chave, hoje: HOJE })

    const o = await localizarConta(app, chave, HOJE)

    expect(o.dataPagamento).not.toBeNull()
  })

  // `ignorados` precisa entrar na busca: reativar uma conta ignorada exige
  // encontra-la primeiro, e ela nao esta em nenhuma das outras listas --
  // nem em `jaResolvido`, que e onde as contas PAGAS caem.
  it('acha uma conta ignorada', async () => {
    const chave = await chaveDoAluguel()
    const mes = await app.projecao.projetarMes('2026-09', HOJE)
    const aluguel = mes.faltaPagar.find((o) => o.nome === 'Aluguel')!

    await app.pagamento.ignorarNoMes(aluguel)

    const depoisDeIgnorar = await app.projecao.projetarMes('2026-09', HOJE)
    expect(depoisDeIgnorar.faltaPagar.map((o) => o.nome)).not.toContain('Aluguel')

    const o = await localizarConta(app, chave, HOJE)

    expect(o.nome).toBe('Aluguel')
  })

  it('recusa uma chave que nao existe, nomeando a competencia', async () => {
    await expect(
      localizarConta(app, 'regra:nao-existe:2026-09', HOJE),
    ).rejects.toThrow(ErroDeUsuario)
    await expect(
      localizarConta(app, 'regra:nao-existe:2026-09', HOJE),
    ).rejects.toThrow(/2026-09/u)
  })
})
