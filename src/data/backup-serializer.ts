/**
 * DAT-03 — Serializacao do estado completo para backup.
 */

import type {
  AncoraSaldo,
  Cartao,
  DataISO,
  Ocorrencia,
  Parcelamento,
  Regra,
} from '../domain/types.js'
import { VERSAO_SCHEMA, type BancoFinanceiro, type Configuracao } from './db.js'
import {
  validarCartao,
  validarOcorrencia,
  validarParcelamento,
  validarRegra,
} from './invariants.js'

export interface DocumentoBackup {
  readonly versaoSchema: number
  readonly exportadoEm: DataISO
  readonly regras: readonly Regra[]
  readonly parcelamentos: readonly Parcelamento[]
  readonly cartoes: readonly Cartao[]
  readonly ocorrencias: readonly Ocorrencia[]
  readonly ancoras: readonly AncoraSaldo[]
  readonly configuracoes: readonly Configuracao[]
}

/** Le todas as tabelas e monta o documento de backup. */
export async function serializar(
  db: BancoFinanceiro,
  hoje: DataISO,
): Promise<DocumentoBackup> {
  const [regras, parcelamentos, cartoes, ocorrencias, ancoras, configuracoes] =
    await Promise.all([
      db.regras.toArray(),
      db.parcelamentos.toArray(),
      db.cartoes.toArray(),
      db.ocorrencias.toArray(),
      db.ancoras.toArray(),
      db.configuracoes.toArray(),
    ])

  return {
    versaoSchema: VERSAO_SCHEMA,
    // Nao participa da restauracao: existe para o usuario distinguir arquivos
    // ao escolher qual importar.
    exportadoEm: hoje,
    regras,
    parcelamentos,
    cartoes,
    ocorrencias,
    ancoras,
    configuracoes,
  }
}

/**
 * Escreve o documento no banco, substituindo integralmente o estado (RN-57).
 *
 * Roda em transacao unica: limpar sem escrever, ou escrever pela metade,
 * deixaria o usuario sem dado algum.
 */
export async function escrever(
  db: BancoFinanceiro,
  doc: DocumentoBackup,
): Promise<void> {
  // Segunda barreira, antes da escrita em lote.
  //
  // `bulkPut` nao passa pelos repositorios, e portanto contorna as invariantes
  // de escrita. Validar aqui garante que nenhum caminho -- nem mesmo um
  // arquivo que atravessasse o validador -- grave um registro invalido.
  //
  // Uma falha aqui aborta a transacao inteira: o banco fica como estava.
  for (const r of doc.regras) validarRegra(r)
  for (const c of doc.cartoes) validarCartao(c)
  for (const p of doc.parcelamentos) validarParcelamento(p)
  for (const o of doc.ocorrencias) validarOcorrencia(o)

  await db.transaction(
    'rw',
    [db.regras, db.parcelamentos, db.cartoes, db.ocorrencias, db.ancoras, db.configuracoes],
    async () => {
      await Promise.all([
        db.regras.clear(),
        db.parcelamentos.clear(),
        db.cartoes.clear(),
        db.ocorrencias.clear(),
        db.ancoras.clear(),
        db.configuracoes.clear(),
      ])

      await Promise.all([
        db.regras.bulkPut([...doc.regras]),
        db.parcelamentos.bulkPut([...doc.parcelamentos]),
        db.cartoes.bulkPut([...doc.cartoes]),
        db.ocorrencias.bulkPut([...doc.ocorrencias]),
        db.ancoras.bulkPut([...doc.ancoras]),
        db.configuracoes.bulkPut([...doc.configuracoes]),
      ])
    },
  )
}

/**
 * Migra um documento de versao anterior para a versao corrente (RN-55).
 *
 * Idempotente: aplicar duas vezes produz o mesmo resultado. A garantia importa
 * porque este caminho e reutilizado pela importacao, fora do controle do
 * Dexie.
 *
 * Na versao 1 nao ha migracao a fazer. Cada versao futura acrescenta seu passo
 * aqui, e o documento atravessa a cadeia inteira ate a versao corrente.
 */
export function migrarDocumento(doc: DocumentoBackup): DocumentoBackup {
  let atual = doc

  // Exemplo do formato que as migracoes futuras seguirao:
  // if (atual.versaoSchema < 2) atual = { ...deVersao1Para2(atual), versaoSchema: 2 }

  if (atual.versaoSchema < VERSAO_SCHEMA) {
    atual = { ...atual, versaoSchema: VERSAO_SCHEMA }
  }

  return atual
}
