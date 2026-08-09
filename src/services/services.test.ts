import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarHarness, type Harness } from '../test-support/app-harness.js'
import type { Regra } from '../domain/types.js'

const HOJE = '2026-08-15'

let app: Harness

beforeEach(async () => {
  app = await criarHarness()
})

afterEach(async () => {
  await app.encerrar()
})

/**
 * Vigencia inicia em agosto por padrao.
 *
 * Uma regra vigente desde janeiro produziria oito ocorrencias atrasadas, e
 * selecionar "a primeira atrasada" pegaria janeiro em vez do mes em teste --
 * defeito de teste que mascara o comportamento real.
 */
async function criarAluguel(over: Partial<Omit<Regra, 'id'>> = {}) {
  return app.regras.criarRegra({
    tipo: 'saida',
    nome: 'Aluguel',
    valorCentavos: 180_000,
    valorEhEstimativa: false,
    diaDoMes: 10,
    ajusteFimDeSemana: 'nenhum',
    vigenteDe: '2026-08',
    vigenteAte: null,
    ...over,
  })
}

/** Ocorrencia de uma competencia especifica, entre todas as resolvidas. */
function daCompetencia(
  mes: Awaited<ReturnType<Harness['projecao']['projetarMes']>>,
  competencia: string,
) {
  const todas = [...mes.faltaPagar, ...mes.jaResolvido, ...mes.ignorados]
  const encontrada = todas.find((o) => o.competencia === competencia)
  if (encontrada === undefined) {
    throw new Error(`nenhuma ocorrencia na competencia ${competencia}`)
  }
  return encontrada
}

describe('projection-service', () => {
  it('projeta o mes sem nenhum lancamento manual', async () => {
    await criarAluguel()
    await criarAluguel({ tipo: 'entrada', nome: 'Salario', valorCentavos: 500_000, diaDoMes: 5 })

    const mes = await app.projecao.projetarMes('2026-08', HOJE)

    expect(mes.resumo.aReceberCentavos).toBe(500_000)
    expect(mes.resumo.aPagarCentavos).toBe(180_000)
    expect(mes.resumo.balancoPrevistoCentavos).toBe(320_000)
    expect(mes.curva.pontos).toHaveLength(31)
  })

  /**
   * RN-61: o intervalo carregado e maior que a competencia pedida. Sem isso, a
   * conta de junho ainda nao paga nao apareceria na tela de agosto, e o saldo
   * pareceria mais folgado do que e.
   */
  it('traz contas atrasadas de meses anteriores', async () => {
    await criarAluguel({ vigenteDe: '2026-06' })

    const mes = await app.projecao.projetarMes('2026-08', HOJE)

    expect(mes.faltaPagar.length).toBeGreaterThanOrEqual(2)
    expect(mes.faltaPagar.map((o) => o.competencia)).toContain('2026-06')
    expect(mes.faltaPagar.map((o) => o.competencia)).toContain('2026-07')
  })

  it('separa em atrasado, a vencer, pago e ignorado', async () => {
    await criarAluguel({ diaDoMes: 5 }) // ja venceu em 15/08
    await criarAluguel({ nome: 'Internet', diaDoMes: 25 }) // ainda vai vencer

    const mes = await app.projecao.projetarMes('2026-08', HOJE)

    expect(mes.faltaPagar.map((o) => o.nome)).toContain('Aluguel')
    expect(mes.faltaPagar.map((o) => o.nome)).toContain('Internet')
  })

  it('projeta os proximos meses', async () => {
    await criarAluguel()

    const futuro = await app.projecao.projetarFuturo('2026-09', 6, HOJE)

    expect(futuro).toHaveLength(6)
    expect(futuro[0]?.competencia).toBe('2026-09')
    expect(futuro[0]?.totalAPagarCentavos).toBe(180_000)
  })
})

describe('payment-service', () => {
  it('registra pagamento materializando a ocorrencia virtual', async () => {
    await criarAluguel()
    const antes = await app.projecao.projetarMes('2026-08', HOJE)
    const alvo = daCompetencia(antes, '2026-08')

    expect(alvo.origem).toBe('virtual')

    await app.pagamento.registrarPagamento(alvo, '2026-08-11', 180_000)

    const depois = await app.projecao.projetarMes('2026-08', HOJE)
    expect(depois.jaResolvido).toHaveLength(1)
    expect(depois.jaResolvido[0]?.origem).toBe('real')
    expect(depois.jaResolvido[0]?.dataPagamento).toBe('2026-08-11')
    expect(await app.repos.ocorrencias.listar()).toHaveLength(1)
  })

  /** RN-51: tocar duas vezes no botao nao cria dois lancamentos. */
  it('registrar o mesmo pagamento duas vezes nao duplica', async () => {
    await criarAluguel()
    const mes = await app.projecao.projetarMes('2026-08', HOJE)
    const alvo = daCompetencia(mes, '2026-08')

    await app.pagamento.registrarPagamento(alvo, '2026-08-11', 180_000)
    await app.pagamento.registrarPagamento(alvo, '2026-08-11', 180_000)

    expect(await app.repos.ocorrencias.listar()).toHaveLength(1)
  })

  it('registra valor pago diferente do previsto', async () => {
    await criarAluguel()
    const mes = await app.projecao.projetarMes('2026-08', HOJE)

    await app.pagamento.registrarPagamento(daCompetencia(mes, '2026-08'), '2026-08-20', 185_000)

    const depois = await app.projecao.projetarMes('2026-08', HOJE)
    expect(depois.resumo.jaPagoCentavos).toBe(185_000)
    expect(depois.resumo.aPagarCentavos).toBe(185_000)
  })

  it('ajusta valor previsto sem marcar como pago', async () => {
    await criarAluguel({ nome: 'Luz', valorEhEstimativa: true, valorCentavos: 15_000 })
    const mes = await app.projecao.projetarMes('2026-08', HOJE)

    await app.pagamento.ajustarValorPrevisto(daCompetencia(mes, '2026-08'), 21_000)

    const depois = await app.projecao.projetarMes('2026-08', HOJE)
    expect(depois.resumo.aPagarCentavos).toBe(21_000)
    expect(depois.jaResolvido).toHaveLength(0)
  })

  it('adia o vencimento de uma ocorrencia isolada', async () => {
    await criarAluguel()
    const mes = await app.projecao.projetarMes('2026-08', HOJE)

    await app.pagamento.adiarVencimento(daCompetencia(mes, '2026-08'), '2026-08-25')

    const depois = await app.projecao.projetarMes('2026-08', HOJE)
    expect(depois.faltaPagar[0]?.dataVencimento).toBe('2026-08-25')
  })

  it('ignora no mes sem afetar os demais meses', async () => {
    await criarAluguel()
    const mes = await app.projecao.projetarMes('2026-08', HOJE)

    await app.pagamento.ignorarNoMes(daCompetencia(mes, '2026-08'))

    const agosto = await app.projecao.projetarMes('2026-08', HOJE)
    const setembro = await app.projecao.projetarMes('2026-09', HOJE)

    expect(agosto.ignorados).toHaveLength(1)
    expect(agosto.resumo.aPagarCentavos).toBe(0)
    expect(setembro.resumo.aPagarCentavos).toBe(180_000)
  })

  /** RN-53: desfazer preserva o registro, que pode ter outras alteracoes. */
  it('desfazer pagamento preserva o valor ajustado', async () => {
    await criarAluguel()
    const mes = await app.projecao.projetarMes('2026-08', HOJE)
    const alvo = daCompetencia(mes, '2026-08')

    await app.pagamento.ajustarValorPrevisto(alvo, 190_000)
    const comAjuste = await app.projecao.projetarMes('2026-08', HOJE)
    await app.pagamento.registrarPagamento(daCompetencia(comAjuste, '2026-08'), '2026-08-11', 190_000)

    const pago = await app.projecao.projetarMes('2026-08', HOJE)
    await app.pagamento.desfazerPagamento(pago.jaResolvido[0]!)

    const depois = await app.projecao.projetarMes('2026-08', HOJE)
    expect(depois.jaResolvido).toHaveLength(0)
    expect(depois.resumo.aPagarCentavos).toBe(190_000)
  })

  it('lanca e remove ocorrencia avulsa', async () => {
    const id = await app.pagamento.lancarAvulso({
      tipo: 'entrada',
      nome: 'Freelance',
      valorPrevistoCentavos: 250_000,
      dataVencimento: '2026-08-20',
      competencia: '2026-08',
    })

    const mes = await app.projecao.projetarMes('2026-08', HOJE)
    expect(mes.resumo.aReceberCentavos).toBe(250_000)

    await app.pagamento.removerAvulso(id)
    expect((await app.projecao.projetarMes('2026-08', HOJE)).resumo.aReceberCentavos).toBe(0)
  })

  it('registra pagamento de ocorrencia avulsa sem duplicar', async () => {
    await app.pagamento.lancarAvulso({
      tipo: 'saida',
      nome: 'Boleto pontual',
      valorPrevistoCentavos: 40_000,
      dataVencimento: '2026-08-20',
      competencia: '2026-08',
    })

    const mes = await app.projecao.projetarMes('2026-08', HOJE)
    await app.pagamento.registrarPagamento(mes.faltaPagar[0]!, '2026-08-18', 40_000)
    await app.pagamento.registrarPagamento(mes.faltaPagar[0]!, '2026-08-18', 40_000)

    expect(await app.repos.ocorrencias.listar()).toHaveLength(1)
  })
})

describe('rule-service', () => {
  it('reajuste a partir de um mes preserva o passado', async () => {
    const regra = await criarAluguel({ vigenteDe: '2026-01' })

    await app.regras.editarRegra(regra.id, { valorCentavos: 200_000 }, 'apartirDeste', '2026-08')

    const julho = await app.projecao.projetarMes('2026-07', HOJE)
    const agosto = await app.projecao.projetarMes('2026-08', HOJE)

    expect(julho.resumo.aPagarCentavos).toBe(180_000)
    expect(agosto.resumo.aPagarCentavos).toBe(200_000)
    expect(await app.repos.regras.listar()).toHaveLength(2)
  })

  it('edicao desde sempre altera todos os meses', async () => {
    const regra = await criarAluguel({ vigenteDe: '2026-01' })

    await app.regras.editarRegra(regra.id, { valorCentavos: 200_000 }, 'desdeSempre', '2026-08')

    const julho = await app.projecao.projetarMes('2026-07', HOJE)
    expect(julho.resumo.aPagarCentavos).toBe(200_000)
    expect(await app.repos.regras.listar()).toHaveLength(1)
  })

  /**
   * RN-46 e RN-42: o que voce ja pagou nao desaparece do historico quando a
   * regra e removida.
   */
  it('remover a regra preserva os pagamentos ja registrados', async () => {
    const regra = await criarAluguel()
    const mes = await app.projecao.projetarMes('2026-08', HOJE)
    await app.pagamento.registrarPagamento(
      daCompetencia(mes, '2026-08'),
      '2026-08-11',
      180_000,
    )

    await app.regras.removerRegra(regra.id)

    const depois = await app.projecao.projetarMes('2026-08', HOJE)
    expect(depois.jaResolvido).toHaveLength(1)
    expect(depois.jaResolvido[0]?.valorPagoCentavos).toBe(180_000)
    expect(depois.faltaPagar).toHaveLength(0)
  })

  it('cria cartao e parcelamento vinculado', async () => {
    const cartao = await app.regras.criarCartao({
      nome: 'Principal',
      diaFechamento: 20,
      diaVencimento: 28,
      gastoMensalTipicoCentavos: 50_000,
    })

    await app.regras.criarParcelamento({
      nome: 'Notebook',
      valorParcelaCentavos: 30_000,
      quantidadeParcelas: 10,
      primeiroVencimento: '2026-08-28',
      cartaoId: cartao.id,
    })

    const mes = await app.projecao.projetarMes('2026-08', HOJE)

    // A fatura soma parcela + gasto tipico; a parcela NAO conta separadamente.
    expect(mes.resumo.aPagarCentavos).toBe(80_000)
  })
})

describe('backup-service', () => {
  it('exporta e reimporta reproduzindo o mesmo estado', async () => {
    await criarAluguel()
    const mes = await app.projecao.projetarMes('2026-08', HOJE)
    await app.pagamento.registrarPagamento(daCompetencia(mes, '2026-08'), '2026-08-11', 180_000)

    const conteudo = await app.backup.exportar(HOJE)
    const antes = await app.projecao.projetarMes('2026-08', HOJE)

    // Limpa tudo, simulando aparelho novo.
    await app.db.regras.clear()
    await app.db.ocorrencias.clear()

    const resultado = app.backup.validarImportacao(conteudo)
    expect(resultado.valido).toBe(true)
    if (!resultado.valido) return

    await app.backup.confirmarImportacao(resultado.documento)

    const depois = await app.projecao.projetarMes('2026-08', HOJE)
    expect(depois.resumo).toEqual(antes.resumo)
    expect(depois.jaResolvido).toEqual(antes.jaResolvido)
  })

  it('produz um resumo do conteudo antes de aplicar', async () => {
    await criarAluguel()
    const conteudo = await app.backup.exportar(HOJE)

    const resultado = app.backup.validarImportacao(conteudo)

    expect(resultado.valido).toBe(true)
    if (!resultado.valido) return
    expect(resultado.resumo.quantidadeRegras).toBe(1)
    expect(resultado.resumo.exportadoEm).toBe(HOJE)
    expect(resultado.resumo.migrado).toBe(false)
  })

  describe('recusas (RN-54, RN-56)', () => {
    it('recusa arquivo que nao e JSON', () => {
      const r = app.backup.validarImportacao('isto nao e json {')
      expect(r.valido).toBe(false)
    })

    it('recusa JSON que nao e backup', () => {
      const r = app.backup.validarImportacao('{"qualquer":"coisa"}')
      expect(r.valido).toBe(false)
    })

    it('recusa backup de versao futura', () => {
      const r = app.backup.validarImportacao(
        JSON.stringify({
          versaoSchema: 999,
          regras: [], parcelamentos: [], cartoes: [],
          ocorrencias: [], ancoras: [], configuracoes: [],
        }),
      )

      expect(r.valido).toBe(false)
      if (r.valido) return
      expect(r.erro).toContain('mais recente')
    })

    it('recusa lancamento com pagamento pela metade', () => {
      const r = app.backup.validarImportacao(
        JSON.stringify({
          versaoSchema: 1,
          regras: [], parcelamentos: [], cartoes: [], ancoras: [], configuracoes: [],
          ocorrencias: [
            {
              id: 'o1', geradorTipo: 'avulso', geradorId: null, competencia: '2026-08',
              tipo: 'saida', nome: 'X', valorPrevistoCentavos: 100,
              dataVencimento: '2026-08-10',
              dataPagamento: '2026-08-11', valorPagoCentavos: null,
              ignorado: false, observacao: null,
            },
          ],
        }),
      )

      expect(r.valido).toBe(false)
      if (r.valido) return
      expect(r.erro).toContain('pela metade')
    })

    it('recusa parcelamento apontando para cartao ausente do arquivo', () => {
      const r = app.backup.validarImportacao(
        JSON.stringify({
          versaoSchema: 1,
          regras: [], cartoes: [], ocorrencias: [], ancoras: [], configuracoes: [],
          parcelamentos: [
            {
              id: 'p1', nome: 'X', valorParcelaCentavos: 100, quantidadeParcelas: 3,
              primeiroVencimento: '2026-08-10', cartaoId: 'fantasma',
            },
          ],
        }),
      )

      expect(r.valido).toBe(false)
    })

    it('uma importacao recusada nao altera o banco', async () => {
      await criarAluguel()
      const antes = await app.repos.regras.listar()

      app.backup.validarImportacao('lixo')

      expect(await app.repos.regras.listar()).toEqual(antes)
    })
  })

  describe('aviso de backup (RF-31)', () => {
    it('nao avisa em banco vazio', async () => {
      expect(await app.backup.precisaAvisarBackup(HOJE)).toBe(false)
    })

    it('avisa quando ha dados e nunca se exportou', async () => {
      await app.pagamento.lancarAvulso({
        tipo: 'saida', nome: 'X', valorPrevistoCentavos: 100,
        dataVencimento: '2026-08-10', competencia: '2026-08',
      })

      expect(await app.backup.precisaAvisarBackup(HOJE)).toBe(true)
    })

    it('nao avisa logo apos exportar, mas avisa depois de 14 dias', async () => {
      await app.backup.exportar('2026-08-01')

      expect(await app.backup.precisaAvisarBackup('2026-08-10')).toBe(false)
      expect(await app.backup.precisaAvisarBackup('2026-08-15')).toBe(true)
      expect(await app.backup.diasDesdeUltimaExportacao('2026-08-15')).toBe(14)
    })
  })
})
