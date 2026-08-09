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
  })
  await app.regras.criarRegra({
    tipo: 'saida', nome: 'Aluguel', valorCentavos: 80_000,
    valorEhEstimativa: false, diaDoMes: 20, ajusteFimDeSemana: 'nenhum',
    vigenteDe: '2026-08', vigenteAte: null,
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
