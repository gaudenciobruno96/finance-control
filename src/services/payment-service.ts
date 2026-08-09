/**
 * SVC-02 — Materializacao de ocorrencias (RN-51 a RN-53).
 */

import { novoId } from '../data/ids.js'
import type { Repositorios } from '../data/repositories.js'
import type {
  Centavos,
  Competencia,
  DataISO,
  Ocorrencia,
  OcorrenciaResolvida,
  TipoMovimento,
} from '../domain/types.js'

/**
 * Converte a ocorrencia resolvida em registro persistivel (RN-52).
 *
 * Copia o estado da virtual no momento -- inclusive valor previsto e
 * vencimento ja ajustado. E isso que congela o valor daquele mes: uma edicao
 * futura da regra nao reescreve o que ja foi materializado.
 */
function materializar(o: OcorrenciaResolvida, id: string): Ocorrencia {
  return {
    id,
    geradorTipo: o.geradorTipo,
    geradorId: o.geradorId,
    competencia: o.competencia,
    tipo: o.tipo,
    nome: o.nome,
    valorPrevistoCentavos: o.valorPrevistoCentavos,
    dataVencimento: o.dataVencimento,
    dataPagamento: o.dataPagamento,
    valorPagoCentavos: o.valorPagoCentavos,
    ignorado: o.ignorado,
    observacao: o.observacao,
  }
}

export interface NovaOcorrenciaAvulsa {
  readonly tipo: TipoMovimento
  readonly nome: string
  readonly valorPrevistoCentavos: Centavos
  readonly dataVencimento: DataISO
  readonly competencia: Competencia
  readonly observacao?: string | null
}

export function criarPaymentService(repos: Repositorios) {
  /**
   * Busca o registro existente pela chave e aplica a alteracao, ou materializa
   * um novo (RN-51).
   *
   * O passo de busca e o que torna toda operacao idempotente: tocar duas vezes
   * no botao atualiza o mesmo registro em vez de criar dois lancamentos.
   */
  async function aplicar(
    o: OcorrenciaResolvida,
    alteracao: Partial<Ocorrencia>,
  ): Promise<void> {
    const existente =
      o.idReal !== null
        ? await repos.ocorrencias.obter(o.idReal)
        : o.geradorId !== null && o.geradorTipo !== 'avulso'
          ? await repos.ocorrencias.obterPorChave(o.geradorTipo, o.geradorId, o.competencia)
          : null

    const base = existente ?? materializar(o, novoId())
    await repos.ocorrencias.salvar({ ...base, ...alteracao })
  }

  return {
    registrarPagamento: (o: OcorrenciaResolvida, data: DataISO, valor: Centavos) =>
      aplicar(o, { dataPagamento: data, valorPagoCentavos: valor, ignorado: false }),

    /** RN-53: limpa o pagamento mas mantem o registro materializado, que pode
     * carregar valor ajustado ou vencimento adiado. */
    desfazerPagamento: (o: OcorrenciaResolvida) =>
      aplicar(o, { dataPagamento: null, valorPagoCentavos: null }),

    ajustarValorPrevisto: (o: OcorrenciaResolvida, valor: Centavos) =>
      aplicar(o, { valorPrevistoCentavos: valor }),

    adiarVencimento: (o: OcorrenciaResolvida, data: DataISO) =>
      aplicar(o, { dataVencimento: data }),

    ignorarNoMes: (o: OcorrenciaResolvida) =>
      aplicar(o, { ignorado: true, dataPagamento: null, valorPagoCentavos: null }),

    reativarNoMes: (o: OcorrenciaResolvida) => aplicar(o, { ignorado: false }),

    async lancarAvulso(dados: NovaOcorrenciaAvulsa): Promise<string> {
      const id = novoId()
      await repos.ocorrencias.salvar({
        id,
        geradorTipo: 'avulso',
        geradorId: null,
        competencia: dados.competencia,
        tipo: dados.tipo,
        nome: dados.nome,
        valorPrevistoCentavos: dados.valorPrevistoCentavos,
        dataVencimento: dados.dataVencimento,
        dataPagamento: null,
        valorPagoCentavos: null,
        ignorado: false,
        observacao: dados.observacao ?? null,
      })
      return id
    },

    removerAvulso: (id: string) => repos.ocorrencias.remover(id),
  }
}

export type PaymentService = ReturnType<typeof criarPaymentService>
