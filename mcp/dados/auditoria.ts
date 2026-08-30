/**
 * Consulta a `criado_em`, que os repositorios nao expoem.
 *
 * Existe para a janela de `desfazer`: os tipos do dominio nao carregam o
 * instante de criacao, e nao devem carregar -- e metadado de persistencia, nao
 * de negocio.
 */

import type { Pool } from 'pg'

/** Lista fechada: o nome da tabela nao pode vir de fora sem isto. */
const TABELAS = ['regras', 'parcelamentos', 'ocorrencias', 'ancoras'] as const

export type TabelaAuditavel = (typeof TABELAS)[number]

export function criarAuditoria(pool: Pool): {
  criadoEm: (tabela: TabelaAuditavel, id: string) => Promise<Date | null>
} {
  return {
    criadoEm: async (tabela: TabelaAuditavel, id: string): Promise<Date | null> => {
      // O nome da tabela e interpolado, nao parametrizado -- o Postgres nao
      // aceita parametro em posicao de identificador. A lista fechada acima e
      // o que torna isso seguro: um valor fora dela nao chega aqui.
      if (!TABELAS.includes(tabela)) {
        throw new Error('tabela nao auditavel')
      }

      const r = await pool.query<{ criado_em: Date }>(
        `select criado_em from ${tabela} where id = $1`,
        [id],
      )
      return r.rows[0]?.criado_em ?? null
    },
  }
}
