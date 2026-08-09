/**
 * SVC-04 — Exportacao e importacao de backup (RN-54 a RN-59).
 */

import { somarDias, comparar } from '../domain/calendar.js'
import type { BancoFinanceiro } from '../data/db.js'
import type { Repositorios } from '../data/repositories.js'
import {
  escrever,
  migrarDocumento,
  serializar,
  type DocumentoBackup,
} from '../data/backup-serializer.js'
import { validar, type ResultadoValidacao } from '../data/backup-validator.js'
import type { DataISO } from '../domain/types.js'

/** Dias sem exportar antes de o aviso aparecer (RF-31). */
export const DIAS_PARA_AVISO = 14

export function criarBackupService(db: BancoFinanceiro, repos: Repositorios) {
  return {
    /** Gera o conteudo do arquivo e registra a data da exportacao (RN-59). */
    async exportar(hoje: DataISO): Promise<string> {
      const documento = await serializar(db, hoje)
      await repos.configuracoes.registrarExportacao(hoje)
      return JSON.stringify(documento, null, 2)
    },

    /**
     * Valida o conteudo SEM tocar o banco (RN-54).
     *
     * Um arquivo corrompido, truncado ou de outra origem nao consegue produzir
     * escrita parcial: nada aqui abre transacao.
     */
    validarImportacao(conteudo: string): ResultadoValidacao {
      let bruto: unknown
      try {
        bruto = JSON.parse(conteudo)
      } catch {
        return { valido: false, erro: 'O arquivo nao e um JSON valido.' }
      }

      const resultado = validar(bruto)
      if (!resultado.valido) return resultado

      // RN-55: backup de versao anterior e migrado pelo mesmo caminho usado ao
      // abrir o banco.
      return { ...resultado, documento: migrarDocumento(resultado.documento) }
    },

    /**
     * Aplica o documento, substituindo integralmente o estado (RN-57).
     *
     * Chamada SOMENTE apos confirmacao explicita do usuario, que ja viu o
     * resumo do que sera aplicado (RN-58).
     */
    async confirmarImportacao(documento: DocumentoBackup): Promise<void> {
      await escrever(db, documento)
    },

    /** Dias decorridos desde a ultima exportacao; nulo se nunca exportou. */
    async diasDesdeUltimaExportacao(hoje: DataISO): Promise<number | null> {
      const ultima = await repos.configuracoes.ultimaExportacao()
      if (ultima === null) return null

      let dias = 0
      let cursor = ultima
      // Limite defensivo: um backup de mais de um ano ja e sinal suficiente.
      while (comparar(cursor, hoje) < 0 && dias < 400) {
        cursor = somarDias(cursor, 1)
        dias += 1
      }
      return dias
    },

    /** Verdadeiro quando o aviso de backup deve aparecer (RF-31). */
    async precisaAvisarBackup(hoje: DataISO): Promise<boolean> {
      const ultima = await repos.configuracoes.ultimaExportacao()
      if (ultima === null) {
        // Nunca exportou: so avisa se ja houver algo a perder.
        const total = await db.ocorrencias.count()
        return total > 0
      }
      return comparar(somarDias(ultima, DIAS_PARA_AVISO), hoje) <= 0
    },
  }
}

export type BackupService = ReturnType<typeof criarBackupService>
