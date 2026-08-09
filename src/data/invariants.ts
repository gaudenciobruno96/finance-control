/**
 * Invariantes de escrita (RN-43 a RN-45).
 *
 * Validacao acontece na escrita, nao e contornada na leitura. Um estado
 * invalido que chega ao banco contamina toda projecao futura, e o defeito
 * aparece longe da causa.
 */

import { ErroDeDominio } from '../domain/errors.js'
import {
  ehCentavosValido,
  ehCompetenciaValida,
  ehDataValida,
  ehDiaDoMesValido,
} from '../domain/guards.js'
import { comparar } from '../domain/calendar.js'
import type {
  AncoraSaldo,
  Cartao,
  DataISO,
  Ocorrencia,
  Parcelamento,
  Regra,
} from '../domain/types.js'

const COMPONENTE = 'repositorio'

function exigir(condicao: boolean, codigo: Parameters<typeof erro>[0]): void {
  if (!condicao) throw erro(codigo)
}

function erro(codigo: ConstructorParameters<typeof ErroDeDominio>[0]): ErroDeDominio {
  return new ErroDeDominio(codigo, COMPONENTE)
}

export function validarRegra(r: Regra): void {
  exigir(ehCentavosValido(r.valorCentavos), 'VALOR_NAO_INTEIRO')
  exigir(r.valorCentavos > 0, 'VALOR_NAO_POSITIVO')
  exigir(ehDiaDoMesValido(r.diaDoMes), 'DIA_DO_MES_INVALIDO')
  exigir(ehCompetenciaValida(r.vigenteDe), 'COMPETENCIA_INVALIDA')

  if (r.vigenteAte !== null) {
    exigir(ehCompetenciaValida(r.vigenteAte), 'COMPETENCIA_INVALIDA')
    exigir(r.vigenteDe <= r.vigenteAte, 'VIGENCIA_INVERTIDA')
  }
}

export function validarParcelamento(p: Parcelamento): void {
  exigir(ehCentavosValido(p.valorParcelaCentavos), 'VALOR_NAO_INTEIRO')
  exigir(p.valorParcelaCentavos > 0, 'VALOR_NAO_POSITIVO')
  exigir(
    Number.isInteger(p.quantidadeParcelas) && p.quantidadeParcelas >= 1,
    'QUANTIDADE_PARCELAS_INVALIDA',
  )
  exigir(ehDataValida(p.primeiroVencimento), 'DATA_INVALIDA')
}

export function validarCartao(c: Cartao): void {
  exigir(ehDiaDoMesValido(c.diaFechamento), 'DIA_DO_MES_INVALIDO')
  exigir(ehDiaDoMesValido(c.diaVencimento), 'DIA_DO_MES_INVALIDO')
  exigir(ehCentavosValido(c.gastoMensalTipicoCentavos), 'VALOR_NAO_INTEIRO')
  exigir(c.gastoMensalTipicoCentavos >= 0, 'VALOR_NAO_POSITIVO')
}

export function validarOcorrencia(o: Ocorrencia): void {
  exigir(ehCentavosValido(o.valorPrevistoCentavos), 'VALOR_NAO_INTEIRO')
  exigir(o.valorPrevistoCentavos > 0, 'VALOR_NAO_POSITIVO')
  exigir(ehCompetenciaValida(o.competencia), 'COMPETENCIA_INVALIDA')
  exigir(ehDataValida(o.dataVencimento), 'DATA_INVALIDA')

  // Invariante 2 da entidade: pagamento tem data e valor juntos, ou nenhum dos
  // dois. Um pagamento sem valor, ou um valor sem data, e um estado
  // meio-registrado que corromperia a curva de saldo.
  const temData = o.dataPagamento !== null
  const temValor = o.valorPagoCentavos !== null
  exigir(temData === temValor, 'VALOR_NAO_INTEIRO')

  if (temData) {
    exigir(ehDataValida(o.dataPagamento as DataISO), 'DATA_INVALIDA')
    exigir(ehCentavosValido(o.valorPagoCentavos), 'VALOR_NAO_INTEIRO')
  }

  // Invariante 4: avulsa nao tem gerador; as demais tem.
  if (o.geradorTipo === 'avulso') {
    exigir(o.geradorId === null, 'COMPETENCIA_INVALIDA')
  } else {
    exigir(o.geradorId !== null, 'COMPETENCIA_INVALIDA')
  }
}

/** RN-45: declarar saldo para uma data que ainda nao chegou nao tem significado. */
export function validarAncora(a: AncoraSaldo, hoje: DataISO): void {
  exigir(ehDataValida(a.data), 'DATA_INVALIDA')
  exigir(ehCentavosValido(a.saldoCentavos), 'VALOR_NAO_INTEIRO')
  exigir(comparar(a.data, hoje) <= 0, 'ANCORA_FUTURA')
}
