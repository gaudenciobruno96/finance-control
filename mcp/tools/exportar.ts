/**
 * Exporta o estado completo no formato que o resto do sistema ja conhece.
 *
 * O banco no Railway e o unico lugar onde estes dados existem. Esta ferramenta
 * e o que permite tirar uma copia sem depender da plataforma.
 */

import { VERSAO_SCHEMA } from '../../src/data/db.js'
import type { DocumentoBackup } from '../../src/data/backup-serializer.js'
import type { AppPg } from '../app-pg.js'
import type { SaldoEstrangeiro } from '../dados/saldos-estrangeiros-pg.js'

/**
 * O documento de backup mais os saldos em moeda estrangeira, como campo
 * IRMAO -- nao dentro de `DocumentoBackup`.
 *
 * Duas razoes: `DocumentoBackup` vive em `src/`, que esta congelado, entao
 * nao daria para alterar mesmo se fizesse sentido. E `simular_cenario`
 * consome o mesmo documento que esta ferramenta produz (ver o registro dele
 * em `servidor-http.ts`) e injeta num banco em memoria via
 * `criarAppDoBackup` -- se o saldo estrangeiro entrasse em `DocumentoBackup`,
 * o cenario simulado passaria a enxergar moeda estrangeira, reabrindo
 * exatamente o vazamento que a decisao central do desenho fecha (o dolar
 * fica fora da projecao).
 */
export interface DocumentoExportado extends DocumentoBackup {
  readonly saldosEstrangeiros: readonly SaldoEstrangeiro[]
}

export async function exportar(app: AppPg, args: { hoje: string }): Promise<DocumentoExportado> {
  const [regras, parcelamentos, ocorrencias, ancoras, saldosEstrangeiros] = await Promise.all([
    app.repos.regras.listar(),
    app.repos.parcelamentos.listar(),
    app.repos.ocorrencias.listar(),
    app.repos.ancoras.listar(),
    app.saldosEstrangeiros.listar(),
  ])

  return {
    versaoSchema: VERSAO_SCHEMA,
    exportadoEm: args.hoje,
    regras,
    parcelamentos,
    ocorrencias,
    ancoras,
    // As configuracoes do app antigo (ultima exportacao) nao tem sentido aqui:
    // nada as le, e exporta-las carregaria estado da plataforma para dentro do
    // documento.
    configuracoes: [],
    saldosEstrangeiros,
  }
}
