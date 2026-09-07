/**
 * SUP-01 — Erro de dominio tipado (PAD-01).
 *
 * Uma classe propria, distinta dos erros nativos, permite as camadas
 * superiores distinguirem um defeito de dominio de uma falha de I/O. Sao
 * naturezas diferentes: erro de banco e condicao operacional recuperavel;
 * erro de dominio e defeito de programacao.
 *
 * RESTRICAO DE CONTEUDO (NFR-S05): a mensagem descreve QUAL invariante foi
 * violada, jamais o valor que a violou. Dado financeiro nao vaza por mensagem
 * de erro.
 */

export type CodigoInvariante =
  | 'VALOR_NAO_INTEIRO'
  | 'VALOR_NAO_POSITIVO'
  | 'MULTIPLICADOR_NAO_INTEIRO'
  | 'DATA_INVALIDA'
  | 'COMPETENCIA_INVALIDA'
  | 'DIA_DO_MES_INVALIDO'
  | 'INTERVALO_INVERTIDO'
  | 'VIGENCIA_INVERTIDA'
  | 'QUANTIDADE_PARCELAS_INVALIDA'
  | 'ANCORA_FUTURA'
  | 'REFERENCIA_INEXISTENTE'
  | 'GERADOR_INCONSISTENTE'
  | 'PAGAMENTO_INCOMPLETO'
  | 'TIPO_INVALIDO'
  | 'INSTANTE_INVALIDO'
  | 'CATEGORIA_INVALIDA'

/**
 * Mensagens fixas por codigo. Sao constantes deliberadamente: uma mensagem
 * interpolada com o dado recebido violaria NFR-S05.
 */
const MENSAGENS: Record<CodigoInvariante, string> = {
  VALOR_NAO_INTEIRO: 'valor monetario deve ser inteiro em centavos',
  VALOR_NAO_POSITIVO: 'valor monetario deve ser maior que zero',
  MULTIPLICADOR_NAO_INTEIRO: 'multiplicador deve ser inteiro',
  DATA_INVALIDA: 'data deve estar no formato AAAA-MM-DD e ser um dia valido',
  COMPETENCIA_INVALIDA: 'competencia deve estar no formato AAAA-MM',
  DIA_DO_MES_INVALIDO: 'dia do mes deve estar entre 1 e 31',
  INTERVALO_INVERTIDO: 'fim do intervalo nao pode ser anterior ao inicio',
  VIGENCIA_INVERTIDA: 'fim da vigencia nao pode ser anterior ao inicio',
  QUANTIDADE_PARCELAS_INVALIDA: 'quantidade de parcelas deve ser inteiro maior ou igual a 1',
  ANCORA_FUTURA: 'ancora de saldo nao pode ter data futura',
  REFERENCIA_INEXISTENTE: 'o registro referenciado nao existe',
  GERADOR_INCONSISTENTE: 'origem do lancamento inconsistente com seu identificador',
  PAGAMENTO_INCOMPLETO: 'pagamento precisa ter data e valor juntos, ou nenhum dos dois',
  TIPO_INVALIDO: 'tipo de movimento deve ser entrada ou saida',
  INSTANTE_INVALIDO: 'instante deve estar no formato ISO 8601 em UTC',
  CATEGORIA_INVALIDA: 'categoria fora da lista conhecida',
}

export class ErroDeDominio extends Error {
  readonly codigo: CodigoInvariante
  readonly componente: string

  constructor(codigo: CodigoInvariante, componente: string) {
    super(`[${componente}] ${MENSAGENS[codigo]}`)
    this.name = 'ErroDeDominio'
    this.codigo = codigo
    this.componente = componente
  }
}

/** Lanca um erro de dominio. Atalho para manter as guardas concisas. */
export function falhar(codigo: CodigoInvariante, componente: string): never {
  throw new ErroDeDominio(codigo, componente)
}

/** Verifica se um valor desconhecido e um erro de dominio. */
export function ehErroDeDominio(e: unknown): e is ErroDeDominio {
  return e instanceof ErroDeDominio
}
