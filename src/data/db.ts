/**
 * DAT-01 — Schema Dexie e migracoes.
 *
 * Cada indice declarado aqui serve a uma consulta identificada nos fluxos de
 * `services.md`. Nenhum existe por precaucao.
 */

import Dexie, { type EntityTable } from 'dexie'
import type {
  AncoraSaldo,
  Ocorrencia,
  Parcelamento,
  Regra,
} from '../domain/types.js'

/** Par chave-valor para o que nao e entidade de negocio. */
export interface Configuracao {
  readonly chave: string
  readonly valor: string
}

/** Versao corrente do schema. Vai gravada em todo arquivo de backup. */
export const VERSAO_SCHEMA = 4

export type BancoFinanceiro = Dexie & {
  regras: EntityTable<Regra, 'id'>
  parcelamentos: EntityTable<Parcelamento, 'id'>
  ocorrencias: EntityTable<Ocorrencia, 'id'>
  ancoras: EntityTable<AncoraSaldo, 'id'>
  configuracoes: EntityTable<Configuracao, 'chave'>
}

/**
 * Declara o schema em um banco.
 *
 * Extraida para funcao propria porque os testes precisam criar bancos
 * independentes, e o caminho de migracao precisa ser reutilizavel pela
 * importacao de backup (RN-55).
 */
export function declararSchema(db: Dexie): void {
  db.version(1).stores({
    regras: 'id, vigenteDe',
    parcelamentos: 'id, cartaoId',
    cartoes: 'id',
    // A chave de sobreposicao NAO e armazenada como campo: e indexada pelo
    // composto dos tres campos que a compoem. Guardar a chave concatenada
    // duplicaria dado derivado, que pode divergir da fonte.
    //
    // Ocorrencias avulsas tem geradorId nulo e por isso ficam fora deste
    // indice -- o que e correto, porque nunca sao buscadas por chave (RN-26).
    ocorrencias:
      'id, competencia, [geradorTipo+geradorId+competencia], [geradorTipo+geradorId]',
    ancoras: 'id, data',
    configuracoes: 'chave',
  })

  // Versao 2: o cartao deixou de ser uma entidade.
  //
  // A fatura passou a ser lancada como despesa recorrente de valor variavel, e
  // o parcelamento perdeu o vinculo com cartao. Com isso desaparece a nocao de
  // componente de fatura e, junto com ela, toda a protecao contra contar o
  // mesmo dinheiro duas vezes -- que so precisava existir porque a parcela
  // vivia dentro da fatura.
  db.version(2)
    .stores({
      regras: 'id, vigenteDe',
      parcelamentos: 'id',
      // Tabela removida.
      cartoes: null,
      ocorrencias:
        'id, competencia, [geradorTipo+geradorId+competencia], [geradorTipo+geradorId]',
      ancoras: 'id, data',
      configuracoes: 'chave',
    })
    .upgrade(async (tx) => {
      await tx
        .table('parcelamentos')
        .toCollection()
        .modify((p: Record<string, unknown>) => {
          delete p['cartaoId']
        })
    })

  // Versao 3: a ancora ganhou instante de declaracao, e o pagamento, instante
  // de registro (RN-32 revisada).
  //
  // O tipo declara `string | null`, e o codigo que desempata compara contra
  // `null`. Mas um registro gravado ANTES desta mudanca nao tem o campo: em
  // IndexedDB o ausente le como `undefined`, e `undefined === null` e falso.
  // Sem esta migracao, `undefined <= undefined` tambem e falso, e a RN-32
  // deixaria de valer para todo dado que ja esta no aparelho -- um mes passado
  // passaria a descontar de novo pagamentos que o saldo declarado ja continha,
  // mostrando menos do que o banco.
  //
  // Gravar `null` deixa o dado armazenado coerente com o tipo declarado, em
  // vez de normalizar a cada leitura.
  db.version(3)
    .stores({
      regras: 'id, vigenteDe',
      parcelamentos: 'id',
      ocorrencias:
        'id, competencia, [geradorTipo+geradorId+competencia], [geradorTipo+geradorId]',
      ancoras: 'id, data',
      configuracoes: 'chave',
    })
    .upgrade(async (tx) => {
      await tx
        .table('ocorrencias')
        .toCollection()
        .modify((o: Record<string, unknown>) => {
          if (o['pagamentoRegistradoEm'] === undefined) {
            o['pagamentoRegistradoEm'] = null
          }
        })

      await tx
        .table('ancoras')
        .toCollection()
        .modify((a: Record<string, unknown>) => {
          if (a['declaradaEm'] === undefined) a['declaradaEm'] = null
        })
    })

  // Versao 4: categoria de gasto.
  //
  // O tipo declara `Categoria | null`, e `validarRegra`/`validarParcelamento`/
  // `validarOcorrencia` exigem que o campo seja nulo ou uma categoria
  // conhecida. Um registro gravado ANTES desta mudanca nao tem o campo: em
  // IndexedDB o ausente le como `undefined`, e `undefined !== null` -- a
  // proxima escrita sobre esse registro (ex.: registrar um pagamento) levaria
  // `undefined` para o validador e seria recusada com CATEGORIA_INVALIDA.
  //
  // Gravar `null` deixa o dado armazenado coerente com o tipo declarado, em
  // vez de normalizar a cada leitura.
  db.version(4)
    .stores({
      regras: 'id, vigenteDe',
      parcelamentos: 'id',
      ocorrencias:
        'id, competencia, [geradorTipo+geradorId+competencia], [geradorTipo+geradorId]',
      ancoras: 'id, data',
      configuracoes: 'chave',
    })
    .upgrade(async (tx) => {
      await tx
        .table('regras')
        .toCollection()
        .modify((r: Record<string, unknown>) => {
          if (r['categoria'] === undefined) r['categoria'] = null
        })

      await tx
        .table('parcelamentos')
        .toCollection()
        .modify((p: Record<string, unknown>) => {
          if (p['categoria'] === undefined) p['categoria'] = null
        })

      await tx
        .table('ocorrencias')
        .toCollection()
        .modify((o: Record<string, unknown>) => {
          if (o['categoria'] === undefined) o['categoria'] = null
        })
    })
}

let instancia: BancoFinanceiro | null = null

/** Instancia unica do banco da aplicacao. */
export function obterBanco(): BancoFinanceiro {
  if (instancia === null) {
    instancia = criarBanco('finance-control')
  }
  return instancia
}

/**
 * Cria um banco com o schema declarado. Usada pela aplicacao e pelos testes,
 * que precisam de bancos isolados entre si.
 */
export function criarBanco(nome: string): BancoFinanceiro {
  const db = new Dexie(nome) as BancoFinanceiro
  declararSchema(db)
  return db
}

/** Reinicia a instancia unica. Usada apenas em teste. */
export function reiniciarInstancia(): void {
  instancia = null
}
