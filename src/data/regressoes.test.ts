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
        { id: crypto.randomUUID(), data: '2026-08-10', saldoCentavos: 10_000 },
        HOJE,
      )
      await repos.ancoras.salvar(
        { id: crypto.randomUUID(), data: '2026-08-10', saldoCentavos: 99_900 },
        HOJE,
      )

      const vigente = await repos.ancoras.vigenteEm(HOJE)
      expect(vigente?.saldoCentavos).toBe(99_900)
      expect(await repos.ancoras.listar()).toHaveLength(1)

      await db.ancoras.clear()
    }
  })

  it('ancoras de datas diferentes continuam acumulando', async () => {
    await repos.ancoras.salvar({ id: 'a', data: '2026-07-01', saldoCentavos: 1 }, HOJE)
    await repos.ancoras.salvar({ id: 'b', data: '2026-08-01', saldoCentavos: 2 }, HOJE)

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
