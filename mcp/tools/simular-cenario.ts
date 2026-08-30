/**
 * "Se eu assumir este gasto, atravesso os proximos meses?"
 *
 * Constroi DOIS bancos descartaveis a partir do mesmo documento -- um com os
 * lancamentos hipoteticos, outro sem -- e compara mes a mes.
 *
 * Os dois bancos sao sempre novos. Reaproveitar um app em cache faria um
 * cenario vazar para a consulta seguinte, que e o unico modo de esta
 * ferramenta produzir um numero errado sem falhar.
 *
 * Os lancamentos entram pelos repositorios, nao por escrita direta no banco:
 * e o que faz as invariantes de `src/data/invariants.ts` rejeitarem um dia 40
 * ou um valor fracionado antes de ele virar projecao.
 */

import {
  compararCompetencias,
  competenciaDe,
  intervaloDeCompetencias,
} from '../../src/domain/calendar.js'
import type { Ocorrencia, Parcelamento, Regra } from '../../src/domain/types.js'
import type { DocumentoBackup } from '../../src/data/backup-serializer.js'
import { novoId } from '../../src/data/ids.js'
import { criarAppDoBackup, type AppEmMemoria } from '../app-em-memoria.js'
import { ErroDeUsuario } from './erro-do-usuario.js'
import {
  AVISO_SALDO_RELATIVO,
  dinheiro,
  ponto,
  type Dinheiro,
  type PontoFormatado,
} from '../formatacao.js'

export type LancamentoHipotetico =
  | { readonly tipo: 'regra'; readonly regra: Omit<Regra, 'id'> }
  | { readonly tipo: 'parcelamento'; readonly parcelamento: Omit<Parcelamento, 'id'> }
  | { readonly tipo: 'avulso'; readonly ocorrencia: Omit<Ocorrencia, 'id'> }

export interface MesComparado {
  readonly competencia: string
  readonly semCenario: Dinheiro
  readonly comCenario: Dinheiro
  readonly diferenca: Dinheiro
  readonly diaMinimoSemCenario: PontoFormatado
  readonly diaMinimoComCenario: PontoFormatado
  /**
   * Mesmo campo que `situacao_do_mes` devolve por mes (RN-30): sem ancora
   * vigente ATE este mes, a curva parte de zero e o nivel do saldo esta
   * deslocado, mesmo que a forma e o dia de aperto continuem corretos.
   */
  readonly saldoRelativo: boolean
}

export interface Simulacao {
  readonly de: string
  readonly ate: string
  readonly meses: readonly MesComparado[]
  readonly primeiroMesNegativoSemCenario: string | null
  readonly primeiroMesNegativoComCenario: string | null
  /**
   * Saldo relativo do PRIMEIRO mes da janela (`de`), nao um "ou" entre todos
   * os meses -- e o mes em que o leitor ancora a leitura da simulacao
   * inteira. Cada `MesComparado` carrega o proprio valor para quem olha um
   * mes especifico da janela.
   */
  readonly saldoRelativo: boolean
  readonly avisoSaldoRelativo: string | null
}

/**
 * Teto de janela.
 *
 * Cada mes custa uma projecao completa em dois bancos. Sem teto, um `ate` de
 * dez anos transformaria uma pergunta casual em minutos de processamento.
 */
const MAXIMO_DE_MESES = 24

async function aplicar(
  app: AppEmMemoria,
  lancamentos: readonly LancamentoHipotetico[],
): Promise<void> {
  for (const l of lancamentos) {
    if (l.tipo === 'regra') {
      await app.repos.regras.salvar({ ...l.regra, id: novoId() })
    } else if (l.tipo === 'parcelamento') {
      await app.repos.parcelamentos.salvar({ ...l.parcelamento, id: novoId() })
    } else {
      await app.repos.ocorrencias.salvar({ ...l.ocorrencia, id: novoId() })
    }
  }
}

export async function simularCenario(
  doc: DocumentoBackup,
  args: {
    readonly lancamentos: readonly LancamentoHipotetico[]
    readonly ate: string
    readonly hoje: string
  },
): Promise<Simulacao> {
  const de = competenciaDe(args.hoje)

  // Guarda antes de chamar intervaloDeCompetencias: sem isso, um `ate`
  // anterior a `hoje` escapa como ErroDeDominio [calendar] cru, sem dizer
  // qual argumento corrigir.
  if (compararCompetencias(args.ate, de) < 0) {
    throw new ErroDeUsuario(
      `A competencia final (${args.ate}) e anterior a competencia de hoje ` +
        `(${de}). Informe um "ate" igual ou posterior a competencia atual.`,
    )
  }

  const competencias = intervaloDeCompetencias(de, args.ate)

  if (competencias.length > MAXIMO_DE_MESES) {
    throw new ErroDeUsuario(
      `Janela de ${competencias.length} meses excede o maximo de ${MAXIMO_DE_MESES}. ` +
        'Reduza a competencia final.',
    )
  }

  const base = await criarAppDoBackup(doc)
  const cenario = await criarAppDoBackup(doc)

  try {
    await aplicar(cenario, args.lancamentos)

    const meses: MesComparado[] = []
    let negativoSem: string | null = null
    let negativoCom: string | null = null
    // undefined ate o primeiro mes ser processado; depois disso, fixo -- e o
    // valor do mes `de` que decide o topo da resposta.
    let saldoRelativoDoPrimeiroMes: boolean | undefined

    for (const c of competencias) {
      const [sem, com] = await Promise.all([
        base.projecao.projetarMes(c, args.hoje),
        cenario.projecao.projetarMes(c, args.hoje),
      ])

      if (negativoSem === null && sem.sobraCentavos < 0) negativoSem = c
      if (negativoCom === null && com.sobraCentavos < 0) negativoCom = c
      saldoRelativoDoPrimeiroMes ??= sem.saldoRelativo

      meses.push({
        competencia: c,
        semCenario: dinheiro(sem.sobraCentavos),
        comCenario: dinheiro(com.sobraCentavos),
        diferenca: dinheiro(com.sobraCentavos - sem.sobraCentavos),
        diaMinimoSemCenario: ponto(sem.curva.diaMinimo),
        diaMinimoComCenario: ponto(com.curva.diaMinimo),
        // sem e com partem do mesmo documento e da mesma ancora -- o
        // lancamento hipotetico nunca muda se ha ancora vigente ou nao.
        saldoRelativo: sem.saldoRelativo,
      })
    }

    const saldoRelativo = saldoRelativoDoPrimeiroMes ?? false

    return {
      de,
      ate: args.ate,
      meses,
      primeiroMesNegativoSemCenario: negativoSem,
      primeiroMesNegativoComCenario: negativoCom,
      saldoRelativo,
      avisoSaldoRelativo: saldoRelativo ? AVISO_SALDO_RELATIVO : null,
    }
  } finally {
    // Encerra mesmo se a projecao lancar: bancos abertos vazam entre chamadas.
    await base.encerrar()
    await cenario.encerrar()
  }
}
