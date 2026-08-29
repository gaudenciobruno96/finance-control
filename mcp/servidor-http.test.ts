import { afterEach, describe, expect, it, vi } from 'vitest'
import { request as httpRequest } from 'node:http'
import type { Server } from 'node:http'
import { format } from 'node:util'
import { criarApp, iniciar, lerPorta, responderPing } from './servidor-http.js'

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

  /**
   * Como `subir`, mas com `FINANCE_MCP_HOST_PERMITIDO` definida antes de
   * `criarApp` ler o ambiente. A variavel e restaurada logo depois de criar
   * o app -- so a criacao le `process.env`, nao o servidor em si.
   */
  async function subirComHostPermitido(hostPermitido: string): Promise<string> {
    const anterior = process.env['FINANCE_MCP_HOST_PERMITIDO']
    process.env['FINANCE_MCP_HOST_PERMITIDO'] = hostPermitido
    let app: ReturnType<typeof criarApp>
    try {
      app = criarApp(SEGREDO)
    } finally {
      if (anterior === undefined) {
        delete process.env['FINANCE_MCP_HOST_PERMITIDO']
      } else {
        process.env['FINANCE_MCP_HOST_PERMITIDO'] = anterior
      }
    }

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

  /**
   * `fetch` recusa definir o header `Host` (e um header proibido pelo
   * padrao) -- por isso este teste usa `node:http` diretamente, que nao tem
   * essa restricao, para simular o Host que o Railway manda no healthcheck.
   */
  function requisicaoComHost(
    base: string,
    hostHeader: string,
  ): Promise<{ status: number; corpo: string }> {
    const url = new URL(base)
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: '/',
          method: 'GET',
          headers: { Host: hostHeader },
        },
        (res) => {
          let corpo = ''
          res.on('data', (chunk: Buffer) => {
            corpo += chunk.toString('utf8')
          })
          res.on('end', () => resolve({ status: res.statusCode ?? 0, corpo }))
        },
      )
      req.on('error', reject)
      req.end()
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

  it('o healthcheck nao expoe a versao nem qualquer outro dado', async () => {
    // A documentacao (README-remoto.md e o desenho) promete que o
    // healthcheck "nao expoe dado algum". O corpo precisa ser exatamente
    // isto -- nem `versao`, nem nada mais.
    const base = await subir()

    const corpo: unknown = await (await fetch(`${base}/`)).json()

    expect(corpo).toStrictEqual({ vivo: true })
  })

  it('nao serve x-powered-by, nem no healthcheck pre-autenticacao', async () => {
    const base = await subir()

    const r = await fetch(`${base}/`)

    expect(r.headers.has('x-powered-by')).toBe(false)
  })

  it('FINANCE_MCP_HOST_PERMITIDO inclui automaticamente o host de healthcheck do Railway', async () => {
    // Prova a correcao do achado: `hostHeaderValidation` e montado ANTES de
    // qualquer rota, inclusive `GET /`. Sem `healthcheck.railway.app` em
    // `allowedHosts`, o proprio healthcheck do Railway levaria 403 -- e foi
    // exatamente isso que quebrou o deploy antes desta correcao.
    const base = await subirComHostPermitido('meu-servico.up.railway.app')

    const doDominioConfigurado = await requisicaoComHost(base, 'meu-servico.up.railway.app')
    expect(doDominioConfigurado.status).toBe(200)

    const doHealthcheckDoRailway = await requisicaoComHost(base, 'healthcheck.railway.app')
    expect(doHealthcheckDoRailway.status).toBe(200)

    const deHostNaoPermitido = await requisicaoComHost(base, 'dominio-nao-autorizado.example.com')
    expect(deHostNaoPermitido.status).toBe(403)
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

  it('registra o erro de corpo malformado sem vazar o corpo via err.message/stack', async () => {
    // Fecha o canal que o round 3 nao fechou: `err.stack` inclui a MENSAGEM
    // do SyntaxError, e o V8 embute um trecho da entrada bruta nessa
    // mensagem para JSON invalido. A sentinela PRECISA ser curta: o V8
    // trunca o trecho citado (`"...`) a partir de um certo tamanho, e uma
    // sentinela longa demais (como a do teste de `err.body` abaixo) passaria
    // mesmo sem a correcao, so por sorte de truncamento -- e por isso este
    // teste nao pode reusar aquela sentinela.
    const base = await subir()
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {})
    const SENTINELA = 'SENTINELA-9271'

    try {
      const r = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: `[1,2,${SENTINELA}]`,
      })
      await r.text()

      expect(espiao).toHaveBeenCalled()

      const registrado = textoRegistrado(espiao)
      expect(registrado).not.toContain(SENTINELA)
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

  /**
   * Le uma resposta MCP, cuidando dos dois formatos que
   * `StreamableHTTPServerTransport` pode devolver: JSON puro, ou um stream
   * SSE (`text/event-stream`) com o payload numa linha `data: `.
   */
  async function lerRespostaMcp(r: Response): Promise<{ result?: unknown; error?: unknown }> {
    const texto = await r.text()
    const tipo = r.headers.get('content-type') ?? ''

    if (tipo.includes('text/event-stream')) {
      const linhaDeDados = texto.split('\n').find((linha) => linha.startsWith('data: '))
      if (linhaDeDados === undefined) {
        throw new Error(`resposta SSE sem linha "data:": ${texto}`)
      }
      return JSON.parse(linhaDeDados.slice('data: '.length)) as { result?: unknown; error?: unknown }
    }

    return JSON.parse(texto) as { result?: unknown; error?: unknown }
  }

  it('completa um exchange MCP real: initialize seguido de tools/call ping devolve pong', async () => {
    // Este e o unico teste que prova a coisa que o spike existe para provar:
    // que `ping` e alcancavel pelo protocolo MCP de verdade, nao so que o
    // endpoint aceita a requisicao. Um transporte totalmente desconectado
    // devolvendo 400 ou 404 passaria em "status !== 401" sem provar nada.
    const base = await subir()
    const cabecalhos = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${SEGREDO}`,
    }

    const respostaInit = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'teste-e2e', version: '1.0.0' },
        },
      }),
    })
    expect(respostaInit.status).toBe(200)
    const corpoInit = await lerRespostaMcp(respostaInit)
    expect(corpoInit.error).toBeUndefined()
    expect(corpoInit.result).toBeDefined()

    const respostaPing = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'ping', arguments: {} },
      }),
    })
    expect(respostaPing.status).toBe(200)
    const corpoPing = await lerRespostaMcp(respostaPing)
    expect(corpoPing.error).toBeUndefined()

    const resultado = corpoPing.result as { content: { type: string; text: string }[] }
    expect(resultado.content[0]?.text).toContain('pong')
  })

  it('criarApp recusa segredo vazio', () => {
    // Nao alcancavel por `iniciar()` (que ja teria lancado em `lerSegredo`),
    // mas a fronteira do app nao deveria depender de um chamador que ela nao
    // controla -- um app sem segredo aceitaria `Authorization: Bearer `
    // (header vazio) como valido.
    expect(() => criarApp('')).toThrow()
  })

  it('criarApp recusa segredo so com espacos', () => {
    expect(() => criarApp('   ')).toThrow()
  })
})

describe('lerPorta', () => {
  it('usa 8080 quando PORT nao esta definida', () => {
    expect(lerPorta({})).toBe(8080)
  })

  it('usa 8080 quando PORT esta vazia', () => {
    expect(lerPorta({ PORT: '' })).toBe(8080)
  })

  it('usa o valor de PORT quando e um inteiro positivo', () => {
    expect(lerPorta({ PORT: '3000' })).toBe(3000)
  })

  it('lanca quando PORT nao e numerica', () => {
    expect(() => lerPorta({ PORT: 'nao-e-um-numero' })).toThrow(/PORT/)
  })

  it('lanca quando PORT e fracionaria', () => {
    expect(() => lerPorta({ PORT: '3000.5' })).toThrow(/PORT/)
  })

  it('lanca quando PORT e zero', () => {
    expect(() => lerPorta({ PORT: '0' })).toThrow(/PORT/)
  })

  it('lanca quando PORT e negativa', () => {
    expect(() => lerPorta({ PORT: '-1' })).toThrow(/PORT/)
  })
})

describe('iniciar', () => {
  const CHAVE_SEGREDO = 'FINANCE_MCP_SEGREDO'
  const CHAVE_PORTA = 'PORT'

  /** Roda `fn` com as variaveis de ambiente indicadas e restaura o estado anterior depois. */
  function comEnv(mudancas: Record<string, string | undefined>, fn: () => void): void {
    const anteriores: Record<string, string | undefined> = {}
    for (const chave of Object.keys(mudancas)) {
      anteriores[chave] = process.env[chave]
    }

    try {
      for (const [chave, valor] of Object.entries(mudancas)) {
        if (valor === undefined) {
          delete process.env[chave]
        } else {
          process.env[chave] = valor
        }
      }
      fn()
    } finally {
      for (const [chave, valor] of Object.entries(anteriores)) {
        if (valor === undefined) {
          delete process.env[chave]
        } else {
          process.env[chave] = valor
        }
      }
    }
  }

  it('nao sobe sem FINANCE_MCP_SEGREDO', () => {
    // O item da tabela de testes do spec que so tinha verificacao manual: a
    // ligacao entre `iniciar()` e `lerSegredo`. Lanca ANTES de `listen`, e
    // por isso nenhuma porta chega a ser aberta -- nao precisa fechar
    // servidor nenhum depois.
    comEnv({ [CHAVE_SEGREDO]: undefined }, () => {
      expect(() => iniciar()).toThrow(/FINANCE_MCP_SEGREDO/)
    })
  })

  it('nao sobe com PORT invalida', () => {
    comEnv({ [CHAVE_SEGREDO]: SEGREDO, [CHAVE_PORTA]: 'nao-e-um-numero' }, () => {
      expect(() => iniciar()).toThrow(/PORT/)
    })
  })
})
