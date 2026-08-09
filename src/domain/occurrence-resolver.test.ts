import { describe, expect, it } from 'vitest'
import { derivarSituacao, resolver } from './occurrence-resolver.js'
import { expandirRegras } from './rule-expander.js'
import type { Ocorrencia, OcorrenciaResolvida, Regra } from './types.js'

const HOJE = '2026-08-15'

function regra(over: Partial<Regra> = {}): Regra {
  return {
    id: 'r1',
    tipo: 'saida',
    nome: 'Aluguel',
    valorCentavos: 180_000,
    valorEhEstimativa: false,
    diaDoMes: 10,
    ajusteFimDeSemana: 'nenhum',
    vigenteDe: '2026-01',
    vigenteAte: null,
    ...over,
  }
}

function real(over: Partial<Ocorrencia> = {}): Ocorrencia {
  return {
    id: 'o1',
    geradorTipo: 'regra',
    geradorId: 'r1',
    competencia: '2026-08',
    tipo: 'saida',
    nome: 'Aluguel',
    valorPrevistoCentavos: 180_000,
    dataVencimento: '2026-08-10',
    dataPagamento: null,
    valorPagoCentavos: null,
    ignorado: false,
    observacao: null,
    ...over,
  }
}

describe('occurrence-resolver', () => {
  describe('derivarSituacao (RN-28)', () => {
    it('ignorado tem precedencia sobre tudo', () => {
      expect(
        derivarSituacao({ ignorado: true, dataPagamento: '2026-08-01', dataVencimento: '2026-08-10' }, HOJE),
      ).toBe('ignorado')
    })

    it('com data de pagamento e pago', () => {
      expect(
        derivarSituacao({ ignorado: false, dataPagamento: '2026-08-09', dataVencimento: '2026-08-10' }, HOJE),
      ).toBe('pago')
    })

    it('vencido sem pagamento e atrasado', () => {
      expect(
        derivarSituacao({ ignorado: false, dataPagamento: null, dataVencimento: '2026-08-10' }, HOJE),
      ).toBe('atrasado')
    })

    it('a vencer e previsto', () => {
      expect(
        derivarSituacao({ ignorado: false, dataPagamento: null, dataVencimento: '2026-08-20' }, HOJE),
      ).toBe('previsto')
    })

    it('vencendo hoje ainda e previsto, nao atrasado', () => {
      expect(
        derivarSituacao({ ignorado: false, dataPagamento: null, dataVencimento: HOJE }, HOJE),
      ).toBe('previsto')
    })
  })

  describe('sobreposicao (RN-25)', () => {
    it('a real substitui a virtual de mesma chave', () => {
      const virtuais = expandirRegras([regra()], ['2026-08'])
      const paga = real({ dataPagamento: '2026-08-09', valorPagoCentavos: 185_000 })

      const resolvidas = resolver(virtuais, [paga], HOJE)

      expect(resolvidas).toHaveLength(1)
      expect(resolvidas[0]?.origem).toBe('real')
      expect(resolvidas[0]?.situacao).toBe('pago')
      expect(resolvidas[0]?.valorPagoCentavos).toBe(185_000)
    })

    it('a virtual sobrevive quando nao ha real correspondente', () => {
      const virtuais = expandirRegras([regra()], ['2026-08', '2026-09'])
      const paga = real({ competencia: '2026-08', dataPagamento: '2026-08-09', valorPagoCentavos: 180_000 })

      const resolvidas = resolver(virtuais, [paga], HOJE)

      expect(resolvidas).toHaveLength(2)
      expect(resolvidas.find((o) => o.competencia === '2026-09')?.origem).toBe('virtual')
    })

    it('uma real de outra competencia nao sobrepoe', () => {
      const virtuais = expandirRegras([regra()], ['2026-08'])
      const deOutroMes = real({ competencia: '2026-07' })

      const resolvidas = resolver(virtuais, [deOutroMes], HOJE)

      expect(resolvidas.find((o) => o.competencia === '2026-08')?.origem).toBe('virtual')
    })

    /**
     * As caracteristicas do gerador sobrevivem a materializacao: uma parcela
     * continua sendo componente de fatura depois de o usuario ajustar seu
     * valor. Sem isso, ajustar uma parcela de cartao a faria passar a contar
     * na curva alem de estar dentro da fatura -- dupla contagem.
     */
    it('preserva ehComponenteDeFatura ao materializar', () => {
      const virtual: OcorrenciaResolvida = {
        chave: 'parcelamento:p1:2026-08',
        origem: 'virtual',
        idReal: null,
        situacao: 'previsto',
        ehComponenteDeFatura: true,
        numeroParcela: 3,
        geradorTipo: 'parcelamento',
        geradorId: 'p1',
        competencia: '2026-08',
        tipo: 'saida',
        nome: 'Notebook (3/10)',
        valorPrevistoCentavos: 30_000,
        dataVencimento: '2026-08-28',
        dataPagamento: null,
        valorPagoCentavos: null,
        ignorado: false,
        observacao: null,
      }
      const ajustada = real({
        geradorTipo: 'parcelamento',
        geradorId: 'p1',
        valorPrevistoCentavos: 32_000,
        dataVencimento: '2026-08-28',
      })

      const [resolvida] = resolver([virtual], [ajustada], HOJE)

      expect(resolvida?.origem).toBe('real')
      expect(resolvida?.ehComponenteDeFatura).toBe(true)
      expect(resolvida?.numeroParcela).toBe(3)
      expect(resolvida?.valorPrevistoCentavos).toBe(32_000)
    })
  })

  /**
   * RN-42 — ocorrencias orfas.
   *
   * Defeito encontrado durante o Functional Design da Unidade 2, ao decidir
   * que remover uma regra preserva as ocorrencias ja materializadas.
   *
   * A implementacao original so alcancava reais que tivessem virtual
   * correspondente. Uma ocorrencia cuja regra foi removida perdia sua virtual
   * e desaparecia -- o aluguel de julho que voce pagou sumia do historico.
   */
  describe('orfas (RN-42)', () => {
    it('uma real sem virtual correspondente ainda aparece', () => {
      const orfa = real({
        geradorId: 'regra-removida',
        dataPagamento: '2026-08-09',
        valorPagoCentavos: 180_000,
      })

      const resolvidas = resolver([], [orfa], HOJE)

      expect(resolvidas).toHaveLength(1)
      expect(resolvidas[0]?.origem).toBe('real')
      expect(resolvidas[0]?.situacao).toBe('pago')
      expect(resolvidas[0]?.valorPagoCentavos).toBe(180_000)
    })

    it('orfas convivem com virtuais de outras regras', () => {
      const virtuais = expandirRegras([regra({ id: 'r-ativa' })], ['2026-08'])
      const orfa = real({ id: 'o-orfa', geradorId: 'r-removida', nome: 'Internet' })

      const resolvidas = resolver(virtuais, [orfa], HOJE)

      expect(resolvidas).toHaveLength(2)
      expect(resolvidas.map((o) => o.nome).sort()).toEqual(['Aluguel', 'Internet'])
    })

    it('uma real fora da vigencia da regra nao desaparece', () => {
      // A regra passou a valer so de setembro, mas agosto ja fora materializado.
      const virtuais = expandirRegras([regra({ vigenteDe: '2026-09' })], ['2026-08', '2026-09'])
      const materializadaEmAgosto = real({
        competencia: '2026-08',
        dataPagamento: '2026-08-09',
        valorPagoCentavos: 180_000,
      })

      const resolvidas = resolver(virtuais, [materializadaEmAgosto], HOJE)

      expect(resolvidas.some((o) => o.competencia === '2026-08')).toBe(true)
    })

    it('nao duplica quando a virtual existe', () => {
      const virtuais = expandirRegras([regra()], ['2026-08'])
      const paga = real({ dataPagamento: '2026-08-09', valorPagoCentavos: 180_000 })

      const resolvidas = resolver(virtuais, [paga], HOJE)

      expect(resolvidas).toHaveLength(1)
    })
  })

  describe('avulsas (RN-26)', () => {
    it('entram sempre no resultado', () => {
      const avulsa = real({ id: 'a1', geradorTipo: 'avulso', geradorId: null, nome: 'Boleto pontual' })

      const resolvidas = resolver([], [avulsa], HOJE)

      expect(resolvidas).toHaveLength(1)
      expect(resolvidas[0]?.nome).toBe('Boleto pontual')
    })

    it('nunca sobrepoem uma virtual', () => {
      const virtuais = expandirRegras([regra()], ['2026-08'])
      const avulsa = real({ id: 'a1', geradorTipo: 'avulso', geradorId: null })

      const resolvidas = resolver(virtuais, [avulsa], HOJE)

      expect(resolvidas).toHaveLength(2)
    })
  })

  describe('idempotencia e ordem (RN-27)', () => {
    it('resolver duas vezes produz o mesmo resultado', () => {
      const virtuais = expandirRegras([regra()], ['2026-08', '2026-09'])
      const reais = [real({ dataPagamento: '2026-08-09', valorPagoCentavos: 180_000 })]

      const primeira = resolver(virtuais, reais, HOJE)
      const segunda = resolver(virtuais, reais, HOJE)

      expect(segunda).toEqual(primeira)
    })

    it('ordena por data de vencimento', () => {
      const cedo = regra({ id: 'r1', nome: 'Cedo', diaDoMes: 5 })
      const tarde = regra({ id: 'r2', nome: 'Tarde', diaDoMes: 25 })

      const resolvidas = resolver(expandirRegras([tarde, cedo], ['2026-08']), [], HOJE)

      expect(resolvidas.map((o) => o.nome)).toEqual(['Cedo', 'Tarde'])
    })
  })
})
