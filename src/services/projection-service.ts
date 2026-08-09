/**
 * SVC-01 — Orquestracao da projecao de um mes.
 *
 * Carrega, delega ao dominio e devolve. Nenhuma regra de negocio vive aqui
 * (RN-62): tudo que decide algo esta na Unidade 1.
 */

import { expandirFaturas } from '../domain/card-invoice-expander.js'
import { intervaloDeCompetencias, somarMeses } from '../domain/calendar.js'
import { expandirParcelamentos } from '../domain/installment-expander.js'
import { expandirRegras } from '../domain/rule-expander.js'
import { resolver } from '../domain/occurrence-resolver.js'
import { projetarCurva } from '../domain/balance-projector.js'
import { resumirMes } from '../domain/month-summarizer.js'
import { resumirMeses } from '../domain/future-commitments.js'
import type {
  Competencia,
  CurvaSaldo,
  DataISO,
  OcorrenciaResolvida,
  ResumoFuturo,
  ResumoMes,
} from '../domain/types.js'
import type { Repositorios } from '../data/repositories.js'

/**
 * Quantos meses para tras carregar alem da competencia pedida (RN-61).
 *
 * Carregar so a competencia corrente perderia as contas atrasadas de meses
 * anteriores, que precisam ser empurradas para hoje (RN-33). A projecao
 * mostraria um saldo mais folgado que a realidade.
 */
const MESES_RETROATIVOS = 12

/**
 * Quantos meses a frente carregar alem da competencia pedida.
 *
 * Um mes basta, e e necessario: uma ocorrencia da competencia seguinte com
 * ajuste `antecipa` -- o padrao sugerido para entradas -- pode ter vencimento
 * no ultimo dia do mes exibido. Salario do dia 1 que cai em sabado e
 * antecipado para o dia 31 do mes anterior; sem esta janela, ele sumia da
 * curva daquele mes.
 */
const MESES_A_FRENTE = 1

export interface MesProjetado {
  readonly competencia: Competencia
  readonly resumo: ResumoMes
  readonly curva: CurvaSaldo

  /**
   * Saidas que ainda vao sair da conta, vencidas ou nao.
   *
   * Inclui as atrasadas de meses anteriores dentro da janela: elas continuam
   * sendo dinheiro que voce deve.
   */
  readonly faltaPagar: readonly OcorrenciaResolvida[]

  /** Entradas ainda nao confirmadas. Nunca rotuladas como atrasadas (RN-90). */
  readonly aindaEntra: readonly OcorrenciaResolvida[]

  /** Tudo com pagamento ou recebimento registrado. */
  readonly jaResolvido: readonly OcorrenciaResolvida[]

  readonly ignorados: readonly OcorrenciaResolvida[]

  /** Parcelas de cartao, exibidas aninhadas sob a fatura a que pertencem. */
  readonly componentesDeFatura: readonly OcorrenciaResolvida[]

  readonly totalFaltaPagarCentavos: number
  readonly totalAindaEntraCentavos: number
  readonly totalJaResolvidoCentavos: number
}

/**
 * Resolve as ocorrencias de um intervalo. Extraida porque a projecao mensal e
 * a visao de futuro precisam da mesma sequencia com intervalos diferentes.
 */
async function resolverIntervalo(
  repos: Repositorios,
  de: Competencia,
  ate: Competencia,
  agora: DataISO,
): Promise<readonly OcorrenciaResolvida[]> {
  const [regras, parcelamentos, cartoes, reais] = await Promise.all([
    repos.regras.listar(),
    repos.parcelamentos.listar(),
    repos.cartoes.listar(),
    repos.ocorrencias.listarPorIntervalo(de, ate),
  ])

  const intervalo = intervaloDeCompetencias(de, ate)

  const virtuais = [
    ...expandirRegras(regras, intervalo),
    ...expandirParcelamentos(parcelamentos, intervalo),
    ...expandirFaturas(cartoes, parcelamentos, intervalo),
  ]

  return resolver(virtuais, reais, agora)
}

export function criarProjectionService(repos: Repositorios) {
  return {
    async projetarMes(competencia: Competencia, agora: DataISO): Promise<MesProjetado> {
      const de = somarMeses(competencia, -MESES_RETROATIVOS)

      const [resolvidas, ancora] = await Promise.all([
        resolverIntervalo(repos, de, somarMeses(competencia, MESES_A_FRENTE), agora),
        repos.ancoras.vigenteEm(agora),
      ])

      const curva = projetarCurva(resolvidas, ancora, competencia, agora)
      const resumo = resumirMes(resolvidas, curva, competencia)

      const doMes = resolvidas.filter((o) => o.competencia === competencia)

      // Componentes de fatura sao exibidos aninhados sob a fatura, nunca como
      // linha propria: seu valor ja esta somado nela (RN-18, RN-71).
      const componentesDeFatura = doMes.filter((o) => o.ehComponenteDeFatura)
      const proprios = doMes.filter((o) => !o.ehComponenteDeFatura)

      // Saidas atrasadas de meses ANTERIORES continuam sendo divida e
      // aparecem junto com as do mes. Entradas de meses anteriores nao: sao
      // presumidas recebidas (RN-90) e ja estao no saldo declarado.
      const atrasadasDeAntes = resolvidas.filter(
        (o) =>
          o.competencia !== competencia &&
          o.situacao === 'atrasado' &&
          !o.ehComponenteDeFatura,
      )

      const faltaPagar = [
        ...atrasadasDeAntes,
        ...proprios.filter(
          (o) => o.tipo === 'saida' && (o.situacao === 'atrasado' || o.situacao === 'previsto'),
        ),
      ]

      const aindaEntra = proprios.filter(
        (o) =>
          o.tipo === 'entrada' &&
          (o.situacao === 'previsto' || o.situacao === 'a_confirmar'),
      )

      const jaResolvido = proprios.filter((o) => o.situacao === 'pago')

      const somar = (lista: readonly OcorrenciaResolvida[]): number =>
        lista.reduce((t, o) => t + (o.valorPagoCentavos ?? o.valorPrevistoCentavos), 0)

      return {
        competencia,
        resumo,
        curva,
        faltaPagar,
        aindaEntra,
        jaResolvido,
        ignorados: proprios.filter((o) => o.situacao === 'ignorado'),
        componentesDeFatura,
        totalFaltaPagarCentavos: somar(faltaPagar),
        totalAindaEntraCentavos: somar(aindaEntra),
        totalJaResolvidoCentavos: somar(jaResolvido),
      }
    },

    async projetarFuturo(
      de: Competencia,
      meses: number,
      agora: DataISO,
    ): Promise<readonly ResumoFuturo[]> {
      const ate = somarMeses(de, meses - 1)
      const resolvidas = await resolverIntervalo(repos, de, ate, agora)
      return resumirMeses(resolvidas, intervaloDeCompetencias(de, ate))
    },

    /** Exposta para teste: permite verificar a resolucao sem a projecao. */
    resolverIntervalo: (de: Competencia, ate: Competencia, agora: DataISO) =>
      resolverIntervalo(repos, de, ate, agora),
  }
}

export type ProjectionService = ReturnType<typeof criarProjectionService>
