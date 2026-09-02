/**
 * O recibo de uma escrita.
 *
 * Toda ferramenta de escrita devolve o que ficou gravado, com identificador e
 * um resumo pronto para o assistente repetir. Esta e a alternativa deliberada
 * a confirmar antes de gravar: o risco real nao e o usuario nao perceber que
 * gravou, e o modelo interpretar errado data, valor ou natureza -- e mostrar o
 * registro final e o que expoe isso.
 */

export type TipoDeEscrita = 'recorrente' | 'avulso' | 'pagamento' | 'saldo' | 'parcelamento'

export interface Recibo {
  readonly tipo: TipoDeEscrita
  readonly id: string
  readonly resumo: string
  readonly avisos: readonly string[]
}

export function montarRecibo(
  tipo: TipoDeEscrita,
  id: string,
  resumo: string,
  avisos: readonly string[] = [],
): Recibo {
  return { tipo, id, resumo, avisos }
}

// A janela de 24 horas de `desfazer` foi removida a pedido do usuario: ela
// recusava corrigir um registro antigo e mandava usar "a ferramenta de edicao
// correspondente", que nunca existiu -- um beco sem saida. Junto com ela saiu
// a tolerancia de desvio de relogio, que so servia para calcular a janela.
//
// O que protege `desfazer` agora e o que sempre fez o trabalho: o id precisa
// ser dito explicitamente, e ele so aparece num recibo ou numa consulta.

/**
 * O recibo de um ajuste em conta existente.
 *
 * Traz `antes` e `depois` porque e o que substitui o `desfazer`: reverter um
 * ajuste exigiria guardar o valor anterior, e nao guardamos. Em vez disso a
 * pessoa le o valor antigo e, se quiser, chama a ferramenta de novo com ele.
 *
 * Os dois sao texto ja formatado ("R$ 1.500,00", "2026-09-01", "ativa"):
 * quem le e uma pessoa, e o valor em centavos nao acrescenta nada aqui.
 */
export interface ReciboDeAjuste {
  readonly chave: string
  readonly nome: string
  readonly antes: string
  readonly depois: string
  readonly resumo: string
  readonly avisos: readonly string[]
}
