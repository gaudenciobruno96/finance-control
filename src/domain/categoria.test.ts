import { describe, expect, it } from 'vitest'
import { expandirRegras } from './rule-expander.js'
import { expandirParcelamentos } from './installment-expander.js'
import { resolver } from './occurrence-resolver.js'
import { CATEGORIAS } from './types.js'
import type { Ocorrencia, Parcelamento, Regra } from './types.js'

const INTERVALO = ['2026-09'] as const

function regra(over: Partial<Regra> = {}): Regra {
  return {
    id: 'r-1',
    tipo: 'saida',
    nome: 'Aluguel',
    valorCentavos: 180_000,
    valorEhEstimativa: false,
    diaDoMes: 10,
    ajusteFimDeSemana: 'nenhum',
    vigenteDe: '2026-09',
    vigenteAte: null,
    categoria: 'moradia',
    ...over,
  }
}

function parcelamento(over: Partial<Parcelamento> = {}): Parcelamento {
  return {
    id: 'p-1',
    nome: 'Geladeira',
    valorParcelaCentavos: 30_000,
    quantidadeParcelas: 3,
    primeiroVencimento: '2026-09-20',
    categoria: 'compras',
    ...over,
  }
}

describe('CATEGORIAS', () => {
  // A lista e fixa de proposito: categoria de texto livre fragmenta em
  // silencio ("Mercado", "mercado", "Supermercado" viram tres setores) e a
  // soma por setor deixa de fechar.
  it('tem as quinze categorias combinadas, sem acentuacao', () => {
    expect(CATEGORIAS).toEqual([
      'moradia',
      'mercado',
      'alimentacao_fora',
      'transporte',
      'vestuario',
      'saude',
      'pet',
      'servicos',
      'dividas',
      'familia',
      'investimento',
      'compras',
      'cartao',
      'lazer',
      'outros',
    ])
  })
})

describe('heranca da categoria', () => {
  it('a ocorrencia virtual de uma regra herda a categoria da regra', () => {
    const [o] = expandirRegras([regra()], INTERVALO)

    expect(o?.categoria).toBe('moradia')
  })

  it('a ocorrencia virtual de um parcelamento herda a do parcelamento', () => {
    const [o] = expandirParcelamentos([parcelamento()], INTERVALO)

    expect(o?.categoria).toBe('compras')
  })

  it('regra sem categoria gera ocorrencia com categoria nula', () => {
    const [o] = expandirRegras([regra({ categoria: null })], INTERVALO)

    expect(o?.categoria).toBeNull()
  })

  it('parcelamento sem categoria gera ocorrencia com categoria nula', () => {
    const [o] = expandirParcelamentos([parcelamento({ categoria: null })], INTERVALO)

    expect(o?.categoria).toBeNull()
  })

  // RN-52: a materializada congela o estado do momento, como ja congela nome
  // e valor. Recategorizar a regra nao reescreve o passado -- o historico
  // registra como o gasto era classificado quando aconteceu.
  it('a materializada preserva a propria categoria, nao a da regra atual', () => {
    const real: Ocorrencia = {
      id: 'o-1',
      geradorTipo: 'regra',
      geradorId: 'r-1',
      competencia: '2026-09',
      tipo: 'saida',
      nome: 'Aluguel',
      valorPrevistoCentavos: 180_000,
      dataVencimento: '2026-09-10',
      dataPagamento: '2026-09-10',
      valorPagoCentavos: 180_000,
      pagamentoRegistradoEm: null,
      ignorado: false,
      observacao: null,
      categoria: 'moradia',
    }

    // A regra agora diz outra coisa; a materializada nao acompanha.
    const virtuais = expandirRegras([regra({ categoria: 'outros' })], INTERVALO)
    const [resolvida] = resolver(virtuais, [real], '2026-09-15')

    expect(resolvida?.categoria).toBe('moradia')
  })
})
