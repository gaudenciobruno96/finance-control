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

import { competenciaDe, intervaloDeCompetencias } from '../../src/domain/calendar.js'
import type { Ocorrencia, Parcelamento, Regra } from '../../src/domain/types.js'
import type { DocumentoBackup } from '../../src/data/backup-serializer.js'
import { novoId } from '../../src/data/ids.js'
import { criarAppDoBackup, type AppEmMemoria } from '../app-em-memoria.js'
import { dinheiro, ponto, type Dinheiro } from '../formatacao.js'

export type LancamentoHipotetico =
  | { readonly tipo: 'regra'; readonly regra: Omit<Regra, 'id'> }
  | { readonly tipo: 'parcelamento'; readonly parcelamento: Omit<Parcelamento, 'id'> }
  | { readonly tipo: 'avulso'; readonly ocorrencia: Omit<Ocorrencia, 'id'> }

export interface MesComparado {
  readonly competencia: string
  readonly semCenario: Dinheiro
  readonly comCenario: Dinheiro
  readonly diferenca: Dinheiro
  readonly diaMinimoComCenario: {
    readonly data: string
    readonly saldoCentavos: number
    readonly saldo: string
  }
}

export interface Simulacao {
  readonly de: string
  readonly ate: string
  readonly meses: readonly MesComparado[]
  readonly primeiroMesNegativoSemCenario: string | null
  readonly primeiroMesNegativoComCenario: string | null
  readonly saldoRelativo: boolean
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
  const competencias = intervaloDeCompetencias(de, args.ate)

  if (competencias.length > MAXIMO_DE_MESES) {
    throw new Error(
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

    for (const c of competencias) {
      const [sem, com] = await Promise.all([
        base.projecao.projetarMes(c, args.hoje),
        cenario.projecao.projetarMes(c, args.hoje),
      ])

      if (negativoSem === null && sem.sobraCentavos < 0) negativoSem = c
      if (negativoCom === null && com.sobraCentavos < 0) negativoCom = c

      meses.push({
        competencia: c,
        semCenario: dinheiro(sem.sobraCentavos),
        comCenario: dinheiro(com.sobraCentavos),
        diferenca: dinheiro(com.sobraCentavos - sem.sobraCentavos),
        diaMinimoComCenario: ponto(com.curva.diaMinimo),
      })
    }

    return {
      de,
      ate: args.ate,
      meses,
      primeiroMesNegativoSemCenario: negativoSem,
      primeiroMesNegativoComCenario: negativoCom,
      saldoRelativo: doc.ancoras.length === 0,
    }
  } finally {
    // Encerra mesmo se a projecao lancar: bancos abertos vazam entre chamadas.
    await base.encerrar()
    await cenario.encerrar()
  }
}
