/**
 * DOM-07 — Resolucao entre ocorrencias virtuais e reais (RN-25 a RN-28).
 */

import { comparar } from './calendar.js'
import { chaveDe } from './occurrence-key.js'
import type {
  DataISO,
  Ocorrencia,
  OcorrenciaResolvida,
  SituacaoOcorrencia,
} from './types.js'

export { chaveDe }

/**
 * Situacao derivada, nunca armazenada (RN-28).
 *
 * Armazena-la criaria a possibilidade de divergir do estado real: bastaria um
 * caminho de escrita esquecer de atualiza-la.
 */
export function derivarSituacao(
  o: Pick<Ocorrencia, 'ignorado' | 'dataPagamento' | 'dataVencimento' | 'tipo'>,
  hoje: DataISO,
): SituacaoOcorrencia {
  if (o.ignorado) return 'ignorado'
  if (o.dataPagamento !== null) return 'pago'

  if (comparar(o.dataVencimento, hoje) < 0) {
    // RN-90: "atrasado" e vocabulario de divida e vale apenas para saidas.
    //
    // Um salario cuja data ja passou e que voce nao confirmou nao esta
    // atrasado -- provavelmente caiu e voce nao teve motivo para registrar.
    // Rotula-lo como atrasado enchia a lista de dividas com os proprios
    // salarios de todos os meses anteriores, esvaziando o sentido da secao.
    return o.tipo === 'entrada' ? 'a_confirmar' : 'atrasado'
  }

  return 'previsto'
}

function realParaResolvida(
  real: Ocorrencia,
  hoje: DataISO,
  base: OcorrenciaResolvida | null,
): OcorrenciaResolvida {
  return {
    chave: chaveDe(real.geradorTipo, real.geradorId, real.competencia),
    origem: 'real',
    idReal: real.id,
    situacao: derivarSituacao(real, hoje),
    // O numero da parcela pertence ao GERADOR, nao ao registro persistido:
    // por isso e herdado da virtual quando ela existe.
    numeroParcela: base?.numeroParcela ?? null,
    geradorTipo: real.geradorTipo,
    geradorId: real.geradorId,
    competencia: real.competencia,
    tipo: real.tipo,
    nome: real.nome,
    valorPrevistoCentavos: real.valorPrevistoCentavos,
    dataVencimento: real.dataVencimento,
    dataPagamento: real.dataPagamento,
    valorPagoCentavos: real.valorPagoCentavos,
    pagamentoRegistradoEm: real.pagamentoRegistradoEm,
    ignorado: real.ignorado,
    observacao: real.observacao,
  }
}

/**
 * Combina ocorrencias virtuais com as reais.
 *
 * A construcao por indice (PAD-06) evita a busca aninhada quadratica e torna a
 * operacao idempotente (RN-27) e independente da ordem das entradas.
 */
export function resolver(
  virtuais: readonly OcorrenciaResolvida[],
  reais: readonly Ocorrencia[],
  hoje: DataISO,
): readonly OcorrenciaResolvida[] {
  const porChave = new Map<string, Ocorrencia>()
  const avulsas: Ocorrencia[] = []

  for (const real of reais) {
    if (real.geradorTipo === 'avulso') {
      avulsas.push(real)
    } else {
      porChave.set(chaveDe(real.geradorTipo, real.geradorId, real.competencia), real)
    }
  }

  const resultado: OcorrenciaResolvida[] = []
  const consumidas = new Set<string>()

  for (const virtual of virtuais) {
    const real = porChave.get(virtual.chave)
    if (real === undefined) {
      resultado.push({ ...virtual, situacao: derivarSituacao(virtual, hoje) })
    } else {
      // RN-25: a real sobrepoe a virtual.
      consumidas.add(virtual.chave)
      resultado.push(realParaResolvida(real, hoje, virtual))
    }
  }

  // RN-42: ocorrencias reais orfas -- as que perderam sua virtual.
  //
  // Acontece quando a regra, o parcelamento ou o cartao que as gerou foi
  // removido, ou quando a vigencia da regra foi encurtada e deixou de cobrir
  // uma competencia ja materializada.
  //
  // Sem este bloco, o aluguel de julho que voce pagou desapareceria do
  // historico no instante em que a regra fosse removida. Sao dado registrado
  // pelo usuario: nada justifica descarta-las em silencio.
  for (const [chave, real] of porChave) {
    if (consumidas.has(chave)) continue
    resultado.push(realParaResolvida(real, hoje, null))
  }

  // RN-26: avulsas nao tem virtual correspondente e nunca sao sobrepostas.
  for (const avulsa of avulsas) {
    resultado.push({
      ...realParaResolvida(avulsa, hoje, null),
      chave: `avulso:${avulsa.id}:${avulsa.competencia}`,
    })
  }

  return ordenar(resultado)
}

function ordenar(
  ocorrencias: readonly OcorrenciaResolvida[],
): readonly OcorrenciaResolvida[] {
  return [...ocorrencias].sort((a, b) => {
    const porData = comparar(a.dataVencimento, b.dataVencimento)
    if (porData !== 0) return porData
    const porNome = a.nome.localeCompare(b.nome, 'pt-BR')
    if (porNome !== 0) return porNome
    // Desempate final pela chave: garante ordem total e deterministica,
    // condicao para a resolucao ser independente da ordem das entradas.
    return a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0
  })
}
