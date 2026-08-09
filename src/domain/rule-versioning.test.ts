import { describe, expect, it } from 'vitest'
import { editarAPartirDe, editarDesdeSempre } from './rule-versioning.js'
import { expandirRegras, selecionarVigente } from './rule-expander.js'
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
    ...over,
  }
}

describe('rule-versioning', () => {
  describe('editarAPartirDe (RN-13)', () => {
    /**
     * O cenario que motiva toda a vigencia existir: o aluguel sobe em agosto,
     * e julho precisa continuar valendo o que valia.
     */
    it('preserva o passado e aplica o novo valor a partir do mes escolhido', () => {
      const original = regra({ valorCentavos: 180_000, vigenteDe: '2026-01' })

      const versoes = editarAPartirDe(original, { valorCentavos: 200_000 }, '2026-08', 'r2')

      expect(versoes).toHaveLength(2)

      const [encerrada, nova] = versoes
      expect(encerrada?.valorCentavos).toBe(180_000)
      expect(encerrada?.vigenteDe).toBe('2026-01')
      expect(encerrada?.vigenteAte).toBe('2026-07')

      expect(nova?.valorCentavos).toBe(200_000)
      expect(nova?.vigenteDe).toBe('2026-08')
      expect(nova?.vigenteAte).toBeNull()
      expect(nova?.id).toBe('r2')
    })

    it('a expansao reflete o valor certo em cada mes', () => {
      const original = regra({ valorCentavos: 180_000, vigenteDe: '2026-01' })
      const versoes = editarAPartirDe(original, { valorCentavos: 200_000 }, '2026-08', 'r2')

      const ocorrencias = expandirRegras(versoes, intervaloDeCompetencias('2026-06', '2026-09'))
      const porCompetencia = new Map(
        ocorrencias.map((o) => [o.competencia, o.valorPrevistoCentavos]),
      )

      expect(porCompetencia.get('2026-06')).toBe(180_000)
      expect(porCompetencia.get('2026-07')).toBe(180_000)
      expect(porCompetencia.get('2026-08')).toBe(200_000)
      expect(porCompetencia.get('2026-09')).toBe(200_000)
    })

    it('nao cria versao vazia quando a edicao alcanca a propria vigencia inicial', () => {
      const original = regra({ vigenteDe: '2026-08' })

      const versoes = editarAPartirDe(original, { valorCentavos: 200_000 }, '2026-08', 'r2')

      expect(versoes).toHaveLength(1)
      expect(versoes[0]?.valorCentavos).toBe(200_000)
      expect(versoes[0]?.id).toBe('r1')
    })

    it('nao cria versao vazia quando a edicao antecede a vigencia inicial', () => {
      const original = regra({ vigenteDe: '2026-08' })

      const versoes = editarAPartirDe(original, { valorCentavos: 200_000 }, '2026-05', 'r2')

      expect(versoes).toHaveLength(1)
      expect(versoes[0]?.valorCentavos).toBe(200_000)
    })

    it('preserva o fim de vigencia original na nova versao', () => {
      const original = regra({ vigenteDe: '2026-01', vigenteAte: '2026-12' })

      const [encerrada, nova] = editarAPartirDe(original, { valorCentavos: 200_000 }, '2026-08', 'r2')

      expect(encerrada?.vigenteAte).toBe('2026-07')
      expect(nova?.vigenteAte).toBe('2026-12')
    })

    it('nao versiona quando a edicao e posterior ao fim da vigencia', () => {
      const original = regra({ vigenteDe: '2026-01', vigenteAte: '2026-06' })

      const versoes = editarAPartirDe(original, { valorCentavos: 200_000 }, '2026-09', 'r2')

      expect(versoes).toEqual([original])
    })

    it('permite alterar outros campos alem do valor', () => {
      const original = regra({ diaDoMes: 10, nome: 'Aluguel' })

      const [, nova] = editarAPartirDe(
        original,
        { diaDoMes: 15, nome: 'Aluguel novo', ajusteFimDeSemana: 'posterga' },
        '2026-08',
        'r2',
      )

      expect(nova?.diaDoMes).toBe(15)
      expect(nova?.nome).toBe('Aluguel novo')
      expect(nova?.ajusteFimDeSemana).toBe('posterga')
    })

    it('exatamente uma versao vigora em cada competencia (RN-15)', () => {
      const original = regra({ vigenteDe: '2026-01' })
      const versoes = editarAPartirDe(original, { valorCentavos: 200_000 }, '2026-08', 'r2')

      for (const c of intervaloDeCompetencias('2026-01', '2026-12')) {
        const vigentes = versoes.filter(
          (r) =>
            (r.vigenteDe <= c) && (r.vigenteAte === null || r.vigenteAte >= c),
        )
        expect(vigentes).toHaveLength(1)
      }
      expect(selecionarVigente(versoes, '2026-07')?.valorCentavos).toBe(180_000)
      expect(selecionarVigente(versoes, '2026-08')?.valorCentavos).toBe(200_000)
    })
  })

  describe('editarDesdeSempre (RN-14)', () => {
    it('altera a regra em lugar, sem versionar', () => {
      const original = regra({ valorCentavos: 180_000 })

      const alterada = editarDesdeSempre(original, { valorCentavos: 200_000 })

      expect(alterada.id).toBe('r1')
      expect(alterada.valorCentavos).toBe(200_000)
      expect(alterada.vigenteDe).toBe('2026-01')
      expect(alterada.vigenteAte).toBeNull()
    })

    it('afeta todas as competencias na expansao', () => {
      const alterada = editarDesdeSempre(regra(), { valorCentavos: 200_000 })

      const ocorrencias = expandirRegras([alterada], intervaloDeCompetencias('2026-01', '2026-03'))

      expect(ocorrencias.every((o) => o.valorPrevistoCentavos === 200_000)).toBe(true)
    })
  })
})
