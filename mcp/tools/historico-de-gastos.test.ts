import { describe, expect, it } from 'vitest'
import { criarAppDoBackup } from '../app-em-memoria.js'
import { ORCAMENTO_SIMPLES } from '../fixtures/orcamento-simples.js'
import { historicoDeGastos } from './historico-de-gastos.js'
import type { DocumentoBackup } from '../../src/data/backup-serializer.js'

/** Tres meses de luz paga, com valores diferentes, mais um salario recebido. */
const COM_HISTORICO: DocumentoBackup = {
  ...ORCAMENTO_SIMPLES,
  ocorrencias: [
    ...['2026-01', '2026-02', '2026-03'].map((c, i) => ({
      id: `o-luz-${c}`,
      geradorTipo: 'regra' as const,
      geradorId: 'r-luz',
      competencia: c,
      tipo: 'saida' as const,
      nome: 'Luz',
      valorPrevistoCentavos: 22000,
      dataVencimento: `${c}-15`,
      dataPagamento: `${c}-14`,
      valorPagoCentavos: 20000 + i * 10000,
      pagamentoRegistradoEm: null,
      ignorado: false,
      observacao: null,
      categoria: null,
    })),
    {
      id: 'o-salario-2026-02',
      geradorTipo: 'regra',
      geradorId: 'r-salario',
      competencia: '2026-02',
      tipo: 'entrada',
      nome: 'Salario',
      valorPrevistoCentavos: 500000,
      dataVencimento: '2026-02-05',
      dataPagamento: '2026-02-05',
      valorPagoCentavos: 500000,
      pagamentoRegistradoEm: null,
      ignorado: false,
      observacao: null,
      categoria: null,
    },
  ],
}

describe('historicoDeGastos', () => {
  it('agrega por nome usando o valor pago', async () => {
    const app = await criarAppDoBackup(COM_HISTORICO)

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-03-20' })
    const luz = r.itens.find((i) => i.nome === 'Luz')

    // 200,00 + 300,00 + 400,00
    expect(luz?.total.valorCentavos).toBe(90000)
    expect(luz?.media.valorCentavos).toBe(30000)
    await app.encerrar()
  })

  it('devolve a serie mensal em ordem cronologica', async () => {
    const app = await criarAppDoBackup(COM_HISTORICO)

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-03-20' })
    const luz = r.itens.find((i) => i.nome === 'Luz')

    expect(luz?.meses.map((m) => m.competencia)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ])
    expect(luz?.meses.map((m) => m.total.valorCentavos)).toEqual([20000, 30000, 40000])
    await app.encerrar()
  })

  it('exclui entradas: salario nao e gasto', async () => {
    const app = await criarAppDoBackup(COM_HISTORICO)

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-03-20' })

    expect(r.itens.map((i) => i.nome)).not.toContain('Salario')
    await app.encerrar()
  })

  it('exclui o que nao foi pago', async () => {
    const app = await criarAppDoBackup(COM_HISTORICO)

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-03-20' })

    // O aluguel e recorrente mas nunca teve pagamento registrado.
    expect(r.itens.map((i) => i.nome)).not.toContain('Aluguel')
    await app.encerrar()
  })

  it('filtra por nome sem diferenciar maiuscula', async () => {
    const app = await criarAppDoBackup(COM_HISTORICO)

    const r = await historicoDeGastos(app, { meses: 6, nome: 'luz', hoje: '2026-03-20' })

    expect(r.itens).toHaveLength(1)
    expect(r.itens[0]?.nome).toBe('Luz')
    await app.encerrar()
  })

  it('respeita a janela de meses', async () => {
    const app = await criarAppDoBackup(COM_HISTORICO)

    // Janela de 1 mes a partir de marco: so a luz de marco.
    const r = await historicoDeGastos(app, { meses: 1, hoje: '2026-03-20' })
    const luz = r.itens.find((i) => i.nome === 'Luz')

    expect(luz?.total.valorCentavos).toBe(40000)
    expect(r.de).toBe('2026-03')
    expect(r.ate).toBe('2026-03')
    await app.encerrar()
  })

  it('ordena do maior gasto para o menor', async () => {
    const app = await criarAppDoBackup({
      ...COM_HISTORICO,
      ocorrencias: [
        ...COM_HISTORICO.ocorrencias,
        {
          id: 'o-aluguel-2026-03',
          geradorTipo: 'regra',
          geradorId: 'r-aluguel',
          competencia: '2026-03',
          tipo: 'saida',
          nome: 'Aluguel',
          valorPrevistoCentavos: 180000,
          dataVencimento: '2026-03-10',
          dataPagamento: '2026-03-10',
          valorPagoCentavos: 180000,
          pagamentoRegistradoEm: null,
          ignorado: false,
          observacao: null,
          categoria: null,
        },
      ],
    })

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-03-20' })

    expect(r.itens[0]?.nome).toBe('Aluguel')
    await app.encerrar()
  })

  it('devolve lista vazia quando nao ha gasto pago na janela', async () => {
    const app = await criarAppDoBackup({ ...COM_HISTORICO, ocorrencias: [] })

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-03-20' })

    expect(r.itens).toEqual([])
    expect(r.totalGeral.valorCentavos).toBe(0)
    await app.encerrar()
  })
})
