/**
 * Traducao de um lancamento da caixa unica para o servico correspondente.
 *
 * A caixa nao sabe que existem tres servicos diferentes, e nao deveria: para
 * quem usa, "anotar uma conta" e uma coisa so. Este e o unico ponto do app que
 * conhece as tres formas, e ele existe porque a mesma caixa aparece na tela do
 * mes e na de receitas.
 */

import { useCallback } from 'react'
import type { NovoLancamento } from '../components/QuickExpense.js'
import { useApp } from './useApp.js'

export function useSalvarLancamento(): (dados: NovoLancamento) => Promise<void> {
  const { pagamento, regras } = useApp()

  return useCallback(
    async (dados: NovoLancamento): Promise<void> => {
      switch (dados.forma) {
        case 'avulso':
          await pagamento.lancarAvulso({
            tipo: dados.tipo,
            nome: dados.nome,
            valorPrevistoCentavos: dados.valorPrevistoCentavos,
            dataVencimento: dados.dataVencimento,
            competencia: dados.competencia,
          })
          return

        case 'recorrente':
          await regras.criarRegra({
            tipo: dados.tipo,
            nome: dados.nome,
            valorCentavos: dados.valorCentavos,
            // A caixa nao pergunta se o valor e estimativa: seria uma quarta
            // decisao para anotar um boleto. O valor de qualquer mes pode ser
            // corrigido depois, sem mexer na regra.
            valorEhEstimativa: false,
            diaDoMes: dados.diaDoMes,
            // Entrada antecipa, saida nao se mexe: adiantar o pagamento de uma
            // conta e escolha de quem paga, mas o salario que cairia no sabado
            // cai na sexta sem que ninguem decida nada (RN-07).
            ajusteFimDeSemana: dados.tipo === 'entrada' ? 'antecipa' : 'nenhum',
            vigenteDe: dados.vigenteDe,
            vigenteAte: null,
            categoria: null,
          })
          return

        case 'parcelado':
          await regras.criarParcelamento({
            nome: dados.nome,
            valorParcelaCentavos: dados.valorParcelaCentavos,
            quantidadeParcelas: dados.quantidadeParcelas,
            primeiroVencimento: dados.primeiroVencimento,
            categoria: null,
          })
          return
      }
    },
    [pagamento, regras],
  )
}
