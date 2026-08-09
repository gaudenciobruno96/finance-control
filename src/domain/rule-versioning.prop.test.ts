/**
 * Testes por propriedade de DOM-11 (PROP-V01 a PROP-V04).
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { editarAPartirDe } from './rule-versioning.js'
import { regraVigenteEm } from './rule-expander.js'
import { compararCompetencias, intervaloDeCompetencias, somarMeses } from './calendar.js'
import { centavosPositivo, regra } from '../test-support/generators.js'

/** Regra de vigencia indefinida, para isolar o efeito da edicao. */
const regraAberta = () => regra().map((r) => ({ ...r, vigenteAte: null }))

describe('rule-versioning — propriedades', () => {
  /**
   * PROP-V01 · Apos a edicao, nenhuma competencia tem duas versoes vigentes.
   *
   * Duas versoes vigentes no mesmo mes gerariam duas ocorrencias para a mesma
   * conta -- o usuario veria o aluguel cobrado duas vezes.
   */
  it('PROP-V01: nunca ha duas versoes vigentes na mesma competencia', () => {
    fc.assert(
      fc.property(
        regraAberta(),
        fc.integer({ min: -6, max: 24 }),
        centavosPositivo(),
        (r, deslocamento, novoValor) => {
          const alvo = somarMeses(r.vigenteDe, deslocamento)
          const versoes = editarAPartirDe(r, { valorCentavos: novoValor }, alvo, 'novo-id')

          const janela = intervaloDeCompetencias(
            somarMeses(r.vigenteDe, -3),
            somarMeses(r.vigenteDe, 30),
          )

          for (const c of janela) {
            const vigentes = versoes.filter((v) => regraVigenteEm(v, c))
            expect(vigentes.length).toBeLessThanOrEqual(1)
          }
        },
      ),
    )
  })

  /**
   * PROP-V02 · Competencias anteriores a edicao mantem exatamente o valor
   * anterior. E a propriedade que protege o historico de um reajuste.
   */
  it('PROP-V02: o passado mantem o valor anterior', () => {
    fc.assert(
      fc.property(
        regraAberta(),
        fc.integer({ min: 1, max: 24 }),
        centavosPositivo(),
        (r, deslocamento, novoValor) => {
          const alvo = somarMeses(r.vigenteDe, deslocamento)
          const versoes = editarAPartirDe(r, { valorCentavos: novoValor }, alvo, 'novo-id')

          const anteriores = intervaloDeCompetencias(r.vigenteDe, somarMeses(alvo, -1))

          for (const c of anteriores) {
            const vigente = versoes.find((v) => regraVigenteEm(v, c))
            expect(vigente?.valorCentavos).toBe(r.valorCentavos)
          }
        },
      ),
    )
  })

  /** PROP-V03 · Competencias a partir da edicao refletem o novo valor. */
  it('PROP-V03: o futuro reflete o novo valor', () => {
    fc.assert(
      fc.property(
        regraAberta(),
        fc.integer({ min: 1, max: 24 }),
        centavosPositivo(),
        (r, deslocamento, novoValor) => {
          const alvo = somarMeses(r.vigenteDe, deslocamento)
          const versoes = editarAPartirDe(r, { valorCentavos: novoValor }, alvo, 'novo-id')

          const posteriores = intervaloDeCompetencias(alvo, somarMeses(alvo, 12))

          for (const c of posteriores) {
            const vigente = versoes.find((v) => regraVigenteEm(v, c))
            expect(vigente?.valorCentavos).toBe(novoValor)
          }
        },
      ),
    )
  })

  /**
   * PROP-V04 · A uniao das vigencias nao deixa lacuna.
   *
   * Uma lacuna faria a conta simplesmente desaparecer de um mes -- pior que um
   * valor errado, porque nada indicaria o problema.
   */
  it('PROP-V04: nao ha lacuna entre a versao encerrada e a nova', () => {
    fc.assert(
      fc.property(
        regraAberta(),
        fc.integer({ min: 1, max: 24 }),
        centavosPositivo(),
        (r, deslocamento, novoValor) => {
          const alvo = somarMeses(r.vigenteDe, deslocamento)
          const versoes = editarAPartirDe(r, { valorCentavos: novoValor }, alvo, 'novo-id')

          const janela = intervaloDeCompetencias(r.vigenteDe, somarMeses(alvo, 12))

          for (const c of janela) {
            expect(versoes.some((v) => regraVigenteEm(v, c))).toBe(true)
          }

          if (versoes.length === 2) {
            const [encerrada, nova] = versoes
            expect(somarMeses(encerrada!.vigenteAte as string, 1)).toBe(nova!.vigenteDe)
            expect(compararCompetencias(encerrada!.vigenteDe, encerrada!.vigenteAte as string))
              .toBeLessThanOrEqual(0)
          }
        },
      ),
    )
  })
})
