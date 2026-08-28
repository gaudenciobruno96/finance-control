import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Server } from 'node:http'
import { format } from 'node:util'
import { criarApp, responderPing } from './servidor-http.js'

/**
 * Reconstroi o texto que `console.error` de fato imprimiria.
 *
 * `chamada.join(' ')` NAO serve: `Array.prototype.join` converte cada
 * argumento via `String(x)`, que para um `Error` chama `toString()` e
 * devolve so `nome: mensagem` -- as propriedades proprias extras (como
 * `err.body`, que o body-parser anexa ao erro de parse) ficam de fora. O
 * `console.error` real usa `util.format` por baixo, que ao formatar um
 * `Error` imprime o stack e, depois dele, as propriedades proprias
 * enumeraveis. So `format` reproduz isso fielmente.
 */
function textoRegistrado(espiao: { mock: { calls: unknown[][] } }): string {
  return espiao.mock.calls.map((chamada) => format(...chamada)).join('\n')
}

const SEGREDO = 'segredo-de-teste-suficientemente-longo'

describe('responderPing', () => {
  it('devolve pong com a hora do servidor em ISO 8601', () => {
    const r = responderPing(new Date('2026-08-28T17:00:00.000Z'), '0.1.0')

    expect(r.resposta).toBe('pong')
    expect(r.horaDoServidor).toBe('2026-08-28T17:00:00.000Z')
    expect(r.versao).toBe('0.1.0')
  })

  it('reflete o instante recebido, nao um valor fixo', () => {
    // A hora e o que prova que o servidor executou codigo agora, e nao
    // devolveu resposta em cache em algum ponto do caminho.
    const a = responderPing(new Date('2026-01-01T00:00:00.000Z'), '0.1.0')
    const b = responderPing(new Date('2026-06-15T12:30:00.000Z'), '0.1.0')

    expect(a.horaDoServidor).not.toBe(b.horaDoServidor)
  })
})

describe('criarApp', () => {
  let servidor: Server | null = null

  afterEach(async () => {
    if (servidor !== null) {
      await new Promise<void>((ok) => servidor?.close(() => ok()))
      servidor = null
    }
  })

  /** Sobe o app numa porta efemera e devolve a base da URL. */
  async function subir(): Promise<string> {
    const app = criarApp(SEGREDO)
    return new Promise((ok) => {
      servidor = app.listen(0, '127.0.0.1', () => {
        const endereco = servidor?.address()
        if (endereco === null || endereco === undefined || typeof endereco === 'string') {
          throw new Error('nao foi possivel obter a porta')
        }
        ok(`http://127.0.0.1:${endereco.port}`)
      })
    })
  }

  it('responde ao healthcheck sem exigir autenticacao', async () => {
    const base = await subir()

    const r = await fetch(`${base}/`)

    expect(r.status).toBe(200)
  })

  it('o healthcheck nao vaza nada sobre o segredo', async () => {
    const base = await subir()

    const texto = await (await fetch(`${base}/`)).text()

    expect(texto).not.toContain(SEGREDO)
  })

  it('recusa o endpoint MCP sem o header', async () => {
    const base = await subir()

    const r = await fetch(`${base}/mcp`, { method: 'POST' })

    expect(r.status).toBe(401)
    expect(await r.text()).toBe('')
  })

  it('recusa o endpoint MCP com o segredo errado', async () => {
    const base = await subir()

    const r = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer errado' },
    })

    expect(r.status).toBe(401)
  })

  it('passa da autenticacao com o segredo certo', async () => {
    const base = await subir()

    const r = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SEGREDO}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    })

    // O que se prova aqui e que NAO foi barrado: o codigo de status do
    // protocolo MCP depende da negociacao e nao interessa a este teste.
    expect(r.status).not.toBe(401)
  })

  /**
   * O que uma resposta de erro NAO pode conter, seja qual for o status: nada
   * que descreva a estrutura interna do servidor. Compartilhado pelos dois
   * testes de corpo malformado abaixo, autenticado e nao autenticado, porque
   * a garantia e a mesma nos dois casos.
   */
  function semNadaInterno(texto: string): void {
    expect(texto).not.toContain('SyntaxError')
    expect(texto).not.toContain('at ') // formato de linha de stack trace do V8
    expect(texto).not.toMatch(/\.(ts|js):\d+/) // "arquivo.ts:12" ou "arquivo.js:12"
    expect(texto).not.toMatch(/<html/i)
  }

  it('POST nao autenticado com JSON malformado nao vaza estrutura interna', async () => {
    const base = await subir()

    const r = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ isto nao e json valido',
    })

    // O parser de corpo (montado globalmente por createMcpExpressApp) roda
    // ANTES do middleware de auth, entao um corpo malformado nunca chega a
    // criarMiddlewareDeAuth -- o 401 nao e alcancavel aqui. O que a resposta
    // tem que garantir e nao vazar nada, nao um status especifico: 401
    // exigiria autenticar antes do parser, que roda mais cedo na cadeia
    // global do Express e nao da para pular na frente dele.
    semNadaInterno(await r.text())
  })

  it('POST autenticado com JSON malformado tambem responde de forma controlada', async () => {
    const base = await subir()

    const r = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SEGREDO}`,
      },
      body: '{ isto nao e json valido',
    })

    semNadaInterno(await r.text())
  })

  it('registra o erro de corpo malformado no servidor sem vazar o segredo', async () => {
    const base = await subir()
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      // Header de autorizacao presente de proposito: se o log fosse
      // descuidado e incluisse a requisicao inteira (req.headers), o
      // segredo apareceria aqui. Sem o header, o teste nao provaria nada.
      const r = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SEGREDO}`,
        },
        body: '{ isto nao e json valido',
      })
      await r.text()

      expect(espiao).toHaveBeenCalled()

      const registrado = textoRegistrado(espiao)
      expect(registrado).not.toContain(SEGREDO)
    } finally {
      espiao.mockRestore()
    }
  })

  it('registra o erro de corpo malformado sem vazar o corpo da requisicao', async () => {
    const base = await subir()
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {})
    const SENTINELA = 'SENTINELA-NAO-DEVE-VAZAR-9271'

    try {
      // O body-parser, ao falhar o parse, anexa o corpo cru inteiro como
      // propriedade `body` do erro (`http-errors` muta o SyntaxError
      // original). Registrar o objeto `err` inteiro vazaria isso mesmo sem
      // nunca tocar em `req.body` diretamente -- por isso a sentinela vai no
      // CORPO malformado, nao no header.
      const r = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: `{ "valor": "${SENTINELA}"`,
      })
      await r.text()

      expect(espiao).toHaveBeenCalled()

      const registrado = textoRegistrado(espiao)
      expect(registrado).not.toContain(SENTINELA)
    } finally {
      espiao.mockRestore()
    }
  })
})
