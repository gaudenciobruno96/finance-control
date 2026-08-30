/**
 * Saldos em moeda estrangeira.
 *
 * Fica FORA de `Repositorios`: aquele tipo e derivado da implementacao Dexie,
 * e acrescentar um campo obrigaria a implementar o mesmo repositorio em Dexie
 * e alteraria a suite de contrato. Aqui `AppPg` ganha um campo proprio, irmao
 * de `repos`.
 */

import type { Pool } from 'pg'

// Efeito colateral deliberado: registra o parser que devolve `bigint` como
// numero. Sem ele `valor_centavos` chegaria como string e a soma do
// patrimonio concatenaria em vez de somar.
import './conexao.js'

export interface SaldoEstrangeiro {
  readonly moeda: string
  readonly valorCentavos: number
  readonly data: string
}

export interface SaldosEstrangeirosRepo {
  listar(): Promise<SaldoEstrangeiro[]>
  salvar(s: SaldoEstrangeiro): Promise<void>
}

interface Linha {
  readonly moeda: string
  readonly valor_centavos: number
  readonly data: string
}

export function criarSaldosEstrangeirosPg(pool: Pool): SaldosEstrangeirosRepo {
  return {
    listar: async (): Promise<SaldoEstrangeiro[]> => {
      // Ordem fixa por moeda: o resultado do patrimonio e lido por uma
      // pessoa, e uma lista que troca de ordem entre chamadas parece
      // instabilidade nos dados.
      const r = await pool.query<Linha>(
        'select moeda, valor_centavos, data from saldos_estrangeiros order by moeda',
      )
      return r.rows.map((l) => ({
        moeda: l.moeda,
        valorCentavos: l.valor_centavos,
        data: l.data,
      }))
    },

    salvar: async (s: SaldoEstrangeiro): Promise<void> => {
      await pool.query(
        `insert into saldos_estrangeiros (moeda, valor_centavos, data, atualizado_em)
         values ($1,$2,$3,now())
         on conflict (moeda) do update set
           valor_centavos = excluded.valor_centavos,
           data = excluded.data,
           atualizado_em = now()`,
        [s.moeda, s.valorCentavos, s.data],
      )
    },
  }
}
