/**
 * "Quanto gastei com X nos ultimos meses?"
 *
 * Unica ferramenta com agregacao propria. Considera APENAS saidas ja pagas:
 * somar salario e conta de luz na mesma serie produziria um total que nao
 * significa nada, e incluir o que ainda nao foi pago transformaria previsao em
 * historico.
 *
 * Agrupa por um de dois eixos, escolhidos por `agruparPor`: por nome (o
 * padrao, "quanto gastei com Mercado?") ou por categoria ("quanto gastei com
 * alimentacao?"). O filtro `nome` continua filtrando por nome nos dois casos
 * -- e um recorte do conjunto, o agrupamento e o eixo da soma, e sao coisas
 * independentes.
 *
 * Por isso a resposta ecoa os dois. Agrupando por nome o filtro era evidente
 * -- os rotulos ERAM os nomes. Agrupando por categoria os rotulos sao setores,
 * e um recorte por nome produziria uma quebra por setor completa na aparencia
 * (com linha `sem_categoria` e `totalGeral`) de uma fracao do dinheiro. Com o
 * eco, a resposta nunca pode ser lida como "tudo" quando e um subconjunto.
 */

import { competenciaDe, somarMeses } from '../../src/domain/calendar.js'
import { media } from '../../src/domain/money.js'
import type { ProjectionService } from '../../src/services/projection-service.js'
import { dinheiro, type Dinheiro } from '../formatacao.js'

export interface GastoNoMes {
  readonly competencia: string
  readonly total: Dinheiro
}

export interface GastoPorGrupo {
  readonly grupo: string
  readonly total: Dinheiro
  /** Media sobre os meses em que houve gasto, nao sobre a janela inteira. */
  readonly media: Dinheiro
  readonly meses: readonly GastoNoMes[]
}

export interface HistoricoDeGastos {
  readonly de: string
  readonly ate: string
  /**
   * Filtro de nome efetivamente aplicado, ou nulo quando o relatorio cobre
   * TODAS as saidas pagas da janela. Nulo e a unica leitura possivel de "isto
   * e o total".
   */
  readonly nome: string | null
  /** Eixo em que `itens[].grupo` esta expresso. */
  readonly agruparPor: 'nome' | 'categoria'
  readonly itens: readonly GastoPorGrupo[]
  readonly totalGeral: Dinheiro
}

const MESES_PADRAO = 6

export async function historicoDeGastos(
  // Estreitado ao que a funcao realmente usa, como em o-que-vence.ts.
  app: { readonly projecao: ProjectionService },
  args: { meses?: number; nome?: string; agruparPor?: 'nome' | 'categoria'; hoje: string },
): Promise<HistoricoDeGastos> {
  const meses = args.meses ?? MESES_PADRAO
  const ate = competenciaDe(args.hoje)
  const de = somarMeses(ate, -(meses - 1))

  const resolvidas = await app.projecao.resolverIntervalo(de, ate, args.hoje)

  // Um filtro que sobra vazio depois do trim nao recorta nada -- ecoa-lo como
  // filtro aplicado diria uma inverdade sobre o conjunto somado.
  const aparado = args.nome?.trim() ?? ''
  const nome = aparado === '' ? null : aparado
  const filtro = nome?.toLowerCase() ?? null
  const agruparPor = args.agruparPor ?? 'nome'

  const pagas = resolvidas.filter(
    (o) =>
      o.tipo === 'saida' &&
      o.situacao === 'pago' &&
      (filtro === null || o.nome.toLowerCase().includes(filtro)),
  )

  // grupo -> competencia -> total
  const porGrupo = new Map<string, Map<string, number>>()

  for (const o of pagas) {
    // 'pago' implica dataPagamento preenchida, e o dominio garante que
    // valorPago acompanha. O fallback existe so para o tipo.
    const valor = o.valorPagoCentavos ?? o.valorPrevistoCentavos

    // Nulo vira uma linha propria em vez de sumir: um relatorio que soma
    // parte do dinheiro e o apresenta como o todo e pior que um que admite a
    // lacuna.
    const chave = agruparPor === 'categoria' ? (o.categoria ?? 'sem_categoria') : o.nome

    const porMes = porGrupo.get(chave) ?? new Map<string, number>()
    porMes.set(o.competencia, (porMes.get(o.competencia) ?? 0) + valor)
    porGrupo.set(chave, porMes)
  }

  const itens: GastoPorGrupo[] = [...porGrupo.entries()]
    .map(([grupo, porMes]) => {
      const ordenados = [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b))
      const totais = ordenados.map(([, v]) => v)

      return {
        grupo,
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
    nome,
    agruparPor,
    itens,
    totalGeral: dinheiro(itens.reduce((t, i) => t + i.total.valorCentavos, 0)),
  }
}
