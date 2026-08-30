import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { situacaoDoMes } from '../situacao-do-mes.js'
import { desfazer } from '../desfazer.js'
import { marcarPago } from './marcar-pago.js'
import { cadastrarParcelamento } from './cadastrar-parcelamento.js'

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
  for (const t of ['regras', 'parcelamentos', 'ocorrencias', 'ancoras']) {
    await pool.query(`delete from ${t}`)
  }
})

/** Momento de referencia para a janela de desfazer, sempre logo apos a escrita. */
function logoDepois(): Date {
  return new Date(Date.now() + 60_000)
}

describe('cadastrarParcelamento', () => {
  it('grava e devolve recibo com parcela, quantidade e total', async () => {
    const r = await cadastrarParcelamento(app, {
      nome: 'Geladeira',
      valorParcela: '300,00',
      quantidadeParcelas: 10,
      primeiroVencimento: '2026-10-20',
    })

    expect(r.tipo).toBe('parcelamento')
    expect(r.resumo).toContain('Geladeira')
    expect(r.resumo).toMatch(/R\$\s?300,00/u)
    // 'toContain('10')' era vacuo: '2026-10-20' tambem contem '10'.
    expect(r.resumo).toContain('10x')
    // O total e derivado, para o usuario conferir contra a fatura.
    expect(r.resumo).toMatch(/R\$\s?3\.000,00/u)

    const gravado = await app.repos.parcelamentos.obter(r.id)
    expect(gravado?.valorParcelaCentavos).toBe(30000)
    expect(gravado?.quantidadeParcelas).toBe(10)
  })

  it('recusa valor invalido, sem gravar', async () => {
    await expect(
      cadastrarParcelamento(app, {
        nome: 'Bobagem',
        valorParcela: 'trezentos reais',
        quantidadeParcelas: 10,
        primeiroVencimento: '2026-10-20',
      }),
    ).rejects.toThrow(/valor/i)

    expect(await app.repos.parcelamentos.listar()).toHaveLength(0)
  })

  it('recusa quantidade de parcelas invalida, sem gravar', async () => {
    await expect(
      cadastrarParcelamento(app, {
        nome: 'Zero parcelas',
        valorParcela: '300,00',
        quantidadeParcelas: 0,
        primeiroVencimento: '2026-10-20',
      }),
    ).rejects.toThrow(/quantidade/i)

    expect(await app.repos.parcelamentos.listar()).toHaveLength(0)
  })

  it('aparece na projecao como parcela nos meses seguintes', async () => {
    await cadastrarParcelamento(app, {
      nome: 'Geladeira',
      valorParcela: '300,00',
      quantidadeParcelas: 3,
      primeiroVencimento: '2026-10-20',
    })

    const outubro = await situacaoDoMes(app, { competencia: '2026-10', hoje: '2026-10-01' })
    // Novembro e o unico mes cuja presenca depende de `somarMeses` --
    // outubro e o mes do primeiro vencimento, dezembro e o limite testado
    // abaixo, e so novembro so aparece se o avanco de competencia estiver
    // correto.
    const novembro = await situacaoDoMes(app, { competencia: '2026-11', hoje: '2026-10-01' })
    const dezembro = await situacaoDoMes(app, { competencia: '2026-12', hoje: '2026-10-01' })
    const janeiro = await situacaoDoMes(app, { competencia: '2027-01', hoje: '2026-10-01' })

    // `expandirParcelamentos` nomeia cada parcela virtual como
    // "Nome (n/total)" (ver src/domain/installment-expander.ts) -- por isso a
    // checagem e por substring, nao por igualdade exata.
    expect(outubro.faltaPagar.some((i) => i.nome.includes('Geladeira'))).toBe(true)
    expect(novembro.faltaPagar.some((i) => i.nome.includes('Geladeira'))).toBe(true)
    expect(dezembro.faltaPagar.some((i) => i.nome.includes('Geladeira'))).toBe(true)
    // Tres parcelas: outubro, novembro, dezembro. Janeiro ja nao tem.
    expect(janeiro.faltaPagar.some((i) => i.nome.includes('Geladeira'))).toBe(false)

    // Numeracao e valor por parcela, nao so a presenca do nome.
    const parcelaDeNovembro = novembro.faltaPagar.find((i) => i.nome.includes('Geladeira'))
    expect(parcelaDeNovembro?.nome).toBe('Geladeira (2/3)')
    expect(parcelaDeNovembro?.valorCentavos).toBe(30000)
  })
})

describe('desfazer de parcelamento', () => {
  it('remove o parcelamento', async () => {
    const r = await cadastrarParcelamento(app, {
      nome: 'Engano',
      valorParcela: '100,00',
      quantidadeParcelas: 5,
      primeiroVencimento: '2026-10-20',
    })

    await desfazer(app, {
      tipo: 'parcelamento',
      id: r.id,
      agora: logoDepois(),
      hoje: '2026-10-01',
    })

    expect(await app.repos.parcelamentos.obter(r.id)).toBeNull()
  })

  it('avisa que parcelas ja materializadas permanecem', async () => {
    const r = await cadastrarParcelamento(app, {
      nome: 'Geladeira',
      valorParcela: '300,00',
      quantidadeParcelas: 3,
      primeiroVencimento: '2026-10-20',
    })

    // Materializa a parcela de outubro pagando-a -- sem isto o teste nunca
    // exercita o comportamento que o requisito descreve, so a string do
    // aviso.
    const outubro = await situacaoDoMes(app, { competencia: '2026-10', hoje: '2026-10-01' })
    const parcelaDeOutubro = outubro.faltaPagar.find((i) => i.nome.includes('Geladeira'))
    expect(parcelaDeOutubro).toBeDefined()
    await marcarPago(app, { chave: parcelaDeOutubro!.chave, hoje: '2026-10-01' })

    const resultado = await desfazer(app, {
      tipo: 'parcelamento',
      id: r.id,
      agora: logoDepois(),
      hoje: '2026-10-01',
    })

    // Sem este aviso a pessoa conclui que apagou a compra inteira e continua
    // vendo parcelas na projecao, sem entender por que.
    expect(resultado.descricao).toMatch(/materializad/i)

    // A remocao do parcelamento NAO cascateia: a ocorrencia materializada
    // continua no historico.
    const materializadas = await app.repos.ocorrencias.porGerador('parcelamento', r.id)
    expect(materializadas).toHaveLength(1)
  })

  it('recusa fora da janela de 24 horas, sem apagar', async () => {
    const r = await cadastrarParcelamento(app, {
      nome: 'Antigo',
      valorParcela: '100,00',
      quantidadeParcelas: 2,
      primeiroVencimento: '2026-10-20',
    })

    const muitoDepois = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await expect(
      desfazer(app, { tipo: 'parcelamento', id: r.id, agora: muitoDepois, hoje: '2026-10-01' }),
    ).rejects.toThrow(/24 horas|janela/i)

    expect(await app.repos.parcelamentos.obter(r.id)).not.toBeNull()
  })
})
