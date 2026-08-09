/**
 * DOM-03 — Aritmetica de calendario local (RN-04 a RN-08, RN-10).
 *
 * Toda operacao e feita sobre o texto `AAAA-MM-DD`. Nenhuma passa por `Date`
 * com semantica UTC. Isso nao e preciosismo: `new Date('2026-08-10')` no fuso
 * do Brasil resulta em 9 de agosto as 21h, e um salario do dia 10 apareceria
 * no dia 9. E um defeito classico e silencioso.
 */

import {
  diasNoMes,
  ehCompetenciaValida,
  exigirCompetencia,
  exigirData,
  exigirDiaDoMes,
} from './guards.js'
import { falhar } from './errors.js'
import type { AjusteFimDeSemana, Competencia, DataISO } from './types.js'

const COMPONENTE = 'calendar'

/** Reexportado para que a interface valide antes de chamar o dominio. */
export { ehCompetenciaValida }

// ---------------------------------------------------------------------------
// Decomposicao e composicao
// ---------------------------------------------------------------------------

interface PartesData {
  readonly ano: number
  readonly mes: number
  readonly dia: number
}

function partes(d: DataISO): PartesData {
  return {
    ano: Number(d.slice(0, 4)),
    mes: Number(d.slice(5, 7)),
    dia: Number(d.slice(8, 10)),
  }
}

function juntar(ano: number, mes: number, dia: number): DataISO {
  const a = String(ano).padStart(4, '0')
  const m = String(mes).padStart(2, '0')
  const d = String(dia).padStart(2, '0')
  return `${a}-${m}-${d}`
}

function partesCompetencia(c: Competencia): { ano: number; mes: number } {
  return { ano: Number(c.slice(0, 4)), mes: Number(c.slice(5, 7)) }
}

// ---------------------------------------------------------------------------
// Comparacao
// ---------------------------------------------------------------------------

/**
 * Comparacao de datas. Negativo se `a` vem antes, positivo se depois, zero se
 * iguais.
 *
 * O formato `AAAA-MM-DD` e ordenavel lexicograficamente, entao a comparacao de
 * texto e suficiente e exata.
 */
export function comparar(a: DataISO, b: DataISO): number {
  exigirData(a, COMPONENTE)
  exigirData(b, COMPONENTE)
  return a < b ? -1 : a > b ? 1 : 0
}

export function compararCompetencias(a: Competencia, b: Competencia): number {
  exigirCompetencia(a, COMPONENTE)
  exigirCompetencia(b, COMPONENTE)
  return a < b ? -1 : a > b ? 1 : 0
}

// ---------------------------------------------------------------------------
// Aritmetica de dias
// ---------------------------------------------------------------------------

/**
 * Avanca ou retrocede dias.
 *
 * A conversao entre data e numero de dias usa o algoritmo de Howard Hinnant
 * (`days_from_civil` / `civil_from_days`), que e exato para o calendario
 * proleptico gregoriano e nao depende de nenhum tipo de data da plataforma --
 * portanto nao ha fuso horario envolvido em ponto algum (RN-04).
 *
 * A epoca e 1970-01-01, que corresponde ao dia 0.
 */
export function somarDias(d: DataISO, n: number): DataISO {
  exigirData(d, COMPONENTE)
  return deNumeroDeDias(paraNumeroDeDias(d) + n)
}

function div(a: number, b: number): number {
  return Math.floor(a / b)
}

/** Dias decorridos desde 1970-01-01. Negativo para datas anteriores. */
function paraNumeroDeDias(data: DataISO): number {
  const { ano, mes, dia } = partes(data)
  // Marco vira o primeiro mes do "ano deslocado", o que joga o dia bissexto
  // para o fim e elimina o caso especial no meio da contagem.
  const y = ano - (mes <= 2 ? 1 : 0)
  const era = div(y >= 0 ? y : y - 399, 400)
  const anoDaEra = y - era * 400
  const diaDoAno = div(153 * (mes + (mes > 2 ? -3 : 9)) + 2, 5) + dia - 1
  const diaDaEra =
    anoDaEra * 365 + div(anoDaEra, 4) - div(anoDaEra, 100) + diaDoAno
  return era * 146097 + diaDaEra - 719468
}

function deNumeroDeDias(dias: number): DataISO {
  const z = dias + 719468
  const era = div(z >= 0 ? z : z - 146096, 146097)
  const diaDaEra = z - era * 146097
  const anoDaEra = div(
    diaDaEra - div(diaDaEra, 1460) + div(diaDaEra, 36524) - div(diaDaEra, 146096),
    365,
  )
  const y = anoDaEra + era * 400
  const diaDoAno = diaDaEra - (365 * anoDaEra + div(anoDaEra, 4) - div(anoDaEra, 100))
  const mesDeslocado = div(5 * diaDoAno + 2, 153)
  const dia = diaDoAno - div(153 * mesDeslocado + 2, 5) + 1
  const mes = mesDeslocado + (mesDeslocado < 10 ? 3 : -9)
  const ano = y + (mes <= 2 ? 1 : 0)
  return juntar(ano, mes, dia)
}

// ---------------------------------------------------------------------------
// Dia da semana
// ---------------------------------------------------------------------------

/** 0 domingo, 6 sabado. */
export function diaDaSemana(d: DataISO): number {
  exigirData(d, COMPONENTE)
  // 1970-01-01 (dia 0) foi uma quinta-feira, que e 4 nesta convencao.
  return ((paraNumeroDeDias(d) + 4) % 7 + 7) % 7
}

export function ehFimDeSemana(d: DataISO): boolean {
  const s = diaDaSemana(d)
  return s === 0 || s === 6
}

// ---------------------------------------------------------------------------
// Competencia
// ---------------------------------------------------------------------------

export function competenciaDe(d: DataISO): Competencia {
  exigirData(d, COMPONENTE)
  return d.slice(0, 7)
}

export function primeiroDiaDaCompetencia(c: Competencia): DataISO {
  exigirCompetencia(c, COMPONENTE)
  const { ano, mes } = partesCompetencia(c)
  return juntar(ano, mes, 1)
}

export function ultimoDiaDoMes(c: Competencia): number {
  exigirCompetencia(c, COMPONENTE)
  const { ano, mes } = partesCompetencia(c)
  return diasNoMes(ano, mes)
}

export function somarMeses(c: Competencia, n: number): Competencia {
  exigirCompetencia(c, COMPONENTE)
  const { ano, mes } = partesCompetencia(c)
  const totalMeses = ano * 12 + (mes - 1) + n
  const novoAno = Math.floor(totalMeses / 12)
  const novoMes = totalMeses - novoAno * 12 + 1
  return `${String(novoAno).padStart(4, '0')}-${String(novoMes).padStart(2, '0')}`
}

/**
 * Constroi a data de um dia dentro de uma competencia, truncando dia
 * inexistente no ultimo dia do mes (RN-05).
 *
 * Nunca transborda para o mes seguinte: dia 31 em abril e 30 de abril, nao
 * 1o de maio.
 */
export function construirData(c: Competencia, dia: number): DataISO {
  exigirCompetencia(c, COMPONENTE)
  exigirDiaDoMes(dia, COMPONENTE)
  const { ano, mes } = partesCompetencia(c)
  const limite = diasNoMes(ano, mes)
  return juntar(ano, mes, Math.min(dia, limite))
}

export function diasDaCompetencia(c: Competencia): readonly DataISO[] {
  exigirCompetencia(c, COMPONENTE)
  const { ano, mes } = partesCompetencia(c)
  const total = diasNoMes(ano, mes)
  const dias: DataISO[] = []
  for (let d = 1; d <= total; d += 1) dias.push(juntar(ano, mes, d))
  return dias
}

export function intervaloDeCompetencias(
  de: Competencia,
  ate: Competencia,
): readonly Competencia[] {
  exigirCompetencia(de, COMPONENTE)
  exigirCompetencia(ate, COMPONENTE)
  if (compararCompetencias(de, ate) > 0) falhar('INTERVALO_INVERTIDO', COMPONENTE)

  const resultado: Competencia[] = []
  let atual = de
  while (compararCompetencias(atual, ate) <= 0) {
    resultado.push(atual)
    atual = somarMeses(atual, 1)
  }
  return resultado
}

// ---------------------------------------------------------------------------
// Ajuste de fim de semana
// ---------------------------------------------------------------------------

/**
 * Aplica o ajuste de fim de semana (RN-06).
 *
 * Pode atravessar a fronteira do mes (RN-07): postergar 31 de maio, um sabado,
 * resulta em 2 de junho. Isso e permitido e NAO altera a competencia da
 * ocorrencia, que e determinada antes deste ajuste (RN-08).
 *
 * Feriados nao sao considerados (RN-10).
 */
export function aplicarAjuste(d: DataISO, ajuste: AjusteFimDeSemana): DataISO {
  exigirData(d, COMPONENTE)
  if (ajuste === 'nenhum') return d

  const s = diaDaSemana(d)
  if (s !== 0 && s !== 6) return d

  if (ajuste === 'antecipa') {
    return somarDias(d, s === 6 ? -1 : -2)
  }
  return somarDias(d, s === 6 ? 2 : 1)
}

/** Ajuste padrao sugerido por tipo de movimento (RN-09). */
export function ajustePadrao(tipo: 'entrada' | 'saida'): AjusteFimDeSemana {
  return tipo === 'entrada' ? 'antecipa' : 'posterga'
}
