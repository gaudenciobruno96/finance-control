/**
 * SUP-04 — Geradores de dominio para teste por propriedade (PBT-07).
 *
 * Cada gerador produz valores que satisfazem as invariantes da entidade POR
 * CONSTRUCAO. Um gerador de Regra nunca emite diaDoMes igual a 0 ou 40; um
 * gerador de Centavos nunca emite fracao.
 *
 * Por construcao e nao por filtro: gerar valores arbitrarios e descartar os
 * invalidos desperdica execucoes e enviesa a distribuicao para longe das
 * bordas -- justamente onde os defeitos moram.
 *
 * Compartilhado entre as tres unidades. Vive fora de src/domain/ porque nao e
 * codigo de producao.
 */

import fc from 'fast-check'
import { diasNoMes } from '../domain/guards.js'
import type {
  AjusteFimDeSemana,
  AncoraSaldo,
  Cartao,
  Centavos,
  Competencia,
  DataISO,
  Ocorrencia,
  Parcelamento,
  Regra,
  TipoMovimento,
} from '../domain/types.js'

// Faixa de anos deliberadamente estreita: gerar o ano 47000 nao encontra
// defeito de negocio, so ruido. As bordas que importam sao as de mes e dia.
const ANO_MIN = 2020
const ANO_MAX = 2035

const VALOR_MAX = 100_000_00 // cem mil reais em centavos

// ---------------------------------------------------------------------------
// Primitivos
// ---------------------------------------------------------------------------

export const centavos = (): fc.Arbitrary<Centavos> =>
  fc.integer({ min: -VALOR_MAX, max: VALOR_MAX })

export const centavosPositivo = (): fc.Arbitrary<Centavos> =>
  fc.integer({ min: 1, max: VALOR_MAX })

export const centavosNaoNegativo = (): fc.Arbitrary<Centavos> =>
  fc.integer({ min: 0, max: VALOR_MAX })

function formatar(ano: number, mes: number, dia: number): DataISO {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/**
 * Data valida. O dia depende do mes e do ano, de modo que 30 de fevereiro
 * jamais e gerado.
 */
export const dataISO = (): fc.Arbitrary<DataISO> =>
  fc
    .tuple(
      fc.integer({ min: ANO_MIN, max: ANO_MAX }),
      fc.integer({ min: 1, max: 12 }),
    )
    .chain(([ano, mes]) =>
      fc
        .integer({ min: 1, max: diasNoMes(ano, mes) })
        .map((dia) => formatar(ano, mes, dia)),
    )

export const competencia = (): fc.Arbitrary<Competencia> =>
  fc
    .tuple(
      fc.integer({ min: ANO_MIN, max: ANO_MAX }),
      fc.integer({ min: 1, max: 12 }),
    )
    .map(([ano, mes]) => `${ano}-${String(mes).padStart(2, '0')}`)

/**
 * Dia do mes na faixa completa 1 a 31, inclusive os dias que nao existem em
 * todo mes. Gerar 29, 30 e 31 e o ponto: e onde o truncamento de RN-05 e
 * exercitado.
 */
export const diaDoMes = (): fc.Arbitrary<number> => fc.integer({ min: 1, max: 31 })

export const tipoMovimento = (): fc.Arbitrary<TipoMovimento> =>
  fc.constantFrom<TipoMovimento[]>('entrada', 'saida')

export const ajusteFimDeSemana = (): fc.Arbitrary<AjusteFimDeSemana> =>
  fc.constantFrom<AjusteFimDeSemana[]>('nenhum', 'antecipa', 'posterga')

const identificador = (prefixo: string): fc.Arbitrary<string> =>
  fc.integer({ min: 1, max: 9999 }).map((n) => `${prefixo}-${n}`)

const nome = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'Salario principal',
    'Salario secundario',
    'Aluguel',
    'Internet',
    'Conta de luz',
    'Conta de agua',
    'Assinatura',
  )

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

/**
 * Regra com vigencia sempre coerente: `vigenteAte` e nulo ou posterior a
 * `vigenteDe`, nunca anterior.
 */
export const regra = (): fc.Arbitrary<Regra> =>
  fc
    .record({
      id: identificador('regra'),
      tipo: tipoMovimento(),
      nome: nome(),
      valorCentavos: centavosPositivo(),
      valorEhEstimativa: fc.boolean(),
      diaDoMes: diaDoMes(),
      ajusteFimDeSemana: ajusteFimDeSemana(),
      vigenteDe: competencia(),
      duracaoMeses: fc.option(fc.integer({ min: 0, max: 36 }), { nil: null }),
    })
    .map(({ duracaoMeses, ...resto }) => ({
      ...resto,
      vigenteAte: duracaoMeses === null ? null : somarMesesSimples(resto.vigenteDe, duracaoMeses),
    }))

function somarMesesSimples(c: Competencia, n: number): Competencia {
  const ano = Number(c.slice(0, 4))
  const mes = Number(c.slice(5, 7))
  const total = ano * 12 + (mes - 1) + n
  const novoAno = Math.floor(total / 12)
  const novoMes = total - novoAno * 12 + 1
  return `${String(novoAno).padStart(4, '0')}-${String(novoMes).padStart(2, '0')}`
}

export const cartao = (): fc.Arbitrary<Cartao> =>
  fc.record({
    id: identificador('cartao'),
    nome: fc.constantFrom('Cartao principal', 'Cartao secundario'),
    diaFechamento: diaDoMes(),
    diaVencimento: diaDoMes(),
    gastoMensalTipicoCentavos: centavosNaoNegativo(),
  })

/** Parcelamento sem vinculo a cartao. */
export const parcelamentoAvulso = (): fc.Arbitrary<Parcelamento> =>
  fc.record({
    id: identificador('parcelamento'),
    nome: fc.constantFrom('Geladeira', 'Notebook', 'Curso', 'Viagem'),
    valorParcelaCentavos: centavosPositivo(),
    quantidadeParcelas: fc.integer({ min: 1, max: 24 }),
    primeiroVencimento: dataISO(),
    cartaoId: fc.constant(null),
  })

/** Parcelamento vinculado a um cartao especifico. */
export const parcelamentoDeCartao = (cartaoId: string): fc.Arbitrary<Parcelamento> =>
  fc.record({
    id: identificador('parcelamento'),
    nome: fc.constantFrom('Geladeira', 'Notebook', 'Curso', 'Viagem'),
    valorParcelaCentavos: centavosPositivo(),
    quantidadeParcelas: fc.integer({ min: 1, max: 24 }),
    primeiroVencimento: dataISO(),
    cartaoId: fc.constant(cartaoId),
  })

/**
 * Ocorrencia com o par (dataPagamento, valorPagoCentavos) sempre coerente:
 * ambos nulos ou ambos preenchidos, nunca um so. E a invariante 2 da entidade.
 */
export const ocorrencia = (): fc.Arbitrary<Ocorrencia> =>
  fc
    .record({
      id: identificador('ocorrencia'),
      geradorTipo: fc.constantFrom('regra' as const, 'avulso' as const),
      geradorId: identificador('gerador'),
      competencia: competencia(),
      tipo: tipoMovimento(),
      nome: nome(),
      valorPrevistoCentavos: centavosPositivo(),
      dataVencimento: dataISO(),
      pagamento: fc.option(
        fc.record({ data: dataISO(), valor: centavosPositivo() }),
        { nil: null },
      ),
      ignorado: fc.boolean(),
      observacao: fc.constant(null),
    })
    .map(({ pagamento, ignorado, geradorTipo, geradorId, ...resto }) => ({
      ...resto,
      geradorTipo,
      geradorId: geradorTipo === 'avulso' ? null : geradorId,
      // Invariante 3: item ignorado nao tem data de pagamento.
      ignorado,
      dataPagamento: ignorado ? null : (pagamento?.data ?? null),
      valorPagoCentavos: ignorado ? null : (pagamento?.valor ?? null),
    }))

export const ancoraSaldo = (): fc.Arbitrary<AncoraSaldo> =>
  fc.record({
    id: identificador('ancora'),
    data: dataISO(),
    saldoCentavos: centavos(),
  })
