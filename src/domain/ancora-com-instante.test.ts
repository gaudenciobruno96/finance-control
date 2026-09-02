import { describe, expect, it } from 'vitest'
import { projetarCurva } from './balance-projector.js'
import type { AncoraSaldo, OcorrenciaResolvida } from './types.js'

/**
 * RN-32 revisada: a ancora e um saldo num INSTANTE, nao num dia.
 *
 * Antes, qualquer pagamento com data <= a da ancora era ignorado, porque o
 * saldo declarado e leitura de extrato. Isso vale para quem confere a noite e
 * declara com tudo pago -- e erra para quem declara de manha e gasta durante
 * o dia, mostrando um saldo MAIOR que o do banco.
 */

const DIA = '2026-09-01'

function ancora(declaradaEm: string | null): AncoraSaldo {
  return { id: 'a-1', data: DIA, saldoCentavos: 1_000_000, declaradaEm }
}

function pagamento(registradoEm: string | null): OcorrenciaResolvida {
  return {
    chave: 'k',
    idReal: 'o-1',
    origem: 'real',
    geradorTipo: 'avulso',
    geradorId: null,
    nome: 'Sushi',
    tipo: 'saida',
    dataVencimento: DIA,
    dataPagamento: DIA,
    valorPrevistoCentavos: 11_100,
    valorPagoCentavos: 11_100,
    pagamentoRegistradoEm: registradoEm,
    competencia: '2026-09',
    numeroParcela: null,
    ignorado: false,
    situacao: 'pago',
  } as OcorrenciaResolvida
}

/** Saldo do ultimo ponto da curva do mes. */
function saldoFinal(a: AncoraSaldo, o: OcorrenciaResolvida): number {
  const curva = projetarCurva([o], a, '2026-09', DIA)
  return curva.pontos[curva.pontos.length - 1]?.saldoCentavos ?? 0
}

describe('RN-32 com instante', () => {
  // O caso do usuario: declarou de manha, pagou a tarde. O dinheiro saiu
  // DEPOIS da leitura do extrato, entao precisa descontar.
  it('desconta o pagamento registrado DEPOIS da ancora', () => {
    const a = ancora('2026-09-01T09:00:00.000Z')
    const o = pagamento('2026-09-01T18:00:00.000Z')

    expect(saldoFinal(a, o)).toBe(1_000_000 - 11_100)
  })

  // O caso oposto, que a RN-32 sempre protegeu: conferiu o extrato depois de
  // pagar, entao o valor digitado JA desconta. Descontar de novo daria um
  // saldo menor que o do banco.
  it('NAO desconta o pagamento registrado ANTES da ancora', () => {
    const a = ancora('2026-09-01T18:00:00.000Z')
    const o = pagamento('2026-09-01T09:00:00.000Z')

    expect(saldoFinal(a, o)).toBe(1_000_000)
  })

  it('trata instantes iguais como ja refletidos', () => {
    const mesmo = '2026-09-01T12:00:00.000Z'

    expect(saldoFinal(ancora(mesmo), pagamento(mesmo))).toBe(1_000_000)
  })

  // Sem instante nao ha como ordenar, e a escolha e preservar o que o app ja
  // fazia -- nenhum saldo historico se desloca sozinho.
  it('sem nenhum dos dois instantes, mantem o comportamento anterior', () => {
    expect(saldoFinal(ancora(null), pagamento(null))).toBe(1_000_000)
  })

  it('com so o instante da ancora, mantem o comportamento anterior', () => {
    expect(saldoFinal(ancora('2026-09-01T09:00:00.000Z'), pagamento(null))).toBe(1_000_000)
  })

  it('com so o instante do pagamento, mantem o comportamento anterior', () => {
    expect(saldoFinal(ancora(null), pagamento('2026-09-01T18:00:00.000Z'))).toBe(1_000_000)
  })
})

describe('RN-32 em datas diferentes nao depende de instante', () => {
  // O caso 1 da regra: data anterior a ancora, sempre ignorado. O instante
  // nao entra na conta -- se entrasse, um pagamento de ontem as 18h contra
  // uma ancora de hoje as 9h seria descontado indevidamente.
  it('pagamento de dia anterior nunca desconta, mesmo com hora maior', () => {
    const a = ancora('2026-09-01T09:00:00.000Z')
    const o = {
      ...pagamento('2026-08-31T23:00:00.000Z'),
      dataVencimento: '2026-08-31',
      dataPagamento: '2026-08-31',
    } as OcorrenciaResolvida

    expect(saldoFinal(a, o)).toBe(1_000_000)
  })
})
