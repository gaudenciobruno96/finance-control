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
import { ignorarConta } from './ignorar-conta.js'
import { registrarParte } from './registrar-parte.js'

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

async function mercado(competencia = '2026-09') {
  await cadastrarRecorrente(app, {
    tipo: 'saida',
    nome: 'Mercado',
    valor: '1500,00',
    diaDoMes: 1,
    vigenteDe: '2026-09',
  })
  const m = await situacaoDoMes(app, { competencia, hoje: HOJE })
  return m.faltaPagar.find((i) => i.nome === 'Mercado')!
}

async function salario() {
  await cadastrarRecorrente(app, {
    tipo: 'entrada',
    nome: 'Salário',
    valor: '18000,00',
    diaDoMes: 30,
    vigenteDe: '2026-09',
  })
  const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
  return m.aindaEntra.find((i) => i.nome === 'Salário')!
}

async function faltaPagar(competencia = '2026-09') {
  const m = await situacaoDoMes(app, { competencia, hoje: HOJE })
  return m.faltaPagar.map((i) => i.nome)
}

describe('ignorarConta', () => {
  it('tira o item da projecao', async () => {
    const c = await mercado()

    const r = await ignorarConta(app, { chave: c.chave, ignorar: true, hoje: HOJE })

    expect(r.antes).toBe('ativa')
    expect(r.depois).toBe('ignorada')
    expect(await faltaPagar()).not.toContain('Mercado')
  })

  it('devolve o item quando reativa', async () => {
    const c = await mercado()
    await ignorarConta(app, { chave: c.chave, ignorar: true, hoje: HOJE })
    await ignorarConta(app, { chave: c.chave, ignorar: false, hoje: HOJE })

    expect(await faltaPagar()).toContain('Mercado')
  })

  // O mes seguinte segue prevendo a conta: ignorar vale so para o mes, e a
  // recorrencia nao e tocada. E o caso que motivou a ferramenta.
  it('nao afeta o mes seguinte', async () => {
    const c = await mercado()
    await ignorarConta(app, { chave: c.chave, ignorar: true, hoje: HOJE })

    expect(await faltaPagar('2026-10')).toContain('Mercado')
  })

  // `ignorarNoMes` limpa dataPagamento e valorPagoCentavos junto com o flag.
  // A operacao continua permitida -- as vezes e o que se quer --, mas o
  // recibo precisa dizer o que foi destruido.
  it('avisa, com o valor, quando apaga um pagamento registrado', async () => {
    const c = await mercado()
    await marcarPago(app, { chave: c.chave, valor: '1500,00', hoje: HOJE })

    const r = await ignorarConta(app, { chave: c.chave, ignorar: true, hoje: HOJE })

    expect(r.avisos.join(' ')).toMatch(/R\$\s?1\.500,00/u)
    expect(r.avisos.join(' ')).toMatch(/pagamento/iu)

    const [o] = await app.repos.ocorrencias.listar()
    expect(o?.dataPagamento).toBeNull()
  })

  it('nao avisa de pagamento quando nao havia nenhum', async () => {
    const c = await mercado()

    const r = await ignorarConta(app, { chave: c.chave, ignorar: true, hoje: HOJE })

    expect(r.avisos.join(' ')).not.toMatch(/pagamento registrado/iu)
  })
})

describe('registrarParte', () => {
  it('reduz o que ainda falta entrar', async () => {
    const s = await salario()

    const r = await registrarParte(app, { chave: s.chave, valor: '8000,00', hoje: HOJE })

    expect(r.antes).toMatch(/R\$\s?18\.000,00/u)
    expect(r.depois).toMatch(/R\$\s?10\.000,00/u)

    const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
    expect(m.aindaEntra.find((i) => i.nome === 'Salário')?.valorCentavos).toBe(1_000_000)
  })

  // Vale so para este mes: escreve uma ocorrencia que sobrepoe a virtual e
  // nao toca na regra.
  it('nao afeta o mes seguinte', async () => {
    const s = await salario()
    await registrarParte(app, { chave: s.chave, valor: '8000,00', hoje: HOJE })

    const out = await situacaoDoMes(app, { competencia: '2026-10', hoje: HOJE })
    expect(out.aindaEntra.find((i) => i.nome === 'Salário')?.valorCentavos).toBe(1_800_000)
  })

  it('recusa parte maior ou igual ao previsto, sem gravar', async () => {
    const s = await salario()

    await expect(
      registrarParte(app, { chave: s.chave, valor: '18000,00', hoje: HOJE }),
    ).rejects.toThrow()
    expect(await app.repos.ocorrencias.listar()).toEqual([])
  })

  it('recusa valor ilegivel, sem gravar', async () => {
    const s = await salario()

    await expect(
      registrarParte(app, { chave: s.chave, valor: 'oito mil', hoje: HOJE }),
    ).rejects.toThrow(ErroDeUsuario)
    expect(await app.repos.ocorrencias.listar()).toEqual([])
  })

  it('recusa conta ja paga', async () => {
    const c = await mercado()
    await marcarPago(app, { chave: c.chave, hoje: HOJE })

    await expect(
      registrarParte(app, { chave: c.chave, valor: '500,00', hoje: HOJE }),
    ).rejects.toThrow(ErroDeUsuario)
  })
})
