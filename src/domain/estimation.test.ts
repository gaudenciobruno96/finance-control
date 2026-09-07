import { describe, expect, it } from 'vitest'
import { MESES_PADRAO, mediaDosUltimosPagos } from './estimation.js'
import type { Ocorrencia } from './types.js'

function paga(
  competencia: string,
  dataPagamento: string,
  valorPagoCentavos: number,
  over: Partial<Ocorrencia> = {},
): Ocorrencia {
  return {
    id: `o-${competencia}`,
    geradorTipo: 'regra',
    geradorId: 'luz',
    competencia,
    tipo: 'saida',
    nome: 'Conta de luz',
    valorPrevistoCentavos: 15_000,
    dataVencimento: `${competencia}-10`,
    dataPagamento,
    valorPagoCentavos,
    pagamentoRegistradoEm: null,
    ignorado: false,
    observacao: null,
    categoria: null,
    ...over,
  }
}

describe('estimation', () => {
  it('calcula a media dos ultimos tres pagamentos', () => {
    const historico = [
      paga('2026-05', '2026-05-10', 12_000),
      paga('2026-06', '2026-06-10', 15_000),
      paga('2026-07', '2026-07-10', 18_000),
    ]

    expect(mediaDosUltimosPagos(historico, 'luz')).toBe(15_000)
  })

  /** RN-38: sugerir a media de um unico mes daria falsa impressao de tendencia. */
  it('devolve nulo quando nao ha amostras suficientes', () => {
    const historico = [
      paga('2026-06', '2026-06-10', 15_000),
      paga('2026-07', '2026-07-10', 18_000),
    ]

    expect(mediaDosUltimosPagos(historico, 'luz')).toBeNull()
    expect(mediaDosUltimosPagos([], 'luz')).toBeNull()
  })

  it('considera apenas os mais recentes quando ha mais que o necessario', () => {
    const historico = [
      paga('2026-01', '2026-01-10', 100_000),
      paga('2026-05', '2026-05-10', 12_000),
      paga('2026-06', '2026-06-10', 15_000),
      paga('2026-07', '2026-07-10', 18_000),
    ]

    expect(mediaDosUltimosPagos(historico, 'luz')).toBe(15_000)
  })

  it('nao depende da ordem do historico recebido', () => {
    const historico = [
      paga('2026-07', '2026-07-10', 18_000),
      paga('2026-05', '2026-05-10', 12_000),
      paga('2026-06', '2026-06-10', 15_000),
    ]

    expect(mediaDosUltimosPagos(historico, 'luz')).toBe(15_000)
  })

  /** RN-39: interessa quanto a conta custou, nao quanto se esperava que custasse. */
  it('usa o valor pago, nao o previsto', () => {
    const historico = [
      paga('2026-05', '2026-05-10', 12_000, { valorPrevistoCentavos: 99_999 }),
      paga('2026-06', '2026-06-10', 15_000, { valorPrevistoCentavos: 99_999 }),
      paga('2026-07', '2026-07-10', 18_000, { valorPrevistoCentavos: 99_999 }),
    ]

    expect(mediaDosUltimosPagos(historico, 'luz')).toBe(15_000)
  })

  it('ignora ocorrencias de outras regras', () => {
    const historico = [
      paga('2026-05', '2026-05-10', 12_000),
      paga('2026-06', '2026-06-10', 15_000),
      paga('2026-07', '2026-07-10', 18_000),
      paga('2026-07', '2026-07-11', 999_999, { geradorId: 'agua', id: 'outro' }),
    ]

    expect(mediaDosUltimosPagos(historico, 'luz')).toBe(15_000)
  })

  it('ignora ocorrencias nao pagas e ignoradas', () => {
    const historico = [
      paga('2026-05', '2026-05-10', 12_000),
      paga('2026-06', '2026-06-10', 15_000),
      paga('2026-07', '2026-07-10', 18_000),
      { ...paga('2026-08', '2026-08-10', 999_999), ignorado: true },
      { ...paga('2026-08', '2026-08-11', 0), id: 'nao-paga', dataPagamento: null, valorPagoCentavos: null },
    ]

    expect(mediaDosUltimosPagos(historico, 'luz')).toBe(15_000)
  })

  it('aceita quantidade de meses configuravel', () => {
    const historico = [
      paga('2026-06', '2026-06-10', 10_000),
      paga('2026-07', '2026-07-10', 20_000),
    ]

    expect(mediaDosUltimosPagos(historico, 'luz', 2)).toBe(15_000)
    expect(MESES_PADRAO).toBe(3)
  })

  it('arredonda para o centavo mais proximo', () => {
    const historico = [
      paga('2026-05', '2026-05-10', 10_000),
      paga('2026-06', '2026-06-10', 10_000),
      paga('2026-07', '2026-07-10', 10_001),
    ]

    expect(mediaDosUltimosPagos(historico, 'luz')).toBe(10_000)
    expect(Number.isInteger(mediaDosUltimosPagos(historico, 'luz'))).toBe(true)
  })
})
