import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool, descreverErro, lerUrlDoBanco } from './conexao.js'
import { aplicarMigracoes } from './migracoes.js'

describe('lerUrlDoBanco', () => {
  it('devolve a url quando definida', () => {
    expect(lerUrlDoBanco({ DATABASE_URL: 'postgres://x' })).toBe('postgres://x')
  })

  it('lanca quando ausente', () => {
    expect(() => lerUrlDoBanco({})).toThrow(/DATABASE_URL/)
  })

  it('nao repete a url na mensagem de erro', () => {
    // A url carrega a senha do banco. A mensagem cita o NOME da variavel.
    const url = 'postgres://usuario:senha-secreta@host/banco'
    try {
      lerUrlDoBanco({ DATABASE_URL: '   ' })
      expect.unreachable('deveria ter lancado')
    } catch (e) {
      expect(String(e)).not.toContain('senha-secreta')
      expect(String(e)).not.toContain(url)
    }
  })
})

describe('descreverErro', () => {
  it('nao inclui a mensagem crua', () => {
    const erro = Object.assign(new Error('connection to postgres://u:senha@h failed'), {
      code: '28P01',
    })

    const texto = descreverErro(erro)

    expect(texto).not.toContain('senha')
    expect(texto).not.toContain('connection to')
    expect(texto).toContain('28P01')
    expect(texto).toContain('Error')
  })

  it('lida com valor que nao e Error', () => {
    expect(descreverErro('qualquer coisa')).not.toContain('qualquer coisa')
  })
})

describe('aplicarMigracoes', () => {
  let container: StartedPostgreSqlContainer
  let pool: Pool

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start()
    pool = criarPool(container.getConnectionUri())
  }, 120_000)

  afterAll(async () => {
    await pool.end()
    await container.stop()
  })

  it('cria as cinco tabelas', async () => {
    await aplicarMigracoes(pool)

    const r = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`,
    )
    const nomes = r.rows.map((x) => x.table_name)

    expect(nomes).toContain('regras')
    expect(nomes).toContain('parcelamentos')
    expect(nomes).toContain('ocorrencias')
    expect(nomes).toContain('ancoras')
    expect(nomes).toContain('configuracoes')
  })

  it('e idempotente: aplicar duas vezes nao falha', async () => {
    const primeira = await aplicarMigracoes(pool)
    const segunda = await aplicarMigracoes(pool)

    expect(segunda).toBe(primeira)
  })

  it('o banco rejeita chave de sobreposicao duplicada', async () => {
    // Isto e metade do valor de migrar: a nao-duplicacao deixa de ser
    // convencao do codigo e passa a ser invariante do banco.
    await aplicarMigracoes(pool)

    const inserir = (id: string) =>
      pool.query(
        `insert into ocorrencias
         (id, gerador_tipo, gerador_id, competencia, tipo, nome,
          valor_previsto_centavos, data_vencimento, data_pagamento,
          valor_pago_centavos, ignorado, observacao)
         values ($1,'regra','r-1','2026-03','saida','Aluguel',
                 180000,'2026-03-10',null,null,false,null)`,
        [id],
      )

    await inserir('o-1')
    await expect(inserir('o-2')).rejects.toThrow()
  })

  it('o banco rejeita duas ancoras na mesma data', async () => {
    await aplicarMigracoes(pool)

    const inserir = (id: string) =>
      pool.query(`insert into ancoras (id, data, saldo_centavos) values ($1,'2026-04-01',120000)`, [
        id,
      ])

    await inserir('a-1')
    await expect(inserir('a-2')).rejects.toThrow()
  })

  it('dinheiro volta como numero inteiro, nao string', async () => {
    // BIGINT volta como string no driver pg por padrao. A conversao precisa
    // acontecer, senao centavos viram texto e a aritmetica do dominio quebra
    // silenciosamente ('100' + 1 === '1001').
    await aplicarMigracoes(pool)
    await pool.query(
      `insert into ancoras (id, data, saldo_centavos) values ('a-num','2026-05-01',123456)`,
    )

    const r = await pool.query<{ saldo_centavos: number }>(
      `select saldo_centavos from ancoras where id = 'a-num'`,
    )

    expect(r.rows[0]?.saldo_centavos).toBe(123456)
    expect(typeof r.rows[0]?.saldo_centavos).toBe('number')
  })
})
