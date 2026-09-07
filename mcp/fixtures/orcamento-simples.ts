/**
 * Orcamento minimo para os testes das ferramentas.
 *
 * Salario de 5.000,00 no dia 5, aluguel de 1.800,00 no dia 10, luz estimada em
 * 220,00 no dia 15 (ja paga, por 245,90), e ancora de saldo de 1.200,00 em
 * 1o de marco.
 */

import { VERSAO_SCHEMA } from '../../src/data/db.js'
import type { DocumentoBackup } from '../../src/data/backup-serializer.js'

export const ORCAMENTO_SIMPLES: DocumentoBackup = {
  versaoSchema: VERSAO_SCHEMA,
  exportadoEm: '2026-03-20',
  regras: [
    {
      id: 'r-salario',
      tipo: 'entrada',
      nome: 'Salario',
      valorCentavos: 500000,
      valorEhEstimativa: false,
      diaDoMes: 5,
      ajusteFimDeSemana: 'antecipa',
      vigenteDe: '2026-01',
      vigenteAte: null,
      categoria: null,
    },
    {
      id: 'r-aluguel',
      tipo: 'saida',
      nome: 'Aluguel',
      valorCentavos: 180000,
      valorEhEstimativa: false,
      diaDoMes: 10,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-01',
      vigenteAte: null,
      categoria: null,
    },
    {
      id: 'r-luz',
      tipo: 'saida',
      nome: 'Luz',
      valorCentavos: 22000,
      valorEhEstimativa: true,
      diaDoMes: 15,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-01',
      vigenteAte: null,
      categoria: null,
    },
  ],
  parcelamentos: [],
  ocorrencias: [
    {
      id: 'o-luz-marco',
      geradorTipo: 'regra',
      geradorId: 'r-luz',
      competencia: '2026-03',
      tipo: 'saida',
      nome: 'Luz',
      valorPrevistoCentavos: 22000,
      dataVencimento: '2026-03-15',
      dataPagamento: '2026-03-14',
      valorPagoCentavos: 24590,
      pagamentoRegistradoEm: null,
      ignorado: false,
      observacao: null,
      categoria: null,
    },
  ],
  ancoras: [{ id: 'a-1', data: '2026-03-01', saldoCentavos: 120000, declaradaEm: null }],
  configuracoes: [],
}

/** Mesmo orcamento, sem ancora: exercita o caminho de saldo relativo (RN-30). */
export const ORCAMENTO_SEM_ANCORA: DocumentoBackup = {
  ...ORCAMENTO_SIMPLES,
  ancoras: [],
}

/**
 * Mesmo orcamento, com ancora datada no futuro (1o de junho). Exercita o
 * OUTRO caminho de saldo relativo do RN-30: ha uma ancora cadastrada, mas
 * ela nao vigora ainda para um mes como marco -- `ancoraForaDoFuturo` fica
 * falso e o saldo desse mes e relativo mesmo com `ancoras.length > 0`. E o
 * caso que `doc.ancoras.length === 0` (a formula errada) confundia com "tem
 * ancora, saldo absoluto".
 */
export const ORCAMENTO_ANCORA_FUTURA: DocumentoBackup = {
  ...ORCAMENTO_SIMPLES,
  ancoras: [{ id: 'a-futura', data: '2026-06-01', saldoCentavos: 120000, declaradaEm: null }],
}
