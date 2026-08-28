import { describe, expect, it } from 'vitest'
import { criarAppDoBackup } from './app-em-memoria.js'
import { ORCAMENTO_SIMPLES } from './fixtures/orcamento-simples.js'

describe('criarAppDoBackup', () => {
  it('carrega as regras do documento no banco', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const regras = await app.repos.regras.listar()
    expect(regras.map((r) => r.nome).sort()).toEqual(['Aluguel', 'Luz', 'Salario'])

    app.encerrar()
  })

  it('monta o servico de projecao sobre os dados carregados', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const mes = await app.projecao.projetarMes('2026-03', '2026-03-20')

    // Aluguel do dia 10 ja passou e nao foi pago: continua devido.
    expect(mes.faltaPagar.map((o) => o.nome)).toContain('Aluguel')
    // A luz foi paga por 245,90 -- o valor pago prevalece sobre o previsto.
    expect(mes.totalJaResolvidoCentavos).toBe(24590)
    expect(mes.saldoRelativo).toBe(false)

    app.encerrar()
  })

  it('isola bancos entre chamadas', async () => {
    const a = await criarAppDoBackup(ORCAMENTO_SIMPLES)
    const b = await criarAppDoBackup({
      ...ORCAMENTO_SIMPLES,
      regras: [],
      ocorrencias: [],
    })

    expect(await a.repos.regras.listar()).toHaveLength(3)
    expect(await b.repos.regras.listar()).toHaveLength(0)

    a.encerrar()
    b.encerrar()
  })

  it('migra documento de schema anterior', async () => {
    // Versao 1 trazia cartaoId no parcelamento. migrarDocumento remove.
    const antigo = {
      ...ORCAMENTO_SIMPLES,
      versaoSchema: 1,
      parcelamentos: [
        {
          id: 'p-1',
          nome: 'Geladeira',
          valorParcelaCentavos: 30000,
          quantidadeParcelas: 10,
          primeiroVencimento: '2026-03-20',
          cartaoId: 'c-1',
        },
      ],
    } as unknown as typeof ORCAMENTO_SIMPLES

    const app = await criarAppDoBackup(antigo)

    const [p] = await app.repos.parcelamentos.listar()
    expect(p).toBeDefined()
    expect(p).not.toHaveProperty('cartaoId')

    app.encerrar()
  })
})
