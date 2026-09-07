/**
 * A conta exibida no topo precisa FECHAR com o numero grande.
 *
 * Regressao da segunda revisao: o titulo usava o saldo projetado (que inclui o
 * ja resolvido) enquanto a conta somava apenas as listas do que falta. Os
 * numeros nao davam -- na tela cujo proposito e explicar de onde o numero vem.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarHarness, type Harness } from '../test-support/app-harness.js'

const HOJE = '2026-08-15'
let app: Harness

beforeEach(async () => {
  app = await criarHarness()
})

afterEach(async () => {
  await app.encerrar()
})

async function cenario() {
  await app.regras.definirAncora('2026-08-01', 100_000, HOJE)

  await app.regras.criarRegra({
    tipo: 'entrada', nome: 'Salário', valorCentavos: 300_000,
    valorEhEstimativa: false, diaDoMes: 5, ajusteFimDeSemana: 'nenhum',
    vigenteDe: '2026-08', vigenteAte: null,
    categoria: null,
  })
  await app.regras.criarRegra({
    tipo: 'saida', nome: 'Aluguel', valorCentavos: 80_000,
    valorEhEstimativa: false, diaDoMes: 20, ajusteFimDeSemana: 'nenhum',
    vigenteDe: '2026-08', vigenteAte: null,
    categoria: null,
  })
}

describe('a conta do topo fecha com o número grande', () => {
  it('saldo na referência + entra − sai = sobra', async () => {
    await cenario()
    const mes = await app.projecao.projetarMes('2026-08', HOJE)

    expect(
      mes.saldoNaReferenciaCentavos +
        mes.entraAposReferenciaCentavos -
        mes.saiAposReferenciaCentavos,
    ).toBe(mes.sobraCentavos)
  })

  it('fecha também com um pagamento já registrado', async () => {
    await cenario()
    const mes = await app.projecao.projetarMes('2026-08', HOJE)
    const salario = mes.aindaEntra[0]
    expect(salario).toBeDefined()

    await app.pagamento.registrarPagamento(salario!, '2026-08-05', 300_000)

    const depois = await app.projecao.projetarMes('2026-08', HOJE)
    expect(
      depois.saldoNaReferenciaCentavos +
        depois.entraAposReferenciaCentavos -
        depois.saiAposReferenciaCentavos,
    ).toBe(depois.sobraCentavos)
  })

  it('fecha em mês futuro e em mês passado', async () => {
    await cenario()

    for (const competencia of ['2026-07', '2026-09', '2026-12']) {
      const mes = await app.projecao.projetarMes(competencia, HOJE)
      expect(
        mes.saldoNaReferenciaCentavos +
          mes.entraAposReferenciaCentavos -
          mes.saiAposReferenciaCentavos,
      ).toBe(mes.sobraCentavos)
    }
  })

  it('sinaliza saldo relativo ao abrir um mês anterior à âncora', async () => {
    await cenario()

    const agosto = await app.projecao.projetarMes('2026-08', HOJE)
    expect(agosto.saldoRelativo).toBe(false)

    // A ancora e de 1o de agosto: julho fica sem referencia absoluta.
    const julho = await app.projecao.projetarMes('2026-07', HOJE)
    expect(julho.saldoRelativo).toBe(true)
  })
})

describe('atrasados de meses anteriores (regressão da 2ª revisão)', () => {
  /**
   * A janela de carga passou a se estender um mes para frente, e o filtro por
   * "competencia diferente" trazia as contas do mes SEGUINTE como divida
   * vencida -- dobrando o total a pagar de todo mes passado aberto.
   */
  it('as contas do mês seguinte NÃO entram como dívida do mês exibido', async () => {
    await app.regras.criarRegra({
      tipo: 'saida', nome: 'Aluguel', valorCentavos: 180_000,
      valorEhEstimativa: false, diaDoMes: 10, ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-07', vigenteAte: null,
      categoria: null,
    })

    const julho = await app.projecao.projetarMes('2026-07', HOJE)

    expect(julho.totalFaltaPagarCentavos).toBe(180_000)
    expect(julho.faltaPagar).toHaveLength(1)
    expect(julho.faltaPagar[0]?.competencia).toBe('2026-07')
  })

  it('as de meses anteriores continuam entrando', async () => {
    await app.regras.criarRegra({
      tipo: 'saida', nome: 'Aluguel', valorCentavos: 180_000,
      valorEhEstimativa: false, diaDoMes: 10, ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-06', vigenteAte: null,
      categoria: null,
    })

    const agosto = await app.projecao.projetarMes('2026-08', HOJE)

    // Junho, julho e agosto: três meses de aluguel não pago.
    expect(agosto.totalFaltaPagarCentavos).toBe(540_000)
    expect(agosto.faltaPagar.map((o) => o.competencia).sort()).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
    ])
  })
})

/**
 * O saldo exibido tem de ser IGUAL ao digitado.
 *
 * Bug relatado: a pessoa informou 3.940 e a tela mostrou 1.940. A conta
 * vencida do dia era empurrada para hoje (RN-33) e o ponto da curva do dia de
 * hoje ja vinha com ela descontada -- mas o dinheiro ainda estava na conta, e
 * a linha ao lado do numero diz "que voce tem hoje".
 */
describe('o saldo de hoje é o que foi declarado', () => {
  it('conta vencida empurrada para hoje não some do saldo, vai para “ainda sai”', async () => {
    // Vence dia 10, hoje e 15: atrasada, empurrada para hoje.
    await app.regras.criarRegra({
      tipo: 'saida', nome: 'Boleto', valorCentavos: 200_000,
      valorEhEstimativa: false, diaDoMes: 10, ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-08', vigenteAte: null,
      categoria: null,
    })
    await app.regras.definirAncora(HOJE, 394_000, HOJE)

    const mes = await app.projecao.projetarMes('2026-08', HOJE)

    expect(mes.saldoNaReferenciaCentavos).toBe(394_000)
    expect(mes.referenciaEhHoje).toBe(true)
    expect(mes.saiAposReferenciaCentavos).toBe(200_000)
    expect(mes.sobraCentavos).toBe(194_000)

    // E aparece na lista que se abre, para poder ser conferida.
    expect(mes.detalheSaiApos.map((o) => o.nome)).toEqual(['Boleto'])
  })

  it('o que foi pago hoje não é descontado de novo do saldo declarado', async () => {
    await app.regras.criarRegra({
      tipo: 'saida', nome: 'Boleto', valorCentavos: 200_000,
      valorEhEstimativa: false, diaDoMes: 15, ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-08', vigenteAte: null,
      categoria: null,
    })

    const antes = await app.projecao.projetarMes('2026-08', HOJE)
    const boleto = antes.faltaPagar[0]
    expect(boleto).toBeDefined()
    await app.pagamento.registrarPagamento(boleto!, HOJE, 200_000)

    // O saldo e lido do extrato DEPOIS de pagar: ja vem descontado.
    await app.regras.definirAncora(HOJE, 394_000, HOJE)

    const mes = await app.projecao.projetarMes('2026-08', HOJE)

    expect(mes.saldoNaReferenciaCentavos).toBe(394_000)
    expect(mes.saiAposReferenciaCentavos).toBe(0)
    expect(mes.sobraCentavos).toBe(394_000)
    expect(mes.jaResolvido).toHaveLength(1)
  })

  it('a identidade continua fechando quando o mês exibido é futuro', async () => {
    await app.regras.criarRegra({
      tipo: 'saida', nome: 'Aluguel', valorCentavos: 80_000,
      valorEhEstimativa: false, diaDoMes: 1, ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-08', vigenteAte: null,
      categoria: null,
    })
    await app.regras.definirAncora(HOJE, 394_000, HOJE)

    // Setembro inteiro esta no futuro: nem o dia 1 aconteceu.
    const mes = await app.projecao.projetarMes('2026-09', HOJE)

    expect(
      mes.saldoNaReferenciaCentavos +
        mes.entraAposReferenciaCentavos -
        mes.saiAposReferenciaCentavos,
    ).toBe(mes.sobraCentavos)
    // 80.000 de setembro mais o aluguel de agosto, vencido e nao pago: a
    // divida antiga e empurrada para o inicio da curva (RN-33).
    expect(mes.saiAposReferenciaCentavos).toBe(160_000)
  })
})
