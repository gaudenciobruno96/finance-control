/**
 * Consulta a `atualizado_em`, que os repositorios nao expoem.
 *
 * Existe para a janela de `desfazer`: os tipos do dominio nao carregam
 * instante nenhum de persistencia, e nao devem carregar -- e metadado de
 * armazenamento, nao de negocio.
 *
 * Le `atualizado_em`, NAO `criado_em`: para as escritas que ATUALIZAM uma
 * linha existente (pagamento sobre ocorrencia ja materializada; declarar
 * saldo substituindo uma ancora na mesma data), `criado_em` mede quando a
 * linha nasceu, nao quando a escrita que se quer desfazer aconteceu. O metodo
 * se chama `tocadoEm` para o nome dizer o que ele mede.
 */

import type { Pool } from 'pg'

/** Lista fechada: o nome da tabela nao pode vir de fora sem isto. */
const TABELAS = ['regras', 'parcelamentos', 'ocorrencias', 'ancoras'] as const

export type TabelaAuditavel = (typeof TABELAS)[number]

export function criarAuditoria(pool: Pool): {
  tocadoEm: (tabela: TabelaAuditavel, id: string) => Promise<Date | null>
} {
  return {
    tocadoEm: async (tabela: TabelaAuditavel, id: string): Promise<Date | null> => {
      // O nome da tabela e interpolado, nao parametrizado -- o Postgres nao
      // aceita parametro em posicao de identificador. A lista fechada acima e
      // o que torna isso seguro: um valor fora dela nao chega aqui.
      if (!TABELAS.includes(tabela)) {
        throw new Error('tabela nao auditavel')
      }

      const r = await pool.query<{ atualizado_em: Date }>(
        `select atualizado_em from ${tabela} where id = $1`,
        [id],
      )
      return r.rows[0]?.atualizado_em ?? null
    },
  }
}
