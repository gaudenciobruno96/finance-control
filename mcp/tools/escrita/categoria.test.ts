import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'
import { situacaoDoMes } from '../situacao-do-mes.js'
import { cadastrarRecorrente } from './cadastrar-recorrente.js'
import { cadastrarParcelamento } from './cadastrar-parcelamento.js'
import { lancarAvulso } from './lancar-avulso.js'
import { marcarPago } from './marcar-pago.js'
import { definirCategoria } from './definir-categoria.js'

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

describe('categoria nas escritas', () => {
  it('cadastrar_recorrente grava a categoria', async () => {
    const r = await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
      categoria: 'moradia',
    })

    expect((await app.repos.regras.obter(r.id))?.categoria).toBe('moradia')
  })

  it('cadastrar_recorrente sem categoria grava nulo', async () => {
    const r = await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Sem categoria',
      valor: '100,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    expect((await app.repos.regras.obter(r.id))?.categoria).toBeNull()
  })

  it('lancar_avulso grava a categoria', async () => {
    const r = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Jaguar Sushi',
      valor: '111,00',
      hoje: HOJE,
      categoria: 'alimentacao_fora',
    })

    expect((await app.repos.ocorrencias.obter(r.id))?.categoria).toBe('alimentacao_fora')
  })

  it('cadastrar_parcelamento grava a categoria', async () => {
    const r = await cadastrarParcelamento(app, {
      nome: 'Geladeira',
      valorParcela: '300,00',
      quantidadeParcelas: 3,
      primeiroVencimento: '2026-10-20',
      categoria: 'compras',
    })

    expect((await app.repos.parcelamentos.obter(r.id))?.categoria).toBe('compras')
  })

  // A heranca e o que torna a feature barata: categorizar o aluguel e UMA
  // operacao, nao doze por ano.
  //
  // Le do projetor cru (app.projecao.projetarMes), nao de situacaoDoMes: o
  // ItemFormatado de situacaoDoMes ainda nao carrega `categoria` (isso e
  // Task 4) -- so a OcorrenciaResolvida do projetor traz o campo.
  it('a conta gerada pela regra ja vem com a categoria da regra', async () => {
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
      categoria: 'moradia',
    })

    const m = await app.projecao.projetarMes('2026-09', HOJE)
    expect(m.faltaPagar.find((i) => i.nome === 'Aluguel')?.categoria).toBe('moradia')
  })
})

describe('definirCategoria', () => {
  async function regraSemCategoria() {
    return cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })
  }

  it('categoriza uma recorrencia que ja existia', async () => {
    const r = await regraSemCategoria()

    const recibo = await definirCategoria(app, {
      tipo: 'recorrente',
      id: r.id,
      categoria: 'moradia',
      hoje: HOJE,
    })

    expect(recibo.antes).toBe('sem categoria')
    expect(recibo.depois).toBe('moradia')
    expect((await app.repos.regras.obter(r.id))?.categoria).toBe('moradia')
  })

  it('categoriza um parcelamento que ja existia', async () => {
    const p = await cadastrarParcelamento(app, {
      nome: 'Geladeira',
      valorParcela: '300,00',
      quantidadeParcelas: 3,
      primeiroVencimento: '2026-10-20',
    })

    await definirCategoria(app, {
      tipo: 'parcelamento',
      id: p.id,
      categoria: 'compras',
      hoje: HOJE,
    })

    expect((await app.repos.parcelamentos.obter(p.id))?.categoria).toBe('compras')
  })

  it('categoriza um avulso que ja existia', async () => {
    const a = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Jaguar Sushi',
      valor: '111,00',
      hoje: HOJE,
    })

    await definirCategoria(app, {
      tipo: 'avulso',
      id: a.id,
      categoria: 'alimentacao_fora',
      hoje: HOJE,
    })

    expect((await app.repos.ocorrencias.obter(a.id))?.categoria).toBe('alimentacao_fora')
  })

  it('uma segunda chamada sobrescreve, e o recibo mostra a anterior', async () => {
    const r = await regraSemCategoria()
    await definirCategoria(app, { tipo: 'recorrente', id: r.id, categoria: 'outros', hoje: HOJE })

    const recibo = await definirCategoria(app, {
      tipo: 'recorrente',
      id: r.id,
      categoria: 'moradia',
      hoje: HOJE,
    })

    expect(recibo.antes).toBe('outros')
    expect(recibo.depois).toBe('moradia')
    expect((await app.repos.regras.obter(r.id))?.categoria).toBe('moradia')
  })

  it('recusa um id inexistente, sem gravar', async () => {
    await expect(
      definirCategoria(app, {
        tipo: 'recorrente',
        id: 'nao-existe',
        categoria: 'moradia',
        hoje: HOJE,
      }),
    ).rejects.toThrow(ErroDeUsuario)

    expect(await app.repos.regras.listar()).toEqual([])
  })

  // RN-52: recategorizar a regra nao reescreve o historico. A conta de
  // setembro, ja materializada, guarda a categoria que tinha.
  it('recategorizar a regra nao muda a ocorrencia ja materializada', async () => {
    const r = await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
      categoria: 'moradia',
    })

    const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
    const chave = m.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave
    await marcarPago(app, { chave, hoje: HOJE })

    await definirCategoria(app, { tipo: 'recorrente', id: r.id, categoria: 'outros', hoje: HOJE })

    const [materializada] = await app.repos.ocorrencias.listar()
    expect(materializada?.categoria).toBe('moradia')
  })
})
