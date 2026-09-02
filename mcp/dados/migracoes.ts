/**
 * Migracoes do esquema.
 *
 * O SQL vive embutido, nao em arquivos .sql: ler arquivo em runtime depende do
 * diretorio de trabalho e do que o empacotador copiou, e ja quebrou um deploy
 * neste projeto por motivo parecido.
 *
 * DINHEIRO e BIGINT. Nunca NUMERIC, DECIMAL ou FLOAT: o driver devolveria
 * string ou float e reintroduziria o erro que centavos inteiros eliminam.
 *
 * DATAS sao TEXT. Nunca DATE: o driver converte DATE em Date do JavaScript
 * aplicando fuso, e um salario do dia 10 voltaria como dia 9 as 21h.
 */

import type { Pool } from 'pg'

/** Identificador do lock. Qualquer numero serve, desde que seja sempre o mesmo. */
const CHAVE_DO_LOCK = 8_742_301

const MIGRACOES: readonly string[] = [
  `
  create table if not exists regras (
    id text primary key,
    tipo text not null,
    nome text not null,
    valor_centavos bigint not null,
    valor_eh_estimativa boolean not null,
    dia_do_mes integer not null,
    ajuste_fim_de_semana text not null,
    vigente_de text not null,
    vigente_ate text,
    criado_em timestamptz not null default now()
  );

  create table if not exists parcelamentos (
    id text primary key,
    nome text not null,
    valor_parcela_centavos bigint not null,
    quantidade_parcelas integer not null,
    primeiro_vencimento text not null,
    criado_em timestamptz not null default now()
  );

  create table if not exists ocorrencias (
    id text primary key,
    gerador_tipo text not null,
    gerador_id text,
    competencia text not null,
    tipo text not null,
    nome text not null,
    valor_previsto_centavos bigint not null,
    data_vencimento text not null,
    data_pagamento text,
    valor_pago_centavos bigint,
    ignorado boolean not null,
    observacao text,
    criado_em timestamptz not null default now()
  );

  create index if not exists ocorrencias_competencia on ocorrencias (competencia);
  create index if not exists ocorrencias_gerador on ocorrencias (gerador_tipo, gerador_id);

  -- A chave de sobreposicao (RN-51). Avulsas tem gerador_id nulo e ficam fora
  -- do indice, que e correto: nunca sao buscadas por chave.
  create unique index if not exists ocorrencias_chave
    on ocorrencias (gerador_tipo, gerador_id, competencia)
    where gerador_id is not null;

  create table if not exists ancoras (
    id text primary key,
    data text not null,
    saldo_centavos bigint not null,
    criado_em timestamptz not null default now()
  );

  -- RN-50: nao existem duas ancoras na mesma data. A versao anterior mantinha
  -- as duas e desempatava por UUID, entao corrigir um saldo digitado errado
  -- funcionava em cerca de metade das vezes.
  create unique index if not exists ancoras_data on ancoras (data);

  create table if not exists configuracoes (
    chave text primary key,
    valor text not null,
    criado_em timestamptz not null default now()
  );
  `,
  // NAO edite a migracao acima: o mecanismo aplica so as versoes acima da
  // atual, e um banco ja migrado nunca reveria uma versao editada.
  //
  // `atualizado_em` mede o TOQUE, nao a criacao (RN da janela de desfazer,
  // achado 5). `criado_em` fica congelado no `insert`, e `on conflict do
  // update` nao o toca -- entao, para as duas escritas que ATUALIZAM uma
  // linha existente (pagamento sobre ocorrencia ja materializada, e
  // declarar_saldo substituindo uma ancora existente na mesma data),
  // `criado_em` mede quando a linha nasceu, nao quando a escrita que se quer
  // desfazer aconteceu. Um pagamento de hoje sobre uma ocorrencia
  // materializada ha um mes carregaria `criado_em` de um mes atras, e
  // `desfazer` recusaria como "mais de 24 horas" um pagamento feito ha
  // segundos.
  `
  alter table regras add column if not exists atualizado_em timestamptz not null default now();
  alter table parcelamentos add column if not exists atualizado_em timestamptz not null default now();
  alter table ocorrencias add column if not exists atualizado_em timestamptz not null default now();
  alter table ancoras add column if not exists atualizado_em timestamptz not null default now();
  `,
  // O saldo em moeda estrangeira fica FORA da projecao de proposito. Se
  // entrasse na ancora, o app afirmaria que o mes fecha com dinheiro que
  // ainda precisa passar por uma conversao a uma cotacao que nao aconteceu.
  //
  // `moeda` e a chave primaria: um saldo por moeda, declarar de novo
  // substitui. Nao ha historico -- e por isso esta escrita nao entra no
  // `desfazer`.
  `
  create table if not exists saldos_estrangeiros (
    moeda text primary key,
    valor_centavos bigint not null,
    data text not null,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
  );
  `,
  // RN-32 revisada: a ancora e um saldo num INSTANTE, nao num dia.
  //
  // `timestamptz`, e nao `text` como as datas (RN-04): estes campos NAO sao
  // datas de calendario, sao instantes absolutos, e precisam de fuso para
  // ordenar corretamente entre um container em UTC e um usuario em BRT. E a
  // unica excecao a RN-04 no schema.
  //
  // Nullable e sem back-fill de proposito: nulo significa "comportamento
  // anterior", e nenhum saldo ja conferido se desloca.
  `
  alter table ancoras add column if not exists declarada_em timestamptz;
  alter table ocorrencias add column if not exists pagamento_registrado_em timestamptz;
  `,
]

export async function aplicarMigracoes(pool: Pool): Promise<number> {
  const cliente = await pool.connect()

  try {
    // O lock impede que dois processos apliquem a mesma migracao ao subir
    // juntos. Ele e liberado no finally, e tambem se a conexao cair.
    await cliente.query('select pg_advisory_lock($1)', [CHAVE_DO_LOCK])

    await cliente.query(
      `create table if not exists migracoes (
        versao integer primary key,
        aplicada_em timestamptz not null default now()
      )`,
    )

    const r = await cliente.query<{ versao: number }>(
      'select coalesce(max(versao), 0) as versao from migracoes',
    )
    const atual = r.rows[0]?.versao ?? 0

    for (let i = atual; i < MIGRACOES.length; i += 1) {
      const sql = MIGRACOES[i]
      if (sql === undefined) continue

      await cliente.query('begin')
      try {
        await cliente.query(sql)
        await cliente.query('insert into migracoes (versao) values ($1)', [i + 1])
        await cliente.query('commit')
      } catch (e) {
        await cliente.query('rollback')
        throw e
      }
    }

    return MIGRACOES.length
  } finally {
    await cliente.query('select pg_advisory_unlock($1)', [CHAVE_DO_LOCK])
    cliente.release()
  }
}
