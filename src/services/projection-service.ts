/**
 * SVC-01 — Orquestracao da projecao de um mes.
 *
 * Carrega, delega ao dominio e devolve. Nenhuma regra de negocio vive aqui
 * (RN-62): tudo que decide algo esta na Unidade 1.
 */

import {
  comparar,
  compararCompetencias,
  construirData,
  intervaloDeCompetencias,
  somarMeses,
  ultimoDiaDoMes,
} from '../domain/calendar.js'
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

  readonly totalFaltaPagarCentavos: number
  readonly totalAindaEntraCentavos: number
  readonly totalJaResolvidoCentavos: number

  // A conta exibida no topo. Vale a identidade, por construcao:
  //   saldoNaReferencia + entraApos - saiApos === sobra
  readonly saldoNaReferenciaCentavos: number
  readonly dataDaReferencia: DataISO
  /** Falso quando o mes exibido nao contem a data corrente. */
  readonly referenciaEhHoje: boolean
  readonly entraAposReferenciaCentavos: number
  readonly saiAposReferenciaCentavos: number

  /**
   * O que compoe cada um dos dois totais acima.
   *
   * Existe para a tela poder abrir os numeros: o usuario quer ver O QUE ainda
   * entra e O QUE ainda sai, e essas listas nao coincidem com as agrupadas por
   * competencia -- um salario ja recebido no dia 5 pertence ao mes, mas nao ao
   * que ainda esta por vir.
   */
  readonly detalheEntraApos: readonly OcorrenciaResolvida[]
  readonly detalheSaiApos: readonly OcorrenciaResolvida[]
  readonly sobraCentavos: number

  /**
   * Verdadeiro quando o nivel da curva e arbitrario -- sem ancora, ou com a
   * ancora posterior ao mes exibido.
   *
   * A interface precisa disto para nao apresentar como absoluto um numero que
   * e relativo. Antes o aviso dependia apenas da ausencia de ancora, e abrir um
   * mes anterior a ela mostrava valores relativos sem qualquer indicacao.
   */
  readonly saldoRelativo: boolean
}

/**
 * Ponto da curva que serve de referencia para a conta exibida.
 *
 * E o dia de hoje quando ele esta dentro do mes; caso contrario, o primeiro
 * ponto da curva -- para um mes futuro, tudo ainda esta por acontecer.
 */
function ultimoDiaDaCompetencia(c: Competencia): DataISO {
  return construirData(c, ultimoDiaDoMes(c))
}

function posicaoNaCurva(
  curva: CurvaSaldo,
  agora: DataISO,
): { data: DataISO; saldoCentavos: number; ehHoje: boolean } {
  const primeiro = curva.pontos[0]
  const ultimo = curva.pontos[curva.pontos.length - 1]

  if (primeiro === undefined || ultimo === undefined) {
    return { data: agora, saldoCentavos: curva.saldoInicialCentavos, ehHoje: false }
  }

  if (comparar(agora, primeiro.data) < 0) {
    // Mes inteiramente no futuro: a referencia e o saldo de partida.
    return {
      data: primeiro.data,
      saldoCentavos: curva.saldoInicialCentavos,
      ehHoje: false,
    }
  }

  if (comparar(agora, ultimo.data) > 0) {
    // Mes inteiramente no passado: nao ha nada "apos hoje" dentro dele.
    return { data: ultimo.data, saldoCentavos: ultimo.saldoCentavos, ehHoje: false }
  }

  const doDia = curva.pontos.find((p) => p.data === agora) ?? ultimo
  return { data: doDia.data, saldoCentavos: doDia.saldoCentavos, ehHoje: true }
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
  const [regras, parcelamentos, reais] = await Promise.all([
    repos.regras.listar(),
    repos.parcelamentos.listar(),
    repos.ocorrencias.listarPorIntervalo(de, ate),
  ])

  const intervalo = intervaloDeCompetencias(de, ate)

  const virtuais = [
    ...expandirRegras(regras, intervalo),
    ...expandirParcelamentos(parcelamentos, intervalo),
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

      const proprios = doMes

      // Saidas atrasadas de meses ANTERIORES continuam sendo divida e
      // aparecem junto com as do mes. Entradas de meses anteriores nao: sao
      // presumidas recebidas (RN-90) e ja estao no saldo declarado.
      //
      // A comparacao precisa ser ESTRITAMENTE ANTERIOR, nao apenas "diferente".
      // A janela de carga agora se estende um mes para frente, e um filtro por
      // desigualdade trazia as contas do mes SEGUINTE para dentro da tela como
      // se fossem divida vencida -- dobrando o total a pagar de todo mes
      // passado que o usuario abrisse.
      const atrasadasDeAntes = resolvidas.filter(
        (o) =>
          compararCompetencias(o.competencia, competencia) < 0 &&
          o.situacao === 'atrasado',
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

      // A CONTA exibida na tela vem da propria curva, nao de uma soma paralela
      // das listas.
      //
      // As listas excluem o que ja foi resolvido; a curva inclui tudo. Somar as
      // listas produzia uma conta que nao chegava ao numero grande exibido
      // acima dela -- justamente na tela cujo proposito e explicar de onde o
      // numero vem.
      //
      // Derivando dos mesmos movimentos que formaram a curva, a identidade
      // `saldoHoje + entra - sai = sobra` fecha por construcao.
      const referencia = posicaoNaCurva(curva, agora)

      let entraDepois = 0
      let saiDepois = 0
      for (const m of curva.movimentos) {
        if (comparar(m.data, referencia.data) <= 0) continue
        entraDepois += m.entradaCentavos
        saiDepois += m.saidaCentavos
      }

      // As ocorrencias por tras de cada total, para a tela poder abri-los.
      //
      // O criterio e o MESMO da soma acima -- data efetiva posterior a
      // referencia -- e nao o agrupamento por competencia usado nas listas.
      // Sao coisas diferentes: um salario recebido no dia 5 ja passou, e nao
      // esta em "ainda entra", mesmo sendo do mes exibido.
      const aposReferencia = resolvidas.filter((o) => {
        if (o.ignorado) return false
        const data = o.dataPagamento ?? o.dataVencimento
        return (
          comparar(data, referencia.data) > 0 &&
          comparar(data, ultimoDiaDaCompetencia(competencia)) <= 0
        )
      })

      const detalheEntra = aposReferencia.filter((o) => o.tipo === 'entrada')
      const detalheSai = aposReferencia.filter((o) => o.tipo === 'saida')

      return {
        competencia,
        resumo,
        curva,
        faltaPagar,
        aindaEntra,
        jaResolvido,
        ignorados: proprios.filter((o) => o.situacao === 'ignorado'),
        totalFaltaPagarCentavos: somar(faltaPagar),
        totalAindaEntraCentavos: somar(aindaEntra),
        totalJaResolvidoCentavos: somar(jaResolvido),

        saldoNaReferenciaCentavos: referencia.saldoCentavos,
        dataDaReferencia: referencia.data,
        referenciaEhHoje: referencia.ehHoje,
        entraAposReferenciaCentavos: entraDepois,
        saiAposReferenciaCentavos: saiDepois,
        detalheEntraApos: detalheEntra,
        detalheSaiApos: detalheSai,
        sobraCentavos: curva.pontos[curva.pontos.length - 1]?.saldoCentavos ?? 0,
        saldoRelativo: curva.saldoRelativo,
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
