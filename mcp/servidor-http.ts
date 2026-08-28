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
import express, { type Express } from 'express'

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

/**
 * Monta o app.
 *
 * `createMcpExpressApp` com host '0.0.0.0' NAO liga a protecao contra DNS
 * rebinding automaticamente -- ela so vale para bind local. Num endereco
 * publico, quem faz esse papel e `allowedHosts`, alimentado pelo dominio do
 * Railway quando ele for conhecido.
 */
export function criarApp(segredo: string): Express {
  const hostPermitido = process.env['FINANCE_MCP_HOST_PERMITIDO']

  const app = createMcpExpressApp(
    hostPermitido === undefined || hostPermitido === ''
      ? { host: '0.0.0.0' }
      : { host: '0.0.0.0', allowedHosts: [hostPermitido] },
  )

  // Healthcheck do Railway. Sem autenticacao de proposito, e por isso nao
  // devolve nada alem de um sinal de vida.
  app.get('/', (_req, res) => {
    res.status(200).json({ vivo: true, versao: VERSAO })
  })

  // `express.json()` fica na rota, nao global: `createMcpExpressApp` ja monta
  // middlewares proprios, e empilhar um parser global por cima corre o risco
  // de consumir o corpo duas vezes.
  //
  // A autenticacao vem ANTES do transporte: nada do protocolo MCP roda para
  // quem nao passou pelo cadeado.
  app.post('/mcp', express.json(), criarMiddlewareDeAuth(segredo), async (req, res) => {
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

  return app
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
  // um processo que sobe sem segredo publica um endpoint aberto.
  const segredo = lerSegredo(process.env)
  const porta = Number(process.env['PORT'] ?? 8080)

  criarApp(segredo).listen(porta, '0.0.0.0', () => {
    // Sem segredo, sem porta de origem, sem nada alem do fato de estar no ar.
    console.log(`servidor MCP de financas no ar, versao ${VERSAO}`)
  })
}
