import { describe, expect, it } from 'vitest'
import { criarAppDoBackup } from '../app-em-memoria.js'
import { ORCAMENTO_SIMPLES } from '../fixtures/orcamento-simples.js'
import { oQueVence } from './o-que-vence.js'

describe('oQueVence', () => {
  it('separa o que ja venceu do que ainda vai vencer', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    // Em 20 de marco: aluguel do dia 10 esta atrasado; nada mais vence ate 27.
    const r = await oQueVence(app, { dias: 7, hoje: '2026-03-20' })

    expect(r.atrasado.map((i) => i.nome)).toContain('Aluguel')
    expect(r.aPagar.map((i) => i.nome)).not.toContain('Aluguel')
    await app.encerrar()
  })

  it('inclui o que vence dentro da janela', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    // Em 8 de marco, o aluguel do dia 10 esta dentro de 7 dias. A regra vige
    // desde janeiro sem baixa registrada para jan/fev, entao ha divida
    // legitima de meses anteriores em `atrasado` -- o teste verifica que o
    // ALUGUEL DESTE MES (ainda nao vencido) nao esta nele, e nao que o grupo
    // inteiro esteja vazio.
    const r = await oQueVence(app, { dias: 7, hoje: '2026-03-08' })

    expect(r.aPagar.map((i) => i.nome)).toContain('Aluguel')
    expect(r.atrasado.some((i) => i.competencia === '2026-03')).toBe(false)
    await app.encerrar()
  })

  it('exclui o que vence depois da janela', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await oQueVence(app, { dias: 1, hoje: '2026-03-08' })

    expect(r.aPagar.map((i) => i.nome)).not.toContain('Aluguel')
    await app.encerrar()
  })

  it('nunca rotula entrada como atrasada (RN-90)', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    // Salario do dia 5 nao foi confirmado, e ja e dia 20.
    const r = await oQueVence(app, { dias: 7, hoje: '2026-03-20' })

    expect(r.atrasado.every((i) => i.tipo === 'saida')).toBe(true)
    expect(r.aConfirmar.map((i) => i.nome)).toContain('Salario')
    await app.encerrar()
  })

  it('usa 7 dias por padrao', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await oQueVence(app, { hoje: '2026-03-08' })

    expect(r.dias).toBe(7)
    expect(r.ate).toBe('2026-03-15')
    await app.encerrar()
  })

  it('soma os totais de cada grupo', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await oQueVence(app, { dias: 7, hoje: '2026-03-20' })

    expect(r.totalAtrasado.valorCentavos).toBe(
      r.atrasado.reduce((t, i) => t + i.valorCentavos, 0),
    )
    expect(r.totalAPagar.valorCentavos).toBe(
      r.aPagar.reduce((t, i) => t + i.valorCentavos, 0),
    )
    await app.encerrar()
  })

  it('exclui o item ignorado da lista de atrasados', async () => {
    const app = await criarAppDoBackup({
      ...ORCAMENTO_SIMPLES,
      ocorrencias: [
        ...ORCAMENTO_SIMPLES.ocorrencias,
        {
          id: 'o-aluguel-marco',
          geradorTipo: 'regra',
          geradorId: 'r-aluguel',
          competencia: '2026-03',
          tipo: 'saida',
          nome: 'Aluguel',
          valorPrevistoCentavos: 180000,
          dataVencimento: '2026-03-10',
          dataPagamento: null,
          valorPagoCentavos: null,
          pagamentoRegistradoEm: null,
          ignorado: true,
          observacao: null,
        },
      ],
    })

    const r = await oQueVence(app, { dias: 7, hoje: '2026-03-20' })

    // A regra vige desde janeiro sem baixa em jan/fev, entao 'Aluguel' de
    // meses anteriores ja e divida legitima em `atrasado` -- filtrar so por
    // nome nao provaria nada sobre o item ignorado. O que importa e que o
    // ALUGUEL DESTE MES (marcado ignorado) nao aparece.
    expect(r.atrasado.some((i) => i.competencia === '2026-03')).toBe(false)
    await app.encerrar()
  })

  it('nao conta duas vezes uma divida antiga quando a janela cruza a virada do mes', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    // Em 28 de marco, janela de 10 dias cai em 7 de abril: a consulta projeta
    // marco E abril. O aluguel de fevereiro (regra vigente desde janeiro, sem
    // baixa) esta atrasado nas DUAS projecoes -- sem a deduplicacao por
    // chave, apareceria duplicado em `atrasado`.
    const r = await oQueVence(app, { dias: 10, hoje: '2026-03-28' })

    expect(r.ate).toBe('2026-04-07')
    const alugueisDeFevereiro = r.atrasado.filter(
      (i) => i.nome === 'Aluguel' && i.competencia === '2026-02',
    )
    expect(alugueisDeFevereiro).toHaveLength(1)
    await app.encerrar()
  })

  it('nao perde o mes do meio numa janela de tres meses', async () => {
    const app = await criarAppDoBackup({
      ...ORCAMENTO_SIMPLES,
      ocorrencias: [
        ...ORCAMENTO_SIMPLES.ocorrencias,
        {
          id: 'o-manutencao-fev',
          geradorTipo: 'avulso',
          geradorId: null,
          competencia: '2026-02',
          tipo: 'saida',
          nome: 'Manutencao',
          valorPrevistoCentavos: 35000,
          dataVencimento: '2026-02-20',
          dataPagamento: null,
          valorPagoCentavos: null,
          pagamentoRegistradoEm: null,
          ignorado: false,
          observacao: null,
        },
      ],
    })

    // Janela de 90 dias a partir de 15 de janeiro cobre jan, fev, mar e abr
    // (ate = 15 de abril). A Manutencao de fevereiro nao pertence nem a
    // competencia de hoje (janeiro) nem a de `ate` (abril): projetar so as
    // duas pontas a fazia sumir em silencio.
    const r = await oQueVence(app, { dias: 90, hoje: '2026-01-15' })

    expect(r.ate).toBe('2026-04-15')
    expect(r.aPagar.map((i) => i.nome)).toContain('Manutencao')
    await app.encerrar()
  })
})
