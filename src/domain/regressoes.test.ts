/**
 * Testes dos defeitos de dominio encontrados na revisao.
 */

import { describe, expect, it } from 'vitest'
import { expandirRegras } from './rule-expander.js'
import { resolver } from './occurrence-resolver.js'
import { projetarCurva } from './balance-projector.js'
import { aplicarAjuste, competenciaDe } from './calendar.js'
import type { AncoraSaldo, Regra } from './types.js'

const ANCORA: AncoraSaldo = {
  id: 'a',
  data: '2026-08-01',
  saldoCentavos: 100_000,
  declaradaEm: null,
}

function regra(over: Partial<Regra> = {}): Regra {
  return {
    id: 'r1',
    tipo: 'saida',
    nome: 'Item',
    valorCentavos: 100_000,
    valorEhEstimativa: false,
    diaDoMes: 10,
    ajusteFimDeSemana: 'nenhum',
    vigenteDe: '2026-01',
    vigenteAte: null,
    categoria: null,
    ...over,
  }
}

describe('entrada vencida nunca e divida (revisao, RN-90)', () => {
  const salario = regra({ tipo: 'entrada', nome: 'Salário', diaDoMes: 5 })
  const aluguel = regra({ id: 'r2', tipo: 'saida', nome: 'Aluguel', diaDoMes: 10 })

  it('salario vencido fica a confirmar; conta vencida fica atrasada', () => {
    const resolvidas = resolver(expandirRegras([salario, aluguel], ['2026-08']), [], '2026-08-15')

    const porNome = new Map(resolvidas.map((o) => [o.nome, o.situacao]))
    expect(porNome.get('Salário')).toBe('a_confirmar')
    expect(porNome.get('Aluguel')).toBe('atrasado')
  })

  /**
   * O sintoma que motivou a revisao: com a regra vigente ha meses, cada
   * salario nao confirmado de cada mes anterior aparecia como divida, e a
   * lista de "atrasado" perdia o sentido.
   */
  it('nenhum salario de meses anteriores e rotulado como atrasado', () => {
    const meses = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
    const resolvidas = resolver(expandirRegras([salario], meses), [], '2026-08-15')

    expect(resolvidas).toHaveLength(8)
    expect(resolvidas.every((o) => o.situacao === 'a_confirmar')).toBe(true)
    expect(resolvidas.some((o) => o.situacao === 'atrasado')).toBe(false)
  })

  /**
   * Coerente com "assume que caiu": a entrada antiga ja esta refletida no
   * saldo declarado, e empurra-la para hoje inflaria o saldo com um salario
   * que ja foi recebido e gasto.
   */
  it('entrada antiga nao confirmada nao e somada de novo ao saldo de hoje', () => {
    const antigas = resolver(expandirRegras([salario], ['2026-06']), [], '2026-08-15')
    const curva = projetarCurva(antigas, ANCORA, '2026-08', '2026-08-15')

    expect(curva.pontos[0]?.saldoCentavos).toBe(100_000)
  })

  it('saida antiga nao paga continua afundando o saldo de hoje', () => {
    const antigas = resolver(expandirRegras([aluguel], ['2026-06']), [], '2026-08-15')
    const curva = projetarCurva(antigas, ANCORA, '2026-08', '2026-08-15')

    expect(curva.pontos[0]?.saldoCentavos).toBe(0)
  })
})

describe('ocorrencia antecipada para o mes anterior (revisao #1)', () => {
  /**
   * 2026-08-01 e sabado. Um salario do dia 1 com `antecipa` -- o padrao
   * sugerido para entradas -- vence em 31 de julho.
   *
   * A competencia continua sendo agosto (RN-08), entao a projecao de JULHO
   * precisa carregar o mes seguinte para alcanca-lo. Sem isso, o salario sumia
   * da curva de julho.
   */
  it('o vencimento cai no mes anterior a competencia', () => {
    expect(aplicarAjuste('2026-08-01', 'antecipa')).toBe('2026-07-31')

    const [ocorrencia] = expandirRegras(
      [regra({ tipo: 'entrada', diaDoMes: 1, ajusteFimDeSemana: 'antecipa' })],
      ['2026-08'],
    )

    expect(ocorrencia?.competencia).toBe('2026-08')
    expect(ocorrencia?.dataVencimento).toBe('2026-07-31')
    expect(competenciaDe(ocorrencia?.dataVencimento ?? '')).toBe('2026-07')
  })

  it('a curva de julho inclui a ocorrencia antecipada de agosto', () => {
    const deAgosto = resolver(
      expandirRegras(
        [regra({ tipo: 'entrada', valorCentavos: 300_000, diaDoMes: 1, ajusteFimDeSemana: 'antecipa' })],
        ['2026-08'],
      ),
      [],
      '2026-08-15',
    )

    const curva = projetarCurva(
      deAgosto,
      { id: 'a', data: '2026-07-01', saldoCentavos: 0, declaradaEm: null },
      '2026-07',
      '2026-08-15',
    )

    expect(curva.pontos[curva.pontos.length - 1]?.saldoCentavos).toBe(300_000)
  })
})

