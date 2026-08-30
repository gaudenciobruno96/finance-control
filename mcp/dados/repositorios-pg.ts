/**
 * Repositorios sobre Postgres.
 *
 * Satisfaz `Repositorios` estruturalmente: os servicos e o dominio nao sabem
 * que a persistencia mudou.
 *
 * As invariantes de `src/data/invariants.ts` sao chamadas aqui exatamente como
 * a implementacao Dexie chama. Elas sao o que impede um diaDoMes 40 ou um
 * centavo fracionado de entrar, e valem para qualquer banco.
 */

import type { Pool } from 'pg'
// O parser de BIGINT vive como efeito colateral em conexao.ts. Sem este
// import, um chamador que construa o Pool sem passar por `criarPool`
// receberia centavos como string, e a aritmetica do dominio quebraria em
// silencio.
import './conexao.js'
import type { Repositorios } from '../../src/data/repositories.js'
import {
  validarAncora,
  validarOcorrencia,
  validarParcelamento,
  validarRegra,
} from '../../src/data/invariants.js'
import type {
  AncoraSaldo,
  Competencia,
  DataISO,
  Ocorrencia,
  Parcelamento,
  Regra,
  TipoGerador,
} from '../../src/domain/types.js'

interface LinhaRegra {
  id: string
  tipo: string
  nome: string
  valor_centavos: number
  valor_eh_estimativa: boolean
  dia_do_mes: number
  ajuste_fim_de_semana: string
  vigente_de: string
  vigente_ate: string | null
}

function paraRegra(l: LinhaRegra): Regra {
  return {
    id: l.id,
    tipo: l.tipo as Regra['tipo'],
    nome: l.nome,
    valorCentavos: l.valor_centavos,
    valorEhEstimativa: l.valor_eh_estimativa,
    diaDoMes: l.dia_do_mes,
    ajusteFimDeSemana: l.ajuste_fim_de_semana as Regra['ajusteFimDeSemana'],
    vigenteDe: l.vigente_de,
    vigenteAte: l.vigente_ate,
  }
}

interface LinhaParcelamento {
  id: string
  nome: string
  valor_parcela_centavos: number
  quantidade_parcelas: number
  primeiro_vencimento: string
}

function paraParcelamento(l: LinhaParcelamento): Parcelamento {
  return {
    id: l.id,
    nome: l.nome,
    valorParcelaCentavos: l.valor_parcela_centavos,
    quantidadeParcelas: l.quantidade_parcelas,
    primeiroVencimento: l.primeiro_vencimento,
  }
}

interface LinhaOcorrencia {
  id: string
  gerador_tipo: string
  gerador_id: string | null
  competencia: string
  tipo: string
  nome: string
  valor_previsto_centavos: number
  data_vencimento: string
  data_pagamento: string | null
  valor_pago_centavos: number | null
  ignorado: boolean
  observacao: string | null
}

function paraOcorrencia(l: LinhaOcorrencia): Ocorrencia {
  return {
    id: l.id,
    geradorTipo: l.gerador_tipo as TipoGerador,
    geradorId: l.gerador_id,
    competencia: l.competencia,
    tipo: l.tipo as Ocorrencia['tipo'],
    nome: l.nome,
    valorPrevistoCentavos: l.valor_previsto_centavos,
    dataVencimento: l.data_vencimento,
    dataPagamento: l.data_pagamento,
    valorPagoCentavos: l.valor_pago_centavos,
    ignorado: l.ignorado,
    observacao: l.observacao,
  }
}

interface LinhaAncora {
  id: string
  data: string
  saldo_centavos: number
}

function paraAncora(l: LinhaAncora): AncoraSaldo {
  return { id: l.id, data: l.data, saldoCentavos: l.saldo_centavos }
}

export function criarRepositoriosPg(pool: Pool): Repositorios {
  return {
    regras: {
      listar: async (): Promise<Regra[]> => {
        const r = await pool.query<LinhaRegra>('select * from regras')
        return r.rows.map(paraRegra)
      },

      obter: async (id: string): Promise<Regra | null> => {
        const r = await pool.query<LinhaRegra>('select * from regras where id = $1', [id])
        const linha = r.rows[0]
        return linha === undefined ? null : paraRegra(linha)
      },

      salvar: async (x: Regra): Promise<void> => {
        validarRegra(x)
        await pool.query(
          `insert into regras
           (id, tipo, nome, valor_centavos, valor_eh_estimativa, dia_do_mes,
            ajuste_fim_de_semana, vigente_de, vigente_ate)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (id) do update set
             tipo = excluded.tipo, nome = excluded.nome,
             valor_centavos = excluded.valor_centavos,
             valor_eh_estimativa = excluded.valor_eh_estimativa,
             dia_do_mes = excluded.dia_do_mes,
             ajuste_fim_de_semana = excluded.ajuste_fim_de_semana,
             vigente_de = excluded.vigente_de, vigente_ate = excluded.vigente_ate`,
          [
            x.id,
            x.tipo,
            x.nome,
            x.valorCentavos,
            x.valorEhEstimativa,
            x.diaDoMes,
            x.ajusteFimDeSemana,
            x.vigenteDe,
            x.vigenteAte,
          ],
        )
      },

      /** RN-46: a remocao NAO cascateia. Ocorrencias materializadas permanecem. */
      remover: async (id: string): Promise<void> => {
        await pool.query('delete from regras where id = $1', [id])
      },
    },

    parcelamentos: {
      listar: async (): Promise<Parcelamento[]> => {
        const r = await pool.query<LinhaParcelamento>('select * from parcelamentos')
        return r.rows.map(paraParcelamento)
      },

      obter: async (id: string): Promise<Parcelamento | null> => {
        const r = await pool.query<LinhaParcelamento>(
          'select * from parcelamentos where id = $1',
          [id],
        )
        const linha = r.rows[0]
        return linha === undefined ? null : paraParcelamento(linha)
      },

      salvar: async (x: Parcelamento): Promise<void> => {
        validarParcelamento(x)
        await pool.query(
          `insert into parcelamentos
           (id, nome, valor_parcela_centavos, quantidade_parcelas, primeiro_vencimento)
           values ($1,$2,$3,$4,$5)
           on conflict (id) do update set
             nome = excluded.nome,
             valor_parcela_centavos = excluded.valor_parcela_centavos,
             quantidade_parcelas = excluded.quantidade_parcelas,
             primeiro_vencimento = excluded.primeiro_vencimento`,
          [x.id, x.nome, x.valorParcelaCentavos, x.quantidadeParcelas, x.primeiroVencimento],
        )
      },

      remover: async (id: string): Promise<void> => {
        await pool.query('delete from parcelamentos where id = $1', [id])
      },
    },

    ocorrencias: {
      listar: async (): Promise<Ocorrencia[]> => {
        const r = await pool.query<LinhaOcorrencia>('select * from ocorrencias')
        return r.rows.map(paraOcorrencia)
      },

      obter: async (id: string): Promise<Ocorrencia | null> => {
        const r = await pool.query<LinhaOcorrencia>('select * from ocorrencias where id = $1', [id])
        const linha = r.rows[0]
        return linha === undefined ? null : paraOcorrencia(linha)
      },

      salvar: async (x: Ocorrencia): Promise<void> => {
        validarOcorrencia(x)
        await pool.query(
          `insert into ocorrencias
           (id, gerador_tipo, gerador_id, competencia, tipo, nome,
            valor_previsto_centavos, data_vencimento, data_pagamento,
            valor_pago_centavos, ignorado, observacao)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           on conflict (id) do update set
             gerador_tipo = excluded.gerador_tipo, gerador_id = excluded.gerador_id,
             competencia = excluded.competencia, tipo = excluded.tipo,
             nome = excluded.nome,
             valor_previsto_centavos = excluded.valor_previsto_centavos,
             data_vencimento = excluded.data_vencimento,
             data_pagamento = excluded.data_pagamento,
             valor_pago_centavos = excluded.valor_pago_centavos,
             ignorado = excluded.ignorado, observacao = excluded.observacao`,
          [
            x.id,
            x.geradorTipo,
            x.geradorId,
            x.competencia,
            x.tipo,
            x.nome,
            x.valorPrevistoCentavos,
            x.dataVencimento,
            x.dataPagamento,
            x.valorPagoCentavos,
            x.ignorado,
            x.observacao,
          ],
        )
      },

      remover: async (id: string): Promise<void> => {
        await pool.query('delete from ocorrencias where id = $1', [id])
      },

      listarPorIntervalo: async (de: Competencia, ate: Competencia): Promise<Ocorrencia[]> => {
        // Competencia e TEXT no formato AAAA-MM, que ordena lexicograficamente
        // igual a cronologicamente. `between` inclui as duas pontas, como a
        // implementacao Dexie.
        const r = await pool.query<LinhaOcorrencia>(
          'select * from ocorrencias where competencia between $1 and $2',
          [de, ate],
        )
        return r.rows.map(paraOcorrencia)
      },

      obterPorChave: async (
        geradorTipo: TipoGerador,
        geradorId: string,
        competencia: Competencia,
      ): Promise<Ocorrencia | null> => {
        const r = await pool.query<LinhaOcorrencia>(
          `select * from ocorrencias
           where gerador_tipo = $1 and gerador_id = $2 and competencia = $3`,
          [geradorTipo, geradorId, competencia],
        )
        const linha = r.rows[0]
        return linha === undefined ? null : paraOcorrencia(linha)
      },

      porGerador: async (
        geradorTipo: TipoGerador,
        geradorId: string,
      ): Promise<Ocorrencia[]> => {
        const r = await pool.query<LinhaOcorrencia>(
          'select * from ocorrencias where gerador_tipo = $1 and gerador_id = $2',
          [geradorTipo, geradorId],
        )
        return r.rows.map(paraOcorrencia)
      },
    },

    ancoras: {
      listar: async (): Promise<AncoraSaldo[]> => {
        const r = await pool.query<LinhaAncora>('select * from ancoras')
        return r.rows.map(paraAncora)
      },

      /**
       * RN-50: declarar o saldo de uma data que ja tem ancora SUBSTITUI.
       *
       * O indice unico em `data` faz o `on conflict (data)` resolver isso numa
       * unica instrucao -- a implementacao Dexie precisava de transacao e de um
       * laco apagando as da mesma data.
       */
      salvar: async (a: AncoraSaldo, hoje: DataISO): Promise<void> => {
        validarAncora(a, hoje)
        await pool.query(
          `insert into ancoras (id, data, saldo_centavos)
           values ($1,$2,$3)
           on conflict (data) do update set
             id = excluded.id, saldo_centavos = excluded.saldo_centavos`,
          [a.id, a.data, a.saldoCentavos],
        )
      },

      remover: async (id: string): Promise<void> => {
        await pool.query('delete from ancoras where id = $1', [id])
      },

      /** RN-49: a de maior data que nao ultrapassa a data pedida. */
      vigenteEm: async (data: DataISO): Promise<AncoraSaldo | null> => {
        const r = await pool.query<LinhaAncora>(
          'select * from ancoras where data <= $1 order by data desc limit 1',
          [data],
        )
        const linha = r.rows[0]
        return linha === undefined ? null : paraAncora(linha)
      },
    },

    configuracoes: {
      obter: async (chave: string): Promise<string | null> => {
        const r = await pool.query<{ valor: string }>(
          'select valor from configuracoes where chave = $1',
          [chave],
        )
        return r.rows[0]?.valor ?? null
      },

      definir: async (chave: string, valor: string): Promise<void> => {
        await pool.query(
          `insert into configuracoes (chave, valor) values ($1,$2)
           on conflict (chave) do update set valor = excluded.valor`,
          [chave, valor],
        )
      },

      ultimaExportacao: async (): Promise<DataISO | null> => {
        const r = await pool.query<{ valor: string }>(
          `select valor from configuracoes where chave = 'ultimaExportacao'`,
        )
        return r.rows[0]?.valor ?? null
      },

      registrarExportacao: async (data: DataISO): Promise<void> => {
        await pool.query(
          `insert into configuracoes (chave, valor) values ('ultimaExportacao', $1)
           on conflict (chave) do update set valor = excluded.valor`,
          [data],
        )
      },
    },
  }
}
