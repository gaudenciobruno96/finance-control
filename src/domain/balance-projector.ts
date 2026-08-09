/**
 * DOM-08 — Projecao da curva de saldo dia a dia (RN-29 a RN-36).
 *
 * DUAS DECISOES QUE EMERGIRAM NA IMPLEMENTACAO
 *
 * 1. Onde a curva comeca. Quando a ancora cai dentro do mes exibido -- o caso
 *    comum, "hoje eu tenho X" no mes corrente --, a curva NAO comeca no dia 1:
 *    voce nao sabe qual era seu saldo no dia 1 se so declarou o saldo hoje.
 *    Ela comeca no dia da ancora. Desenhar dias anteriores seria inventar
 *    numero.
 *
 * 2. O que entra na curva de um mes. Nao e "ocorrencias da competencia", e
 *    "ocorrencias cuja data efetiva cai dentro do mes". Uma ocorrencia de
 *    competencia maio postergada para 1o de junho afeta o dinheiro de junho,
 *    nao o de maio.
 */

import {
  comparar,
  diasDaCompetencia,
  primeiroDiaDaCompetencia,
  somarMeses,
} from './calendar.js'
import { somar } from './money.js'
import type {
  AncoraSaldo,
  Centavos,
  Competencia,
  CurvaSaldo,
  DataISO,
  MovimentoDoDia,
  OcorrenciaResolvida,
  PontoCurva,
} from './types.js'

/** Janela de busca por atrasados (RN-34). */
const MESES_DE_ATRASO = 12

function maior(a: DataISO, b: DataISO): DataISO {
  return comparar(a, b) >= 0 ? a : b
}

/** Sinal do movimento: entrada soma, saida subtrai. */
function delta(o: OcorrenciaResolvida, valor: Centavos): Centavos {
  return o.tipo === 'entrada' ? valor : -valor
}

/**
 * Ocorrencias que efetivamente movimentam dinheiro.
 *
 * Duas exclusoes definem a corretude do numero:
 * - ignoradas nunca entram (RN-35);
 * - componentes de fatura nunca entram sozinhos (RN-18), porque ja estao
 *   somados dentro da fatura do cartao. Conta-los aqui seria contar o mesmo
 *   dinheiro duas vezes.
 */
function movimenta(o: OcorrenciaResolvida): boolean {
  return !o.ignorado && !o.ehComponenteDeFatura
}

/** Data em que o dinheiro efetivamente se move. */
function dataEfetiva(o: OcorrenciaResolvida): DataISO {
  return o.dataPagamento ?? o.dataVencimento
}

/** Valor que efetivamente se move (RN-31). */
function valorEfetivo(o: OcorrenciaResolvida): Centavos {
  return o.valorPagoCentavos ?? o.valorPrevistoCentavos
}

export function projetarCurva(
  ocorrencias: readonly OcorrenciaResolvida[],
  ancora: AncoraSaldo | null,
  competencia: Competencia,
  hoje: DataISO,
): CurvaSaldo {
  const dias = diasDaCompetencia(competencia)
  const primeiroDia = primeiroDiaDaCompetencia(competencia)
  const ultimoDia = dias[dias.length - 1] as DataISO

  // RN-29, RN-30. Sem ancora, a curva parte de zero e o resultado e marcado
  // como relativo: a forma e o dia de saldo minimo continuam corretos, apenas
  // o nivel esta deslocado.
  const semAncora = ancora === null
  const ancoraForaDoFuturo = ancora !== null && comparar(ancora.data, ultimoDia) <= 0

  const inicio =
    semAncora || !ancoraForaDoFuturo ? primeiroDia : maior(primeiroDia, ancora.data)

  const saldoInicial = semAncora || !ancoraForaDoFuturo ? 0 : ancora.saldoCentavos
  const saldoRelativo = semAncora || !ancoraForaDoFuturo

  const limiteDeAtraso = primeiroDiaDaCompetencia(
    somarMeses(competencia, -MESES_DE_ATRASO),
  )

  // Acumula os movimentos por dia antes de percorrer o mes.
  const movimentosPorDia = new Map<DataISO, { entrada: Centavos; saida: Centavos }>()
  const acumular = (data: DataISO, o: OcorrenciaResolvida, bruto: Centavos): void => {
    const atual = movimentosPorDia.get(data) ?? { entrada: 0, saida: 0 }
    if (o.tipo === 'entrada') atual.entrada += bruto
    else atual.saida += bruto
    movimentosPorDia.set(data, atual)
  }

  // Data a partir da qual um movimento ainda nao esta refletido no saldo
  // declarado. Sem ancora, equivale ao inicio da curva.
  const dataDaAncora = ancora !== null && ancoraForaDoFuturo ? ancora.data : inicio

  // Movimentos que ocorrem entre a ancora e o inicio do mes exibido: ja
  // aconteceram (ou vao acontecer) antes do primeiro dia da curva, e portanto
  // compoem o saldo de partida em vez de aparecerem como um ponto.
  const antesDoMes: Centavos[] = []

  for (const o of ocorrencias) {
    if (!movimenta(o)) continue

    const data = dataEfetiva(o)
    const bruto = valorEfetivo(o)
    const valor = delta(o, bruto)

    if (comparar(data, ultimoDia) > 0) {
      // Cai em mes posterior: pertence a curva daquele mes, nao a deste.
      continue
    }

    if (comparar(data, inicio) >= 0) {
      acumular(data, o, bruto)
      continue
    }

    // Daqui para baixo: a data e anterior ao inicio da curva.

    if (comparar(data, dataDaAncora) >= 0) {
      // Posterior a ancora: ainda nao esta no saldo declarado, e acontece
      // antes do mes exibido. Entra no saldo de partida.
      antesDoMes.push(valor)
      continue
    }

    if (o.dataPagamento !== null) {
      // RN-32: ja pago antes da ancora, presume-se refletido no saldo
      // declarado. Conta-lo de novo seria contagem dupla.
      continue
    }

    // RN-90: entrada vencida e nao confirmada presume-se RECEBIDA, e portanto
    // ja refletida no saldo declarado -- exatamente como um pagamento antigo.
    //
    // Empurra-la para hoje como se fosse dinheiro a entrar inflaria o saldo
    // com um salario que ja caiu e ja foi gasto.
    if (o.tipo === 'entrada') continue

    // RN-33 e RN-34: SAIDA vencida e nao paga dentro da janela e empurrada
    // para o inicio da curva. A divida existe e precisa afundar o saldo de
    // hoje.
    if (comparar(data, limiteDeAtraso) >= 0 && comparar(data, hoje) < 0) {
      acumular(inicio, o, bruto)
    }
  }

  const saldoDePartida = somar(saldoInicial, ...antesDoMes)

  const pontos: PontoCurva[] = []
  const movimentos: MovimentoDoDia[] = []
  let saldo = saldoDePartida

  for (const dia of dias) {
    if (comparar(dia, inicio) < 0) continue

    const doDia = movimentosPorDia.get(dia) ?? { entrada: 0, saida: 0 }
    saldo = somar(saldo, doDia.entrada, -doDia.saida)

    pontos.push({ data: dia, saldoCentavos: saldo })
    movimentos.push({
      data: dia,
      entradaCentavos: doDia.entrada,
      saidaCentavos: doDia.saida,
    })
  }

  return {
    pontos,
    movimentos,
    saldoInicialCentavos: saldoDePartida,
    diaMinimo: encontrarMinimo(pontos, inicio, saldoDePartida),
    saldoRelativo,
  }
}

/**
 * Primeiro ponto de menor saldo (RN-36).
 *
 * Em caso de empate, o mais cedo: e o momento em que o aperto comeca.
 */
function encontrarMinimo(
  pontos: readonly PontoCurva[],
  inicio: DataISO,
  saldoInicial: Centavos,
): PontoCurva {
  const primeiro = pontos[0]
  if (primeiro === undefined) {
    // Competencia sem nenhum dia elegivel. Nao ocorre no uso normal, mas o
    // tipo exige um ponto: devolvemos o inicio com o saldo de partida.
    return { data: inicio, saldoCentavos: saldoInicial }
  }

  let minimo = primeiro
  for (const p of pontos) {
    if (p.saldoCentavos < minimo.saldoCentavos) minimo = p
  }
  return minimo
}
