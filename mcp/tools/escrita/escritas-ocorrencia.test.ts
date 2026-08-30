import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { situacaoDoMes } from '../situacao-do-mes.js'
import { lancarAvulso } from './lancar-avulso.js'
import { marcarPago } from './marcar-pago.js'

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
  for (const t of ['regras', 'ancoras', 'ocorrencias']) {
    await pool.query(`delete from ${t}`)
  }
})

async function cadastrarAluguel(): Promise<void> {
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
}

describe('lancarAvulso', () => {
  it('grava e devolve recibo', async () => {
    const r = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Mercado',
      valor: '80',
      hoje: '2026-09-15',
    })

    expect(r.tipo).toBe('avulso')
    expect(r.resumo).toContain('Mercado')
    expect(r.resumo).toMatch(/R\$\s?80,00/u)

    const gravada = await app.repos.ocorrencias.obter(r.id)
    expect(gravada?.valorPrevistoCentavos).toBe(8000)
    expect(gravada?.geradorTipo).toBe('avulso')
    expect(gravada?.geradorId).toBeNull()
  })

  it('usa hoje como data quando nao vem, e deriva a competencia', async () => {
    const r = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Padaria',
      valor: '12,50',
      hoje: '2026-09-15',
    })

    const gravada = await app.repos.ocorrencias.obter(r.id)
    expect(gravada?.dataVencimento).toBe('2026-09-15')
    expect(gravada?.competencia).toBe('2026-09')
  })

  it('deriva a competencia da data informada, nao de hoje', async () => {
    const r = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Retroativo',
      valor: '30',
      data: '2026-07-20',
      hoje: '2026-09-15',
    })

    const gravada = await app.repos.ocorrencias.obter(r.id)
    expect(gravada?.competencia).toBe('2026-07')
  })

  it('recusa valor invalido sem gravar', async () => {
    await expect(
      lancarAvulso(app, { tipo: 'saida', nome: 'x', valor: 'muito', hoje: '2026-09-15' }),
    ).rejects.toThrow(/valor/i)

    expect(await app.repos.ocorrencias.listar()).toHaveLength(0)
  })

  it('aparece na situacao do mes depois de lancado', async () => {
    await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Pneu',
      valor: '850',
      hoje: '2026-09-15',
    })

    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })

    expect(s.faltaPagar.map((i) => i.nome)).toContain('Pneu')
  })
})

describe('marcarPago', () => {
  it('paga uma conta que ainda nao existe no banco', async () => {
    // A conta gerada por regra e virtual ate alguem interagir. Este e o caso
    // central da ferramenta.
    await cadastrarAluguel()

    const antes = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    const aluguel = antes.faltaPagar.find((i) => i.nome === 'Aluguel')
    expect(aluguel).toBeDefined()
    expect(await app.repos.ocorrencias.listar()).toHaveLength(0)

    const r = await marcarPago(app, { chave: aluguel!.chave, hoje: '2026-09-15' })

    expect(r.tipo).toBe('pagamento')
    expect(r.resumo).toContain('Aluguel')

    const materializadas = await app.repos.ocorrencias.listar()
    expect(materializadas).toHaveLength(1)
    expect(materializadas[0]?.dataPagamento).toBe('2026-09-15')
  })

  it('sai de faltaPagar depois de pago', async () => {
    await cadastrarAluguel()
    const antes = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    await marcarPago(app, {
      chave: antes.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave,
      hoje: '2026-09-15',
    })

    const depois = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })

    expect(depois.faltaPagar.map((i) => i.nome)).not.toContain('Aluguel')
  })

  it('e idempotente: pagar duas vezes nao cria dois lancamentos (RN-51)', async () => {
    await cadastrarAluguel()
    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    const chave = s.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave

    await marcarPago(app, { chave, hoje: '2026-09-15' })
    await marcarPago(app, { chave, hoje: '2026-09-15' })

    expect(await app.repos.ocorrencias.listar()).toHaveLength(1)
  })

  it('aceita valor diferente do previsto', async () => {
    await cadastrarAluguel()
    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    const chave = s.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave

    await marcarPago(app, { chave, valor: '1755,50', hoje: '2026-09-15' })

    const [o] = await app.repos.ocorrencias.listar()
    expect(o?.valorPagoCentavos).toBe(175550)
    expect(o?.valorPrevistoCentavos).toBe(180000)
  })

  it('recusa chave que nao corresponde a nenhuma ocorrencia', async () => {
    await cadastrarAluguel()

    await expect(
      marcarPago(app, { chave: 'chave|inventada|2026-09', hoje: '2026-09-15' }),
    ).rejects.toThrow(/chave/i)

    expect(await app.repos.ocorrencias.listar()).toHaveLength(0)
  })

  it('usa a competencia da data informada para localizar a ocorrencia, nao a de hoje', async () => {
    // Regra de ENTRADA vigente desde um mes anterior ao corrente (hoje e
    // 2026-09-15). Uma saida atrasada nao serviria para provar isto: RN-33 a
    // empurra para dentro de qualquer mes atual, entao ela apareceria em
    // faltaPagar mesmo se o codigo projetasse o mes errado. Uma entrada nao e
    // empurrada (RN-90) -- so aparece em aindaEntra do mes projetado que e
    // dela mesma. Isso faz o teste distinguir de verdade `competenciaDe(data)`
    // de `competenciaDe(hoje)`.
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

    const r = await marcarPago(app, { chave, data: '2026-07-10', hoje: '2026-09-15' })

    expect(r.tipo).toBe('pagamento')

    const [o] = await app.repos.ocorrencias.listar()
    expect(o?.competencia).toBe('2026-07')
    expect(o?.dataPagamento).toBe('2026-07-10')
  })

  it('recusa valor invalido ao pagar, sem gravar', async () => {
    await cadastrarAluguel()
    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    const chave = s.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave

    await expect(
      marcarPago(app, { chave, valor: 'muito dinheiro', hoje: '2026-09-15' }),
    ).rejects.toThrow(/valor/i)

    expect(await app.repos.ocorrencias.listar()).toHaveLength(0)
  })

  it('recusa valor negativo ao pagar, sem gravar', async () => {
    // deEntradaUsuario('-50') devolve -5000, que nao e null -- sem a guarda
    // isso chegaria ao PaymentService, e o projetor de saldo usa
    // valorPagoCentavos como magnitude do movimento: um pagamento negativo de
    // uma saida INVERTE o sinal e soma dinheiro em vez de subtrair.
    await cadastrarAluguel()
    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    const chave = s.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave

    await expect(
      marcarPago(app, { chave, valor: '-50', hoje: '2026-09-15' }),
    ).rejects.toThrow(/valor/i)

    // Nao apenas lancou: a tabela continua exatamente como estava, sem a
    // ocorrencia materializada com um pagamento negativo.
    expect(await app.repos.ocorrencias.listar()).toHaveLength(0)
  })

  it('recusa valor zero ao pagar, sem gravar', async () => {
    await cadastrarAluguel()
    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    const chave = s.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave

    await expect(
      marcarPago(app, { chave, valor: '0', hoje: '2026-09-15' }),
    ).rejects.toThrow(/valor/i)

    expect(await app.repos.ocorrencias.listar()).toHaveLength(0)
  })

  it('paga uma conta de setembro antecipadamente, em 31/08 (a competencia vem da chave, nao de hoje)', async () => {
    // Achado 6: a versao anterior projetava competenciaDe(data) -- e sem
    // `data` explicita, data = hoje = '2026-08-31', entao competenciaDe da
    // '2026-08'. A chave devolvida por situacao_do_mes de setembro e de
    // '2026-09', que nao aparece na projecao de agosto: "nao encontrei a
    // chave" para uma chave que a propria ferramenta acabou de devolver.
    await cadastrarAluguel()

    const setembro = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-08-31' })
    const chave = setembro.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave

    const r = await marcarPago(app, { chave, hoje: '2026-08-31' })

    expect(r.tipo).toBe('pagamento')
    const [o] = await app.repos.ocorrencias.listar()
    expect(o?.competencia).toBe('2026-09')
    expect(o?.dataPagamento).toBe('2026-08-31')
  })

  it('paga uma conta previamente marcada como ignorada (mes.ignorados entra na busca)', async () => {
    // Achado 6: `registrarPagamento` (via PaymentService.aplicar) ja seta
    // `ignorado: false` -- pagar uma conta ignorada e uma reativacao valida.
    // Sem `mes.ignorados` na lista de busca, isso falhava com "nao encontrei
    // a chave", mesmo a chave existindo (so que na lista errada).
    await cadastrarAluguel()
    const mes = await app.projecao.projetarMes('2026-09', '2026-09-15')
    const aluguel = mes.faltaPagar.find((o) => o.nome === 'Aluguel')!

    await app.pagamento.ignorarNoMes(aluguel)
    const depoisDeIgnorar = await app.projecao.projetarMes('2026-09', '2026-09-15')
    expect(depoisDeIgnorar.ignorados.map((o) => o.nome)).toContain('Aluguel')
    expect(depoisDeIgnorar.faltaPagar.map((o) => o.nome)).not.toContain('Aluguel')

    const r = await marcarPago(app, { chave: aluguel.chave, hoje: '2026-09-15' })

    expect(r.tipo).toBe('pagamento')
    const [o] = await app.repos.ocorrencias.listar()
    expect(o?.ignorado).toBe(false)
    expect(o?.dataPagamento).toBe('2026-09-15')
  })
})
