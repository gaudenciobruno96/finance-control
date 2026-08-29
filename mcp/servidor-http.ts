/**
 * Servidor MCP remoto, exposto por Streamable HTTP.
 *
 * Diferente de `mcp/server.ts`, que fala stdio com um cliente local, este vive
 * numa URL publica e e alcancado pela infraestrutura da Anthropic quando o
 * usuario pergunta algo pelo celular. E por isso que funciona com o computador
 * do usuario desligado, e e por isso que a autenticacao aqui nao e opcional.
 *
 * ESCOPO: este e o spike. A unica ferramenta e `ping`. As ferramentas
 * financeiras chegam no Projeto 1, sobre este mesmo transporte.
 */

import { readFileSync } from 'node:fs'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Express, NextFunction, Request, Response } from 'express'

import { criarMiddlewareDeAuth, lerSegredo } from './auth.js'

export const VERSAO: string = (
  JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string }
).version

export interface RespostaPing {
  readonly resposta: 'pong'
  readonly horaDoServidor: string
  readonly versao: string
}

/**
 * A hora entra como parametro, nao e lida aqui dentro.
 *
 * O mesmo motivo do dominio financeiro (RN-04): funcao que le o relogio nao se
 * testa sem manipular o relogio global. Quem chama decide que instante e este.
 */
export function responderPing(agora: Date, versao: string): RespostaPing {
  return {
    resposta: 'pong',
    horaDoServidor: agora.toISOString(),
    versao,
  }
}

function criarServidorMcp(): McpServer {
  const server = new McpServer({ name: 'financas-remoto', version: VERSAO })

  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description:
        'Verifica se o servidor de financas esta no ar. Devolve a hora do ' +
        'servidor, que prova que ele executou agora e nao devolveu cache.',
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(responderPing(new Date(), VERSAO), null, 2),
        },
      ],
    }),
  )

  return server
}

function statusDoErro(err: unknown): number {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status?: unknown }).status
    if (typeof status === 'number') return status
  }

  return 500
}

/**
 * Middleware de erro do Express (assinatura de 4 parametros -- e assim que o
 * Express reconhece que e um tratador de erro, nao um middleware normal).
 *
 * Existe porque `express.json()`, montado globalmente por
 * `createMcpExpressApp`, roda ANTES de `criarMiddlewareDeAuth`. Um corpo JSON
 * malformado estoura no parser antes da autenticacao ter a chance de rodar --
 * autenticado ou nao. Sem este tratador, o erro cairia no handler padrao do
 * Express, que sem `NODE_ENV=production` devolve uma pagina HTML com stack
 * trace e caminho de arquivo para quem nao tem o segredo.
 *
 * A resposta ao cliente e sempre a mesma forma fixa: nunca `err.stack`, nunca
 * `err.message` (a mensagem original do body-parser pode descrever a
 * localizacao exata do erro de sintaxe, informacao interna que nao precisa
 * sair). O status HTTP e preservado quando o erro declara um (400 para corpo
 * malformado, por exemplo) porque isso e publico e nao depende do segredo;
 * cai para 500 quando o erro nao diz nada sobre si mesmo.
 *
 * O Express 5 encaminha automaticamente promessas rejeitadas de handlers
 * assincronos para este middleware -- entao nao e so o SyntaxError do parser
 * que passa por aqui, e sim qualquer falha do handler de `/mcp`
 * (`connect`, `handleRequest`, o que vier no Projeto 1). Responder sem
 * registrar apagaria o rastro que o handler padrao do Express deixava antes
 * (`console.error(err.stack)`, ver `express/lib/application.js`), e este
 * arquivo e a fundacao de transporte de todas as ferramentas financeiras que
 * vem a seguir -- um defeito nelas precisa aparecer no log do Railway, nao
 * so sumir num JSON generico. Por isso o log ANTES de responder.
 *
 * Restricao que sobrevive a este log: NUNCA registrar `req` (nem
 * `req.headers`, que carrega o segredo, nem `req.body`, que no Projeto 1 vai
 * carregar valores financeiros) -- e, pelo mesmo motivo, NUNCA registrar o
 * objeto `err` inteiro. Parece contraintuitivo, mas o `body-parser`, ao
 * falhar o parse, chama `createError(400, err, { body: str, ... })` e o
 * `http-errors` MUTA o `SyntaxError` original no lugar, anexando `err.body`
 * com o corpo cru inteiro da requisicao. `console.error` de um `Error`
 * imprime o stack e, depois dele, todas as propriedades proprias
 * enumeraveis -- inclusive esse `body`. Por isso registramos so o `stack`
 * (string montada pelo runtime com nome, mensagem e quadros de pilha; nao
 * inclui propriedades proprias como `err.body`), nunca o `err` em si.
 *
 * Mais um canal fechado, que sobrevivia ao anterior: a MENSAGEM do erro (que
 * faz parte de `err.stack`) ainda pode citar um trecho da entrada -- o
 * SyntaxError que o V8 lanca para JSON invalido embute um excerto do texto
 * que falhou ("Unexpected token 'S', "[1,2,SENTINELA-9271]" is not valid
 * JSON"), e esse excerto e texto controlado por quem mandou a requisicao,
 * sem autenticar, e pode conter quebra de linha (forjando linhas de log). Um
 * erro de parse de corpo e reconhecivel por `err.type ===
 * 'entity.parse.failed'` (e o proprio body-parser que marca, ver
 * `body-parser/lib/read.js`) -- para esse caso especifico, registramos so o
 * NOME e o STATUS do erro, nunca `message` nem `stack`. Para qualquer outro
 * erro (que vem do nosso proprio codigo, nao de entrada de terceiros) o
 * `stack` continua sendo logado, porque e para isso que este log existe.
 */
function ehErroDeParseDeCorpo(err: unknown): err is Error & { type: string } {
  return (
    err instanceof Error &&
    'type' in err &&
    (err as { type: unknown }).type === 'entity.parse.failed'
  )
}

function tratarErroDeCorpo(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (ehErroDeParseDeCorpo(err)) {
    console.error(
      'erro nao tratado em /mcp: falha ao parsear corpo (nome=%s status=%d)',
      err.name,
      statusDoErro(err),
    )
  } else if (err instanceof Error) {
    console.error('erro nao tratado em /mcp:', err.stack)
  } else {
    console.error('erro nao tratado em /mcp:', String(err))
  }

  if (res.headersSent) {
    next(err)
    return
  }

  res.status(statusDoErro(err)).json({ erro: 'requisicao invalida' })
}

/**
 * Hostname fixo com que o Railway faz o healthcheck -- NUNCA o dominio
 * publico do servico.
 *
 * `hostHeaderValidation` (ligado por `allowedHosts` abaixo) e montado pelo
 * SDK ANTES de qualquer rota, inclusive `GET /`. Sem esta entrada, definir
 * `FINANCE_MCP_HOST_PERMITIDO` derruba o healthcheck do Railway (403 em vez
 * de 200) e o deploy e marcado como falho -- comportamento verificado contra
 * o app real. Nao remova pensando que e lixo: e o healthcheck do Railway que
 * teria que ser removido primeiro.
 */
const HOST_HEALTHCHECK_RAILWAY = 'healthcheck.railway.app'

/**
 * Monta o app.
 *
 * `createMcpExpressApp` com host '0.0.0.0' NAO liga a protecao contra DNS
 * rebinding automaticamente -- ela so vale para bind local. Num endereco
 * publico, quem faz esse papel e `allowedHosts`, alimentado pelo dominio do
 * Railway quando ele for conhecido (mais `HOST_HEALTHCHECK_RAILWAY`, sempre).
 */
export function criarApp(segredo: string): Express {
  if (segredo.trim() === '') {
    // Defesa na fronteira: `iniciar()` ja nao chega aqui sem segredo (
    // `lerSegredo` lanca antes), mas este modulo nao controla quem mais vai
    // chamar `criarApp` -- um app que aceita segredo vazio autenticaria
    // `Authorization: Bearer ` (header vazio) como valido.
    throw new Error(
      'criarApp requer um segredo nao vazio: um app sem segredo aceitaria ' +
        'qualquer requisicao como autenticada.',
    )
  }

  const hostPermitido = process.env['FINANCE_MCP_HOST_PERMITIDO']

  const app = createMcpExpressApp(
    hostPermitido === undefined || hostPermitido === ''
      ? { host: '0.0.0.0' }
      : { host: '0.0.0.0', allowedHosts: [hostPermitido, HOST_HEALTHCHECK_RAILWAY] },
  )

  // Framework fingerprinting de graca, inclusive pre-autenticacao -- sem
  // ganho nenhum em manter.
  app.disable('x-powered-by')

  // Healthcheck do Railway. Sem autenticacao de proposito, e por isso nao
  // devolve nada alem de um sinal de vida -- nem a versao, nem qualquer
  // outro dado (RN: "Nao expoe dado algum").
  app.get('/', (_req, res) => {
    res.status(200).json({ vivo: true })
  })

  // `createMcpExpressApp` ja monta `express.json()` globalmente, antes de
  // qualquer rota registrada aqui -- por isso o corpo ja chega parseado ao
  // handler, sem precisar (e sem poder, sem duplicar o parser) de outro
  // `express.json()` nesta rota.
  //
  // A autenticacao vem ANTES do transporte: nada do protocolo MCP roda para
  // quem nao passou pelo cadeado. O que ela NAO consegue ficar na frente e do
  // parser global: um corpo JSON malformado estoura no parser, antes deste
  // middleware rodar, autenticado ou nao. E por isso que existe
  // `tratarErroDeCorpo` abaixo -- ele garante que esse erro tambem sai
  // controlado, sem stack nem estrutura interna, e sem dizer se quem mandou
  // tinha o segredo certo.
  app.post('/mcp', criarMiddlewareDeAuth(segredo), async (req, res) => {
    // Modo stateless: sem sessao em memoria. O Railway reinicia e escala o
    // processo quando quer, e sessao guardada aqui se perderia no meio de uma
    // conversa. Omitir `sessionIdGenerator` (em vez de passar `undefined`
    // explicitamente) e a forma documentada pelo SDK de desligar sessao, e a
    // unica que sobrevive a `exactOptionalPropertyTypes`.
    const transporte = new StreamableHTTPServerTransport({})

    res.on('close', () => {
      void transporte.close()
    })

    // @ts-expect-error TS2379: o acessor `onclose` de StreamableHTTPServerTransport e
    // tipado `(() => void) | undefined`, enquanto `Transport.onclose` e uma
    // propriedade opcional `() => void`. So esta classe do SDK tem esse
    // descompasso -- StdioServerTransport (usado em mcp/server.ts) declara
    // `onclose?: () => void` puro e nao aciona o erro. Falso positivo de
    // `exactOptionalPropertyTypes` contra a propria tipagem do SDK.
    await criarServidorMcp().connect(transporte)
    await transporte.handleRequest(req, res, req.body)
  })

  // Precisa vir depois das rotas: o Express so identifica um middleware como
  // tratador de erro pela aridade de 4 parametros, e so o alcanca quando algo
  // antes dele -- rota ou middleware global, como o parser de corpo -- chama
  // `next(err)` ou rejeita uma promise.
  app.use(tratarErroDeCorpo)

  return app
}

const PORTA_PADRAO = 8080

/**
 * Le a porta do ambiente, ou lanca.
 *
 * `Number(valor)` para uma `PORT` malformada (vazia depois de trim nao
 * conta, string nao numerica, fracionaria, negativa ou zero) vira `NaN`, e
 * `server.listen(NaN, ...)` nao falha -- o Node escuta numa porta aleatoria
 * escolhida pelo SO. O healthcheck do Railway (que bate numa porta
 * conhecida) falha, e nada no log explica o motivo: um servidor escutando
 * numa porta desconhecida e um servidor que ninguem alcanca. Falha alto e
 * explicito no boot, do mesmo jeito que a falta do segredo.
 */
export function lerPorta(env: Record<string, string | undefined>): number {
  const bruta = env['PORT']
  if (bruta === undefined || bruta.trim() === '') return PORTA_PADRAO

  const porta = Number(bruta)
  if (!Number.isInteger(porta) || porta <= 0) {
    throw new Error(
      `PORT invalida: "${bruta}". Precisa ser um numero inteiro positivo.`,
    )
  }

  return porta
}

/**
 * Bootstrap, exportado mas nao chamado aqui.
 *
 * Quem chama e `mcp/main-http.ts`. Detectar "sou o ponto de entrada?" por
 * comparacao entre `import.meta.url` e `process.argv[1]` e fragil no Windows e
 * sob o tsx; um arquivo de entrada separado nao tem esse problema, e este
 * modulo passa a ser importavel pelos testes sem subir servidor nenhum.
 */
export function iniciar(): void {
  // lerSegredo lanca quando a variavel falta, e e exatamente o que se quer:
  // um processo que sobe sem segredo publica um endpoint aberto. lerPorta
  // lanca pelo mesmo motivo: um processo escutando numa porta que ninguem
  // sabe qual e tao inalcancavel quanto um processo fora do ar.
  const segredo = lerSegredo(process.env)
  const porta = lerPorta(process.env)

  criarApp(segredo).listen(porta, '0.0.0.0', () => {
    // Sem segredo, sem porta de origem, sem nada alem do fato de estar no ar.
    console.log(`servidor MCP de financas no ar, versao ${VERSAO}`)
  })
}
