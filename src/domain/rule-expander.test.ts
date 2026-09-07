import { describe, expect, it } from 'vitest'
import { expandirRegras, regraVigenteEm, selecionarVigente } from './rule-expander.js'
import { intervaloDeCompetencias } from './calendar.js'
import type { Regra } from './types.js'

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
    categoria: null,
    ...over,
  }
}

describe('rule-expander', () => {
  describe('vigencia (RN-12)', () => {
    it('vale de vigenteDe ate vigenteAte, ambas inclusive', () => {
      const r = regra({ vigenteDe: '2026-03', vigenteAte: '2026-05' })

      expect(regraVigenteEm(r, '2026-02')).toBe(false)
      expect(regraVigenteEm(r, '2026-03')).toBe(true)
      expect(regraVigenteEm(r, '2026-04')).toBe(true)
      expect(regraVigenteEm(r, '2026-05')).toBe(true)
      expect(regraVigenteEm(r, '2026-06')).toBe(false)
    })

    it('vigenteAte nulo significa vigencia indefinida', () => {
      const r = regra({ vigenteDe: '2026-01', vigenteAte: null })

      expect(regraVigenteEm(r, '2099-12')).toBe(true)
    })

    it('seleciona a regra vigente entre versoes da mesma linhagem', () => {
      const antiga = regra({ id: 'r1', valorCentavos: 180_000, vigenteDe: '2026-01', vigenteAte: '2026-07' })
      const nova = regra({ id: 'r2', valorCentavos: 200_000, vigenteDe: '2026-08', vigenteAte: null })

      expect(selecionarVigente([antiga, nova], '2026-06')?.id).toBe('r1')
      expect(selecionarVigente([antiga, nova], '2026-08')?.id).toBe('r2')
      expect(selecionarVigente([antiga, nova], '2025-12')).toBeNull()
    })
  })

  describe('expansao (RN-11)', () => {
    it('produz uma ocorrencia por competencia vigente', () => {
      const r = regra({ vigenteDe: '2026-01', vigenteAte: '2026-03' })
      const ocorrencias = expandirRegras([r], intervaloDeCompetencias('2026-01', '2026-06'))

      expect(ocorrencias).toHaveLength(3)
      expect(ocorrencias.map((o) => o.competencia)).toEqual(['2026-01', '2026-02', '2026-03'])
    })

    it('nao produz nada fora do intervalo consultado', () => {
      const r = regra({ vigenteDe: '2026-01', vigenteAte: null })
      const ocorrencias = expandirRegras([r], intervaloDeCompetencias('2026-05', '2026-05'))

      expect(ocorrencias).toHaveLength(1)
      expect(ocorrencias[0]?.competencia).toBe('2026-05')
    })

    it('trunca dia inexistente no ultimo dia do mes (RN-05)', () => {
      const r = regra({ diaDoMes: 31 })
      const ocorrencias = expandirRegras([r], ['2026-02', '2026-04', '2026-05'])

      expect(ocorrencias.map((o) => o.dataVencimento)).toEqual([
        '2026-02-28',
        '2026-04-30',
        '2026-05-31',
      ])
    })

    it('aplica o ajuste de fim de semana apos construir a data (RN-06)', () => {
      // 2026-08-08 e sabado.
      const entrada = regra({ tipo: 'entrada', diaDoMes: 8, ajusteFimDeSemana: 'antecipa' })
      const saida = regra({ tipo: 'saida', diaDoMes: 8, ajusteFimDeSemana: 'posterga' })

      expect(expandirRegras([entrada], ['2026-08'])[0]?.dataVencimento).toBe('2026-08-07')
      expect(expandirRegras([saida], ['2026-08'])[0]?.dataVencimento).toBe('2026-08-10')
    })

    /**
     * RN-08, o defeito mais sutil deste modulo.
     *
     * 2026-05-31 e domingo. Com `posterga`, o vencimento escorrega para 1o de
     * junho -- mas a ocorrencia continua pertencendo a competencia de maio.
     *
     * Se a competencia fosse derivada da data ajustada, a chave mudaria e um
     * item ja marcado como pago em maio reapareceria como pendente em junho.
     */
    it('mantem a competencia quando o ajuste atravessa o mes (RN-08)', () => {
      const r = regra({ diaDoMes: 31, ajusteFimDeSemana: 'posterga' })
      const [ocorrencia] = expandirRegras([r], ['2026-05'])

      expect(ocorrencia?.dataVencimento).toBe('2026-06-01')
      expect(ocorrencia?.competencia).toBe('2026-05')
      expect(ocorrencia?.chave).toBe('regra:r1:2026-05')
    })

    it('marca a ocorrencia como virtual e prevista', () => {
      const [ocorrencia] = expandirRegras([regra()], ['2026-08'])

      expect(ocorrencia?.origem).toBe('virtual')
      expect(ocorrencia?.situacao).toBe('previsto')
      expect(ocorrencia?.dataPagamento).toBeNull()
    })

    it('expande varias regras de uma vez', () => {
      const salario = regra({ id: 'r1', tipo: 'entrada', nome: 'Salario A', diaDoMes: 5 })
      const outro = regra({ id: 'r2', tipo: 'entrada', nome: 'Salario B', diaDoMes: 20 })

      const ocorrencias = expandirRegras([salario, outro], ['2026-08'])

      expect(ocorrencias).toHaveLength(2)
      expect(new Set(ocorrencias.map((o) => o.chave)).size).toBe(2)
    })
  })
})
