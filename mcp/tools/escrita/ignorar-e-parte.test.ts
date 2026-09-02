import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'
import { situacaoDoMes } from '../situacao-do-mes.js'
import { cadastrarRecorrente } from './cadastrar-recorrente.js'
import { declararSaldo } from './declarar-saldo.js'
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

  // A queixa que originou a branch inteira, em dinheiro e nao em pertinencia
  // de lista: a estimativa de mercado venceu sem ser paga, virou "atrasado" e
  // o projetor a empurrou para hoje (RN-33), derrubando o saldo do dia. Os
  // demais testes provam que o item sai da lista -- este prova que o dinheiro
  // volta, que e a reclamacao de verdade.
  //
  // Exige uma ANCORA: sem ela `saldoRelativo` e verdadeiro e os valores tem
  // forma mas nao tem nivel, entao a diferenca nao significaria nada.
  it('devolve o saldo que a conta vencida e nao paga tinha derrubado', async () => {
    await declararSaldo(app, { valor: '10000,00', hoje: HOJE })
    const c = await mercado() // vence 2026-09-01; em 2026-09-15 esta vencida

    const antes = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
    expect(antes.saldoRelativo).toBe(false)
    expect(antes.faltaPagar.map((i) => i.nome)).toContain('Mercado')

    await ignorarConta(app, { chave: c.chave, ignorar: true, hoje: HOJE })

    const depois = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
    expect(depois.saldoRelativo).toBe(false)
    expect(depois.sobra.valorCentavos - antes.sobra.valorCentavos).toBe(150_000)

    // Ignorada a unica conta do mes, a sobra volta a ser o saldo declarado.
    expect(depois.sobra.valorCentavos).toBe(1_000_000)
  })

  // A chave de uma conta ignorada nao aparecia em consulta nenhuma: existia
  // so no recibo da chamada que a ignorou. Numa conversa seguinte, reativar
  // era literalmente inenderecavel.
  it('mantem a conta ignorada visivel, com chave, em situacao_do_mes', async () => {
    const c = await mercado()
    await ignorarConta(app, { chave: c.chave, ignorar: true, hoje: HOJE })

    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
    const ignorada = s.ignorados.find((i) => i.nome === 'Mercado')

    expect(ignorada?.chave).toBe(c.chave)
    expect(ignorada?.valorCentavos).toBe(150_000)
    expect(s.faltaPagar.map((i) => i.nome)).not.toContain('Mercado')

    // E a chave listada de fato reativa.
    await ignorarConta(app, { chave: ignorada!.chave, ignorar: false, hoje: HOJE })
    expect(await faltaPagar()).toContain('Mercado')
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

  // "Veio tudo" e o engano mais provavel desta ferramenta. Antes, ele saia
  // como o codigo interno do dominio ("[restanteAposParte] valor monetario
  // deve ser maior que zero"), que nao diz o que fazer em vez disso.
  it('recusa parte maior ou igual ao previsto, nomeando marcar_pago', async () => {
    const s = await salario()

    await expect(
      registrarParte(app, { chave: s.chave, valor: '18000,00', hoje: HOJE }),
    ).rejects.toThrow(ErroDeUsuario)
    await expect(
      registrarParte(app, { chave: s.chave, valor: '18000,00', hoje: HOJE }),
    ).rejects.toThrow(/marcar_pago/u)
    await expect(
      registrarParte(app, { chave: s.chave, valor: '20000,00', hoje: HOJE }),
    ).rejects.toThrow(/marcar_pago/u)

    expect(await app.repos.ocorrencias.listar()).toEqual([])
  })

  // `deEntradaUsuario('-100')` devolve -10000 sem reclamar -- sinal e sintaxe
  // valida para `declarar_saldo`. Sem guarda aqui, o negativo so morreria no
  // dominio, como codigo interno.
  it('recusa parte zero ou negativa, sem gravar', async () => {
    const s = await salario()

    await expect(
      registrarParte(app, { chave: s.chave, valor: '-100', hoje: HOJE }),
    ).rejects.toThrow(ErroDeUsuario)
    await expect(
      registrarParte(app, { chave: s.chave, valor: '0', hoje: HOJE }),
    ).rejects.toThrow(ErroDeUsuario)
    expect(await app.repos.ocorrencias.listar()).toEqual([])
  })

  it('recusa conta ignorada, nomeando ignorar_conta, sem gravar', async () => {
    const s = await salario()
    await ignorarConta(app, { chave: s.chave, ignorar: true, hoje: HOJE })

    await expect(
      registrarParte(app, { chave: s.chave, valor: '8000,00', hoje: HOJE }),
    ).rejects.toThrow(/ignorar_conta/u)

    const m = await app.projecao.projetarMes('2026-09', HOJE)
    expect(m.ignorados.find((o) => o.nome === 'Salário')?.valorPrevistoCentavos).toBe(
      1_800_000,
    )
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
