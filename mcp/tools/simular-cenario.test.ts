import { describe, expect, it } from 'vitest'
import {
  ORCAMENTO_ANCORA_FUTURA,
  ORCAMENTO_SIMPLES,
} from '../fixtures/orcamento-simples.js'
import { simularCenario, type LancamentoHipotetico } from './simular-cenario.js'

const GELADEIRA: LancamentoHipotetico = {
  tipo: 'parcelamento',
  parcelamento: {
    nome: 'Geladeira',
    valorParcelaCentavos: 30000,
    quantidadeParcelas: 6,
    primeiroVencimento: '2026-04-20',
    categoria: null,
  },
}

describe('simularCenario', () => {
  it('devolve os dois cenarios mes a mes', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [GELADEIRA],
      ate: '2026-06',
      hoje: '2026-03-20',
    })

    expect(r.meses.map((m) => m.competencia)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ])
  })

  it('a parcela reduz a sobra a partir do primeiro vencimento', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [GELADEIRA],
      ate: '2026-06',
      hoje: '2026-03-20',
    })

    const marco = r.meses.find((m) => m.competencia === '2026-03')
    const abril = r.meses.find((m) => m.competencia === '2026-04')

    // Marco nao tem parcela: identico nos dois cenarios.
    expect(marco?.diferenca.valorCentavos).toBe(0)
    // Abril tem uma parcela de 300,00 a menos.
    expect(abril?.diferenca.valorCentavos).toBe(-30000)
  })

  it('aceita regra hipotetica', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [
        {
          tipo: 'regra',
          regra: {
            tipo: 'saida',
            nome: 'Academia',
            valorCentavos: 12000,
            valorEhEstimativa: false,
            diaDoMes: 8,
            ajusteFimDeSemana: 'nenhum',
            vigenteDe: '2026-04',
            vigenteAte: null,
            categoria: null,
          },
        },
      ],
      ate: '2026-05',
      hoje: '2026-03-20',
    })

    const abril = r.meses.find((m) => m.competencia === '2026-04')
    expect(abril?.diferenca.valorCentavos).toBe(-12000)
  })

  it('aceita lancamento avulso', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [
        {
          tipo: 'avulso',
          ocorrencia: {
            geradorTipo: 'avulso',
            geradorId: null,
            competencia: '2026-04',
            tipo: 'saida',
            nome: 'Pneu',
            valorPrevistoCentavos: 85000,
            dataVencimento: '2026-04-12',
            dataPagamento: null,
            valorPagoCentavos: null,
            pagamentoRegistradoEm: null,
            ignorado: false,
            observacao: null,
            categoria: null,
          },
        },
      ],
      ate: '2026-04',
      hoje: '2026-03-20',
    })

    const abril = r.meses.find((m) => m.competencia === '2026-04')
    expect(abril?.diferenca.valorCentavos).toBe(-85000)
  })

  it('nao altera nada sem lancamentos', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [],
      ate: '2026-05',
      hoje: '2026-03-20',
    })

    expect(r.meses.every((m) => m.diferenca.valorCentavos === 0)).toBe(true)
  })

  it('e reproduzivel: duas execucoes dao o mesmo resultado', async () => {
    const args = {
      lancamentos: [GELADEIRA],
      ate: '2026-06',
      hoje: '2026-03-20',
    }

    const a = await simularCenario(ORCAMENTO_SIMPLES, args)
    const b = await simularCenario(ORCAMENTO_SIMPLES, args)

    expect(b.meses).toEqual(a.meses)
  })

  it('nao contamina uma simulacao seguinte', async () => {
    await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [GELADEIRA],
      ate: '2026-06',
      hoje: '2026-03-20',
    })

    const limpo = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [],
      ate: '2026-06',
      hoje: '2026-03-20',
    })

    expect(limpo.meses.every((m) => m.diferenca.valorCentavos === 0)).toBe(true)
  })

  it('aponta o primeiro mes negativo de cada cenario', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [
        {
          tipo: 'regra',
          regra: {
            tipo: 'saida',
            nome: 'Absurdo',
            valorCentavos: 900000,
            valorEhEstimativa: false,
            diaDoMes: 20,
            ajusteFimDeSemana: 'nenhum',
            vigenteDe: '2026-04',
            vigenteAte: null,
            categoria: null,
          },
        },
      ],
      ate: '2026-06',
      hoje: '2026-03-20',
    })

    // O gasto absurdo so entra no cenario COM a hipotese: sem ela, o
    // orcamento simples nunca fica negativo na janela.
    expect(r.primeiroMesNegativoComCenario).toBe('2026-04')
    expect(r.primeiroMesNegativoSemCenario).toBeNull()
  })

  it('expoe o dia de saldo minimo dos dois cenarios, nao so do com-cenario', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [
        {
          tipo: 'regra',
          regra: {
            tipo: 'saida',
            nome: 'Absurdo',
            valorCentavos: 900000,
            valorEhEstimativa: false,
            diaDoMes: 2,
            ajusteFimDeSemana: 'nenhum',
            vigenteDe: '2026-04',
            vigenteAte: null,
            categoria: null,
          },
        },
      ],
      ate: '2026-04',
      hoje: '2026-03-20',
    })

    const abril = r.meses.find((m) => m.competencia === '2026-04')

    // O gasto absurdo do dia 2 afunda o saldo COM cenario logo no inicio do
    // mes -- bem abaixo de qualquer minimo que o cenario SEM ele alcance.
    expect(abril?.diaMinimoComCenario.data).toBe('2026-04-02')
    expect(abril?.diaMinimoSemCenario.data).not.toBe(abril?.diaMinimoComCenario.data)
    expect(abril?.diaMinimoComCenario.saldoCentavos).toBeLessThan(
      abril?.diaMinimoSemCenario.saldoCentavos ?? 0,
    )
  })

  it('marca saldoRelativo por mes quando a ancora ainda nao vigorou naquele mes', async () => {
    // Ancora cadastrada em 2026-06-01: para marco e abril ela ainda esta no
    // futuro, entao a curva desses meses parte de zero (RN-30) -- mesmo
    // efeito pratico de nao ter ancora nenhuma, mesmo com ancoras.length > 0.
    const r = await simularCenario(ORCAMENTO_ANCORA_FUTURA, {
      lancamentos: [],
      ate: '2026-03',
      hoje: '2026-03-20',
    })

    expect(r.meses.map((m) => m.saldoRelativo)).toEqual([true])
    expect(r.saldoRelativo).toBe(true)
    expect(r.avisoSaldoRelativo).toMatch(/ancora|âncora/i)
  })

  it('saldoRelativo e falso quando a ancora ja vigora no mes', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [],
      ate: '2026-03',
      hoje: '2026-03-20',
    })

    expect(r.meses.every((m) => !m.saldoRelativo)).toBe(true)
    expect(r.saldoRelativo).toBe(false)
    expect(r.avisoSaldoRelativo).toBeNull()
  })

  it('recusa janela maior que 24 meses', async () => {
    await expect(
      simularCenario(ORCAMENTO_SIMPLES, {
        lancamentos: [],
        ate: '2030-01',
        hoje: '2026-03-20',
      }),
    ).rejects.toThrow(/24/)
  })

  it('recusa "ate" anterior a competencia de hoje, com mensagem acionavel', async () => {
    const chamada = simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [],
      ate: '2026-01',
      hoje: '2026-03-20',
    })

    await expect(chamada).rejects.toThrow(/anterior/i)
    // Nomeia os dois valores em jogo -- e o que torna o erro acionavel em
    // vez de um ErroDeDominio [calendar] cru.
    await expect(chamada).rejects.toThrow(/2026-01/)
    await expect(chamada).rejects.toThrow(/2026-03/)
  })
})
