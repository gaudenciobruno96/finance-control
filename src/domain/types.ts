/**
 * DOM-01 — Tipos do dominio.
 *
 * Todas as estruturas sao `readonly` (PAD-02): a protecao contra alteracao
 * acidental pelas camadas superiores e de tempo de compilacao, sem custo em
 * execucao. Congelar em runtime exigiria percorrer a curva diaria inteira a
 * cada reprojecao, e ha reprojecao a cada escrita.
 */

// ---------------------------------------------------------------------------
// Tipos primitivos
// ---------------------------------------------------------------------------

/**
 * Valor monetario em centavos, sempre inteiro (RN-01).
 *
 * Ponto flutuante e proibido em dinheiro: `0.1 + 0.2` resulta em
 * `0.30000000000000004`, e acumulado ao longo de meses de projecao produz
 * centavos fantasma num app cuja funcao e dizer se o dinheiro da.
 */
export type Centavos = number

/**
 * Data de calendario no formato `AAAA-MM-DD`.
 *
 * Texto, nao `Date` (RN-04). `new Date('2026-08-10')` e interpretado como
 * meia-noite UTC e, no horario de Brasilia, resulta em 9 de agosto as 21h --
 * um salario do dia 10 apareceria no dia 9.
 */
export type DataISO = string

/** Mes de referencia no formato `AAAA-MM`. */
export type Competencia = string

// ---------------------------------------------------------------------------
// Enumeracoes
// ---------------------------------------------------------------------------

export type TipoMovimento = 'entrada' | 'saida'

export type AjusteFimDeSemana = 'nenhum' | 'antecipa' | 'posterga'

export type TipoGerador = 'regra' | 'parcelamento' | 'avulso'

/**
 * Situacao derivada de uma ocorrencia.
 *
 * `atrasado` vale APENAS para saidas: e vocabulario de divida. Um salario que
 * ainda nao foi confirmado nao esta atrasado -- esta `a_confirmar`, e o app
 * presume que caiu (RN-90).
 */
export type SituacaoOcorrencia =
  | 'previsto'
  | 'pago'
  | 'atrasado'
  | 'a_confirmar'
  | 'ignorado'

export type OrigemOcorrencia = 'virtual' | 'real'

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

/** Recorrencia mensal. Cobre tanto entradas quanto saidas. */
export interface Regra {
  readonly id: string
  readonly tipo: TipoMovimento
  readonly nome: string
  readonly valorCentavos: Centavos
  /** Verdadeiro para contas de valor variavel (luz, agua). */
  readonly valorEhEstimativa: boolean
  /** 1 a 31. Dia inexistente no mes trunca no ultimo dia (RN-05). */
  readonly diaDoMes: number
  readonly ajusteFimDeSemana: AjusteFimDeSemana
  readonly vigenteDe: Competencia
  /** Nulo significa vigencia indefinida. */
  readonly vigenteAte: Competencia | null
}

/** Compra em N vezes ou carne. */
export interface Parcelamento {
  readonly id: string
  readonly nome: string
  readonly valorParcelaCentavos: Centavos
  readonly quantidadeParcelas: number
  readonly primeiroVencimento: DataISO
}

/**
 * O lancamento concreto. Nasce quando o usuario interage com uma ocorrencia
 * virtual, ou e criado avulso.
 */
export interface Ocorrencia {
  readonly id: string
  readonly geradorTipo: TipoGerador
  /** Nulo quando avulso. */
  readonly geradorId: string | null
  /**
   * Mes ao qual a ocorrencia pertence, determinado pela data prevista ANTES
   * do ajuste de fim de semana (RN-08). Sem isso, uma ocorrencia de 31 de maio
   * postergada para 2 de junho mudaria de competencia, mudaria de chave, e um
   * item ja pago reapareceria como pendente.
   */
  readonly competencia: Competencia
  readonly tipo: TipoMovimento
  readonly nome: string
  readonly valorPrevistoCentavos: Centavos
  readonly dataVencimento: DataISO
  /** Nulo enquanto nao pago. Sempre nulo ou preenchido junto com valorPago. */
  readonly dataPagamento: DataISO | null
  /** Valor efetivamente pago, que pode diferir do previsto (juros, desconto). */
  readonly valorPagoCentavos: Centavos | null
  readonly ignorado: boolean
  readonly observacao: string | null
}

export interface AncoraSaldo {
  readonly id: string
  readonly data: DataISO
  /** Pode ser negativo. */
  readonly saldoCentavos: Centavos
}

// ---------------------------------------------------------------------------
// Estruturas derivadas (nao persistidas)
// ---------------------------------------------------------------------------

/**
 * Resultado da combinacao entre ocorrencias virtuais e reais.
 *
 * `situacao` e sempre derivada, nunca armazenada -- armazena-la criaria a
 * possibilidade de divergir do estado real.
 */
export interface OcorrenciaResolvida {
  readonly chave: string
  readonly origem: OrigemOcorrencia
  /**
   * Identificador do registro persistido, quando `origem` e 'real'; nulo
   * quando a ocorrencia ainda e virtual.
   *
   * Sem este campo, atualizar uma ocorrencia avulsa exigiria extrair o
   * identificador da chave por manipulacao de texto -- fragil e dependente do
   * formato da chave.
   */
  readonly idReal: string | null
  readonly situacao: SituacaoOcorrencia
  readonly numeroParcela: number | null

  readonly geradorTipo: TipoGerador
  readonly geradorId: string | null
  readonly competencia: Competencia
  readonly tipo: TipoMovimento
  readonly nome: string
  readonly valorPrevistoCentavos: Centavos
  readonly dataVencimento: DataISO
  readonly dataPagamento: DataISO | null
  readonly valorPagoCentavos: Centavos | null
  readonly ignorado: boolean
  readonly observacao: string | null
}

export interface PontoCurva {
  readonly data: DataISO
  readonly saldoCentavos: Centavos
}

/** Movimentacao de um dia, separada por sentido. */
export interface MovimentoDoDia {
  readonly data: DataISO
  readonly entradaCentavos: Centavos
  readonly saidaCentavos: Centavos
}

export interface CurvaSaldo {
  readonly pontos: readonly PontoCurva[]
  readonly diaMinimo: PontoCurva
  /**
   * Movimentos que compoem a curva, dia a dia e por sentido.
   *
   * Expostos para que a interface possa exibir a CONTA que leva ao saldo final
   * -- saldo de hoje, mais o que entra, menos o que sai -- com a garantia de
   * que ela fecha: os mesmos numeros que formaram a curva formam a conta.
   *
   * Recalcular isso na camada de cima a partir das ocorrencias produziria uma
   * segunda implementacao das mesmas regras de exclusao, e as duas
   * divergiriam.
   */
  readonly movimentos: readonly MovimentoDoDia[]
  /** Saldo de partida, antes do primeiro dia da curva. */
  readonly saldoInicialCentavos: Centavos
  /**
   * Verdadeiro quando nao havia ancora de saldo (RN-30). A forma da curva e o
   * dia de saldo minimo permanecem corretos; apenas o nivel esta deslocado.
   */
  readonly saldoRelativo: boolean
}

export interface ResumoMes {
  readonly aReceberCentavos: Centavos
  readonly aPagarCentavos: Centavos
  readonly balancoPrevistoCentavos: Centavos
  readonly saldoFinalProjetadoCentavos: Centavos
  readonly jaPagoCentavos: Centavos
  readonly faltaPagarCentavos: Centavos
}

export interface ResumoFuturo {
  readonly competencia: Competencia
  readonly totalAPagarCentavos: Centavos
  readonly deParcelamentosCentavos: Centavos
}

// ---------------------------------------------------------------------------
// Entradas de operacoes de dominio
// ---------------------------------------------------------------------------

/** Alteracao aplicavel a uma regra, usada pelo versionamento (DOM-11). */
export type AlteracaoRegra = Partial<
  Pick<
    Regra,
    | 'nome'
    | 'valorCentavos'
    | 'valorEhEstimativa'
    | 'diaDoMes'
    | 'ajusteFimDeSemana'
    | 'tipo'
  >
>
