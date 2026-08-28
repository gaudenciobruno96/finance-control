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

export interface PontoFormatado {
  readonly data: string
  readonly saldoCentavos: number
  readonly saldo: string
}

export function ponto(p: PontoCurva): PontoFormatado {
  return {
    data: p.data,
    saldoCentavos: p.saldoCentavos,
    saldo: formatarBRL(p.saldoCentavos),
  }
}

/**
 * Texto pronto para o assistente repetir quando o saldo devolvido e relativo.
 *
 * Compartilhado entre `situacao_do_mes` e `simular_cenario`: as duas
 * ferramentas herdam o mesmo risco de RN-30 (sem ancora, ou com ancora fora
 * do mes exibido, o saldo tem forma mas nao tem nivel), e um assistente que
 * le so uma delas nao pode ficar sem a mesma defesa.
 */
export const AVISO_SALDO_RELATIVO =
  'Nao ha ancora de saldo cadastrada. Os valores de saldo sao RELATIVOS: a ' +
  'forma da curva e o dia de aperto estao corretos, mas o nivel esta ' +
  'deslocado. Nao afirme um saldo absoluto a partir deles.'
