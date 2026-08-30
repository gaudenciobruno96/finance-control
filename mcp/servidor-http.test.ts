import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { request as httpRequest } from 'node:http'
import type { Server } from 'node:http'
import { format } from 'node:util'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarApp, dataNoFuso, iniciar, lerPorta, responderPing } from './servidor-http.js'
import { criarPool } from './dados/conexao.js'
import { aplicarMigracoes } from './dados/migracoes.js'
import { criarAppPg, type AppPg } from './app-pg.js'

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

describe('dataNoFuso', () => {
  it('usa o fuso do usuario (BRT), nao o fuso do processo (UTC)', () => {
    // 22h em Sao Paulo (UTC-3) no dia 31/08 e 01h UTC do dia 01/09 -- o
    // exemplo do proprio achado. A versao ingenua (getDate()/getMonth(), que
    // leem o fuso do PROCESSO -- UTC no container) leria '2026-09-01', um dia
    // adiantado. Verificado: `instante.getUTCDate()` para este instante da
    // 1 (01/09), enquanto o fuso do usuario ainda esta em 31/08.
    expect(dataNoFuso(new Date('2026-09-01T01:00:00.000Z'))).toBe('2026-08-31')
  })

  it('nao muda a data para um horario que ja e o mesmo dia nos dois fusos', () => {
    expect(dataNoFuso(new Date('2026-08-31T12:00:00.000Z'))).toBe('2026-08-31')
  })

  it('vira o dia no instante certo, no fuso do usuario', () => {
    // 00:30 em Sao Paulo do dia 01/09 e 03:30 UTC.
    expect(dataNoFuso(new Date('2026-09-01T03:30:00.000Z'))).toBe('2026-09-01')
  })
})

describe('criarApp', () => {
  let servidor: Server | null = null
  let container: StartedPostgreSqlContainer
  let pool: Pool
  let appPg: AppPg

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start()
    pool = criarPool(container.getConnectionUri())
    await aplicarMigracoes(pool)
    appPg = criarAppPg(pool)
  }, 120_000)

  afterAll(async () => {
    await pool.end()
    await container.stop()
  })

  afterEach(async () => {
    if (servidor !== null) {
      await new Promise<void>((ok) => servidor?.close(() => ok()))
      servidor = null
    }
  })

  /** Sobe o app numa porta efemera e devolve a base da URL. */
  async function subir(): Promise<string> {
    const app = criarApp(SEGREDO, appPg)
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
      app = criarApp(SEGREDO, appPg)
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

  /**
   * As sete ferramentas financeiras (Fix 9): so `ping` era coberto sobre o
   * protocolo real. O que fica sem cobertura sem isto e exatamente a
   * FIACAO -- os schemas zod, os espalhamentos de propriedade opcional
   * (`...(x === undefined ? {} : {x})`), e o default `hoje ?? hojeDoSistema()`
   * -- nada disso e exercitado so chamando as funcoes das ferramentas
   * diretamente. Uma ferramenta quebrada volta como `isError: true` com
   * texto, que para o modelo le como uma resposta normal.
   */
  async function chamarFerramenta(
    nome: string,
    args: Record<string, unknown>,
  ): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
    const base = await subir()
    const cabecalhos = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${SEGREDO}`,
    }

    await fetch(`${base}/mcp`, {
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

    const resposta = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: nome, arguments: args },
      }),
    })
    expect(resposta.status).toBe(200)
    const corpo = await lerRespostaMcp(resposta)
    expect(corpo.error).toBeUndefined()

    return corpo.result as { content: { type: string; text: string }[]; isError?: boolean }
  }

  describe('tools/call sobre as sete ferramentas financeiras', () => {
    beforeEach(async () => {
      for (const t of ['regras', 'ancoras', 'ocorrencias', 'parcelamentos']) {
        await pool.query(`delete from ${t}`)
      }
    })

    it('situacao_do_mes devolve conteudo plausivel, sem competencia explicita', async () => {
      const r = await chamarFerramenta('situacao_do_mes', { hoje: '2026-09-15' })

      expect(r.isError).not.toBe(true)
      expect(r.content[0]?.text).toContain('"competencia": "2026-09"')
      expect(r.content[0]?.text).toContain('"saldoRelativo"')
    })

    it('cadastrar_recorrente grava a regra e devolve recibo plausivel', async () => {
      const r = await chamarFerramenta('cadastrar_recorrente', {
        tipo: 'saida',
        nome: 'Aluguel via tools/call',
        valor: '1800',
        diaDoMes: 10,
        vigenteDe: '2026-09',
      })

      expect(r.isError).not.toBe(true)
      expect(r.content[0]?.text).toContain('Aluguel via tools/call')

      const todas = await pool.query<{ nome: string }>('select nome from regras')
      expect(todas.rows.map((x) => x.nome)).toContain('Aluguel via tools/call')
    })

    it('lancar_avulso grava a ocorrencia e devolve recibo plausivel', async () => {
      const r = await chamarFerramenta('lancar_avulso', {
        tipo: 'saida',
        nome: 'Mercado via tools/call',
        valor: '80',
        hoje: '2026-09-15',
      })

      expect(r.isError).not.toBe(true)
      expect(r.content[0]?.text).toContain('Mercado via tools/call')
      expect(r.content[0]?.text).toContain('R$')
    })

    it('marcar_pago encontra a chave devolvida por situacao_do_mes e paga', async () => {
      await chamarFerramenta('cadastrar_recorrente', {
        tipo: 'saida',
        nome: 'Luz via tools/call',
        valor: '220',
        diaDoMes: 5,
        vigenteDe: '2026-09',
      })

      const situacao = await chamarFerramenta('situacao_do_mes', {
        competencia: '2026-09',
        hoje: '2026-09-15',
      })
      const dados = JSON.parse(situacao.content[0]?.text ?? '{}') as {
        faltaPagar: { nome: string; chave: string }[]
      }
      const chave = dados.faltaPagar.find((i) => i.nome === 'Luz via tools/call')?.chave
      expect(chave).toBeTypeOf('string')

      const r = await chamarFerramenta('marcar_pago', { chave, hoje: '2026-09-15' })

      expect(r.isError).not.toBe(true)
      expect(r.content[0]?.text).toContain('Luz via tools/call')
    })

    it('declarar_saldo grava a ancora e devolve recibo plausivel', async () => {
      const r = await chamarFerramenta('declarar_saldo', { valor: '1000', hoje: '2026-09-15' })

      expect(r.isError).not.toBe(true)
      expect(r.content[0]?.text).toContain('R$')

      const ancoras = await pool.query('select * from ancoras')
      expect(ancoras.rowCount).toBe(1)
    })

    it('desfazer reverte um lancamento avulso feito por lancar_avulso', async () => {
      const lancamento = await chamarFerramenta('lancar_avulso', {
        tipo: 'saida',
        nome: 'Erro via tools/call',
        valor: '50',
        hoje: '2026-09-15',
      })
      const dados = JSON.parse(lancamento.content[0]?.text ?? '{}') as { id: string }

      const r = await chamarFerramenta('desfazer', {
        tipo: 'avulso',
        id: dados.id,
        hoje: '2026-09-15',
      })

      expect(r.isError).not.toBe(true)
      expect(r.content[0]?.text).toContain('removido')

      const restantes = await pool.query('select * from ocorrencias where id = $1', [dados.id])
      expect(restantes.rowCount).toBe(0)
    })

    it('exportar devolve o documento de backup completo', async () => {
      const r = await chamarFerramenta('exportar', { hoje: '2026-09-15' })

      expect(r.isError).not.toBe(true)
      expect(r.content[0]?.text).toContain('"versaoSchema"')
      expect(r.content[0]?.text).toContain('"regras"')
      expect(r.content[0]?.text).toContain('"ocorrencias"')
    })

    it('erro de dominio (valor invalido) atravessa verbatim ate o cliente (Fix 8)', async () => {
      // "Nao entendi o valor" e como o assistente sabe o que tentar diferente
      // -- precisa chegar ao cliente sem ser trocado pela mensagem generica
      // que erros crus recebem.
      const r = await chamarFerramenta('lancar_avulso', {
        tipo: 'saida',
        nome: 'Teste',
        valor: 'nao e um numero',
        hoje: '2026-09-15',
      })

      expect(r.isError).toBe(true)
      expect(r.content[0]?.text).toContain('Nao entendi o valor')
    })

    it('o_que_vence responde pelo protocolo', async () => {
      await chamarFerramenta('cadastrar_recorrente', {
        tipo: 'saida',
        nome: 'Aluguel',
        valor: '1800,00',
        diaDoMes: 10,
        vigenteDe: '2026-09',
      })

      const r = await chamarFerramenta('o_que_vence', { dias: 30, hoje: '2026-09-05' })

      expect(r.isError).not.toBe(true)
      expect(r.content[0]?.text).toContain('Aluguel')
    })

    it('historico_de_gastos responde pelo protocolo e usa o valor PAGO, nao o previsto', async () => {
      await chamarFerramenta('cadastrar_recorrente', {
        tipo: 'saida',
        nome: 'Luz para historico',
        valor: '220,00',
        diaDoMes: 15,
        vigenteDe: '2026-08',
      })

      const situacao = await chamarFerramenta('situacao_do_mes', {
        competencia: '2026-08',
        hoje: '2026-08-20',
      })
      const dadosSituacao = JSON.parse(situacao.content[0]?.text ?? '{}') as {
        faltaPagar: { nome: string; chave: string }[]
      }
      const chave = dadosSituacao.faltaPagar.find((i) => i.nome === 'Luz para historico')?.chave
      expect(chave).toBeTypeOf('string')

      // Valor pago (245,90) deliberadamente diferente do previsto (220,00): o
      // teste so prova algo se o historico refletir o que foi PAGO, nao o
      // que estava previsto.
      const pagamento = await chamarFerramenta('marcar_pago', {
        chave,
        valor: '245,90',
        hoje: '2026-08-20',
      })
      expect(pagamento.isError).not.toBe(true)

      const r = await chamarFerramenta('historico_de_gastos', { meses: 3, hoje: '2026-09-05' })

      expect(r.isError).not.toBe(true)
      const dadosHistorico = JSON.parse(r.content[0]?.text ?? '{}') as {
        itens: { nome: string; total: { valorCentavos: number } }[]
      }
      const item = dadosHistorico.itens.find((i) => i.nome === 'Luz para historico')
      expect(item?.total.valorCentavos).toBe(24590)
    })

    it('cadastrar_parcelamento responde pelo protocolo e grava', async () => {
      const r = await chamarFerramenta('cadastrar_parcelamento', {
        nome: 'Geladeira',
        valorParcela: '300,00',
        quantidadeParcelas: 10,
        primeiroVencimento: '2026-10-20',
      })

      expect(r.isError).not.toBe(true)
      expect(r.content[0]?.text).toContain('Geladeira')

      const gravados = await pool.query('select * from parcelamentos')
      expect(gravados.rowCount).toBe(1)
    })

    it('simular_cenario responde pelo protocolo e NAO altera o banco', async () => {
      await chamarFerramenta('cadastrar_recorrente', {
        tipo: 'saida',
        nome: 'Aluguel',
        valor: '1800,00',
        diaDoMes: 10,
        vigenteDe: '2026-09',
      })

      const antes = await pool.query('select * from regras order by id')

      const r = await chamarFerramenta('simular_cenario', {
        lancamentos: [
          {
            tipo: 'parcelamento',
            parcelamento: {
              nome: 'Geladeira',
              valorParcelaCentavos: 30000,
              quantidadeParcelas: 6,
              primeiroVencimento: '2026-10-20',
            },
          },
        ],
        ate: '2026-12',
        hoje: '2026-09-05',
      })

      expect(r.isError).not.toBe(true)
      expect(r.content[0]?.text).toContain('comCenario')

      // A garantia central da ferramenta: ela escreve so em bancos que morrem
      // no fim da chamada. Quando a fonte era um arquivo isso valia por
      // construcao; agora que a fonte e o banco de producao, precisa ser
      // verificado.
      const depois = await pool.query('select * from regras order by id')
      expect(depois.rows).toEqual(antes.rows)
      expect((await pool.query('select * from parcelamentos')).rowCount).toBe(0)
    })

    it('erro cru do banco NAO atravessa: sai sanitizado (Fix 8)', async () => {
      // Simula uma falha inesperada (nao prevista por nenhuma ferramenta):
      // fecha o pool desta app antes da chamada, forcando `pool.query` a
      // lancar um erro que ninguem escreveu pensando no usuario ler. O que se
      // prova e que esse erro NAO alcanca o cliente verbatim -- so a mensagem
      // generica alcanca.
      const poolProprio = criarPool(container.getConnectionUri())
      const appProprio = criarAppPg(poolProprio)
      await poolProprio.end()

      const appAnterior = appPg
      appPg = appProprio
      try {
        const r = await chamarFerramenta('situacao_do_mes', { hoje: '2026-09-15' })

        expect(r.isError).toBe(true)
        expect(r.content[0]?.text).not.toContain('Cannot use a pool')
        expect(r.content[0]?.text).not.toContain(container.getConnectionUri())
        expect(r.content[0]?.text).toMatch(/falha interna/i)
      } finally {
        appPg = appAnterior
      }
    })
  })

  it('criarApp recusa segredo vazio', () => {
    // Nao alcancavel por `iniciar()` (que ja teria lancado em `lerSegredo`),
    // mas a fronteira do app nao deveria depender de um chamador que ela nao
    // controla -- um app sem segredo aceitaria `Authorization: Bearer `
    // (header vazio) como valido.
    expect(() => criarApp('', appPg)).toThrow()
  })

  it('criarApp recusa segredo so com espacos', () => {
    expect(() => criarApp('   ', appPg)).toThrow()
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
  const CHAVE_BANCO = 'DATABASE_URL'

  /**
   * Roda `fn` com as variaveis de ambiente indicadas e restaura o estado
   * anterior depois. `iniciar()` e assincrona (aplica migracoes antes de
   * escutar), entao `fn` tambem e -- e esperada antes do `finally` restaurar
   * o ambiente, senao a chamada em curso veria o ambiente ja restaurado.
   */
  async function comEnv(
    mudancas: Record<string, string | undefined>,
    fn: () => Promise<void>,
  ): Promise<void> {
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
      await fn()
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

  it('nao sobe sem FINANCE_MCP_SEGREDO', async () => {
    // O item da tabela de testes do spec que so tinha verificacao manual: a
    // ligacao entre `iniciar()` e `lerSegredo`. Lanca ANTES de `listen`, e
    // por isso nenhuma porta chega a ser aberta -- nao precisa fechar
    // servidor nenhum depois.
    await comEnv({ [CHAVE_SEGREDO]: undefined }, async () => {
      await expect(iniciar()).rejects.toThrow(/FINANCE_MCP_SEGREDO/)
    })
  })

  it('nao sobe com PORT invalida', async () => {
    await comEnv({ [CHAVE_SEGREDO]: SEGREDO, [CHAVE_PORTA]: 'nao-e-um-numero' }, async () => {
      await expect(iniciar()).rejects.toThrow(/PORT/)
    })
  })

  it('nao sobe sem DATABASE_URL', async () => {
    // Lanca antes de qualquer tentativa de conexao: `lerUrlDoBanco` roda
    // antes de `criarPool`, entao este teste nao depende de banco nenhum no
    // ar.
    await comEnv(
      { [CHAVE_SEGREDO]: SEGREDO, [CHAVE_PORTA]: undefined, [CHAVE_BANCO]: undefined },
      async () => {
        await expect(iniciar()).rejects.toThrow(/DATABASE_URL/)
      },
    )
  })

  it('nao sobe quando as migracoes falham, e nao vaza a DATABASE_URL no log', async () => {
    // Nenhum Postgres real escuta na porta 1 -- `aplicarMigracoes` falha ao
    // conectar, e e exatamente esse caminho (nao "sem DATABASE_URL") que
    // precisa deixar o processo fora do ar. A senha na URL e a prova de que
    // `descreverErro` (nao a mensagem crua do `pg`) e o que vai ao log.
    const SENHA_SENTINELA = 'senha-sentinela-nao-deve-vazar-8214'
    const urlComPortaFechada = `postgres://postgres:${SENHA_SENTINELA}@127.0.0.1:1/nao-existe`
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await comEnv(
        {
          [CHAVE_SEGREDO]: SEGREDO,
          [CHAVE_PORTA]: undefined,
          [CHAVE_BANCO]: urlComPortaFechada,
        },
        async () => {
          await expect(iniciar()).rejects.toThrow(/migra/i)
        },
      )

      expect(espiao).toHaveBeenCalled()
      const registrado = textoRegistrado(espiao)
      expect(registrado).not.toContain(SENHA_SENTINELA)
      expect(registrado).not.toContain(urlComPortaFechada)
    } finally {
      espiao.mockRestore()
    }
  }, 20_000)
})
