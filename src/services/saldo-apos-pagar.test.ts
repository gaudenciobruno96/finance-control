/**
 * RN-91: marcar uma conta como paga desconta do saldo de hoje.
 *
 * O saldo exibido e o do COMECO do dia, para que uma conta que apenas vence
 * hoje nao apareca descontada de um dinheiro que ainda esta na conta. A regra
 * nao distinguia "vence hoje" de "foi paga hoje", e no segundo caso o dinheiro
 * ja saiu do banco: o app mostrava um saldo MAIOR que o do extrato, e marcar
 * como pago nao movia numero nenhum.
 *
 * O teste cobre os dois lados, porque corrigir so um quebraria o outro: o
 * saldo tem de cair, e o mesmo item tem de sair de "ainda sai" -- sem isso o
 * pagamento seria contado duas vezes e a identidade do topo pararia de fechar.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarHarness, type Harness } from '../test-support/app-harness.js'

const HOJE = '2026-08-20'
const COMPETENCIA = '2026-08'

let app: Harness

beforeEach(async () => {
  app = await criarHarness()
})

afterEach(async () => {
  await app.encerrar()
})

/** Ancora de R$ 10.000 declarada ONTEM, aluguel de R$ 1.800 vencendo HOJE. */
async function cenario() {
  await app.regras.definirAncora('2026-08-19', 1_000_000, HOJE)
  await app.regras.criarRegra({
    tipo: 'saida',
    nome: 'Aluguel',
    valorCentavos: 180_000,
    valorEhEstimativa: false,
    diaDoMes: 20,
    ajusteFimDeSemana: 'nenhum',
    vigenteDe: COMPETENCIA,
    vigenteAte: null,
    categoria: null,
  })
}

async function aluguel() {
  const mes = await app.projecao.projetarMes(COMPETENCIA, HOJE)
  const o = [...mes.faltaPagar, ...mes.jaResolvido].find((x) => x.nome === 'Aluguel')
  if (o === undefined) throw new Error('Aluguel nao encontrado na projecao')
  return o
}

describe('saldo de hoje depois de marcar como pago', () => {
  it('antes de pagar, o saldo e o declarado e a conta esta em "ainda sai"', async () => {
    await cenario()
    const mes = await app.projecao.projetarMes(COMPETENCIA, HOJE)

    expect(mes.saldoNaReferenciaCentavos).toBe(1_000_000)
    expect(mes.saiAposReferenciaCentavos).toBe(180_000)
    expect(mes.detalheSaiApos.map((o) => o.nome)).toContain('Aluguel')
  })

  it('depois de pagar, o saldo cai e a conta sai de "ainda sai"', async () => {
    await cenario()
    await app.pagamento.registrarPagamento(await aluguel(), HOJE, 180_000)

    const mes = await app.projecao.projetarMes(COMPETENCIA, HOJE)

    // O dinheiro saiu do banco: R$ 10.000,00 - R$ 1.800,00.
    expect(mes.saldoNaReferenciaCentavos).toBe(820_000)
    // E nao pode continuar sendo cobrado no que ainda vai sair.
    expect(mes.saiAposReferenciaCentavos).toBe(0)
    expect(mes.detalheSaiApos.map((o) => o.nome)).not.toContain('Aluguel')
  })

  it('a identidade do topo continua fechando depois do pagamento', async () => {
    await cenario()
    await app.pagamento.registrarPagamento(await aluguel(), HOJE, 180_000)

    const mes = await app.projecao.projetarMes(COMPETENCIA, HOJE)

    expect(
      mes.saldoNaReferenciaCentavos +
        mes.entraAposReferenciaCentavos -
        mes.saiAposReferenciaCentavos,
    ).toBe(mes.sobraCentavos)
  })

  // RN-31: o que saiu da conta foi o valor pago, nao o previsto.
  it('desconta o valor pago quando difere do previsto', async () => {
    await cenario()
    await app.pagamento.registrarPagamento(await aluguel(), HOJE, 200_000)

    const mes = await app.projecao.projetarMes(COMPETENCIA, HOJE)

    expect(mes.saldoNaReferenciaCentavos).toBe(800_000)
  })

  it('uma entrada confirmada hoje soma no saldo', async () => {
    await app.regras.definirAncora('2026-08-19', 1_000_000, HOJE)
    await app.regras.criarRegra({
      tipo: 'entrada',
      nome: 'Salário',
      valorCentavos: 500_000,
      valorEhEstimativa: false,
      diaDoMes: 20,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: COMPETENCIA,
      vigenteAte: null,
      categoria: null,
    })

    const antes = await app.projecao.projetarMes(COMPETENCIA, HOJE)
    const salario = antes.aindaEntra.find((o) => o.nome === 'Salário')
    if (salario === undefined) throw new Error('Salario nao encontrado')
    await app.pagamento.registrarPagamento(salario, HOJE, 500_000)

    const depois = await app.projecao.projetarMes(COMPETENCIA, HOJE)

    expect(antes.saldoNaReferenciaCentavos).toBe(1_000_000)
    expect(depois.saldoNaReferenciaCentavos).toBe(1_500_000)
    expect(depois.entraAposReferenciaCentavos).toBe(0)
  })

  // A regra que ja existia e que esta correcao nao pode ter quebrado: uma
  // conta que apenas VENCE hoje nao saiu da conta, e o saldo exibido tem de
  // continuar batendo com o extrato de manha.
  it('nao desconta o que apenas vence hoje e ainda nao foi pago', async () => {
    await cenario()
    const mes = await app.projecao.projetarMes(COMPETENCIA, HOJE)

    expect(mes.saldoNaReferenciaCentavos).toBe(1_000_000)
  })

  // RN-53: desfazer o pagamento devolve o dinheiro ao saldo.
  it('desfazer o pagamento devolve o valor ao saldo', async () => {
    await cenario()
    await app.pagamento.registrarPagamento(await aluguel(), HOJE, 180_000)
    await app.pagamento.desfazerPagamento(await aluguel())

    const mes = await app.projecao.projetarMes(COMPETENCIA, HOJE)

    expect(mes.saldoNaReferenciaCentavos).toBe(1_000_000)
    expect(mes.saiAposReferenciaCentavos).toBe(180_000)
  })
})
