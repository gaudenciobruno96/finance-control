/**
 * Testes dos defeitos encontrados na revisao de codigo.
 *
 * Cada um reproduz o cenario concreto que falhava antes da correcao. Sem eles,
 * nada impede que a mesma classe de defeito volte.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarBanco, type BancoFinanceiro } from './db.js'
import { criarRepositorios, type Repositorios } from './repositories.js'
import { validar } from './backup-validator.js'
import { VERSAO_SCHEMA } from './db.js'

const HOJE = '2026-08-15'

let db: BancoFinanceiro
let repos: Repositorios

beforeEach(async () => {
  db = criarBanco(`regressao-${crypto.randomUUID()}`)
  repos = criarRepositorios(db)
  await db.open()
})

afterEach(async () => {
  db.close()
  await db.delete()
})

describe('ancora na mesma data (revisao #2)', () => {
  /**
   * Antes, duas ancoras na mesma data coexistiam e `vigenteEm` escolhia pela
   * ordem do indice -- que desempata pela chave primaria. Como o id e um UUID
   * aleatorio, a vencedora era a de maior UUID, nao a gravada por ultimo.
   *
   * Corrigir um saldo digitado errado funcionava em cerca de metade das vezes.
   */
  it('declarar o saldo de novo substitui, e o valor novo sempre vence', async () => {
    for (let i = 0; i < 20; i += 1) {
      await repos.ancoras.salvar(
        { id: crypto.randomUUID(), data: '2026-08-10', saldoCentavos: 10_000, declaradaEm: null },
        HOJE,
      )
      await repos.ancoras.salvar(
        { id: crypto.randomUUID(), data: '2026-08-10', saldoCentavos: 99_900, declaradaEm: null },
        HOJE,
      )

      const vigente = await repos.ancoras.vigenteEm(HOJE)
      expect(vigente?.saldoCentavos).toBe(99_900)
      expect(await repos.ancoras.listar()).toHaveLength(1)

      await db.ancoras.clear()
    }
  })

  it('ancoras de datas diferentes continuam acumulando', async () => {
    await repos.ancoras.salvar({ id: 'a', data: '2026-07-01', saldoCentavos: 1, declaradaEm: null }, HOJE)
    await repos.ancoras.salvar({ id: 'b', data: '2026-08-01', saldoCentavos: 2, declaradaEm: null }, HOJE)

    expect(await repos.ancoras.listar()).toHaveLength(2)
    expect((await repos.ancoras.vigenteEm('2026-07-15'))?.saldoCentavos).toBe(1)
    expect((await repos.ancoras.vigenteEm(HOJE))?.saldoCentavos).toBe(2)
  })
})

describe('validacao de backup (revisao #5)', () => {
  function documento(ocorrencia: Record<string, unknown>) {
    return {
      versaoSchema: VERSAO_SCHEMA,
      exportadoEm: HOJE,
      regras: [],
      parcelamentos: [],
      cartoes: [],
      ancoras: [],
      configuracoes: [],
      ocorrencias: [ocorrencia],
    }
  }

  const base = {
    id: 'o1',
    geradorTipo: 'avulso',
    geradorId: null,
    competencia: '2026-08',
    tipo: 'entrada',
    nome: 'Freelance',
    valorPrevistoCentavos: 250_000,
    dataVencimento: '2026-08-20',
    dataPagamento: null,
    valorPagoCentavos: null,
    ignorado: false,
    observacao: null,
  }

  it('aceita um lancamento completo', () => {
    expect(validar(documento(base)).valido).toBe(true)
  })

  /**
   * O defeito: `tipo` nao era verificado, e o projetor trata como saida tudo
   * que nao e 'entrada'. Uma receita virava despesa em silencio na curva.
   */
  it('recusa lancamento sem tipo', () => {
    const { tipo, ...semTipo } = base
    void tipo

    const r = validar(documento(semTipo))
    expect(r.valido).toBe(false)
    if (r.valido) return
    expect(r.erro).toContain('entrada ou saída'.normalize('NFC').replace('í', 'i'))
  })

  it('recusa tipo desconhecido', () => {
    expect(validar(documento({ ...base, tipo: 'transferencia' })).valido).toBe(false)
  })

  /**
   * Um registro nao avulso sem gerador fica fora do indice composto que
   * sustenta a idempotencia, e cada confirmacao de pagamento criaria uma
   * duplicata.
   */
  it('recusa origem incoerente com o identificador', () => {
    expect(
      validar(documento({ ...base, geradorTipo: 'regra', geradorId: null })).valido,
    ).toBe(false)

    expect(
      validar(documento({ ...base, geradorTipo: 'avulso', geradorId: 'r1' })).valido,
    ).toBe(false)
  })

  it('recusa lancamento sem descricao ou sem marcacao de ignorado', () => {
    expect(validar(documento({ ...base, nome: '' })).valido).toBe(false)
    expect(validar(documento({ ...base, ignorado: 'nao' })).valido).toBe(false)
  })
})

/**
 * O defeito: o validador nao olhava `categoria`.
 *
 * Um arquivo com `"Mercado"` -- maiuscula, fora da lista fixa -- passava como
 * valido, o usuario via o resumo, confirmava, e so entao a importacao morria
 * com um ErroDeDominio cru ("categoria fora da lista conhecida") vindo de
 * dentro de `escrever`. Nenhum dado se perdia, mas o contrato deste modulo e
 * recusar entrada nao confiavel com uma razao legivel ANTES do resumo.
 *
 * Editar o JSON a mao e o caminho natural de quem quer recategorizar contas ja
 * pagas em lote, entao a entrada errada e provavel.
 */
describe('categoria fora da lista conhecida no arquivo', () => {
  const REGRA = {
    id: 'r1',
    tipo: 'saida',
    nome: 'Aluguel',
    valorCentavos: 180_000,
    valorEhEstimativa: false,
    diaDoMes: 10,
    ajusteFimDeSemana: 'nenhum',
    vigenteDe: '2026-01',
    vigenteAte: null,
    categoria: null,
  }

  const PARCELAMENTO = {
    id: 'p1',
    nome: 'Notebook',
    valorParcelaCentavos: 30_000,
    quantidadeParcelas: 10,
    primeiroVencimento: '2026-08-28',
    categoria: null,
  }

  const OCORRENCIA = {
    id: 'o1',
    geradorTipo: 'avulso',
    geradorId: null,
    competencia: '2026-08',
    tipo: 'saida',
    nome: 'Feira',
    valorPrevistoCentavos: 12_000,
    dataVencimento: '2026-08-20',
    dataPagamento: null,
    valorPagoCentavos: null,
    ignorado: false,
    observacao: null,
    categoria: null,
  }

  function doc(over: Record<string, unknown> = {}) {
    return {
      versaoSchema: VERSAO_SCHEMA,
      exportadoEm: HOJE,
      regras: [REGRA],
      parcelamentos: [PARCELAMENTO],
      ancoras: [],
      configuracoes: [],
      ocorrencias: [OCORRENCIA],
      ...over,
    }
  }

  it('aceita as categorias da lista, e nulo', () => {
    const r = validar(
      doc({
        regras: [{ ...REGRA, categoria: 'moradia' }],
        parcelamentos: [{ ...PARCELAMENTO, categoria: 'compras' }],
        ocorrencias: [{ ...OCORRENCIA, categoria: 'mercado' }],
      }),
    )

    expect(r.valido).toBe(true)
    expect(validar(doc()).valido).toBe(true)
  })

  /**
   * Backup anterior a versao 4 nao tem o campo, e `migrarDocumento` so o
   * preenche DEPOIS da validacao. Recusar o ausente aqui tornaria todo arquivo
   * antigo inimportavel.
   */
  it('aceita o campo ausente, como nos backups anteriores a versao 4', () => {
    const { categoria: catRegra, ...regraSemCampo } = REGRA
    const { categoria: catParcelamento, ...parcelamentoSemCampo } = PARCELAMENTO
    const { categoria: catOcorrencia, ...ocorrenciaSemCampo } = OCORRENCIA
    void catRegra
    void catParcelamento
    void catOcorrencia

    expect(
      validar(
        doc({
          regras: [regraSemCampo],
          parcelamentos: [parcelamentoSemCampo],
          ocorrencias: [ocorrenciaSemCampo],
        }),
      ).valido,
    ).toBe(true)
  })

  it('recusa a regra com categoria fora da lista, com razao legivel', () => {
    const r = validar(doc({ regras: [{ ...REGRA, categoria: 'Mercado' }] }))

    expect(r.valido).toBe(false)
    if (r.valido) return
    expect(r.erro).toContain('regra')
    expect(r.erro).toContain('categoria')
  })

  it('recusa o parcelamento com categoria fora da lista', () => {
    const r = validar(doc({ parcelamentos: [{ ...PARCELAMENTO, categoria: 'eletronicos' }] }))

    expect(r.valido).toBe(false)
    if (r.valido) return
    expect(r.erro).toContain('parcelamento')
    expect(r.erro).toContain('categoria')
  })

  it('recusa o lancamento com categoria fora da lista', () => {
    const r = validar(doc({ ocorrencias: [{ ...OCORRENCIA, categoria: 'mercadinho' }] }))

    expect(r.valido).toBe(false)
    if (r.valido) return
    expect(r.erro).toContain('lancamento')
    expect(r.erro).toContain('categoria')
  })

  it('recusa categoria que nem texto e', () => {
    expect(validar(doc({ ocorrencias: [{ ...OCORRENCIA, categoria: 7 }] })).valido).toBe(false)
  })
})
