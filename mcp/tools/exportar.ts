/**
 * Exporta o estado completo no formato que o resto do sistema ja conhece.
 *
 * O banco no Railway e o unico lugar onde estes dados existem. Esta ferramenta
 * e o que permite tirar uma copia sem depender da plataforma.
 */

import { VERSAO_SCHEMA } from '../../src/data/db.js'
import type { DocumentoBackup } from '../../src/data/backup-serializer.js'
import type { AppPg } from '../app-pg.js'

export async function exportar(app: AppPg, args: { hoje: string }): Promise<DocumentoBackup> {
  const [regras, parcelamentos, ocorrencias, ancoras] = await Promise.all([
    app.repos.regras.listar(),
    app.repos.parcelamentos.listar(),
    app.repos.ocorrencias.listar(),
    app.repos.ancoras.listar(),
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
  }
}
