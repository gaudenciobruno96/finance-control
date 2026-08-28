/**
 * Traducao das estruturas do dominio para o que o assistente le.
 *
 * Todo valor sai em dois campos: os centavos inteiros, para o assistente
 * calcular, e o texto em BRL, para ele escrever. Devolver so o inteiro
 * convidava a ler `34000` como trinta e quatro mil reais; devolver so o texto
 * impedia qualquer conta.
 *
 * A formatacao em si vem de `formatarBRL`, ja coberta pelos testes do
 * dominio. Aqui so se monta o envelope.
 */

import { formatarBRL } from '../src/domain/money.js'
import type {
  Centavos,
  OcorrenciaResolvida,
  PontoCurva,
} from '../src/domain/types.js'

export interface Dinheiro {
  readonly valorCentavos: number
  readonly valor: string
}

export function dinheiro(centavos: Centavos): Dinheiro {
  return { valorCentavos: centavos, valor: formatarBRL(centavos) }
}

export interface ItemFormatado {
  readonly nome: string
  readonly tipo: 'entrada' | 'saida'
  readonly situacao: string
  readonly dataVencimento: string
  readonly dataPagamento: string | null
  readonly competencia: string
  readonly numeroParcela: number | null
  readonly valorCentavos: number
  readonly valor: string
}

/**
 * Valor efetivo: o pago prevalece sobre o previsto (RN-31). Mesma escolha do
 * projetor de curva -- se divergissem, a lista nao explicaria o total.
 */
function valorEfetivo(o: OcorrenciaResolvida): Centavos {
  return o.valorPagoCentavos ?? o.valorPrevistoCentavos
}

export function item(o: OcorrenciaResolvida): ItemFormatado {
  return {
    nome: o.nome,
    tipo: o.tipo,
    situacao: o.situacao,
    dataVencimento: o.dataVencimento,
    dataPagamento: o.dataPagamento,
    competencia: o.competencia,
    numeroParcela: o.numeroParcela,
    ...dinheiro(valorEfetivo(o)),
  }
}

export function ponto(p: PontoCurva): {
  readonly data: string
  readonly saldoCentavos: number
  readonly saldo: string
} {
  return {
    data: p.data,
    saldoCentavos: p.saldoCentavos,
    saldo: formatarBRL(p.saldoCentavos),
  }
}
