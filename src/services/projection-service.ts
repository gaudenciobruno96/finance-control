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

export interface MesProjetado {
  readonly competencia: Competencia
  readonly resumo: ResumoMes
  readonly curva: CurvaSaldo
  readonly atrasados: readonly OcorrenciaResolvida[]
  readonly aVencer: readonly OcorrenciaResolvida[]
  readonly pagos: readonly OcorrenciaResolvida[]
  readonly ignorados: readonly OcorrenciaResolvida[]
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
        resolverIntervalo(repos, de, competencia, agora),
        repos.ancoras.vigenteEm(agora),
      ])

      const curva = projetarCurva(resolvidas, ancora, competencia, agora)
      const resumo = resumirMes(resolvidas, curva, competencia)

      const doMes = resolvidas.filter((o) => o.competencia === competencia)

      return {
        competencia,
        resumo,
        curva,
        // Atrasados vem do intervalo INTEIRO, nao so da competencia: uma conta
        // de junho ainda nao paga precisa aparecer na tela de agosto.
        atrasados: resolvidas.filter((o) => o.situacao === 'atrasado'),
        aVencer: doMes.filter((o) => o.situacao === 'previsto'),
        pagos: doMes.filter((o) => o.situacao === 'pago'),
        ignorados: doMes.filter((o) => o.situacao === 'ignorado'),
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
