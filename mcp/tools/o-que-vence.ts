/**
 * "O que vence nos proximos dias?"
 *
 * Le do mesmo MesProjetado da tela do mes, filtrando por janela de data. As
 * situacoes vem derivadas do dominio -- atraso nunca e recalculado aqui, e por
 * isso a RN-90 (entrada nao atrasa, fica a confirmar) vale de graca.
 *
 * A janela pode cruzar a virada do mes, entao a consulta cobre a competencia
 * de hoje e a do ultimo dia da janela, sem repetir itens.
 */

import { comparar, competenciaDe, somarDias } from '../../src/domain/calendar.js'
import type { OcorrenciaResolvida } from '../../src/domain/types.js'
import type { AppEmMemoria } from '../app-em-memoria.js'
import { dinheiro, item, type Dinheiro, type ItemFormatado } from '../formatacao.js'

export interface OQueVence {
  readonly de: string
  readonly ate: string
  readonly dias: number
  readonly atrasado: readonly ItemFormatado[]
  readonly aPagar: readonly ItemFormatado[]
  readonly aConfirmar: readonly ItemFormatado[]
  readonly totalAtrasado: Dinheiro
  readonly totalAPagar: Dinheiro
}

const DIAS_PADRAO = 7

export async function oQueVence(
  app: AppEmMemoria,
  args: { dias?: number; hoje: string },
): Promise<OQueVence> {
  const dias = args.dias ?? DIAS_PADRAO
  const ate = somarDias(args.hoje, dias)

  const competencias = [...new Set([competenciaDe(args.hoje), competenciaDe(ate)])]

  const meses = await Promise.all(
    competencias.map((c) => app.projecao.projetarMes(c, args.hoje)),
  )

  // Deduplicacao por chave: uma saida atrasada de fevereiro aparece tanto na
  // projecao de fevereiro quanto na de marco, e contar duas vezes dobraria o
  // total devido.
  // Tipagem explicita: `const x = []` sob `strict` infere `never[]` e o push
  // seguinte nao compila.
  const vistas = new Set<string>()
  const pendentesSaida: OcorrenciaResolvida[] = []
  const pendentesEntrada: OcorrenciaResolvida[] = []

  for (const m of meses) {
    for (const o of m.faltaPagar) {
      if (vistas.has(o.chave)) continue
      vistas.add(o.chave)
      pendentesSaida.push(o)
    }
    for (const o of m.aindaEntra) {
      if (vistas.has(o.chave)) continue
      vistas.add(o.chave)
      pendentesEntrada.push(o)
    }
  }

  const dentroDaJanela = (venc: string): boolean =>
    comparar(venc, args.hoje) >= 0 && comparar(venc, ate) <= 0

  const atrasado = pendentesSaida
    .filter((o) => o.situacao === 'atrasado')
    .map(item)

  const aPagar = pendentesSaida
    .filter((o) => o.situacao !== 'atrasado' && dentroDaJanela(o.dataVencimento))
    .map(item)

  // Entradas cuja data ja passou ficam 'a_confirmar' e entram sempre: o
  // assistente precisa saber que ha um recebimento pendente de confirmacao,
  // mesmo que a data tenha ficado para tras.
  const aConfirmar = pendentesEntrada
    .filter((o) => o.situacao === 'a_confirmar' || dentroDaJanela(o.dataVencimento))
    .map(item)

  const somar = (lista: readonly ItemFormatado[]): number =>
    lista.reduce((t, i) => t + i.valorCentavos, 0)

  return {
    de: args.hoje,
    ate,
    dias,
    atrasado,
    aPagar,
    aConfirmar,
    totalAtrasado: dinheiro(somar(atrasado)),
    totalAPagar: dinheiro(somar(aPagar)),
  }
}
