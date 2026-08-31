/**
 * "Quanto eu tenho no total, somando tudo?"
 *
 * Soma o saldo em reais com os saldos em moeda estrangeira, convertidos pela
 * cotacao que o assistente informa. E a unica ferramenta que ve as duas
 * coisas juntas -- a projecao continua sem saber que a moeda estrangeira
 * existe.
 */

import { competenciaDe } from '../../src/domain/calendar.js'
import type { ProjectionService } from '../../src/services/projection-service.js'
import { converter, formatarMoeda, normalizarMoeda, paraDezMilesimos } from '../cambio.js'
import type { SaldosEstrangeirosRepo } from '../dados/saldos-estrangeiros-pg.js'
import { AVISO_SALDO_RELATIVO, dinheiro, type Dinheiro } from '../formatacao.js'
import { ErroDeUsuario } from './erro-do-usuario.js'

/**
 * Texto pronto para o assistente repetir sempre que houver moeda
 * estrangeira no total.
 *
 * Sem ele, o assistente soma tudo e responde "voce tem R$ X" sobre dinheiro
 * que ainda precisa passar por uma conversao a uma cotacao que nao aconteceu.
 */
export const AVISO_CONVERSAO =
  'O valor em moeda estrangeira ainda não está disponível para pagar contas: ' +
  'ele só entra no fluxo depois de convertido em reais. O equivalente mostrado ' +
  'é uma estimativa pela cotação informada, não um valor garantido.'

export interface LinhaEmMoeda {
  readonly moeda: string
  readonly valor: string
  /** Como veio nos argumentos, para o usuario conferir. */
  readonly cotacao: string
  readonly equivalenteEmReais: Dinheiro
}

export interface Patrimonio {
  readonly emReais: Dinheiro
  readonly dataDaReferencia: string | null
  readonly emMoedaEstrangeira: readonly LinhaEmMoeda[]
  readonly total: Dinheiro
  readonly saldoRelativo: boolean
  readonly avisoSaldoRelativo: string | null
  readonly avisoConversao: string | null
}

export async function patrimonio(
  app: {
    readonly projecao: ProjectionService
    readonly saldosEstrangeiros: SaldosEstrangeirosRepo
  },
  args: { cotacoes?: Record<string, string>; hoje: string },
): Promise<Patrimonio> {
  // O saldo em reais vem da PROJECAO, nao da ancora crua: a ancora e o que
  // foi declarado numa data, e desde entao houve pagamentos e recebimentos.
  // Este e o mesmo numero que `situacao_do_mes` mostra.
  const m = await app.projecao.projetarMes(competenciaDe(args.hoje), args.hoje)

  const saldos = await app.saldosEstrangeiros.listar()

  // Normaliza as chaves para maiusculas: o assistente pode mandar "usd".
  const cotacoes = new Map<string, string>()
  for (const [chave, valor] of Object.entries(args.cotacoes ?? {})) {
    const moeda = normalizarMoeda(chave)
    if (moeda !== null) cotacoes.set(moeda, valor)
  }

  // Uma moeda com saldo e sem cotacao e erro, nao uma linha omitida: um total
  // que descarta uma moeda em silencio e um numero errado com cara de certo.
  const semCotacao = saldos.filter((s) => !cotacoes.has(s.moeda)).map((s) => s.moeda)
  if (semCotacao.length > 0) {
    throw new ErroDeUsuario(
      `Falta a cotacao de ${semCotacao.join(', ')} para somar o patrimonio. ` +
        'Busque a cotacao do dia e informe em `cotacoes`, por exemplo ' +
        '{ "USD": "5,4321" }.',
    )
  }

  const emMoedaEstrangeira: LinhaEmMoeda[] = []
  let somaEstrangeira = 0

  // `saldos` ja vem ordenado por moeda do repositorio.
  for (const s of saldos) {
    const texto = cotacoes.get(s.moeda) as string
    const cotacao = paraDezMilesimos(texto)
    if (cotacao === null) {
      throw new ErroDeUsuario(
        `Nao entendi a cotacao "${texto}" para ${s.moeda}. ` +
          'Use algo como 5,4321, com ate quatro casas decimais.',
      )
    }

    const equivalente = converter(s.valorCentavos, cotacao)
    somaEstrangeira += equivalente

    emMoedaEstrangeira.push({
      moeda: s.moeda,
      valor: formatarMoeda(s.valorCentavos, s.moeda),
      cotacao: texto,
      equivalenteEmReais: dinheiro(equivalente),
    })
  }

  return {
    emReais: dinheiro(m.saldoNaReferenciaCentavos),
    dataDaReferencia: m.dataDaReferencia,
    emMoedaEstrangeira,
    total: dinheiro(m.saldoNaReferenciaCentavos + somaEstrangeira),
    saldoRelativo: m.saldoRelativo,
    avisoSaldoRelativo: m.saldoRelativo ? AVISO_SALDO_RELATIVO : null,
    avisoConversao: emMoedaEstrangeira.length > 0 ? AVISO_CONVERSAO : null,
  }
}
