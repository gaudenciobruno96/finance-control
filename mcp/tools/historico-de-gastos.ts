/**
 * "Quanto gastei com X nos ultimos meses?"
 *
 * Unica ferramenta com agregacao propria. Considera APENAS saidas ja pagas:
 * somar salario e conta de luz na mesma serie produziria um total que nao
 * significa nada, e incluir o que ainda nao foi pago transformaria previsao em
 * historico.
 */

import { competenciaDe, somarMeses } from '../../src/domain/calendar.js'
import { media } from '../../src/domain/money.js'
import type { AppEmMemoria } from '../app-em-memoria.js'
import { dinheiro, type Dinheiro } from '../formatacao.js'

export interface GastoNoMes {
  readonly competencia: string
  readonly total: Dinheiro
}

export interface GastoPorNome {
  readonly nome: string
  readonly total: Dinheiro
  /** Media sobre os meses em que houve gasto, nao sobre a janela inteira. */
  readonly media: Dinheiro
  readonly meses: readonly GastoNoMes[]
}

export interface HistoricoDeGastos {
  readonly de: string
  readonly ate: string
  readonly itens: readonly GastoPorNome[]
  readonly totalGeral: Dinheiro
}

const MESES_PADRAO = 6

export async function historicoDeGastos(
  app: AppEmMemoria,
  args: { meses?: number; nome?: string; hoje: string },
): Promise<HistoricoDeGastos> {
  const meses = args.meses ?? MESES_PADRAO
  const ate = competenciaDe(args.hoje)
  const de = somarMeses(ate, -(meses - 1))

  const resolvidas = await app.projecao.resolverIntervalo(de, ate, args.hoje)

  const filtro = args.nome?.trim().toLowerCase()

  const pagas = resolvidas.filter(
    (o) =>
      o.tipo === 'saida' &&
      o.situacao === 'pago' &&
      (filtro === undefined || o.nome.toLowerCase().includes(filtro)),
  )

  // nome -> competencia -> total
  const porNome = new Map<string, Map<string, number>>()

  for (const o of pagas) {
    // 'pago' implica dataPagamento preenchida, e o dominio garante que
    // valorPago acompanha. O fallback existe so para o tipo.
    const valor = o.valorPagoCentavos ?? o.valorPrevistoCentavos

    const porMes = porNome.get(o.nome) ?? new Map<string, number>()
    porMes.set(o.competencia, (porMes.get(o.competencia) ?? 0) + valor)
    porNome.set(o.nome, porMes)
  }

  const itens: GastoPorNome[] = [...porNome.entries()]
    .map(([nome, porMes]) => {
      const ordenados = [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b))
      const totais = ordenados.map(([, v]) => v)

      return {
        nome,
        total: dinheiro(totais.reduce((t, v) => t + v, 0)),
        media: dinheiro(media(totais) ?? 0),
        meses: ordenados.map(([competencia, v]) => ({
          competencia,
          total: dinheiro(v),
        })),
      }
    })
    .sort((a, b) => b.total.valorCentavos - a.total.valorCentavos)

  return {
    de,
    ate,
    itens,
    totalGeral: dinheiro(itens.reduce((t, i) => t + i.total.valorCentavos, 0)),
  }
}
