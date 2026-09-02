/**
 * "Como estou neste mes?"
 *
 * Enxuga o MesProjetado que o app ja calcula. Nenhuma conta e refeita aqui: os
 * numeros sao os mesmos que a tela exibe, porque vem do mesmo projetor.
 */

import { competenciaDe } from '../../src/domain/calendar.js'
import type { ProjectionService } from '../../src/services/projection-service.js'
import {
  AVISO_SALDO_RELATIVO,
  dinheiro,
  item,
  ponto,
  type Dinheiro,
  type ItemFormatado,
  type PontoFormatado,
} from '../formatacao.js'

export interface SituacaoDoMes {
  readonly competencia: string
  readonly sobra: Dinheiro
  readonly saldoNaReferencia: Dinheiro
  readonly dataDaReferencia: string | null
  readonly entraApos: Dinheiro
  readonly saiApos: Dinheiro
  readonly diaMinimo: PontoFormatado
  readonly totalFaltaPagar: Dinheiro
  readonly totalAindaEntra: Dinheiro
  readonly jaResolvido: Dinheiro
  readonly faltaPagar: readonly ItemFormatado[]
  readonly aindaEntra: readonly ItemFormatado[]
  /**
   * Contas tiradas da projecao deste mes por `ignorar_conta`.
   *
   * Nao entram em nenhum total: estao aqui porque a CHAVE delas nao aparecia
   * em lugar nenhum. Sem esta lista, o unico lugar onde a chave de uma conta
   * ignorada existia era o recibo da chamada que a ignorou -- numa conversa
   * seguinte, `ignorar_conta(ignorar: false)` nao tinha como ser enderecada, e
   * a reativacao ficava inalcancavel.
   */
  readonly ignorados: readonly ItemFormatado[]
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

export async function situacaoDoMes(
  app: { readonly projecao: ProjectionService },
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
    ignorados: m.ignorados.map(item),
    saldoRelativo: m.saldoRelativo,
    avisoSaldoRelativo: m.saldoRelativo ? AVISO_SALDO_RELATIVO : null,
  }
}
