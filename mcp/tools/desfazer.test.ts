import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { chaveDe } from '../../src/domain/occurrence-key.js'
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

  it('desfaz pagamento de ocorrencia materializada ha dias e paga agora (janela mede o toque, nao a criacao)', async () => {
    // Achado 5: `criado_em` fica congelado no insert e `on conflict do update`
    // nao o toca. Uma ocorrencia materializada ha dias (ex.: por uma edicao
    // anterior) e paga AGORA carrega um `criado_em` antigo -- a versao velha
    // da janela recusava desfazer um pagamento feito ha segundos, alegando
    // "mais de 24 horas". A correcao le `atualizado_em`, que a propria
    // chamada de pagamento avanca.
    const chave = chaveDe('regra', 'r-aluguel', '2026-09')
    await app.repos.ocorrencias.salvar({
      id: 'o-materializada-ha-dias',
      geradorTipo: 'regra',
      geradorId: 'r-aluguel',
      competencia: '2026-09',
      tipo: 'saida',
      nome: 'Aluguel',
      valorPrevistoCentavos: 180000,
      dataVencimento: '2026-09-10',
      dataPagamento: null,
      valorPagoCentavos: null,
      ignorado: false,
      observacao: null,
    })
    await pool.query(
      `update ocorrencias set criado_em = now() - interval '2 days' where id = $1`,
      ['o-materializada-ha-dias'],
    )

    // Paga agora -- isso ATUALIZA a linha existente (mesma chave), sem tocar
    // em criado_em, mas avancando atualizado_em.
    await marcarPago(app, { chave, hoje: '2026-09-15' })

    await desfazer(app, { tipo: 'pagamento', id: chave, agora: logoDepois(), hoje: '2026-09-15' })

    const [o] = await app.repos.ocorrencias.listar()
    expect(o?.dataPagamento).toBeNull()
    expect(o?.valorPagoCentavos).toBeNull()
  })

  it('desfaz pagamento retroativo de uma ENTRADA (nao so de saida, que RN-33 empurra para o mes atual)', async () => {
    // Achado 6: desfazer(pagamento) projetava competenciaDe(hoje), que so
    // acha o mes CORRENTE. Uma saida atrasada passaria por coincidencia (RN-33
    // a empurra para dentro de qualquer mes atual); uma entrada nao (RN-90) --
    // so aparece no mes projetado que e dela mesma. A correcao le a
    // competencia da propria chave.
    await app.repos.regras.salvar({
      id: 'r-freela',
      tipo: 'entrada',
      nome: 'Freela',
      valorCentavos: 9900,
      valorEhEstimativa: false,
      diaDoMes: 10,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-07',
      vigenteAte: null,
    })

    const antiga = await situacaoDoMes(app, { competencia: '2026-07', hoje: '2026-09-15' })
    const chave = antiga.aindaEntra.find((i) => i.nome === 'Freela')!.chave

    await marcarPago(app, { chave, data: '2026-07-10', hoje: '2026-09-15' })

    await desfazer(app, { tipo: 'pagamento', id: chave, agora: logoDepois(), hoje: '2026-09-15' })

    const [o] = await app.repos.ocorrencias.listar()
    expect(o?.dataPagamento).toBeNull()
    expect(o?.valorPagoCentavos).toBeNull()
  })
})
