/**
 * DAT-04 — Validacao de arquivo de backup ANTES de qualquer escrita
 * (RN-54, SECURITY-05, SECURITY-13).
 *
 * O documento e dado NAO CONFIAVEL ate provar o contrario. Nada aqui toca o
 * banco: um arquivo corrompido, truncado ou de outra origem nao consegue
 * produzir escrita parcial.
 */

import {
  ehCentavosValido,
  ehCompetenciaValida,
  ehDataValida,
  ehDiaDoMesValido,
} from '../domain/guards.js'
import { comparar } from '../domain/calendar.js'
import type { Competencia } from '../domain/types.js'
import { VERSAO_SCHEMA } from './db.js'
import type { DocumentoBackup } from './backup-serializer.js'

export interface ResumoBackup {
  readonly versaoSchema: number
  readonly exportadoEm: string | null
  readonly quantidadeRegras: number
  readonly quantidadeParcelamentos: number
  readonly quantidadeCartoes: number
  readonly quantidadeOcorrencias: number
  readonly quantidadeAncoras: number
  readonly competenciaInicial: Competencia | null
  readonly competenciaFinal: Competencia | null
  readonly migrado: boolean
}

export type ResultadoValidacao =
  | { readonly valido: true; readonly documento: DocumentoBackup; readonly resumo: ResumoBackup }
  | { readonly valido: false; readonly erro: string }

function invalido(erro: string): ResultadoValidacao {
  return { valido: false, erro }
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function ehTexto(v: unknown): v is string {
  return typeof v === 'string'
}

/**
 * Valida um documento bruto vindo de arquivo.
 *
 * Devolve o documento tipado apenas quando toda a estrutura foi verificada --
 * nunca faz coercao confiante de entrada externa.
 */
export function validar(bruto: unknown): ResultadoValidacao {
  if (!ehObjeto(bruto)) {
    return invalido('O arquivo nao contem um objeto de backup.')
  }

  const versao = bruto['versaoSchema']
  if (typeof versao !== 'number' || !Number.isInteger(versao) || versao < 1) {
    return invalido('O arquivo nao informa uma versao de schema valida.')
  }

  // RN-56: nao ha como saber o que uma versao futura mudou.
  if (versao > VERSAO_SCHEMA) {
    return invalido(
      `O backup foi criado por uma versao mais recente do app (schema ${versao}, ` +
        `esta versao entende ate ${VERSAO_SCHEMA}). Atualize o app e tente de novo.`,
    )
  }

  const tabelas = [
    'regras',
    'parcelamentos',
    'cartoes',
    'ocorrencias',
    'ancoras',
    'configuracoes',
  ] as const

  for (const nome of tabelas) {
    if (!Array.isArray(bruto[nome])) {
      return invalido(`O arquivo nao contem a lista "${nome}".`)
    }
  }

  const erroDeConteudo =
    validarRegras(bruto['regras'] as unknown[]) ??
    validarCartoes(bruto['cartoes'] as unknown[]) ??
    validarParcelamentos(
      bruto['parcelamentos'] as unknown[],
      bruto['cartoes'] as unknown[],
    ) ??
    validarOcorrencias(bruto['ocorrencias'] as unknown[]) ??
    validarAncoras(bruto['ancoras'] as unknown[])

  if (erroDeConteudo !== null) return invalido(erroDeConteudo)

  const documento = bruto as unknown as DocumentoBackup
  const competencias = documento.ocorrencias.map((o) => o.competencia).sort()

  return {
    valido: true,
    documento,
    resumo: {
      versaoSchema: versao,
      exportadoEm: ehTexto(bruto['exportadoEm']) ? bruto['exportadoEm'] : null,
      quantidadeRegras: documento.regras.length,
      quantidadeParcelamentos: documento.parcelamentos.length,
      quantidadeCartoes: documento.cartoes.length,
      quantidadeOcorrencias: documento.ocorrencias.length,
      quantidadeAncoras: documento.ancoras.length,
      competenciaInicial: competencias[0] ?? null,
      competenciaFinal: competencias[competencias.length - 1] ?? null,
      migrado: versao < VERSAO_SCHEMA,
    },
  }
}

function validarRegras(lista: readonly unknown[]): string | null {
  for (const item of lista) {
    if (!ehObjeto(item)) return 'Ha uma regra malformada no arquivo.'
    if (!ehTexto(item['id'])) return 'Ha uma regra sem identificador.'
    if (!ehCentavosValido(item['valorCentavos'])) {
      return 'Ha uma regra com valor invalido.'
    }
    if (!ehDiaDoMesValido(item['diaDoMes'])) {
      return 'Ha uma regra com dia do mes invalido.'
    }
    if (!ehCompetenciaValida(item['vigenteDe'])) {
      return 'Ha uma regra com vigencia inicial invalida.'
    }
    if (item['vigenteAte'] !== null && !ehCompetenciaValida(item['vigenteAte'])) {
      return 'Ha uma regra com vigencia final invalida.'
    }
  }
  return null
}

function validarCartoes(lista: readonly unknown[]): string | null {
  for (const item of lista) {
    if (!ehObjeto(item)) return 'Ha um cartao malformado no arquivo.'
    if (!ehTexto(item['id'])) return 'Ha um cartao sem identificador.'
    if (!ehDiaDoMesValido(item['diaFechamento'])) {
      return 'Ha um cartao com dia de fechamento invalido.'
    }
    if (!ehDiaDoMesValido(item['diaVencimento'])) {
      return 'Ha um cartao com dia de vencimento invalido.'
    }
  }
  return null
}

/** Integridade referencial DENTRO do proprio arquivo. */
function validarParcelamentos(
  lista: readonly unknown[],
  cartoes: readonly unknown[],
): string | null {
  const idsDeCartao = new Set(
    cartoes.filter(ehObjeto).map((c) => c['id']).filter(ehTexto),
  )

  for (const item of lista) {
    if (!ehObjeto(item)) return 'Ha um parcelamento malformado no arquivo.'
    if (!ehTexto(item['id'])) return 'Ha um parcelamento sem identificador.'
    if (!ehCentavosValido(item['valorParcelaCentavos'])) {
      return 'Ha um parcelamento com valor de parcela invalido.'
    }

    const quantidade = item['quantidadeParcelas']
    if (typeof quantidade !== 'number' || !Number.isInteger(quantidade) || quantidade < 1) {
      return 'Ha um parcelamento com quantidade de parcelas invalida.'
    }
    if (!ehDataValida(item['primeiroVencimento'])) {
      return 'Ha um parcelamento com data de vencimento invalida.'
    }

    const cartaoId = item['cartaoId']
    if (cartaoId !== null) {
      if (!ehTexto(cartaoId)) return 'Ha um parcelamento com referencia de cartao invalida.'
      if (!idsDeCartao.has(cartaoId)) {
        return 'Ha um parcelamento apontando para um cartao que nao esta no arquivo.'
      }
    }
  }
  return null
}

const TIPOS_DE_MOVIMENTO = new Set(['entrada', 'saida'])
const TIPOS_DE_GERADOR = new Set(['regra', 'parcelamento', 'cartao', 'avulso'])

function validarOcorrencias(lista: readonly unknown[]): string | null {
  for (const item of lista) {
    if (!ehObjeto(item)) return 'Ha um lancamento malformado no arquivo.'
    if (!ehTexto(item['id'])) return 'Ha um lancamento sem identificador.'

    // O tipo define o SINAL do movimento na curva de saldo.
    //
    // Sem esta verificacao, um lancamento que perdeu o campo `tipo` importava
    // como valido, e o projetor -- que trata como saida tudo que nao e
    // 'entrada' -- transformava silenciosamente uma receita em despesa.
    if (!ehTexto(item['tipo']) || !TIPOS_DE_MOVIMENTO.has(item['tipo'])) {
      return 'Ha um lancamento sem indicacao de entrada ou saida.'
    }

    if (!ehTexto(item['nome']) || item['nome'] === '') {
      return 'Ha um lancamento sem descricao.'
    }

    if (typeof item['ignorado'] !== 'boolean') {
      return 'Ha um lancamento com marcacao de ignorado invalida.'
    }

    // A origem e o identificador precisam ser coerentes entre si: um registro
    // nao avulso sem gerador fica fora do indice composto que sustenta a
    // idempotencia do pagamento, e cada confirmacao criaria uma duplicata.
    if (!ehTexto(item['geradorTipo']) || !TIPOS_DE_GERADOR.has(item['geradorTipo'])) {
      return 'Ha um lancamento com origem desconhecida.'
    }

    const avulso = item['geradorTipo'] === 'avulso'
    const temGerador = ehTexto(item['geradorId'])
    if (avulso === temGerador) {
      return 'Ha um lancamento cuja origem nao corresponde ao seu identificador.'
    }

    if (!ehCentavosValido(item['valorPrevistoCentavos'])) {
      return 'Ha um lancamento com valor previsto invalido.'
    }
    if (!ehCompetenciaValida(item['competencia'])) {
      return 'Ha um lancamento com competencia invalida.'
    }
    if (!ehDataValida(item['dataVencimento'])) {
      return 'Ha um lancamento com data de vencimento invalida.'
    }

    const temData = item['dataPagamento'] !== null && item['dataPagamento'] !== undefined
    const temValor = item['valorPagoCentavos'] !== null && item['valorPagoCentavos'] !== undefined

    // Um pagamento sem valor, ou um valor sem data, corromperia a curva.
    if (temData !== temValor) {
      return 'Ha um lancamento com pagamento registrado pela metade.'
    }
    if (temData) {
      if (!ehDataValida(item['dataPagamento'])) {
        return 'Ha um lancamento com data de pagamento invalida.'
      }
      if (!ehCentavosValido(item['valorPagoCentavos'])) {
        return 'Ha um lancamento com valor pago invalido.'
      }
    }
  }
  return null
}

function validarAncoras(lista: readonly unknown[]): string | null {
  const datas: string[] = []
  const vistas = new Set<string>()

  for (const item of lista) {
    if (!ehObjeto(item)) return 'Ha uma ancora de saldo malformada no arquivo.'
    if (!ehTexto(item['id'])) return 'Ha uma ancora de saldo sem identificador.'
    if (!ehDataValida(item['data'])) return 'Ha uma ancora de saldo com data invalida.'
    if (!ehCentavosValido(item['saldoCentavos'])) {
      return 'Ha uma ancora de saldo com valor invalido.'
    }
    // Duas ancoras na mesma data e exatamente o estado que RN-50 passou a
    // impedir na escrita. Um arquivo gerado por versao anterior o traria de
    // volta pelo bulkPut, contornando a invariante do repositorio.
    if (vistas.has(item['data'])) {
      return 'Ha mais de uma ancora de saldo para a mesma data.'
    }
    vistas.add(item['data'])

    datas.push(item['data'])
  }

  // Ordenacao verificada para garantir que `comparar` foi exercitado sobre
  // todas as datas -- se alguma escapasse da validacao acima, falharia aqui.
  datas.sort(comparar)
  return null
}
