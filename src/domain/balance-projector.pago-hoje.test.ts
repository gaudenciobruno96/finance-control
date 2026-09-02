import { describe, expect, it } from 'vitest'
import { separarPorPagamento } from './balance-projector.js'
import type { MovimentoDoDia, OcorrenciaResolvida } from './types.js'

/**
 * RN-91: o que ja foi pago hoje ja saiu do banco.
 *
 * A referencia da projecao e o saldo no COMECO do dia, para que uma conta que
 * apenas vence hoje nao apareca descontada de um dinheiro que ainda esta na
 * conta. Mas uma conta ja PAGA hoje saiu -- e ate esta correcao o saldo
 * exibido a ignorava, mostrando um numero maior que o do extrato.
 *
 * A separacao precisa ser exaustiva: o que sai de `pago` mais o que sai de
 * `pendente` tem de reconstituir o dia inteiro, ou a identidade
 * `saldo + entra - sai = sobra` deixa de fechar.
 */

function ocorrencia(over: Partial<OcorrenciaResolvida>): OcorrenciaResolvida {
  return {
    chave: 'k',
    idReal: null,
    geradorTipo: 'regra',
    geradorId: 'r1',
    nome: 'Item',
    tipo: 'saida',
    dataVencimento: '2026-08-31',
    dataPagamento: null,
    valorPrevistoCentavos: 180_000,
    valorPagoCentavos: null,
    competencia: '2026-08',
    numeroParcela: null,
    ignorado: false,
    situacao: 'a_pagar',
    ...over,
  } as OcorrenciaResolvida
}

/** Monta o movimento do dia como `projetarCurva` monta: totais e itens juntos. */
function movimento(itens: readonly OcorrenciaResolvida[]): MovimentoDoDia {
  let entrada = 0
  let saida = 0
  for (const o of itens) {
    const valor = o.valorPagoCentavos ?? o.valorPrevistoCentavos
    if (o.tipo === 'entrada') entrada += valor
    else saida += valor
  }
  return { data: '2026-08-31', entradaCentavos: entrada, saidaCentavos: saida, itens }
}

const saidaPaga = ocorrencia({
  nome: 'Aluguel',
  dataPagamento: '2026-08-31',
  valorPagoCentavos: 180_000,
  situacao: 'pago',
})
const saidaPendente = ocorrencia({ nome: 'Luz', valorPrevistoCentavos: 25_000 })
const entradaRecebida = ocorrencia({
  nome: 'Salario',
  tipo: 'entrada',
  dataPagamento: '2026-08-31',
  valorPagoCentavos: 500_000,
  situacao: 'pago',
})

describe('separarPorPagamento', () => {
  it('poe o que ja foi pago em `pago` e o resto em `pendente`', () => {
    const { pago, pendente } = separarPorPagamento(
      movimento([saidaPaga, saidaPendente, entradaRecebida]),
    )

    expect(pago.itens.map((o) => o.nome)).toEqual(['Aluguel', 'Salario'])
    expect(pago.saidaCentavos).toBe(180_000)
    expect(pago.entradaCentavos).toBe(500_000)

    expect(pendente.itens.map((o) => o.nome)).toEqual(['Luz'])
    expect(pendente.saidaCentavos).toBe(25_000)
    expect(pendente.entradaCentavos).toBe(0)
  })

  // A propriedade que sustenta a identidade exibida no topo da tela.
  it('e exaustiva: pago mais pendente reconstitui o dia inteiro', () => {
    const dia = movimento([saidaPaga, saidaPendente, entradaRecebida])
    const { pago, pendente } = separarPorPagamento(dia)

    expect(pago.entradaCentavos + pendente.entradaCentavos).toBe(dia.entradaCentavos)
    expect(pago.saidaCentavos + pendente.saidaCentavos).toBe(dia.saidaCentavos)
    expect(pago.itens.length + pendente.itens.length).toBe(dia.itens.length)
  })

  it('um dia sem nada pago devolve tudo em pendente', () => {
    const dia = movimento([saidaPendente])
    const { pago, pendente } = separarPorPagamento(dia)

    expect(pago.itens).toEqual([])
    expect(pago.saidaCentavos).toBe(0)
    expect(pendente.saidaCentavos).toBe(25_000)
  })

  // RN-31: o valor pago prevalece sobre o previsto. Uma conta prevista em 200
  // e paga em 240 tirou 240 da conta.
  it('usa o valor pago, nao o previsto', () => {
    const cara = ocorrencia({
      valorPrevistoCentavos: 200_00,
      dataPagamento: '2026-08-31',
      valorPagoCentavos: 240_00,
    })
    const { pago } = separarPorPagamento(movimento([cara]))

    expect(pago.saidaCentavos).toBe(240_00)
  })

  it('preserva a data do dia nos dois lados', () => {
    const { pago, pendente } = separarPorPagamento(movimento([saidaPaga, saidaPendente]))

    expect(pago.data).toBe('2026-08-31')
    expect(pendente.data).toBe('2026-08-31')
  })
})
