/**
 * SVC-03 — Ciclo de vida de regras, parcelamentos e cartoes (RN-13, RN-14, RN-47).
 */

import { editarAPartirDe, editarDesdeSempre } from '../domain/rule-versioning.js'
import { novoId } from '../data/ids.js'
import type { BancoFinanceiro } from '../data/db.js'
import type { Repositorios } from '../data/repositories.js'
import type {
  AlteracaoRegra,
  Competencia,
  Parcelamento,
  Regra,
} from '../domain/types.js'

export type EscopoDeEdicao = 'apartirDeste' | 'desdeSempre'

export function criarRuleService(db: BancoFinanceiro, repos: Repositorios) {
  return {
    async criarRegra(dados: Omit<Regra, 'id'>): Promise<Regra> {
      const regra: Regra = { ...dados, id: novoId() }
      await repos.regras.salvar(regra)
      return regra
    },

    /**
     * Edita aplicando a semantica de vigencia.
     *
     * A transacao nao e formalidade: uma falha entre gravar a regra encerrada
     * e a nova deixaria um mes sem regra vigente, ou dois meses com duas.
     */
    async editarRegra(
      id: string,
      alteracao: AlteracaoRegra,
      escopo: EscopoDeEdicao,
      competencia: Competencia,
    ): Promise<void> {
      const regra = await repos.regras.obter(id)
      if (regra === null) return

      const versoes =
        escopo === 'apartirDeste'
          ? editarAPartirDe(regra, alteracao, competencia, novoId())
          : [editarDesdeSempre(regra, alteracao)]

      await db.transaction('rw', db.regras, async () => {
        for (const v of versoes) {
          await repos.regras.salvar(v)
        }
      })
    },

    /** RN-46: a remocao NAO cascateia. Ocorrencias materializadas permanecem. */
    removerRegra: (id: string) => repos.regras.remover(id),

    async criarParcelamento(dados: Omit<Parcelamento, 'id'>): Promise<Parcelamento> {
      const parcelamento: Parcelamento = { ...dados, id: novoId() }
      await repos.parcelamentos.salvar(parcelamento)
      return parcelamento
    },

    async atualizarParcelamento(p: Parcelamento): Promise<void> {
      await repos.parcelamentos.salvar(p)
    },

    removerParcelamento: (id: string) => repos.parcelamentos.remover(id),

    async definirAncora(
      data: string,
      saldoCentavos: number,
      hoje: string,
    ): Promise<void> {
      await repos.ancoras.salvar({ id: novoId(), data, saldoCentavos, declaradaEm: null }, hoje)
    },
  }
}

export type RuleService = ReturnType<typeof criarRuleService>
