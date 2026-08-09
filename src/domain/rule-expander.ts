/**
 * DOM-04 — Expansao de regras recorrentes em ocorrencias virtuais
 * (RN-11, RN-12).
 */

import {
  aplicarAjuste,
  compararCompetencias,
  construirData,
} from './calendar.js'
import { chaveDe } from './occurrence-key.js'
import type { Competencia, OcorrenciaResolvida, Regra } from './types.js'

/** Verdadeiro quando a regra esta vigente na competencia (RN-12). */
export function regraVigenteEm(regra: Regra, c: Competencia): boolean {
  if (compararCompetencias(c, regra.vigenteDe) < 0) return false
  if (regra.vigenteAte !== null && compararCompetencias(c, regra.vigenteAte) > 0) {
    return false
  }
  return true
}

/**
 * Seleciona, entre regras da mesma linhagem, a vigente em uma competencia.
 * Devolve null quando nenhuma vigora.
 */
export function selecionarVigente(
  regras: readonly Regra[],
  c: Competencia,
): Regra | null {
  return regras.find((r) => regraVigenteEm(r, c)) ?? null
}

/**
 * Expande regras em ocorrencias virtuais, uma por competencia vigente
 * (RN-11).
 */
export function expandirRegras(
  regras: readonly Regra[],
  intervalo: readonly Competencia[],
): readonly OcorrenciaResolvida[] {
  const resultado: OcorrenciaResolvida[] = []

  for (const regra of regras) {
    for (const competencia of intervalo) {
      if (!regraVigenteEm(regra, competencia)) continue

      // A ordem importa: construir a data (truncando dia inexistente, RN-05)
      // e SO ENTAO aplicar o ajuste de fim de semana (RN-06).
      const dataBase = construirData(competencia, regra.diaDoMes)
      const dataVencimento = aplicarAjuste(dataBase, regra.ajusteFimDeSemana)

      resultado.push({
        chave: chaveDe('regra', regra.id, competencia),
        origem: 'virtual',
        idReal: null,
        situacao: 'previsto',
        ehComponenteDeFatura: false,
        cartaoId: null,
        numeroParcela: null,
        geradorTipo: 'regra',
        geradorId: regra.id,
        // RN-08: a competencia vem do laco, NAO e derivada de dataVencimento.
        // Derivar do vencimento faria uma ocorrencia de 31 de maio postergada
        // para 2 de junho migrar de competencia e mudar de chave.
        competencia,
        tipo: regra.tipo,
        nome: regra.nome,
        valorPrevistoCentavos: regra.valorCentavos,
        dataVencimento,
        dataPagamento: null,
        valorPagoCentavos: null,
        ignorado: false,
        observacao: null,
      })
    }
  }

  return resultado
}
