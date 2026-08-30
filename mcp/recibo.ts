/**
 * O recibo de uma escrita.
 *
 * Toda ferramenta de escrita devolve o que ficou gravado, com identificador e
 * um resumo pronto para o assistente repetir. Esta e a alternativa deliberada
 * a confirmar antes de gravar: o risco real nao e o usuario nao perceber que
 * gravou, e o modelo interpretar errado data, valor ou natureza -- e mostrar o
 * registro final e o que expoe isso.
 */

export type TipoDeEscrita = 'recorrente' | 'avulso' | 'pagamento' | 'saldo'

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

export const JANELA_DE_DESFAZER_HORAS = 24

const MS_POR_HORA = 60 * 60 * 1000

/**
 * Desfazer alcanca so o passado recente.
 *
 * Desfazer algo de tres meses atras nao e desfazer, e edicao -- e edicao de
 * registro antigo deve ser explicita, nunca efeito colateral de uma ferramenta
 * chamada "desfazer". Sem o limite, `desfazer` seria `apagar_qualquer_coisa`, e
 * um identificador trocado apagaria historia.
 */
export function dentroDaJanela(criadoEm: Date, agora: Date): boolean {
  const decorrido = agora.getTime() - criadoEm.getTime()
  return decorrido >= 0 && decorrido <= JANELA_DE_DESFAZER_HORAS * MS_POR_HORA
}
