import 'fake-indexeddb/auto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import type { Repositorios } from '../../src/data/repositories.js'
import { criarRepositorios } from '../../src/data/repositories.js'
import { criarBanco } from '../../src/data/db.js'
import type { AncoraSaldo, Ocorrencia, Parcelamento, Regra } from '../../src/domain/types.js'
import { criarPool } from './conexao.js'
import { aplicarMigracoes } from './migracoes.js'
import { criarRepositoriosPg } from './repositorios-pg.js'

const REGRA: Regra = {
  id: 'r-1',
  tipo: 'saida',
  nome: 'Aluguel',
  valorCentavos: 180000,
  valorEhEstimativa: false,
  diaDoMes: 10,
  ajusteFimDeSemana: 'nenhum',
  vigenteDe: '2026-01',
  vigenteAte: null,
}

const PARCELAMENTO: Parcelamento = {
  id: 'p-1',
  nome: 'Geladeira',
  valorParcelaCentavos: 30000,
  quantidadeParcelas: 10,
  primeiroVencimento: '2026-04-20',
}

const OCORRENCIA: Ocorrencia = {
  id: 'o-1',
  geradorTipo: 'regra',
  geradorId: 'r-1',
  competencia: '2026-03',
  tipo: 'saida',
  nome: 'Aluguel',
  valorPrevistoCentavos: 180000,
  dataVencimento: '2026-03-10',
  dataPagamento: null,
  valorPagoCentavos: null,
  ignorado: false,
  observacao: null,
}

const ANCORA: AncoraSaldo = { id: 'a-1', data: '2026-03-01', saldoCentavos: 120000 }

let container: StartedPostgreSqlContainer
let pool: Pool

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  pool = criarPool(container.getConnectionUri())
  await aplicarMigracoes(pool)
}, 120_000)

afterAll(async () => {
  await pool.end()
  await container.stop()
})

/**
 * Os mesmos casos contra as duas implementacoes.
 *
 * Uma divergencia entre Dexie e Postgres em `vigenteEm` ou
 * `listarPorIntervalo` so apareceria numa projecao errada meses depois. Aqui
 * ela falha na hora.
 */
const IMPLEMENTACOES: readonly [string, () => Promise<Repositorios>][] = [
  [
    'dexie',
    async () => {
      const db = criarBanco(`contrato-${crypto.randomUUID()}`)
      await db.open()
      return criarRepositorios(db)
    },
  ],
  [
    'postgres',
    async () => {
      for (const t of ['regras', 'parcelamentos', 'ocorrencias', 'ancoras', 'configuracoes']) {
        await pool.query(`delete from ${t}`)
      }
      return criarRepositoriosPg(pool)
    },
  ],
]

describe.each(IMPLEMENTACOES)('contrato de Repositorios (%s)', (_nome, montar) => {
  let repos: Repositorios

  beforeEach(async () => {
    repos = await montar()
  })

  it('salva e le uma regra', async () => {
    await repos.regras.salvar(REGRA)

    expect(await repos.regras.obter('r-1')).toEqual(REGRA)
    expect(await repos.regras.listar()).toEqual([REGRA])
  })

  it('devolve null para regra inexistente', async () => {
    expect(await repos.regras.obter('nao-existe')).toBeNull()
  })

  it('rejeita regra invalida', async () => {
    await expect(repos.regras.salvar({ ...REGRA, diaDoMes: 40 })).rejects.toThrow()
  })

  it('salvar duas vezes atualiza em vez de duplicar', async () => {
    await repos.regras.salvar(REGRA)
    await repos.regras.salvar({ ...REGRA, nome: 'Aluguel novo' })

    const todas = await repos.regras.listar()
    expect(todas).toHaveLength(1)
    expect(todas[0]?.nome).toBe('Aluguel novo')
  })

  it('remove regra sem cascatear para ocorrencias (RN-46)', async () => {
    await repos.regras.salvar(REGRA)
    await repos.ocorrencias.salvar(OCORRENCIA)

    await repos.regras.remover('r-1')

    expect(await repos.regras.obter('r-1')).toBeNull()
    expect(await repos.ocorrencias.obter('o-1')).toEqual(OCORRENCIA)
  })

  it('salva e le um parcelamento', async () => {
    await repos.parcelamentos.salvar(PARCELAMENTO)

    expect(await repos.parcelamentos.obter('p-1')).toEqual(PARCELAMENTO)
    expect(await repos.parcelamentos.listar()).toEqual([PARCELAMENTO])
  })

  it('devolve null para parcelamento inexistente', async () => {
    expect(await repos.parcelamentos.obter('nao-existe')).toBeNull()
  })

  it('rejeita parcelamento invalido', async () => {
    await expect(
      repos.parcelamentos.salvar({ ...PARCELAMENTO, quantidadeParcelas: 0 }),
    ).rejects.toThrow()
  })

  it('salvar parcelamento duas vezes atualiza em vez de duplicar', async () => {
    await repos.parcelamentos.salvar(PARCELAMENTO)
    await repos.parcelamentos.salvar({ ...PARCELAMENTO, nome: 'Geladeira nova' })

    const todos = await repos.parcelamentos.listar()
    expect(todos).toHaveLength(1)
    expect(todos[0]?.nome).toBe('Geladeira nova')
  })

  it('remove parcelamento', async () => {
    await repos.parcelamentos.salvar(PARCELAMENTO)

    await repos.parcelamentos.remover('p-1')

    expect(await repos.parcelamentos.obter('p-1')).toBeNull()
    expect(await repos.parcelamentos.listar()).toEqual([])
  })

  it('lista ocorrencias por intervalo, inclusive nas pontas', async () => {
    await repos.ocorrencias.salvar(OCORRENCIA)
    await repos.ocorrencias.salvar({ ...OCORRENCIA, id: 'o-2', competencia: '2026-05', geradorId: 'r-2' })
    await repos.ocorrencias.salvar({ ...OCORRENCIA, id: 'o-3', competencia: '2026-07', geradorId: 'r-3' })

    const achadas = await repos.ocorrencias.listarPorIntervalo('2026-03', '2026-05')

    expect(achadas.map((o) => o.id).sort()).toEqual(['o-1', 'o-2'])
  })

  it('acha por chave de sobreposicao', async () => {
    await repos.ocorrencias.salvar(OCORRENCIA)

    const achada = await repos.ocorrencias.obterPorChave('regra', 'r-1', '2026-03')

    expect(achada?.id).toBe('o-1')
  })

  it('devolve null quando a chave nao existe', async () => {
    expect(await repos.ocorrencias.obterPorChave('regra', 'nada', '2026-03')).toBeNull()
  })

  it('lista o historico de um gerador', async () => {
    await repos.ocorrencias.salvar(OCORRENCIA)
    await repos.ocorrencias.salvar({ ...OCORRENCIA, id: 'o-2', competencia: '2026-04' })

    const historico = await repos.ocorrencias.porGerador('regra', 'r-1')

    expect(historico).toHaveLength(2)
  })

  it('preserva nulos da ocorrencia', async () => {
    await repos.ocorrencias.salvar(OCORRENCIA)

    const lida = await repos.ocorrencias.obter('o-1')

    expect(lida?.dataPagamento).toBeNull()
    expect(lida?.valorPagoCentavos).toBeNull()
    expect(lida?.observacao).toBeNull()
  })

  it('preserva valores de pagamento quando presentes', async () => {
    await repos.ocorrencias.salvar({
      ...OCORRENCIA,
      dataPagamento: '2026-03-09',
      valorPagoCentavos: 179550,
      observacao: 'desconto',
    })

    const lida = await repos.ocorrencias.obter('o-1')

    expect(lida?.dataPagamento).toBe('2026-03-09')
    expect(lida?.valorPagoCentavos).toBe(179550)
    expect(typeof lida?.valorPagoCentavos).toBe('number')
    expect(lida?.observacao).toBe('desconto')
  })

  it('salva ancora e devolve a vigente na data', async () => {
    await repos.ancoras.salvar(ANCORA, '2026-03-20')

    expect(await repos.ancoras.vigenteEm('2026-03-20')).toEqual(ANCORA)
  })

  it('vigenteEm devolve a de maior data que nao ultrapassa (RN-49)', async () => {
    await repos.ancoras.salvar(ANCORA, '2026-05-20')
    await repos.ancoras.salvar({ id: 'a-2', data: '2026-04-01', saldoCentavos: 90000 }, '2026-05-20')

    const vigente = await repos.ancoras.vigenteEm('2026-04-15')

    expect(vigente?.id).toBe('a-2')
  })

  it('vigenteEm devolve null quando nao ha ancora anterior', async () => {
    await repos.ancoras.salvar(ANCORA, '2026-03-20')

    expect(await repos.ancoras.vigenteEm('2026-02-01')).toBeNull()
  })

  it('salvar um id existente numa data nova MOVE a ancora, como o Dexie (achado 7)', async () => {
    // A versao Postgres anterior fazia `on conflict (data)`, que so cobre o
    // conflito no indice de `data`. Quando o MESMO id ja existia numa data
    // DIFERENTE, quem batia primeiro era a chave primaria `id` -- nao nomeada
    // na clausula -- e o Postgres levantava 23505 em vez de mover a linha. O
    // Dexie (`put`) move sem erro. Este caso roda contra as duas
    // implementacoes: precisa passar nas duas.
    await repos.ancoras.salvar(ANCORA, '2026-05-20') // a-1 em 2026-03-01

    await repos.ancoras.salvar({ id: 'a-1', data: '2026-05-01', saldoCentavos: 999 }, '2026-05-20')

    const todas = await repos.ancoras.listar()
    expect(todas).toHaveLength(1)
    expect(todas[0]?.id).toBe('a-1')
    expect(todas[0]?.data).toBe('2026-05-01')
    expect(todas[0]?.saldoCentavos).toBe(999)
  })

  it('declarar saldo na mesma data substitui (RN-50)', async () => {
    await repos.ancoras.salvar(ANCORA, '2026-03-20')
    await repos.ancoras.salvar({ id: 'a-outra', data: '2026-03-01', saldoCentavos: 555 }, '2026-03-20')

    const todas = await repos.ancoras.listar()
    expect(todas).toHaveLength(1)
    expect(todas[0]?.saldoCentavos).toBe(555)
  })

  it('rejeita ancora com data futura', async () => {
    await expect(
      repos.ancoras.salvar({ id: 'a-f', data: '2027-01-01', saldoCentavos: 1 }, '2026-03-20'),
    ).rejects.toThrow()
  })

  it('guarda e le configuracao', async () => {
    await repos.configuracoes.definir('cor', 'azul')

    expect(await repos.configuracoes.obter('cor')).toBe('azul')
    expect(await repos.configuracoes.obter('inexistente')).toBeNull()
  })
})
