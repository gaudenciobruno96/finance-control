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
import { ajustarConta } from './ajustar-conta.js'
import { ignorarConta } from './ignorar-conta.js'

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

async function aluguel() {
  await cadastrarRecorrente(app, {
    tipo: 'saida',
    nome: 'Aluguel',
    valor: '1800,00',
    diaDoMes: 10,
    vigenteDe: '2026-09',
  })
  const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
  return m.faltaPagar.find((i) => i.nome === 'Aluguel')!
}

// `situacaoDoMes` (a ferramenta MCP) enxuga `jaResolvido` para uma soma em
// dinheiro, sem a lista de itens -- por isso a verificacao usa o projetor
// bruto, que traz faltaPagar/aindaEntra/jaResolvido como listas de
// ocorrencias. O valor efetivo segue RN-31: pago prevalece sobre previsto.
async function itemNaProjecao(nome: string) {
  const m = await app.projecao.projetarMes('2026-09', HOJE)
  const o = [...m.faltaPagar, ...m.aindaEntra, ...m.jaResolvido].find(
    (i) => i.nome === nome,
  )
  if (o === undefined) return undefined
  return {
    dataVencimento: o.dataVencimento,
    valorCentavos: o.valorPagoCentavos ?? o.valorPrevistoCentavos,
  }
}

describe('ajustarConta', () => {
  it('muda o valor e a projecao reflete', async () => {
    const a = await aluguel()

    const r = await ajustarConta(app, { chave: a.chave, valor: '2000,00', hoje: HOJE })

    expect(r.antes).toMatch(/R\$\s?1\.800,00/u)
    expect(r.depois).toMatch(/R\$\s?2\.000,00/u)
    expect((await itemNaProjecao('Aluguel'))?.valorCentavos).toBe(200_000)
  })

  it('muda o vencimento e o item se move de dia', async () => {
    const a = await aluguel()

    const r = await ajustarConta(app, {
      chave: a.chave,
      vencimento: '2026-09-25',
      hoje: HOJE,
    })

    expect(r.antes).toContain('2026-09-10')
    expect(r.depois).toContain('2026-09-25')
    expect((await itemNaProjecao('Aluguel'))?.dataVencimento).toBe('2026-09-25')
  })

  it('muda os dois de uma vez', async () => {
    const a = await aluguel()

    await ajustarConta(app, {
      chave: a.chave,
      valor: '2000,00',
      vencimento: '2026-09-25',
      hoje: HOJE,
    })

    const item = await itemNaProjecao('Aluguel')
    expect(item?.valorCentavos).toBe(200_000)
    expect(item?.dataVencimento).toBe('2026-09-25')
  })

  // Chamar sem nenhum campo e erro, nao uma operacao vazia bem-sucedida: o
  // recibo diria "ajustado" sem nada ter mudado.
  it('recusa quando nenhum campo vem, sem gravar', async () => {
    const a = await aluguel()

    await expect(ajustarConta(app, { chave: a.chave, hoje: HOJE })).rejects.toThrow(
      ErroDeUsuario,
    )
    expect(await app.repos.ocorrencias.listar()).toEqual([])
  })

  // RN-31: numa conta paga o valor PAGO prevalece, entao mexer no previsto
  // nao muda numero nenhum. Aceitar em silencio seria pior que recusar.
  it('recusa conta ja paga, nomeando marcar_pago, sem alterar', async () => {
    const a = await aluguel()
    await marcarPago(app, { chave: a.chave, valor: '1800,00', hoje: HOJE })

    await expect(
      ajustarConta(app, { chave: a.chave, valor: '2000,00', hoje: HOJE }),
    ).rejects.toThrow(/marcar_pago/u)

    const item = await itemNaProjecao('Aluguel')
    expect(item?.valorCentavos).toBe(180_000)
  })

  it('recusa mudar o vencimento de conta paga', async () => {
    const a = await aluguel()
    await marcarPago(app, { chave: a.chave, hoje: HOJE })

    await expect(
      ajustarConta(app, { chave: a.chave, vencimento: '2026-09-25', hoje: HOJE }),
    ).rejects.toThrow(/marcar_pago/u)
  })

  it('recusa valor ilegivel, sem gravar', async () => {
    const a = await aluguel()

    await expect(
      ajustarConta(app, { chave: a.chave, valor: 'dois mil', hoje: HOJE }),
    ).rejects.toThrow(ErroDeUsuario)
    expect(await app.repos.ocorrencias.listar()).toEqual([])
  })

  it('recusa valor zero ou negativo, sem gravar', async () => {
    const a = await aluguel()

    await expect(
      ajustarConta(app, { chave: a.chave, valor: '-100', hoje: HOJE }),
    ).rejects.toThrow(ErroDeUsuario)
    expect(await app.repos.ocorrencias.listar()).toEqual([])
  })

  // O caso da escrita parcial: valor e vencimento sao duas gravacoes
  // sequenciais sem transacao. `2026-09-31` passa pelo regex do schema zod da
  // fronteira e so morre la no dominio -- se a validacao ficasse no ponto da
  // gravacao, o VALOR ja teria sido comitado quando a data estourasse, e o
  // recibo com o `antes` necessario para reverter nunca chegaria.
  it('recusa vencimento inexistente sem comitar o valor', async () => {
    const a = await aluguel()

    await expect(
      ajustarConta(app, {
        chave: a.chave,
        valor: '2000,00',
        vencimento: '2026-09-31',
        hoje: HOJE,
      }),
    ).rejects.toThrow(ErroDeUsuario)

    expect(await app.repos.ocorrencias.listar()).toEqual([])
    expect((await itemNaProjecao('Aluguel'))?.valorCentavos).toBe(180_000)
    expect((await itemNaProjecao('Aluguel'))?.dataVencimento).toBe('2026-09-10')
  })

  it.each(['2026-02-30', '2026-13-01', '2026-04-31'])(
    'recusa a data impossivel %s, que o regex do schema deixa passar',
    async (vencimento) => {
      const a = await aluguel()

      await expect(
        ajustarConta(app, { chave: a.chave, vencimento, hoje: HOJE }),
      ).rejects.toThrow(ErroDeUsuario)
      expect(await app.repos.ocorrencias.listar()).toEqual([])
    },
  )

  // Uma conta ignorada esta fora da projecao, e nenhuma das escritas daqui a
  // reativa: aceitar devolveria um recibo alegre por uma mudanca que nao
  // aparece em lugar nenhum.
  it('recusa conta ignorada, nomeando ignorar_conta, sem alterar', async () => {
    const a = await aluguel()
    await ignorarConta(app, { chave: a.chave, ignorar: true, hoje: HOJE })

    await expect(
      ajustarConta(app, { chave: a.chave, valor: '2000,00', hoje: HOJE }),
    ).rejects.toThrow(/ignorar_conta/u)

    const m = await app.projecao.projetarMes('2026-09', HOJE)
    const ignorada = m.ignorados.find((o) => o.nome === 'Aluguel')
    expect(ignorada?.valorPrevistoCentavos).toBe(180_000)
  })

  // RN-51: a operacao e idempotente. Duas chamadas atualizam a mesma linha.
  it('chamada duas vezes nao cria duas linhas', async () => {
    const a = await aluguel()
    await ajustarConta(app, { chave: a.chave, valor: '2000,00', hoje: HOJE })
    await ajustarConta(app, { chave: a.chave, valor: '2100,00', hoje: HOJE })

    expect(await app.repos.ocorrencias.listar()).toHaveLength(1)
    expect((await itemNaProjecao('Aluguel'))?.valorCentavos).toBe(210_000)
  })
})
