# MCP Remoto — Spike de Viabilidade — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provar que um servidor MCP próprio, hospedado no Railway, aparece como custom connector na conta Claude do usuário e responde a uma pergunta feita do celular, recusando quem não tem o segredo.

**Architecture:** Um servidor Express expondo Streamable HTTP, protegido por um header fixo comparado em tempo constante. Uma única ferramenta, `ping`, que devolve a hora do servidor — prova de que código nosso executou naquele instante. Nasce em `mcp/`, ao lado do servidor stdio existente, e é a fundação de transporte que o Projeto 1 vai herdar.

**Tech Stack:** TypeScript, Node 20+, `@modelcontextprotocol/sdk` 1.30.0, Express 5.2.1, `tsx`, Vitest, Railway.

## Global Constraints

- **Este é um spike.** Ele prova o caminho e não entrega funcionalidade financeira. Nenhum Postgres, nenhuma ferramenta de finanças, nenhuma remoção do PWA. Se uma tarefa parecer exigir qualquer uma dessas coisas, pare e reporte.
- **Nenhum arquivo dentro de `src/` pode ser modificado.** Todo código novo vive em `mcp/`, mais `package.json` e `railway.json` na raiz.
- **O servidor não sobe sem `FINANCE_MCP_SEGREDO`.** Subir sem segredo publicaria um endpoint aberto na internet com finanças pessoais atrás. Falhar ruidosamente no boot é a única opção segura, e o log do Railway é visível.
- **Não existe modo de desenvolvimento que dispense o segredo.** Um caminho que afrouxa a autenticação é um caminho que alguém vai acabar usando em produção.
- **O header é `Authorization: Bearer <segredo>`**, com o prefixo obrigatório e verificado. Aceitar também o segredo cru criaria um segundo caminho de autenticação, não documentado em lugar nenhum.
- **Recusa responde 401 com corpo vazio.** Nenhuma mensagem distingue "header ausente" de "segredo errado" — a distinção só serve a quem está adivinhando.
- **Nenhum segredo vai para log, `stderr` ou mensagem de erro.** Nem o valor, nem parte dele, nem seu tamanho.
- **Imports internos levam a extensão `.js`**, seguindo o padrão do repositório.
- O servidor stdio existente (`mcp/server.ts`) **não é modificado**. Ele morre no Projeto 3, não aqui.
- Branch de trabalho: `mcp-remoto-spike`. Spec: `docs/superpowers/specs/2026-08-28-mcp-remoto-spike-design.md`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `mcp/auth.ts` | Leitura do segredo do ambiente e conferência do header em tempo constante |
| `mcp/auth.test.ts` | Testes da conferência e da exigência do segredo |
| `mcp/servidor-http.ts` | Express, transporte Streamable HTTP, ferramenta `ping`. Não executa nada ao ser importado |
| `mcp/main-http.ts` | Ponto de entrada. Só chama `iniciar()` — separado para que importar o servidor num teste não suba servidor |
| `mcp/servidor-http.test.ts` | Teste do `ping` e da fronteira HTTP (401 e healthcheck) |
| `railway.json` | Comando de início e healthcheck para o Railway |
| `package.json` | Script `mcp:http`, `express` explícito, `tsx` promovido a dependência |

**Fato verificado do SDK 1.30.0** (não presuma outra API): `createMcpExpressApp(options?)` vem de `@modelcontextprotocol/sdk/server/express.js` e devolve um `Express` já configurado para MCP. `StreamableHTTPServerTransport` vem de `@modelcontextprotocol/sdk/server/streamableHttp.js` e aceita `{ sessionIdGenerator }` — passar `undefined` liga o modo **stateless**, que é o que queremos: o Railway pode reiniciar ou escalar o processo a qualquer momento, e sessão em memória se perderia.

---

## Task 1: Autenticação por header

**Files:**
- Create: `mcp/auth.ts`
- Create: `mcp/auth.test.ts`
- Modify: `package.json` (dependências)

**Interfaces:**
- Consumes: nada de tarefas anteriores
- Produces:
  - `function lerSegredo(env: Record<string, string | undefined>): string` — lança `Error` quando ausente ou vazio
  - `function conferir(cabecalho: string | undefined, segredo: string): boolean`
  - `function criarMiddlewareDeAuth(segredo: string): (req: Request, res: Response, next: NextFunction) => void`

- [x] **Step 1: Declarar as dependências explicitamente**

`express` já está em `node_modules` como dependência transitiva do SDK, mas depender disso implicitamente quebra no dia em que o SDK trocar de servidor HTTP. Declare:

```bash
npm install express
npm install --save-dev @types/express
```

E promova `tsx` de `devDependencies` para `dependencies`:

```bash
npm uninstall tsx
npm install tsx
```

O Railway instala apenas dependências de produção. Com `tsx` em `devDependencies`, o comando de início não existiria na máquina de deploy.

- [x] **Step 2: Escrever o teste que falha**

Crie `mcp/auth.test.ts`:

```ts
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
    // que a mensagem e construida a partir do NOME da variavel, nunca do valor.
    try {
      lerSegredo({ FINANCE_MCP_SEGREDO: '' })
      expect.unreachable('deveria ter lancado')
    } catch (e) {
      expect(String(e)).not.toContain(SEGREDO)
    }
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
```

- [x] **Step 3: Rodar e confirmar que falha**

```bash
npm test -- mcp/auth.test.ts
```

Esperado: FAIL, módulo `./auth.js` não encontrado.

- [x] **Step 4: Implementar `mcp/auth.ts`**

```ts
/**
 * Autenticacao do servidor MCP remoto.
 *
 * Este e o unico cadeado da porta. O servidor fica numa URL publica com
 * financas pessoais atras dela, e o que separa uma coisa da outra e o header
 * conferido aqui.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

const PREFIXO = 'Bearer '
const NOME_DA_VARIAVEL = 'FINANCE_MCP_SEGREDO'

/**
 * Le o segredo do ambiente, ou lanca.
 *
 * A mensagem nomeia a variavel e nada mais: ela vai para o log do Railway, e
 * um segredo em log e um segredo vazado.
 */
export function lerSegredo(env: Record<string, string | undefined>): string {
  const valor = env[NOME_DA_VARIAVEL]

  if (valor === undefined || valor.trim() === '') {
    throw new Error(
      `${NOME_DA_VARIAVEL} nao esta definida. O servidor nao sobe sem ela: ` +
        'subir sem segredo publicaria um endpoint aberto na internet.',
    )
  }

  return valor
}

/**
 * Compara sem vazar informacao por tempo.
 *
 * `timingSafeEqual` exige buffers do mesmo tamanho e lanca quando diferem, e
 * comparar tamanhos antes vazaria o tamanho do segredo. Passar os dois por
 * SHA-256 resolve as duas coisas: o digest tem sempre 32 bytes, entao a
 * comparacao nunca lanca e nao revela nada sobre o comprimento.
 */
function iguais(a: string, b: string): boolean {
  const digest = (s: string): Buffer => createHash('sha256').update(s, 'utf8').digest()
  return timingSafeEqual(digest(a), digest(b))
}

export function conferir(cabecalho: string | undefined, segredo: string): boolean {
  if (cabecalho === undefined) return false

  // `startsWith` e comparacao de prefixo publico e conhecido -- nao ha segredo
  // nele, entao nao precisa ser em tempo constante.
  if (!cabecalho.startsWith(PREFIXO)) return false

  return iguais(cabecalho.slice(PREFIXO.length), segredo)
}

export function criarMiddlewareDeAuth(
  segredo: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    if (!conferir(req.header('authorization'), segredo)) {
      // Corpo vazio e sempre o mesmo status: nada distingue os motivos.
      res.status(401).end()
      return
    }

    next()
  }
}
```

- [x] **Step 5: Rodar e confirmar que passa**

```bash
npm test -- mcp/auth.test.ts
```

Esperado: 15 testes PASS.

- [x] **Step 6: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erros. Se `@types/express` não estiver resolvendo, confirme que ele foi instalado no Step 1.

- [x] **Step 7: Commit**

```bash
git add mcp/auth.ts mcp/auth.test.ts package.json package-lock.json
git commit -m "Autentica o MCP remoto por header fixo"
```

---

## Task 2: Servidor HTTP com a ferramenta `ping`

**Files:**
- Create: `mcp/servidor-http.ts`
- Create: `mcp/main-http.ts`
- Create: `mcp/servidor-http.test.ts`

**Interfaces:**
- Consumes: `lerSegredo`, `criarMiddlewareDeAuth` de `mcp/auth.js`
- Produces:
  - `function responderPing(agora: Date, versao: string): { readonly resposta: 'pong'; readonly horaDoServidor: string; readonly versao: string }`
  - `function criarApp(segredo: string): Express`
  - `const VERSAO: string`

- [x] **Step 1: Escrever o teste que falha**

Crie `mcp/servidor-http.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { criarApp, responderPing } from './servidor-http.js'

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
})
```

- [x] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/servidor-http.test.ts
```

Esperado: FAIL, módulo `./servidor-http.js` não encontrado.

- [x] **Step 3: Implementar `mcp/servidor-http.ts`**

```ts
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

  // Sem `express.json()` aqui: `createMcpExpressApp` ja o monta globalmente
  // (verificado no SDK), entao o corpo chega parseado. Um segundo parser seria
  // codigo morto.
  //
  // Consequencia que exige o tratamento de erro mais abaixo: o parser global
  // roda ANTES desta cadeia, entao um corpo malformado estoura no parser sem
  // passar pela autenticacao.
  //
  // A autenticacao vem antes do transporte: nada do protocolo MCP roda para
  // quem nao passou pelo cadeado.
  app.post('/mcp', criarMiddlewareDeAuth(segredo), async (req, res) => {
    // Modo stateless: sem sessao em memoria. O Railway reinicia e escala o
    // processo quando quer, e sessao guardada aqui se perderia no meio de uma
    // conversa.
    const transporte = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })

    res.on('close', () => {
      void transporte.close()
    })

    await criarServidorMcp().connect(transporte)
    await transporte.handleRequest(req, res, req.body)
  })

  // Middleware de erro, registrado DEPOIS das rotas.
  //
  // O parser global do SDK roda antes da autenticacao, entao um corpo
  // malformado de um chamador nao autenticado estoura fora deste handler --
  // um try/catch dentro dele nao alcancaria. Sem isto, o erro cai no handler
  // padrao do Express, que fora de producao devolve stack e caminho de arquivo
  // para quem nao tem o segredo.
  //
  // A resposta nao carrega stack, caminho, mensagem original, nem qualquer
  // sinal de o chamador ter se autenticado ou nao.
  app.use((_erro: unknown, _req: Request, res: Response, _proximo: NextFunction) => {
    res.status(400).json({ erro: 'requisicao invalida' })
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
```

E crie `mcp/main-http.ts`, com uma linha e nada mais:

```ts
/**
 * Ponto de entrada do servidor MCP remoto.
 *
 * Existe separado para que `servidor-http.ts` possa ser importado por teste sem
 * efeito colateral: importar um modulo nao pode subir um servidor.
 */

import { iniciar } from './servidor-http.js'

iniciar()
```

- [x] **Step 4: Rodar e confirmar que passa**

```bash
npm test -- mcp/servidor-http.test.ts
```

Esperado: 7 testes PASS.

Se o teste "passa da autenticacao com o segredo certo" falhar com erro de protocolo em vez de 401, isso é aceitável **apenas** se o status não for 401 — o teste afirma exatamente isso. Não relaxe a asserção para `toBeLessThan(500)` ou similar; se o servidor devolver 500, há um defeito de wiring a investigar.

- [x] **Step 5: Verificar que o servidor recusa subir sem segredo**

Esta é a garantia mais importante do spike e não dá para verificá-la por teste unitário — o bootstrap só roda como ponto de entrada.

```bash
npx tsx mcp/main-http.ts
```

Esperado: o processo **falha imediatamente**, com mensagem citando `FINANCE_MCP_SEGREDO`. Confirme que a mensagem não contém segredo algum.

Depois, com segredo:

```bash
FINANCE_MCP_SEGREDO=teste-local npx tsx mcp/main-http.ts
```

Esperado: imprime a linha de "no ar" e fica escutando. Encerre com Ctrl+C. Registre as duas saídas no relatório.

- [x] **Step 6: Rodar a verificação completa**

```bash
npm run lint && npm run typecheck && npx vitest run mcp
```

Esperado: sem erros; todos os testes de `mcp/` passando, incluindo os 63 que já existiam.

- [x] **Step 7: Commit**

```bash
git add mcp/servidor-http.ts mcp/servidor-http.test.ts
git commit -m "Servidor MCP remoto com a ferramenta ping"
```

---

## Task 3: Deploy no Railway e conexão ao Claude

**Files:**
- Create: `railway.json`
- Create: `mcp/README-remoto.md`
- Modify: `package.json` (script `mcp:http`)

**Interfaces:**
- Consumes: tudo das Tasks 1 e 2
- Produces: um serviço no Railway numa URL HTTPS estável

Esta tarefa não tem teste automatizado: o que ela entrega é infraestrutura, e a verificação é a resposta chegar no celular.

- [x] **Step 1: Acrescentar o script de início**

Em `package.json`, junto dos outros scripts:

```json
"mcp:http": "tsx mcp/main-http.ts"
```

- [x] **Step 2: Criar `railway.json`**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "echo 'sem build: mcp:http roda via tsx, direto do TypeScript'"
  },
  "deploy": {
    "startCommand": "npm run mcp:http",
    "healthcheckPath": "/",
    "healthcheckTimeout": 120,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

`restartPolicyMaxRetries: 3` importa: sem segredo o processo falha no boot, e reinício infinito transformaria um erro de configuração numa conta de consumo.

`buildCommand` explícito importa por outro motivo: sem ele o Nixpacks encontra o script `build` do repositório e roda `tsc --noEmit && vite build` sobre o PWA inteiro — que este servidor nunca carrega e que o Projeto 3 apaga. Um erro de tipo no frontend derrubaria o deploy de um servidor que não usa frontend. O servidor roda por `tsx`, direto do TypeScript, e não precisa de build próprio.

`healthcheckTimeout: 120` em vez do 30 original: partida fria do Nixpacks é lenta, e 30 segundos reprovava um servidor que teria subido.

- [x] **Step 3: Gerar o segredo**

Gere um segredo forte e aleatório. **Não invente um à mão** e não reuse senha de lugar nenhum:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Guarde o valor — ele vai em dois lugares: nas variáveis do Railway e na configuração do connector no Claude. **Não o coloque em nenhum arquivo do repositório.**

- [x] **Step 4: Criar o serviço no Railway**

Pelo painel do Railway ou pela CLI, num dos projetos existentes ou num novo:

1. Crie um serviço apontando para este repositório e a branch `mcp-remoto-spike`.
2. Defina a variável `FINANCE_MCP_SEGREDO` com o valor do Step 3.
3. Gere um domínio público para o serviço.
4. Defina `FINANCE_MCP_HOST_PERMITIDO` com o hostname do domínio gerado, sem `https://` e sem barra final. É seguro definir: o código inclui `healthcheck.railway.app` automaticamente ao lado do domínio configurado, então esta variável não derruba o healthcheck do próprio Railway.

- [x] **Step 5: Confirmar que o serviço está no ar**

```bash
curl -i https://SEU-DOMINIO.up.railway.app/
```

Esperado: `200` e um corpo exatamente `{"vivo":true}`.

O healthcheck não devolve a versão de propósito: ele responde antes da autenticação, e a spec exige que não exponha dado algum. Se aparecer um campo a mais, algo divergiu do desenho.

E confirme que o cadeado funciona de fora:

```bash
curl -i -X POST https://SEU-DOMINIO.up.railway.app/mcp
```

Esperado: `401` com corpo vazio.

**Se o segundo comando devolver qualquer coisa diferente de 401, pare.** Um endpoint MCP aberto na internet com finanças atrás dele é o único desfecho inaceitável deste spike.

- [x] **Step 6: Conectar ao Claude**

No claude.ai, em Configurações → Connectors → Add custom connector:

- URL: `https://SEU-DOMINIO.up.railway.app/mcp`
- Autenticação: header fixo, `Authorization` com valor `Bearer <o segredo do Step 3>`

- [x] **Step 7: O critério de sucesso**

**Do celular, com o computador desligado**, peça ao Claude um ping.

Esperado: ele responde com `pong`, a hora do servidor e a versão. Confira que a hora bate com o instante da pergunta — é isso que prova que o servidor executou naquele momento.

Um teste verde não é o critério. A resposta chegar no celular é.

- [x] **Step 8: Escrever `mcp/README-remoto.md`**

```markdown
# Servidor MCP remoto

Servidor MCP hospedado, alcançado pela infraestrutura da Anthropic quando você
pergunta algo ao Claude — inclusive do celular, com seu computador desligado.

Estado atual: **spike**. A única ferramenta é `ping`. As ferramentas financeiras
chegam no Projeto 1.

Desenho: `docs/superpowers/specs/2026-08-28-mcp-remoto-spike-design.md`

## Variáveis de ambiente

| Variável | Conteúdo | Obrigatória |
|---|---|---|
| `FINANCE_MCP_SEGREDO` | Segredo do header `Authorization: Bearer <segredo>` | Sim — sem ela o processo não sobe |
| `FINANCE_MCP_HOST_PERMITIDO` | Hostname público do serviço, sem protocolo | Não, mas recomendada |
| `PORT` | Porta de escuta. O Railway define sozinho | Não (padrão 8080) |

**O servidor recusa subir sem `FINANCE_MCP_SEGREDO`**, de propósito: subir sem
segredo publicaria um endpoint aberto na internet com finanças pessoais atrás.
Não existe modo de desenvolvimento que dispense essa verificação.

## Endpoints

| Rota | Autenticação | Para quê |
|---|---|---|
| `GET /` | Nenhuma | Healthcheck do Railway. Devolve apenas um sinal de vida |
| `POST /mcp` | `Authorization: Bearer <segredo>` | O protocolo MCP |

Requisição sem o segredo recebe `401` com corpo vazio. Nada na resposta
distingue "header ausente" de "segredo errado".

## Rodar localmente

```bash
FINANCE_MCP_SEGREDO=qualquer-coisa npm run mcp:http
```

## Trocar o segredo

Gere um novo, atualize a variável no Railway, e atualize o connector no Claude.
Os dois precisam mudar juntos — enquanto divergirem, o connector recebe 401.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```
```

- [x] **Step 9: Commit**

```bash
git add railway.json mcp/README-remoto.md package.json
git commit -m "Publica o servidor MCP remoto no Railway"
```

---

## Verificação final

- [x] `npm run lint`, `npm run typecheck` e `npx vitest run mcp` passam
- [x] Nenhum arquivo em `src/` modificado: `git diff main --stat -- src/` (esperado: vazio)
- [x] `mcp/server.ts`, o servidor stdio, não foi tocado
- [x] O segredo não aparece em nenhum arquivo do repositório: `git grep -i "FINANCE_MCP_SEGREDO=" -- ':!docs' ':!*.md'` não retorna valor algum
- [x] `POST /mcp` sem header devolve 401 no domínio público
- [x] O ping responde no celular, com o computador desligado
