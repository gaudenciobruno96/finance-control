import { describe, expect, it } from 'vitest'
import { conferir, criarMiddlewareDeAuth, lerSegredo } from './auth.js'

const SEGREDO = 'um-segredo-longo-o-suficiente-para-nao-ser-adivinhado'

describe('lerSegredo', () => {
  it('devolve o segredo quando definido', () => {
    expect(lerSegredo({ FINANCE_MCP_SEGREDO: SEGREDO })).toBe(SEGREDO)
  })

  it('lanca quando ausente', () => {
    expect(() => lerSegredo({})).toThrow(/FINANCE_MCP_SEGREDO/)
  })

  it('lanca quando vazio', () => {
    expect(() => lerSegredo({ FINANCE_MCP_SEGREDO: '   ' })).toThrow(/FINANCE_MCP_SEGREDO/)
  })

  it('nao repete o segredo na mensagem de erro', () => {
    // Um segredo presente mas invalido nao existe hoje; o que se prova aqui e
    // que a mensagem e construida a partir do NOME da variavel, nunca do
    // valor. `not.toContain(SEGREDO)` passaria mesmo se a mensagem
    // interpolasse QUALQUER OUTRO valor -- so a igualdade exata com o texto
    // fixo prova que nada e interpolado.
    let mensagem = ''
    try {
      lerSegredo({ FINANCE_MCP_SEGREDO: '' })
      expect.unreachable('deveria ter lancado')
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e)
    }

    expect(mensagem).toBe(
      'FINANCE_MCP_SEGREDO nao esta definida. O servidor nao sobe sem ela: ' +
        'subir sem segredo publicaria um endpoint aberto na internet.',
    )
  })

  it('devolve o segredo sem espacos nas bordas', () => {
    expect(lerSegredo({ FINANCE_MCP_SEGREDO: `  ${SEGREDO}\n` })).toBe(SEGREDO)
  })
})

describe('conferir', () => {
  it('aceita o header correto', () => {
    expect(conferir(`Bearer ${SEGREDO}`, SEGREDO)).toBe(true)
  })

  it('recusa header ausente', () => {
    expect(conferir(undefined, SEGREDO)).toBe(false)
  })

  it('recusa header vazio', () => {
    expect(conferir('', SEGREDO)).toBe(false)
  })

  it('recusa segredo errado do mesmo tamanho', () => {
    const errado = 'X'.repeat(SEGREDO.length)
    expect(conferir(`Bearer ${errado}`, SEGREDO)).toBe(false)
  })

  it('recusa segredo errado de tamanho diferente', () => {
    expect(conferir('Bearer x', SEGREDO)).toBe(false)
  })

  it('recusa o segredo cru, sem o prefixo Bearer', () => {
    // Aceitar as duas formas criaria um segundo caminho de autenticacao que
    // nao esta documentado em lugar nenhum.
    expect(conferir(SEGREDO, SEGREDO)).toBe(false)
  })

  it('recusa prefixo com caixa diferente', () => {
    expect(conferir(`bearer ${SEGREDO}`, SEGREDO)).toBe(false)
  })

  it('nao confunde prefixo sem espaco', () => {
    expect(conferir(`Bearer${SEGREDO}`, SEGREDO)).toBe(false)
  })
})

describe('criarMiddlewareDeAuth', () => {
  /** Duplas mínimas de req/res, para não arrastar supertest só por isto. */
  function fingir(cabecalho: string | undefined) {
    let status: number | null = null
    let corpo: unknown = 'nao chamado'
    let seguiu = false

    const req = { header: () => cabecalho }
    const res = {
      status(c: number) {
        status = c
        return this
      },
      end(b?: unknown) {
        corpo = b
        return this
      },
    }

    return {
      req,
      res,
      executar: (m: ReturnType<typeof criarMiddlewareDeAuth>) => {
        m(req as never, res as never, () => {
          seguiu = true
        })
      },
      get status() {
        return status
      },
      get corpo() {
        return corpo
      },
      get seguiu() {
        return seguiu
      },
    }
  }

  it('deixa passar com o segredo certo', () => {
    const c = fingir(`Bearer ${SEGREDO}`)
    c.executar(criarMiddlewareDeAuth(SEGREDO))

    expect(c.seguiu).toBe(true)
    expect(c.status).toBeNull()
  })

  it('responde 401 de corpo vazio sem o segredo', () => {
    const c = fingir(undefined)
    c.executar(criarMiddlewareDeAuth(SEGREDO))

    expect(c.seguiu).toBe(false)
    expect(c.status).toBe(401)
    expect(c.corpo).toBeUndefined()
  })

  it('nao diz por que recusou', () => {
    // Distinguir "faltou header" de "segredo errado" so ajuda quem adivinha.
    const semHeader = fingir(undefined)
    const errado = fingir('Bearer errado')

    semHeader.executar(criarMiddlewareDeAuth(SEGREDO))
    errado.executar(criarMiddlewareDeAuth(SEGREDO))

    expect(semHeader.status).toBe(errado.status)
    expect(semHeader.corpo).toBe(errado.corpo)
  })
})
