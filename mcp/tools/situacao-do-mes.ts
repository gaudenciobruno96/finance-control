/**
 * "Como estou neste mes?"
 *
 * Enxuga o MesProjetado que o app ja calcula. Nenhuma conta e refeita aqui: os
 * numeros sao os mesmos que a tela exibe, porque vem do mesmo projetor.
 */

import { competenciaDe } from '../../src/domain/calendar.js'
import type { AppEmMemoria } from '../app-em-memoria.js'
import { dinheiro, item, ponto, type Dinheiro, type ItemFormatado } from '../formatacao.js'

export interface SituacaoDoMes {
  readonly competencia: string
  readonly sobra: Dinheiro
  readonly saldoNaReferencia: Dinheiro
  readonly dataDaReferencia: string | null
  readonly entraApos: Dinheiro
  readonly saiApos: Dinheiro
  readonly diaMinimo: { readonly data: string; readonly saldoCentavos: number; readonly saldo: string }
  readonly totalFaltaPagar: Dinheiro
  readonly totalAindaEntra: Dinheiro
  readonly jaResolvido: Dinheiro
  readonly faltaPagar: readonly ItemFormatado[]
  readonly aindaEntra: readonly ItemFormatado[]
  readonly saldoRelativo: boolean
  /**
   * Texto pronto para o assistente repetir quando nao ha ancora.
   *
   * Sem ele, um saldo relativo seria lido como saldo absoluto e o assistente
   * afirmaria "voce tem R$ X" sobre um numero que so tem forma, nao nivel --
   * o erro mais caro que esta ferramenta poderia cometer.
   */
  readonly avisoSaldoRelativo: string | null
}

const AVISO =
  'Nao ha ancora de saldo cadastrada. Os valores de saldo sao RELATIVOS: a ' +
  'forma da curva e o dia de aperto estao corretos, mas o nivel esta ' +
  'deslocado. Nao afirme um saldo absoluto a partir deles.'

export async function situacaoDoMes(
  app: AppEmMemoria,
  args: { competencia?: string; hoje: string },
): Promise<SituacaoDoMes> {
  const competencia = args.competencia ?? competenciaDe(args.hoje)
  const m = await app.projecao.projetarMes(competencia, args.hoje)

  return {
    competencia,
    sobra: dinheiro(m.sobraCentavos),
    saldoNaReferencia: dinheiro(m.saldoNaReferenciaCentavos),
    dataDaReferencia: m.dataDaReferencia,
    entraApos: dinheiro(m.entraAposReferenciaCentavos),
    saiApos: dinheiro(m.saiAposReferenciaCentavos),
    diaMinimo: ponto(m.curva.diaMinimo),
    totalFaltaPagar: dinheiro(m.totalFaltaPagarCentavos),
    totalAindaEntra: dinheiro(m.totalAindaEntraCentavos),
    jaResolvido: dinheiro(m.totalJaResolvidoCentavos),
    faltaPagar: m.faltaPagar.map(item),
    aindaEntra: m.aindaEntra.map(item),
    saldoRelativo: m.saldoRelativo,
    avisoSaldoRelativo: m.saldoRelativo ? AVISO : null,
  }
}
