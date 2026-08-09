import { describe, expect, it } from 'vitest'
import { ErroDeDominio } from './errors.js'
import {
  ajustePadrao,
  aplicarAjuste,
  comparar,
  competenciaDe,
  construirData,
  diaDaSemana,
  diasDaCompetencia,
  ehFimDeSemana,
  intervaloDeCompetencias,
  somarDias,
  somarMeses,
  ultimoDiaDoMes,
} from './calendar.js'

describe('calendar', () => {
  /**
   * O defeito que RN-04 previne: new Date('2026-08-10') e interpretado como
   * meia-noite UTC e, no fuso do Brasil, vira 9 de agosto as 21h. Um salario
   * do dia 10 apareceria no dia 9.
   *
   * Este teste confirma que a nossa aritmetica nao sofre esse deslocamento,
   * independentemente do fuso da maquina que roda os testes.
   */
  it('nao desloca datas por fuso horario', () => {
    expect(somarDias('2026-08-10', 0)).toBe('2026-08-10')
    expect(somarDias('2026-08-10', 1)).toBe('2026-08-11')
    expect(somarDias('2026-08-10', -1)).toBe('2026-08-09')
    expect(competenciaDe('2026-08-01')).toBe('2026-08')
  })

  describe('somarDias', () => {
    it('atravessa fronteira de mes', () => {
      expect(somarDias('2026-01-31', 1)).toBe('2026-02-01')
      expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
    })

    it('atravessa fronteira de ano', () => {
      expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
      expect(somarDias('2027-01-01', -1)).toBe('2026-12-31')
    })

    it('trata ano bissexto', () => {
      expect(somarDias('2028-02-28', 1)).toBe('2028-02-29')
      expect(somarDias('2028-02-29', 1)).toBe('2028-03-01')
      expect(somarDias('2026-02-28', 1)).toBe('2026-03-01')
    })

    it('trata seculo nao bissexto e ano de 400 anos', () => {
      // 1900 nao foi bissexto; 2000 foi.
      expect(somarDias('1900-02-28', 1)).toBe('1900-03-01')
      expect(somarDias('2000-02-28', 1)).toBe('2000-02-29')
    })
  })

  describe('diaDaSemana', () => {
    it('identifica corretamente dias conhecidos', () => {
      expect(diaDaSemana('1970-01-01')).toBe(4) // quinta-feira
      expect(diaDaSemana('2026-08-08')).toBe(6) // sabado
      expect(diaDaSemana('2026-08-09')).toBe(0) // domingo
      expect(diaDaSemana('2026-08-10')).toBe(1) // segunda-feira
    })

    it('reconhece fim de semana', () => {
      expect(ehFimDeSemana('2026-08-08')).toBe(true)
      expect(ehFimDeSemana('2026-08-09')).toBe(true)
      expect(ehFimDeSemana('2026-08-10')).toBe(false)
    })
  })

  describe('construirData — truncamento de dia inexistente (RN-05)', () => {
    it('trunca dia 31 em fevereiro nao bissexto', () => {
      expect(construirData('2026-02', 31)).toBe('2026-02-28')
    })

    it('trunca dia 31 em fevereiro bissexto', () => {
      expect(construirData('2028-02', 31)).toBe('2028-02-29')
    })

    it('trunca dia 31 em mes de 30 dias', () => {
      expect(construirData('2026-04', 31)).toBe('2026-04-30')
      expect(construirData('2026-06', 31)).toBe('2026-06-30')
    })

    it('nunca transborda para o mes seguinte', () => {
      for (const c of ['2026-01', '2026-02', '2026-04', '2026-12']) {
        expect(construirData(c, 31).slice(0, 7)).toBe(c)
      }
    })

    it('mantem dia existente', () => {
      expect(construirData('2026-08', 10)).toBe('2026-08-10')
    })

    it('rejeita dia fora da faixa', () => {
      expect(() => construirData('2026-08', 0)).toThrow(ErroDeDominio)
      expect(() => construirData('2026-08', 32)).toThrow(ErroDeDominio)
    })
  })

  describe('aplicarAjuste (RN-06, RN-07)', () => {
    // 2026-08-08 e sabado; 2026-08-09 e domingo.
    it('antecipa sabado para sexta', () => {
      expect(aplicarAjuste('2026-08-08', 'antecipa')).toBe('2026-08-07')
    })

    it('antecipa domingo para sexta', () => {
      expect(aplicarAjuste('2026-08-09', 'antecipa')).toBe('2026-08-07')
    })

    it('posterga sabado para segunda', () => {
      expect(aplicarAjuste('2026-08-08', 'posterga')).toBe('2026-08-10')
    })

    it('posterga domingo para segunda', () => {
      expect(aplicarAjuste('2026-08-09', 'posterga')).toBe('2026-08-10')
    })

    it('nao altera dia util', () => {
      expect(aplicarAjuste('2026-08-10', 'antecipa')).toBe('2026-08-10')
      expect(aplicarAjuste('2026-08-10', 'posterga')).toBe('2026-08-10')
    })

    it('nao altera nada quando o ajuste e nenhum', () => {
      expect(aplicarAjuste('2026-08-08', 'nenhum')).toBe('2026-08-08')
    })

    /**
     * RN-07: o ajuste pode atravessar a fronteira do mes. 2026-05-31 e um
     * domingo; postergado vira 1o de junho.
     *
     * A competencia da ocorrencia NAO acompanha esse deslocamento (RN-08) --
     * isso e responsabilidade dos expansores, verificada la.
     */
    it('pode atravessar a fronteira do mes', () => {
      expect(diaDaSemana('2026-05-31')).toBe(0)
      expect(aplicarAjuste('2026-05-31', 'posterga')).toBe('2026-06-01')
    })

    it('sugere ajuste padrao por tipo de movimento (RN-09)', () => {
      expect(ajustePadrao('entrada')).toBe('antecipa')
      expect(ajustePadrao('saida')).toBe('posterga')
    })
  })

  describe('competencia', () => {
    it('extrai competencia de uma data', () => {
      expect(competenciaDe('2026-08-10')).toBe('2026-08')
    })

    it('soma e subtrai meses atravessando o ano', () => {
      expect(somarMeses('2026-12', 1)).toBe('2027-01')
      expect(somarMeses('2026-01', -1)).toBe('2025-12')
      expect(somarMeses('2026-08', 12)).toBe('2027-08')
      expect(somarMeses('2026-08', 0)).toBe('2026-08')
    })

    it('informa o ultimo dia do mes', () => {
      expect(ultimoDiaDoMes('2026-02')).toBe(28)
      expect(ultimoDiaDoMes('2028-02')).toBe(29)
      expect(ultimoDiaDoMes('2026-04')).toBe(30)
      expect(ultimoDiaDoMes('2026-01')).toBe(31)
    })

    it('lista todos os dias da competencia', () => {
      const dias = diasDaCompetencia('2026-02')
      expect(dias).toHaveLength(28)
      expect(dias[0]).toBe('2026-02-01')
      expect(dias[27]).toBe('2026-02-28')
    })

    it('produz intervalo contiguo de competencias', () => {
      expect(intervaloDeCompetencias('2026-11', '2027-02')).toEqual([
        '2026-11',
        '2026-12',
        '2027-01',
        '2027-02',
      ])
    })

    it('aceita intervalo de um unico mes', () => {
      expect(intervaloDeCompetencias('2026-08', '2026-08')).toEqual(['2026-08'])
    })

    it('rejeita intervalo invertido', () => {
      expect(() => intervaloDeCompetencias('2026-08', '2026-07')).toThrow(ErroDeDominio)
    })
  })

  describe('comparar', () => {
    it('ordena datas', () => {
      expect(comparar('2026-08-09', '2026-08-10')).toBeLessThan(0)
      expect(comparar('2026-08-10', '2026-08-09')).toBeGreaterThan(0)
      expect(comparar('2026-08-10', '2026-08-10')).toBe(0)
    })

    it('rejeita data invalida', () => {
      expect(() => comparar('2026-02-30', '2026-08-10')).toThrow(ErroDeDominio)
      expect(() => comparar('10/08/2026', '2026-08-10')).toThrow(ErroDeDominio)
    })
  })
})
