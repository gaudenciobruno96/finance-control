import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../dados/conexao.js'
import { aplicarMigracoes } from '../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../app-pg.js'
import { situacaoDoMes } from './situacao-do-mes.js'
import { cadastrarRecorrente } from './escrita/cadastrar-recorrente.js'
import { lancarAvulso } from './escrita/lancar-avulso.js'
import { marcarPago } from './escrita/marcar-pago.js'
import { declararSaldo } from './escrita/declarar-saldo.js'
import { desfazer } from './desfazer.js'

let container: StartedPostgreSqlContainer
let pool: Pool
let app: AppPg

// `agora` e o instante de relogio real usado para a janela de 24h, distinto de
// `hoje` (data de negocio fixa nos testes). `criado_em` no Postgres e
// `timestamptz default now()` -- o relogio real do container. Por isso cada
// teste captura o instante DEPOIS de criar o registro (nunca uma constante
// fixa no topo do arquivo): uma constante de modulo e avaliada antes do
// container subir, entao `criadoEm` sempre viria depois dela e a janela
// pareceria negativa mesmo para um registro recem-criado.
//
// `logoDepois` adiciona uma folga de um minuto -- o container tem relogio
// proprio e mediu-se uma diferenca de alguns milissegundos entre ele e o
// processo Node; um minuto absorve isso com folga e ainda representa
// fielmente "desfazer logo em seguida", bem dentro da janela de 24h.
function logoDepois(): Date {
  return new Date(Date.now() + 60_000)
}

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
  for (const t of ['regras', 'ancoras', 'ocorrencias']) {
    await pool.query(`delete from ${t}`)
  }
})

describe('desfazer', () => {
  it('remove um lancamento avulso', async () => {
    const r = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Erro',
      valor: '50',
      hoje: '2026-09-15',
    })

    await desfazer(app, { tipo: 'avulso', id: r.id, agora: logoDepois(), hoje: '2026-09-15' })

    expect(await app.repos.ocorrencias.obter(r.id)).toBeNull()
  })

  it('remove uma regra e avisa que ocorrencias permanecem (RN-46)', async () => {
    const r = await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Engano',
      valor: '100',
      diaDoMes: 5,
      vigenteDe: '2026-09',
    })

    const resultado = await desfazer(app, {
      tipo: 'recorrente',
      id: r.id,
      agora: logoDepois(),
      hoje: '2026-09-15',
    })

    expect(await app.repos.regras.obter(r.id)).toBeNull()
    expect(resultado.descricao).toMatch(/materializad/i)
  })

  it('desfazer pagamento NAO apaga a conta nem o registro (RN-53)', async () => {
    await app.repos.regras.salvar({
      id: 'r-aluguel',
      tipo: 'saida',
      nome: 'Aluguel',
      valorCentavos: 180000,
      valorEhEstimativa: false,
      diaDoMes: 10,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-09',
      vigenteAte: null,
    })
    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    const chave = s.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave
    await marcarPago(app, { chave, hoje: '2026-09-15' })

    await desfazer(app, { tipo: 'pagamento', id: chave, agora: logoDepois(), hoje: '2026-09-15' })

    // O registro materializado permanece -- pode carregar valor ajustado ou
    // vencimento adiado. So o pagamento e limpo.
    const materializadas = await app.repos.ocorrencias.listar()
    expect(materializadas).toHaveLength(1)
    expect(materializadas[0]?.dataPagamento).toBeNull()
    expect(materializadas[0]?.valorPagoCentavos).toBeNull()

    const depois = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    expect(depois.faltaPagar.map((i) => i.nome)).toContain('Aluguel')
  })

  it('remove uma ancora', async () => {
    const r = await declararSaldo(app, { valor: '100', hoje: '2026-09-15' })

    await desfazer(app, { tipo: 'saldo', id: r.id, agora: logoDepois(), hoje: '2026-09-15' })

    expect(await app.repos.ancoras.listar()).toHaveLength(0)
  })

  it('recusa fora da janela de 24 horas', async () => {
    const r = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Antigo',
      valor: '10',
      hoje: '2026-09-15',
    })

    // 30 dias depois do relogio real, para garantir que fica fora da janela de
    // 24h independente de quando o teste rodar.
    const muitoDepois = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await expect(
      desfazer(app, { tipo: 'avulso', id: r.id, agora: muitoDepois, hoje: '2026-12-01' }),
    ).rejects.toThrow(/24 horas|janela/i)

    // E nao apagou nada.
    expect(await app.repos.ocorrencias.obter(r.id)).not.toBeNull()
  })

  it('recusa id inexistente', async () => {
    await expect(
      desfazer(app, { tipo: 'avulso', id: 'nao-existe', agora: logoDepois(), hoje: '2026-09-15' }),
    ).rejects.toThrow()
  })
})
