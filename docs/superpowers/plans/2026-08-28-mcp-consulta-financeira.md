# MCP de Consulta Financeira — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um servidor MCP somente-leitura que dá a um assistente de IA acesso ao orçamento pessoal, reusando `src/domain/` e `src/services/` sem duplicar nenhuma regra de cálculo.

**Architecture:** O servidor baixa o `DocumentoBackup` JSON do repositório privado do GitHub, escreve-o num banco Dexie volátil sobre `fake-indexeddb`, e monta os mesmos repositórios e serviços que o PWA usa. Quatro ferramentas leem desse app em memória. Nada é escrito de volta ao GitHub e nenhum arquivo de `src/` é modificado.

**Tech Stack:** TypeScript, Node 20+, `@modelcontextprotocol/sdk`, `zod`, `dexie`, `fake-indexeddb`, `tsx` (execução sem build), Vitest.

## Global Constraints

- **Nenhum arquivo dentro de `src/` pode ser modificado.** Todo código novo vive em `mcp/`. Se alguma tarefa parecer exigir mudança em `src/`, pare e reporte — é sinal de que o desenho está errado.
- **Dinheiro é sempre inteiro em centavos.** Ponto flutuante é proibido em valor monetário (RN-01). Nunca faça `valor / 100` fora de `formatarBRL`.
- **Datas são texto `AAAA-MM-DD`; competências são texto `AAAA-MM`.** Nunca use `new Date('2026-08-10')` — no fuso do Brasil isso resulta em 9 de agosto às 21h.
- **A data corrente nunca é lida do relógio dentro de uma função de lógica.** `hoje: DataISO` entra como parâmetro em toda ferramenta. Só `mcp/server.ts` tem permissão de consultar o relógio, e apenas para preencher o default.
- **Imports internos levam a extensão `.js`** (`from '../src/domain/money.js'`), seguindo o padrão do repositório.
- **Nenhum valor monetário vai para `stderr` ou log.** Mensagem de erro nomeia a operação que falhou, nunca o dado.
- **Nunca assere texto de moeda com espaço ASCII literal.** `Intl.NumberFormat` em pt-BR separa o símbolo do número com espaço estreito sem quebra (U+202F), e a escolha varia com a versão do ICU. Use `toMatch(/^R\$\s?1\.234,56$/u)` — `\s` em JavaScript casa os dois. É o que `src/domain/money.test.ts` já faz.
- **O servidor não tem função que faça `PUT` ou `POST` no GitHub.** Somente-leitura é estrutural, não uma promessa.
- Branch de trabalho: `mcp-consulta-financeira`. Spec de referência: `docs/superpowers/specs/2026-08-28-mcp-consulta-financeira-design.md`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `mcp/tsconfig.json` | Compilação separada, com tipos de Node |
| `mcp/app-em-memoria.ts` | `DocumentoBackup` → banco Dexie volátil → repositórios e serviços |
| `mcp/formatacao.ts` | Centavos → `{ valorCentavos, valor }`; ocorrência → objeto plano |
| `mcp/configuracao.ts` | Leitura e validação das variáveis de ambiente |
| `mcp/fonte-github.ts` | Download do backup pela API do GitHub, cache por SHA |
| `mcp/tools/situacao-do-mes.ts` | Ferramenta 1 |
| `mcp/tools/o-que-vence.ts` | Ferramenta 2 |
| `mcp/tools/historico-de-gastos.ts` | Ferramenta 3 (única com lógica de agregação nova) |
| `mcp/tools/simular-cenario.ts` | Ferramenta 4 |
| `mcp/server.ts` | Registro das ferramentas e transporte stdio |
| `mcp/fixtures/*.ts` | Documentos de backup para os testes |

**Decisão de execução:** o servidor roda via `tsx`, sem passo de build. O repositório é inteiramente TypeScript e um build separado só para quatro ferramentas de uso pessoal seria cerimônia sem contrapartida.

---

## Task 1: Fundação — app em memória a partir do backup

**Files:**
- Create: `mcp/tsconfig.json`
- Create: `mcp/app-em-memoria.ts`
- Create: `mcp/fixtures/orcamento-simples.ts`
- Create: `mcp/app-em-memoria.test.ts`
- Modify: `package.json` (dependências e scripts)
- Modify: `vitest.config.ts` (incluir `mcp/`)
- Modify: `eslint.config.js` (fronteira `src/` ↛ `mcp/`)

**Interfaces:**
- Consumes: `criarBanco`, `BancoFinanceiro`, `VERSAO_SCHEMA` de `src/data/db.js`; `criarRepositorios`, `Repositorios` de `src/data/repositories.js`; `escrever`, `migrarDocumento`, `DocumentoBackup` de `src/data/backup-serializer.js`; `criarProjectionService`, `ProjectionService` de `src/services/projection-service.js`
- Produces:
  - `interface AppEmMemoria { readonly db: BancoFinanceiro; readonly repos: Repositorios; readonly projecao: ProjectionService; readonly encerrar: () => Promise<void> }`
  - `async function criarAppDoBackup(doc: DocumentoBackup): Promise<AppEmMemoria>`
  - `const ORCAMENTO_SIMPLES: DocumentoBackup` e `const ORCAMENTO_SEM_ANCORA: DocumentoBackup` em `mcp/fixtures/orcamento-simples.ts`

- [ ] **Step 1: Instalar as dependências novas**

```bash
npm install @modelcontextprotocol/sdk zod
npm install --save-dev tsx @types/node
```

`dexie` já é dependência de execução. `fake-indexeddb` precisa sair de `devDependencies` para `dependencies`, porque o servidor MCP o usa em produção:

```bash
npm uninstall fake-indexeddb
npm install fake-indexeddb
```

- [ ] **Step 2: Criar `mcp/tsconfig.json`**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["node"],
    "noEmit": true
  },
  "include": ["../mcp", "../src"]
}
```

- [ ] **Step 3: Ligar `mcp/` ao ferramental**

Em `package.json`, substituir o script `typecheck` e acrescentar `mcp`:

```json
"typecheck": "tsc --noEmit && tsc -p mcp/tsconfig.json",
"mcp": "tsx mcp/server.ts"
```

Em `vitest.config.ts`, trocar a linha `include`:

```ts
include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'mcp/**/*.test.ts'],
```

Em `eslint.config.js`, acrescentar a mensagem junto das outras, no topo:

```js
const MSG_MCP =
  'Nenhuma camada de src/ pode importar de mcp/. A dependencia e de mao ' +
  'unica: o servidor MCP consome o app, o app nunca consome o servidor.'
```

E acrescentar o grupo `mcp` **dentro** de cada um dos três blocos `no-restricted-imports` existentes (`src/domain/**`, `src/data/**`, `src/services/**`), como mais uma entrada no array `patterns`:

```js
{
  group: ['**/mcp', '**/mcp/**'],
  message: MSG_MCP,
},
```

E acrescentar um bloco novo ao final do array de configuração, antes do fechamento, porque `src/ui/` ainda não tem um:

```js
{
  files: ['src/ui/**/*.ts', 'src/ui/**/*.tsx'],
  rules: {
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/mcp', '**/mcp/**'],
            message: MSG_MCP,
          },
        ],
      },
    ],
  },
},
```

**Atenção:** o grupo `mcp` precisa ser acrescentado *dentro* dos blocos existentes, não num bloco novo que também case com `src/domain/**`. Dois blocos configurando a mesma regra para o mesmo arquivo fazem o último vencer, e a fronteira de camadas seria silenciosamente desligada.

- [ ] **Step 4: Criar o fixture**

Crie `mcp/fixtures/orcamento-simples.ts`:

```ts
/**
 * Orcamento minimo para os testes das ferramentas.
 *
 * Salario de 5.000,00 no dia 5, aluguel de 1.800,00 no dia 10, luz estimada em
 * 220,00 no dia 15 (ja paga, por 245,90), e ancora de saldo de 1.200,00 em
 * 1o de marco.
 */

import { VERSAO_SCHEMA } from '../../src/data/db.js'
import type { DocumentoBackup } from '../../src/data/backup-serializer.js'

export const ORCAMENTO_SIMPLES: DocumentoBackup = {
  versaoSchema: VERSAO_SCHEMA,
  exportadoEm: '2026-03-20',
  regras: [
    {
      id: 'r-salario',
      tipo: 'entrada',
      nome: 'Salario',
      valorCentavos: 500000,
      valorEhEstimativa: false,
      diaDoMes: 5,
      ajusteFimDeSemana: 'antecipa',
      vigenteDe: '2026-01',
      vigenteAte: null,
    },
    {
      id: 'r-aluguel',
      tipo: 'saida',
      nome: 'Aluguel',
      valorCentavos: 180000,
      valorEhEstimativa: false,
      diaDoMes: 10,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-01',
      vigenteAte: null,
    },
    {
      id: 'r-luz',
      tipo: 'saida',
      nome: 'Luz',
      valorCentavos: 22000,
      valorEhEstimativa: true,
      diaDoMes: 15,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-01',
      vigenteAte: null,
    },
  ],
  parcelamentos: [],
  ocorrencias: [
    {
      id: 'o-luz-marco',
      geradorTipo: 'regra',
      geradorId: 'r-luz',
      competencia: '2026-03',
      tipo: 'saida',
      nome: 'Luz',
      valorPrevistoCentavos: 22000,
      dataVencimento: '2026-03-15',
      dataPagamento: '2026-03-14',
      valorPagoCentavos: 24590,
      ignorado: false,
      observacao: null,
    },
  ],
  ancoras: [{ id: 'a-1', data: '2026-03-01', saldoCentavos: 120000 }],
  configuracoes: [],
}

/** Mesmo orcamento, sem ancora: exercita o caminho de saldo relativo (RN-30). */
export const ORCAMENTO_SEM_ANCORA: DocumentoBackup = {
  ...ORCAMENTO_SIMPLES,
  ancoras: [],
}
```

- [ ] **Step 5: Escrever o teste que falha**

Crie `mcp/app-em-memoria.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { criarAppDoBackup } from './app-em-memoria.js'
import { ORCAMENTO_SIMPLES } from './fixtures/orcamento-simples.js'

describe('criarAppDoBackup', () => {
  it('carrega as regras do documento no banco', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const regras = await app.repos.regras.listar()
    expect(regras.map((r) => r.nome).sort()).toEqual(['Aluguel', 'Luz', 'Salario'])

    await app.encerrar()
  })

  it('monta o servico de projecao sobre os dados carregados', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const mes = await app.projecao.projetarMes('2026-03', '2026-03-20')

    // Aluguel do dia 10 ja passou e nao foi pago: continua devido.
    expect(mes.faltaPagar.map((o) => o.nome)).toContain('Aluguel')
    // A luz foi paga por 245,90 -- o valor pago prevalece sobre o previsto.
    expect(mes.totalJaResolvidoCentavos).toBe(24590)
    expect(mes.saldoRelativo).toBe(false)

    await app.encerrar()
  })

  it('isola bancos entre chamadas', async () => {
    const a = await criarAppDoBackup(ORCAMENTO_SIMPLES)
    const b = await criarAppDoBackup({
      ...ORCAMENTO_SIMPLES,
      regras: [],
      ocorrencias: [],
    })

    expect(await a.repos.regras.listar()).toHaveLength(3)
    expect(await b.repos.regras.listar()).toHaveLength(0)

    await a.encerrar()
    await b.encerrar()
  })

  it('migra documento de schema anterior', async () => {
    // Versao 1 trazia cartaoId no parcelamento. migrarDocumento remove.
    const antigo = {
      ...ORCAMENTO_SIMPLES,
      versaoSchema: 1,
      parcelamentos: [
        {
          id: 'p-1',
          nome: 'Geladeira',
          valorParcelaCentavos: 30000,
          quantidadeParcelas: 10,
          primeiroVencimento: '2026-03-20',
          cartaoId: 'c-1',
        },
      ],
    } as unknown as typeof ORCAMENTO_SIMPLES

    const app = await criarAppDoBackup(antigo)

    const [p] = await app.repos.parcelamentos.listar()
    expect(p).toBeDefined()
    expect(p).not.toHaveProperty('cartaoId')

    await app.encerrar()
  })
})
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

```bash
npm test -- mcp/app-em-memoria.test.ts
```

Esperado: FAIL, com erro de módulo não encontrado (`./app-em-memoria.js`).

- [ ] **Step 7: Implementar `mcp/app-em-memoria.ts`**

```ts
/**
 * Monta a aplicacao inteira em memoria a partir de um documento de backup.
 *
 * O banco vive apenas enquanto o processo vive. E isso que torna o servidor
 * MCP somente-leitura por construcao, e nao por disciplina: nao existe
 * caminho de codigo daqui de volta para os dados reais.
 *
 * Espelha `src/test-support/app-harness.ts`, com a diferenca de comecar
 * populado em vez de vazio.
 */

import 'fake-indexeddb/auto'

import { criarBanco, type BancoFinanceiro } from '../src/data/db.js'
import { criarRepositorios, type Repositorios } from '../src/data/repositories.js'
import {
  escrever,
  migrarDocumento,
  type DocumentoBackup,
} from '../src/data/backup-serializer.js'
import {
  criarProjectionService,
  type ProjectionService,
} from '../src/services/projection-service.js'

export interface AppEmMemoria {
  readonly db: BancoFinanceiro
  readonly repos: Repositorios
  readonly projecao: ProjectionService
  readonly encerrar: () => Promise<void>
}

/**
 * Nome unico por instancia.
 *
 * Dois bancos de mesmo nome compartilham estado mesmo em memoria, e uma
 * simulacao vazaria para a consulta seguinte -- o defeito exato que a
 * ferramenta de cenario existe para nao ter.
 */
function nomeUnico(): string {
  return `mcp-${crypto.randomUUID()}`
}

export async function criarAppDoBackup(
  doc: DocumentoBackup,
): Promise<AppEmMemoria> {
  const db = criarBanco(nomeUnico())
  await db.open()

  // migrarDocumento antes de escrever: um backup de schema anterior traz
  // campos que o validador de escrita rejeita.
  await escrever(db, migrarDocumento(doc))

  const repos = criarRepositorios(db)

  return {
    db,
    repos,
    projecao: criarProjectionService(repos),
    // close() sozinho apenas derruba a conexao: o fake-indexeddb guarda o
    // banco no registro global pelo resto do processo. Como simular_cenario
    // cria dois apps por chamada, faltar o delete() vazaria dois bancos por
    // simulacao. Mesmo par que `src/test-support/app-harness.ts` usa.
    encerrar: async () => {
      db.close()
      await db.delete()
    },
  }
}
```

- [ ] **Step 8: Rodar os testes e confirmar que passam**

```bash
npm test -- mcp/app-em-memoria.test.ts
```

Esperado: 4 testes PASS.

- [ ] **Step 9: Confirmar que a fronteira de lint ficou de pé**

```bash
npm run lint
```

Esperado: sem erros. Agora prove que a regra nova funciona — acrescente temporariamente ao topo de `src/domain/money.ts`:

```ts
import { criarAppDoBackup } from '../../mcp/app-em-memoria.js'
```

Rode `npm run lint` de novo. Esperado: FAIL com a mensagem `MSG_MCP`. **Remova a linha** e confirme que volta a passar. Uma regra de fronteira nunca verificada é uma regra que não existe.

- [ ] **Step 10: Rodar a verificação completa**

```bash
npm run verify
```

Esperado: lint, typecheck, os 309 testes existentes e os 4 novos, todos passando.

- [ ] **Step 11: Commit**

```bash
git add mcp/ package.json package-lock.json vitest.config.ts eslint.config.js
git commit -m "Monta o app em memoria a partir do backup"
```

---

## Task 2: Formatação de saída

**Files:**
- Create: `mcp/formatacao.ts`
- Create: `mcp/formatacao.test.ts`

**Interfaces:**
- Consumes: `formatarBRL` de `src/domain/money.js`; `OcorrenciaResolvida`, `Centavos`, `PontoCurva` de `src/domain/types.js`
- Produces:
  - `interface Dinheiro { readonly valorCentavos: number; readonly valor: string }`
  - `function dinheiro(centavos: Centavos): Dinheiro`
  - `interface ItemFormatado { readonly nome: string; readonly tipo: 'entrada' | 'saida'; readonly situacao: string; readonly dataVencimento: string; readonly dataPagamento: string | null; readonly competencia: string; readonly numeroParcela: number | null; readonly valorCentavos: number; readonly valor: string }`
  - `function item(o: OcorrenciaResolvida): ItemFormatado`
  - `function ponto(p: PontoCurva): { readonly data: string; readonly saldoCentavos: number; readonly saldo: string }`

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/formatacao.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dinheiro, item, ponto } from './formatacao.js'
import type { OcorrenciaResolvida } from '../src/domain/types.js'

describe('dinheiro', () => {
  it('devolve os centavos intactos junto do texto', () => {
    // `Intl.NumberFormat` em pt-BR separa simbolo e numero com espaco
    // ESTREITO sem quebra (U+202F), nao com espaco ASCII. `\s` em JavaScript
    // casa os dois, e por isso `src/domain/money.test.ts` ja assere assim.
    expect(dinheiro(123456).valorCentavos).toBe(123456)
    expect(dinheiro(123456).valor).toMatch(/^R\$\s?1\.234,56$/u)
  })

  it('formata zero', () => {
    expect(dinheiro(0).valor).toMatch(/^R\$\s?0,00$/u)
  })

  it('formata negativo', () => {
    expect(dinheiro(-5000).valorCentavos).toBe(-5000)
    expect(dinheiro(-5000).valor).toContain('50,00')
  })
})

describe('item', () => {
  const base: OcorrenciaResolvida = {
    chave: 'regra|r-luz|2026-03',
    origem: 'real',
    idReal: 'o-luz-marco',
    situacao: 'pago',
    numeroParcela: null,
    geradorTipo: 'regra',
    geradorId: 'r-luz',
    competencia: '2026-03',
    tipo: 'saida',
    nome: 'Luz',
    valorPrevistoCentavos: 22000,
    dataVencimento: '2026-03-15',
    dataPagamento: '2026-03-14',
    valorPagoCentavos: 24590,
    ignorado: false,
    observacao: null,
  }

  it('usa o valor pago quando existe', () => {
    expect(item(base).valorCentavos).toBe(24590)
    expect(item(base).valor).toMatch(/^R\$\s?245,90$/u)
  })

  it('cai para o previsto quando nao ha pagamento', () => {
    const previsto = { ...base, situacao: 'previsto' as const, dataPagamento: null, valorPagoCentavos: null }
    expect(item(previsto).valorCentavos).toBe(22000)
    expect(item(previsto).dataPagamento).toBeNull()
  })

  it('nao vaza campos internos de resolucao', () => {
    expect(item(base)).not.toHaveProperty('chave')
    expect(item(base)).not.toHaveProperty('idReal')
  })
})

describe('ponto', () => {
  it('formata um ponto da curva', () => {
    expect(ponto({ data: '2026-03-10', saldoCentavos: -4300 })).toEqual({
      data: '2026-03-10',
      saldoCentavos: -4300,
      saldo: expect.stringContaining('43,00'),
    })
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/formatacao.test.ts
```

Esperado: FAIL, módulo `./formatacao.js` não encontrado.

- [ ] **Step 3: Implementar `mcp/formatacao.ts`**

```ts
/**
 * Traducao das estruturas do dominio para o que o assistente le.
 *
 * Todo valor sai em dois campos: os centavos inteiros, para o assistente
 * calcular, e o texto em BRL, para ele escrever. Devolver so o inteiro
 * convidava a ler `34000` como trinta e quatro mil reais; devolver so o texto
 * impedia qualquer conta.
 *
 * A formatacao em si vem de `formatarBRL`, ja coberta pelos testes do
 * dominio. Aqui so se monta o envelope.
 */

import { formatarBRL } from '../src/domain/money.js'
import type {
  Centavos,
  OcorrenciaResolvida,
  PontoCurva,
} from '../src/domain/types.js'

export interface Dinheiro {
  readonly valorCentavos: number
  readonly valor: string
}

export function dinheiro(centavos: Centavos): Dinheiro {
  return { valorCentavos: centavos, valor: formatarBRL(centavos) }
}

export interface ItemFormatado {
  readonly nome: string
  readonly tipo: 'entrada' | 'saida'
  readonly situacao: string
  readonly dataVencimento: string
  readonly dataPagamento: string | null
  readonly competencia: string
  readonly numeroParcela: number | null
  readonly valorCentavos: number
  readonly valor: string
}

/**
 * Valor efetivo: o pago prevalece sobre o previsto (RN-31). Mesma escolha do
 * projetor de curva -- se divergissem, a lista nao explicaria o total.
 */
function valorEfetivo(o: OcorrenciaResolvida): Centavos {
  return o.valorPagoCentavos ?? o.valorPrevistoCentavos
}

export function item(o: OcorrenciaResolvida): ItemFormatado {
  return {
    nome: o.nome,
    tipo: o.tipo,
    situacao: o.situacao,
    dataVencimento: o.dataVencimento,
    dataPagamento: o.dataPagamento,
    competencia: o.competencia,
    numeroParcela: o.numeroParcela,
    ...dinheiro(valorEfetivo(o)),
  }
}

export function ponto(p: PontoCurva): {
  readonly data: string
  readonly saldoCentavos: number
  readonly saldo: string
} {
  return {
    data: p.data,
    saldoCentavos: p.saldoCentavos,
    saldo: formatarBRL(p.saldoCentavos),
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npm test -- mcp/formatacao.test.ts
```

Esperado: 7 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/formatacao.ts mcp/formatacao.test.ts
git commit -m "Formata valores em centavos e texto para o assistente"
```

---

## Task 3: Configuração e fonte de dados no GitHub

**Files:**
- Create: `mcp/configuracao.ts`
- Create: `mcp/fonte-github.ts`
- Create: `mcp/fonte-github.test.ts`

**Interfaces:**
- Consumes: `DocumentoBackup` de `src/data/backup-serializer.js`
- Produces:
  - `interface Configuracao { readonly token: string; readonly repositorio: string; readonly caminho: string }`
  - `function lerConfiguracao(env: Record<string, string | undefined>): Configuracao` — lança `Error` com mensagem explícita quando falta variável. Assinatura larga de propósito: `process.env` satisfaz esse tipo, e os testes podem passar um objeto literal sem montar um `ProcessEnv` inteiro
  - `interface FonteBackup { readonly obter: () => Promise<DocumentoBackup>; readonly obterSemCache: () => Promise<DocumentoBackup> }`
  - `function criarFonteGitHub(cfg: Configuracao, buscar?: typeof fetch): FonteBackup`

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/fonte-github.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { lerConfiguracao } from './configuracao.js'
import { criarFonteGitHub } from './fonte-github.js'
import { ORCAMENTO_SIMPLES } from './fixtures/orcamento-simples.js'

const CFG = {
  token: 'tok',
  repositorio: 'eu/backup',
  caminho: 'financas/backup.json',
}

/** Resposta da API de conteudos do GitHub: base64 de UTF-8, mais o sha. */
function respostaGitHub(doc: unknown, sha: string): Response {
  const conteudo = Buffer.from(JSON.stringify(doc), 'utf-8').toString('base64')
  return new Response(JSON.stringify({ content: conteudo, sha, encoding: 'base64' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('lerConfiguracao', () => {
  it('le as tres variaveis', () => {
    expect(
      lerConfiguracao({
        FINANCE_GITHUB_TOKEN: 'tok',
        FINANCE_GITHUB_REPO: 'eu/backup',
        FINANCE_BACKUP_PATH: 'financas/backup.json',
      }),
    ).toEqual(CFG)
  })

  it('nomeia a variavel que falta', () => {
    expect(() =>
      lerConfiguracao({ FINANCE_GITHUB_REPO: 'eu/backup' }),
    ).toThrow(/FINANCE_GITHUB_TOKEN/)
  })

  it('nao repete o token na mensagem de erro', () => {
    try {
      lerConfiguracao({ FINANCE_GITHUB_TOKEN: 'segredo-real' })
      expect.unreachable('deveria ter lancado')
    } catch (e) {
      expect(String(e)).not.toContain('segredo-real')
    }
  })
})

describe('criarFonteGitHub', () => {
  it('baixa e desserializa o documento', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaGitHub(ORCAMENTO_SIMPLES, 'sha1'))
    const fonte = criarFonteGitHub(CFG, buscar as unknown as typeof fetch)

    const doc = await fonte.obter()

    expect(doc.regras).toHaveLength(3)
    expect(buscar).toHaveBeenCalledOnce()
  })

  it('codifica cada segmento do caminho sem escapar as barras', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaGitHub(ORCAMENTO_SIMPLES, 'sha1'))
    const fonte = criarFonteGitHub(
      { ...CFG, caminho: 'minhas financas/backup.json' },
      buscar as unknown as typeof fetch,
    )

    await fonte.obter()

    const url = String(buscar.mock.calls[0]?.[0])
    expect(url).toContain('/repos/eu/backup/contents/minhas%20financas/backup.json')
  })

  it('nunca usa metodo de escrita', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaGitHub(ORCAMENTO_SIMPLES, 'sha1'))
    const fonte = criarFonteGitHub(CFG, buscar as unknown as typeof fetch)

    await fonte.obter()

    const init = buscar.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.method ?? 'GET').toBe('GET')
  })

  it('reaproveita o documento quando o sha nao mudou', async () => {
    // mockImplementation, nao mockResolvedValue: o corpo de uma Response so
    // pode ser lido UMA vez, entao reusar a mesma instancia entre chamadas
    // falha com "body already read". Cada chamada precisa de uma Response nova.
    const buscar = vi.fn().mockImplementation(() => respostaGitHub(ORCAMENTO_SIMPLES, 'sha1'))
    const fonte = criarFonteGitHub(CFG, buscar as unknown as typeof fetch)

    const a = await fonte.obter()
    const b = await fonte.obter()

    expect(b).toBe(a)
    expect(buscar).toHaveBeenCalledTimes(2)
  })

  it('nao decodifica de novo quando o sha se repete', async () => {
    // Prova por comportamento, sem espionar JSON.parse: a segunda resposta traz
    // o MESMO sha com conteudo impossivel de desserializar. Se o decode for
    // pulado, nada lanca; se nao for, o JSON.parse estoura.
    const buscar = vi
      .fn()
      .mockImplementationOnce(() => respostaGitHub(ORCAMENTO_SIMPLES, 'sha1'))
      .mockImplementationOnce(
        () =>
          new Response(
            JSON.stringify({ content: 'ISSO-NAO-E-JSON', sha: 'sha1', encoding: 'base64' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      )
    const fonte = criarFonteGitHub(CFG, buscar as unknown as typeof fetch)

    const a = await fonte.obter()
    const b = await fonte.obter()

    expect(b).toBe(a)
    expect(b.regras).toHaveLength(3)
  })

  it('devolve documento novo quando o sha muda', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(respostaGitHub(ORCAMENTO_SIMPLES, 'sha1'))
      .mockResolvedValueOnce(
        respostaGitHub({ ...ORCAMENTO_SIMPLES, regras: [] }, 'sha2'),
      )
    const fonte = criarFonteGitHub(CFG, buscar as unknown as typeof fetch)

    const a = await fonte.obter()
    const b = await fonte.obter()

    expect(a.regras).toHaveLength(3)
    expect(b.regras).toHaveLength(0)
  })

  it('ignora o cache em obterSemCache', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaGitHub(ORCAMENTO_SIMPLES, 'sha1'))
    const fonte = criarFonteGitHub(CFG, buscar as unknown as typeof fetch)

    const a = await fonte.obter()
    const b = await fonte.obterSemCache()

    expect(b).not.toBe(a)
    expect(b.regras).toHaveLength(3)
  })

  it('explica o 404 sem citar o token', async () => {
    const buscar = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    const fonte = criarFonteGitHub(CFG, buscar as unknown as typeof fetch)

    await expect(fonte.obter()).rejects.toThrow(/404/)
    await expect(fonte.obter()).rejects.not.toThrow(/tok/)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/fonte-github.test.ts
```

Esperado: FAIL, módulos `./configuracao.js` e `./fonte-github.js` não encontrados.

- [ ] **Step 3: Implementar `mcp/configuracao.ts`**

```ts
/**
 * Configuracao por variavel de ambiente.
 *
 * Segredo nunca em arquivo versionado: o token de leitura do backup e o unico
 * segredo do servidor, e ele entra pelo ambiente.
 */

export interface Configuracao {
  readonly token: string
  readonly repositorio: string
  readonly caminho: string
}

const NOMES = {
  token: 'FINANCE_GITHUB_TOKEN',
  repositorio: 'FINANCE_GITHUB_REPO',
  caminho: 'FINANCE_BACKUP_PATH',
} as const

/**
 * A mensagem nomeia a variavel ausente e nada mais.
 *
 * Nunca ecoa o valor de nenhuma delas: a mensagem vai para o log do cliente
 * MCP, e um token no log e um token vazado.
 */
export function lerConfiguracao(env: Record<string, string | undefined>): Configuracao {
  const faltando = (Object.keys(NOMES) as (keyof typeof NOMES)[])
    .filter((k) => {
      const v = env[NOMES[k]]
      return v === undefined || v.trim() === ''
    })
    .map((k) => NOMES[k])

  if (faltando.length > 0) {
    throw new Error(
      `Configuracao incompleta do MCP financeiro. Faltam: ${faltando.join(', ')}. ` +
        'Defina essas variaveis no registro do servidor MCP.',
    )
  }

  return {
    token: env[NOMES.token] as string,
    repositorio: env[NOMES.repositorio] as string,
    caminho: env[NOMES.caminho] as string,
  }
}
```

- [ ] **Step 4: Implementar `mcp/fonte-github.ts`**

```ts
/**
 * Leitura do backup no repositorio privado do GitHub.
 *
 * Este modulo nao possui funcao que escreva. A ausencia e a garantia: nao ha
 * caminho de codigo daqui que altere o backup, e portanto nada que o servidor
 * MCP faca pode danificar os dados reais.
 *
 * O cache e chaveado pelo SHA do arquivo remoto. A chamada de rede acontece
 * sempre -- e barata e resolve a pergunta "mudou?" -- mas a desserializacao e
 * a reconstrucao do banco sao evitadas quando o SHA se repete.
 */

import type { DocumentoBackup } from '../src/data/backup-serializer.js'
import type { Configuracao } from './configuracao.js'

const RAIZ = 'https://api.github.com'

interface RespostaConteudo {
  readonly content: string
  readonly sha: string
}

/**
 * Codifica segmento a segmento.
 *
 * `encodeURIComponent` sobre o caminho inteiro escaparia as barras e
 * transformaria `pasta/arquivo.json` num nome unico. Mesma escolha de
 * `src/services/sync-service.ts`.
 */
function url(cfg: Configuracao): string {
  const caminho = cfg.caminho.split('/').map(encodeURIComponent).join('/')
  return `${RAIZ}/repos/${cfg.repositorio}/contents/${caminho}`
}

export interface FonteBackup {
  readonly obter: () => Promise<DocumentoBackup>
  readonly obterSemCache: () => Promise<DocumentoBackup>
}

export function criarFonteGitHub(
  cfg: Configuracao,
  buscar: typeof fetch = fetch,
): FonteBackup {
  let shaEmCache: string | null = null
  let docEmCache: DocumentoBackup | null = null

  /** Baixa o envelope da API. Nao decodifica: o sha ainda vai ser comparado. */
  async function baixarEnvelope(): Promise<RespostaConteudo> {
    const resposta = await buscar(url(cfg), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!resposta.ok) {
      // Sem token, sem repositorio, sem caminho: o codigo HTTP basta para
      // diagnosticar, e qualquer um dos tres na mensagem seria vazamento.
      throw new Error(
        `Nao foi possivel ler o backup: o GitHub respondeu ${resposta.status}. ` +
          'Verifique o token, o repositorio e o caminho configurados.',
      )
    }

    return (await resposta.json()) as RespostaConteudo
  }

  function decodificar(corpo: RespostaConteudo): DocumentoBackup {
    const texto = Buffer.from(corpo.content, 'base64').toString('utf-8')
    return JSON.parse(texto) as DocumentoBackup
  }

  return {
    async obter(): Promise<DocumentoBackup> {
      const corpo = await baixarEnvelope()

      // A comparacao vem ANTES do decode: e o decode que o cache existe para
      // evitar. Compara-lo depois faria o trabalho caro de qualquer forma, e o
      // cache so trocaria a referencia devolvida.
      //
      // A identidade da referencia devolvida tambem importa fora daqui: o
      // servidor reusa o app em memoria enquanto receber o MESMO objeto.
      if (corpo.sha === shaEmCache && docEmCache !== null) return docEmCache

      const doc = decodificar(corpo)
      shaEmCache = corpo.sha
      docEmCache = doc
      return doc
    },

    async obterSemCache(): Promise<DocumentoBackup> {
      return decodificar(await baixarEnvelope())
    },
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npm test -- mcp/fonte-github.test.ts
```

Esperado: 10 testes PASS.

- [ ] **Step 6: Commit**

```bash
git add mcp/configuracao.ts mcp/fonte-github.ts mcp/fonte-github.test.ts
git commit -m "Le o backup do GitHub com cache por sha"
```

---

## Task 4: Ferramenta `situacao_do_mes`

**Files:**
- Create: `mcp/tools/situacao-do-mes.ts`
- Create: `mcp/tools/situacao-do-mes.test.ts`

**Interfaces:**
- Consumes: `AppEmMemoria` de `mcp/app-em-memoria.js`; `dinheiro`, `item`, `ponto` de `mcp/formatacao.js`; `competenciaDe` de `src/domain/calendar.js`
- Produces: `async function situacaoDoMes(app: AppEmMemoria, args: { competencia?: string; hoje: string }): Promise<SituacaoDoMes>`, com `SituacaoDoMes` exportado

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/situacao-do-mes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { criarAppDoBackup } from '../app-em-memoria.js'
import {
  ORCAMENTO_SEM_ANCORA,
  ORCAMENTO_SIMPLES,
} from '../fixtures/orcamento-simples.js'
import { situacaoDoMes } from './situacao-do-mes.js'

describe('situacaoDoMes', () => {
  it('usa o mes de hoje quando a competencia nao vem', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await situacaoDoMes(app, { hoje: '2026-03-20' })

    expect(r.competencia).toBe('2026-03')
    await app.encerrar()
  })

  it('devolve totais em centavos e em texto', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-20' })

    expect(r.jaResolvido.valorCentavos).toBe(24590)
    // Espaco estreito (U+202F) do Intl: `\s` casa ASCII e nao-quebravel.
    expect(r.jaResolvido.valor).toMatch(/^R\$\s?245,90$/u)
    await app.encerrar()
  })

  it('lista o aluguel nao pago como pendente', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-20' })

    expect(r.faltaPagar.map((i) => i.nome)).toContain('Aluguel')
    expect(r.faltaPagar.every((i) => i.tipo === 'saida')).toBe(true)
    await app.encerrar()
  })

  it('marca saldoRelativo quando nao ha ancora', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SEM_ANCORA)

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-20' })

    expect(r.saldoRelativo).toBe(true)
    expect(r.avisoSaldoRelativo).toMatch(/ancora|âncora/i)
    await app.encerrar()
  })

  it('nao emite aviso quando ha ancora', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-20' })

    expect(r.saldoRelativo).toBe(false)
    expect(r.avisoSaldoRelativo).toBeNull()
    await app.encerrar()
  })

  it('expoe o dia de saldo minimo', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-20' })

    expect(r.diaMinimo.data).toMatch(/^2026-03-\d{2}$/)
    expect(typeof r.diaMinimo.saldoCentavos).toBe('number')
    await app.encerrar()
  })

  it('fecha a identidade saldo + entra - sai = sobra', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-20' })

    expect(
      r.saldoNaReferencia.valorCentavos +
        r.entraApos.valorCentavos -
        r.saiApos.valorCentavos,
    ).toBe(r.sobra.valorCentavos)
    await app.encerrar()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/tools/situacao-do-mes.test.ts
```

Esperado: FAIL, módulo `./situacao-do-mes.js` não encontrado.

- [ ] **Step 3: Implementar `mcp/tools/situacao-do-mes.ts`**

```ts
/**
 * "Como estou neste mes?"
 *
 * Enxuga o MesProjetado que o app ja calcula. Nenhuma conta e refeita aqui: os
 * numeros sao os mesmos que a tela exibe, porque vem do mesmo projetor.
 */

import { competenciaDe } from '../../src/domain/calendar.js'
import type { AppEmMemoria } from '../app-em-memoria.js'
import { dinheiro, item, ponto, type Dinheiro, type ItemFormatado } from '../formatacao.js'

export interface SituacaoDoMes {
  readonly competencia: string
  readonly sobra: Dinheiro
  readonly saldoNaReferencia: Dinheiro
  readonly dataDaReferencia: string | null
  readonly entraApos: Dinheiro
  readonly saiApos: Dinheiro
  readonly diaMinimo: { readonly data: string; readonly saldoCentavos: number; readonly saldo: string }
  readonly totalFaltaPagar: Dinheiro
  readonly totalAindaEntra: Dinheiro
  readonly jaResolvido: Dinheiro
  readonly faltaPagar: readonly ItemFormatado[]
  readonly aindaEntra: readonly ItemFormatado[]
  readonly saldoRelativo: boolean
  /**
   * Texto pronto para o assistente repetir quando nao ha ancora.
   *
   * Sem ele, um saldo relativo seria lido como saldo absoluto e o assistente
   * afirmaria "voce tem R$ X" sobre um numero que so tem forma, nao nivel --
   * o erro mais caro que esta ferramenta poderia cometer.
   */
  readonly avisoSaldoRelativo: string | null
}

const AVISO =
  'Nao ha ancora de saldo cadastrada. Os valores de saldo sao RELATIVOS: a ' +
  'forma da curva e o dia de aperto estao corretos, mas o nivel esta ' +
  'deslocado. Nao afirme um saldo absoluto a partir deles.'

export async function situacaoDoMes(
  app: AppEmMemoria,
  args: { competencia?: string; hoje: string },
): Promise<SituacaoDoMes> {
  const competencia = args.competencia ?? competenciaDe(args.hoje)
  const m = await app.projecao.projetarMes(competencia, args.hoje)

  return {
    competencia,
    sobra: dinheiro(m.sobraCentavos),
    saldoNaReferencia: dinheiro(m.saldoNaReferenciaCentavos),
    dataDaReferencia: m.dataDaReferencia,
    entraApos: dinheiro(m.entraAposReferenciaCentavos),
    saiApos: dinheiro(m.saiAposReferenciaCentavos),
    diaMinimo: ponto(m.curva.diaMinimo),
    totalFaltaPagar: dinheiro(m.totalFaltaPagarCentavos),
    totalAindaEntra: dinheiro(m.totalAindaEntraCentavos),
    jaResolvido: dinheiro(m.totalJaResolvidoCentavos),
    faltaPagar: m.faltaPagar.map(item),
    aindaEntra: m.aindaEntra.map(item),
    saldoRelativo: m.saldoRelativo,
    avisoSaldoRelativo: m.saldoRelativo ? AVISO : null,
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npm test -- mcp/tools/situacao-do-mes.test.ts
```

Esperado: 7 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/tools/situacao-do-mes.ts mcp/tools/situacao-do-mes.test.ts
git commit -m "Ferramenta de situacao do mes"
```

---

## Task 5: Ferramenta `o_que_vence`

**Files:**
- Create: `mcp/tools/o-que-vence.ts`
- Create: `mcp/tools/o-que-vence.test.ts`

**Interfaces:**
- Consumes: `AppEmMemoria` de `mcp/app-em-memoria.js`; `dinheiro`, `item` de `mcp/formatacao.js`; `competenciaDe`, `somarDias`, `comparar` de `src/domain/calendar.js`
- Produces: `async function oQueVence(app: AppEmMemoria, args: { dias?: number; hoje: string }): Promise<OQueVence>`, com `OQueVence` exportado

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/o-que-vence.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { criarAppDoBackup } from '../app-em-memoria.js'
import { ORCAMENTO_SIMPLES } from '../fixtures/orcamento-simples.js'
import { oQueVence } from './o-que-vence.js'

describe('oQueVence', () => {
  it('separa o que ja venceu do que ainda vai vencer', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    // Em 20 de marco: aluguel do dia 10 esta atrasado; nada mais vence ate 27.
    const r = await oQueVence(app, { dias: 7, hoje: '2026-03-20' })

    expect(r.atrasado.map((i) => i.nome)).toContain('Aluguel')
    expect(r.aPagar.map((i) => i.nome)).not.toContain('Aluguel')
    await app.encerrar()
  })

  it('inclui o que vence dentro da janela', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    // Em 8 de marco, o aluguel do dia 10 esta dentro de 7 dias.
    const r = await oQueVence(app, { dias: 7, hoje: '2026-03-08' })

    expect(r.aPagar.map((i) => i.nome)).toContain('Aluguel')
    expect(r.atrasado).toHaveLength(0)
    await app.encerrar()
  })

  it('exclui o que vence depois da janela', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await oQueVence(app, { dias: 1, hoje: '2026-03-08' })

    expect(r.aPagar.map((i) => i.nome)).not.toContain('Aluguel')
    await app.encerrar()
  })

  it('nunca rotula entrada como atrasada (RN-90)', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    // Salario do dia 5 nao foi confirmado, e ja e dia 20.
    const r = await oQueVence(app, { dias: 7, hoje: '2026-03-20' })

    expect(r.atrasado.every((i) => i.tipo === 'saida')).toBe(true)
    expect(r.aConfirmar.map((i) => i.nome)).toContain('Salario')
    await app.encerrar()
  })

  it('usa 7 dias por padrao', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await oQueVence(app, { hoje: '2026-03-08' })

    expect(r.dias).toBe(7)
    expect(r.ate).toBe('2026-03-15')
    await app.encerrar()
  })

  it('soma os totais de cada grupo', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await oQueVence(app, { dias: 7, hoje: '2026-03-20' })

    expect(r.totalAtrasado.valorCentavos).toBe(
      r.atrasado.reduce((t, i) => t + i.valorCentavos, 0),
    )
    expect(r.totalAPagar.valorCentavos).toBe(
      r.aPagar.reduce((t, i) => t + i.valorCentavos, 0),
    )
    await app.encerrar()
  })

  it('nao exclui o item ignorado da contagem por engano', async () => {
    const app = await criarAppDoBackup({
      ...ORCAMENTO_SIMPLES,
      ocorrencias: [
        ...ORCAMENTO_SIMPLES.ocorrencias,
        {
          id: 'o-aluguel-marco',
          geradorTipo: 'regra',
          geradorId: 'r-aluguel',
          competencia: '2026-03',
          tipo: 'saida',
          nome: 'Aluguel',
          valorPrevistoCentavos: 180000,
          dataVencimento: '2026-03-10',
          dataPagamento: null,
          valorPagoCentavos: null,
          ignorado: true,
          observacao: null,
        },
      ],
    })

    const r = await oQueVence(app, { dias: 7, hoje: '2026-03-20' })

    expect(r.atrasado.map((i) => i.nome)).not.toContain('Aluguel')
    await app.encerrar()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/tools/o-que-vence.test.ts
```

Esperado: FAIL, módulo `./o-que-vence.js` não encontrado.

- [ ] **Step 3: Implementar `mcp/tools/o-que-vence.ts`**

```ts
/**
 * "O que vence nos proximos dias?"
 *
 * Le do mesmo MesProjetado da tela do mes, filtrando por janela de data. As
 * situacoes vem derivadas do dominio -- atraso nunca e recalculado aqui, e por
 * isso a RN-90 (entrada nao atrasa, fica a confirmar) vale de graca.
 *
 * A janela pode cruzar a virada do mes, entao a consulta cobre a competencia
 * de hoje e a do ultimo dia da janela, sem repetir itens.
 */

import { comparar, competenciaDe, somarDias } from '../../src/domain/calendar.js'
import type { OcorrenciaResolvida } from '../../src/domain/types.js'
import type { AppEmMemoria } from '../app-em-memoria.js'
import { dinheiro, item, type Dinheiro, type ItemFormatado } from '../formatacao.js'

export interface OQueVence {
  readonly de: string
  readonly ate: string
  readonly dias: number
  readonly atrasado: readonly ItemFormatado[]
  readonly aPagar: readonly ItemFormatado[]
  readonly aConfirmar: readonly ItemFormatado[]
  readonly totalAtrasado: Dinheiro
  readonly totalAPagar: Dinheiro
}

const DIAS_PADRAO = 7

export async function oQueVence(
  app: AppEmMemoria,
  args: { dias?: number; hoje: string },
): Promise<OQueVence> {
  const dias = args.dias ?? DIAS_PADRAO
  const ate = somarDias(args.hoje, dias)

  const competencias = [...new Set([competenciaDe(args.hoje), competenciaDe(ate)])]

  const meses = await Promise.all(
    competencias.map((c) => app.projecao.projetarMes(c, args.hoje)),
  )

  // Deduplicacao por chave: uma saida atrasada de fevereiro aparece tanto na
  // projecao de fevereiro quanto na de marco, e contar duas vezes dobraria o
  // total devido.
  // Tipagem explicita: `const x = []` sob `strict` infere `never[]` e o push
  // seguinte nao compila.
  const vistas = new Set<string>()
  const pendentesSaida: OcorrenciaResolvida[] = []
  const pendentesEntrada: OcorrenciaResolvida[] = []

  for (const m of meses) {
    for (const o of m.faltaPagar) {
      if (vistas.has(o.chave)) continue
      vistas.add(o.chave)
      pendentesSaida.push(o)
    }
    for (const o of m.aindaEntra) {
      if (vistas.has(o.chave)) continue
      vistas.add(o.chave)
      pendentesEntrada.push(o)
    }
  }

  const dentroDaJanela = (venc: string): boolean =>
    comparar(venc, args.hoje) >= 0 && comparar(venc, ate) <= 0

  const atrasado = pendentesSaida
    .filter((o) => o.situacao === 'atrasado')
    .map(item)

  const aPagar = pendentesSaida
    .filter((o) => o.situacao !== 'atrasado' && dentroDaJanela(o.dataVencimento))
    .map(item)

  // Entradas cuja data ja passou ficam 'a_confirmar' e entram sempre: o
  // assistente precisa saber que ha um recebimento pendente de confirmacao,
  // mesmo que a data tenha ficado para tras.
  const aConfirmar = pendentesEntrada
    .filter((o) => o.situacao === 'a_confirmar' || dentroDaJanela(o.dataVencimento))
    .map(item)

  const somar = (lista: readonly ItemFormatado[]): number =>
    lista.reduce((t, i) => t + i.valorCentavos, 0)

  return {
    de: args.hoje,
    ate,
    dias,
    atrasado,
    aPagar,
    aConfirmar,
    totalAtrasado: dinheiro(somar(atrasado)),
    totalAPagar: dinheiro(somar(aPagar)),
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npm test -- mcp/tools/o-que-vence.test.ts
```

Esperado: 7 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/tools/o-que-vence.ts mcp/tools/o-que-vence.test.ts
git commit -m "Ferramenta de vencimentos na janela"
```

---

## Task 6: Ferramenta `historico_de_gastos`

**Files:**
- Create: `mcp/tools/historico-de-gastos.ts`
- Create: `mcp/tools/historico-de-gastos.test.ts`

**Interfaces:**
- Consumes: `AppEmMemoria` de `mcp/app-em-memoria.js`; `dinheiro` de `mcp/formatacao.js`; `competenciaDe`, `somarMeses` de `src/domain/calendar.js`; `media` de `src/domain/money.js`
- Produces: `async function historicoDeGastos(app: AppEmMemoria, args: { meses?: number; nome?: string; hoje: string }): Promise<HistoricoDeGastos>`, com `HistoricoDeGastos` e `GastoPorNome` exportados

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/historico-de-gastos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { criarAppDoBackup } from '../app-em-memoria.js'
import { ORCAMENTO_SIMPLES } from '../fixtures/orcamento-simples.js'
import { historicoDeGastos } from './historico-de-gastos.js'
import type { DocumentoBackup } from '../../src/data/backup-serializer.js'

/** Tres meses de luz paga, com valores diferentes, mais um salario recebido. */
const COM_HISTORICO: DocumentoBackup = {
  ...ORCAMENTO_SIMPLES,
  ocorrencias: [
    ...['2026-01', '2026-02', '2026-03'].map((c, i) => ({
      id: `o-luz-${c}`,
      geradorTipo: 'regra' as const,
      geradorId: 'r-luz',
      competencia: c,
      tipo: 'saida' as const,
      nome: 'Luz',
      valorPrevistoCentavos: 22000,
      dataVencimento: `${c}-15`,
      dataPagamento: `${c}-14`,
      valorPagoCentavos: 20000 + i * 10000,
      ignorado: false,
      observacao: null,
    })),
    {
      id: 'o-salario-2026-02',
      geradorTipo: 'regra',
      geradorId: 'r-salario',
      competencia: '2026-02',
      tipo: 'entrada',
      nome: 'Salario',
      valorPrevistoCentavos: 500000,
      dataVencimento: '2026-02-05',
      dataPagamento: '2026-02-05',
      valorPagoCentavos: 500000,
      ignorado: false,
      observacao: null,
    },
  ],
}

describe('historicoDeGastos', () => {
  it('agrega por nome usando o valor pago', async () => {
    const app = await criarAppDoBackup(COM_HISTORICO)

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-03-20' })
    const luz = r.itens.find((i) => i.nome === 'Luz')

    // 200,00 + 300,00 + 400,00
    expect(luz?.total.valorCentavos).toBe(90000)
    expect(luz?.media.valorCentavos).toBe(30000)
    await app.encerrar()
  })

  it('devolve a serie mensal em ordem cronologica', async () => {
    const app = await criarAppDoBackup(COM_HISTORICO)

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-03-20' })
    const luz = r.itens.find((i) => i.nome === 'Luz')

    expect(luz?.meses.map((m) => m.competencia)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ])
    expect(luz?.meses.map((m) => m.total.valorCentavos)).toEqual([20000, 30000, 40000])
    await app.encerrar()
  })

  it('exclui entradas: salario nao e gasto', async () => {
    const app = await criarAppDoBackup(COM_HISTORICO)

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-03-20' })

    expect(r.itens.map((i) => i.nome)).not.toContain('Salario')
    await app.encerrar()
  })

  it('exclui o que nao foi pago', async () => {
    const app = await criarAppDoBackup(COM_HISTORICO)

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-03-20' })

    // O aluguel e recorrente mas nunca teve pagamento registrado.
    expect(r.itens.map((i) => i.nome)).not.toContain('Aluguel')
    await app.encerrar()
  })

  it('filtra por nome sem diferenciar maiuscula', async () => {
    const app = await criarAppDoBackup(COM_HISTORICO)

    const r = await historicoDeGastos(app, { meses: 6, nome: 'luz', hoje: '2026-03-20' })

    expect(r.itens).toHaveLength(1)
    expect(r.itens[0]?.nome).toBe('Luz')
    await app.encerrar()
  })

  it('respeita a janela de meses', async () => {
    const app = await criarAppDoBackup(COM_HISTORICO)

    // Janela de 1 mes a partir de marco: so a luz de marco.
    const r = await historicoDeGastos(app, { meses: 1, hoje: '2026-03-20' })
    const luz = r.itens.find((i) => i.nome === 'Luz')

    expect(luz?.total.valorCentavos).toBe(40000)
    expect(r.de).toBe('2026-03')
    expect(r.ate).toBe('2026-03')
    await app.encerrar()
  })

  it('ordena do maior gasto para o menor', async () => {
    const app = await criarAppDoBackup({
      ...COM_HISTORICO,
      ocorrencias: [
        ...COM_HISTORICO.ocorrencias,
        {
          id: 'o-aluguel-2026-03',
          geradorTipo: 'regra',
          geradorId: 'r-aluguel',
          competencia: '2026-03',
          tipo: 'saida',
          nome: 'Aluguel',
          valorPrevistoCentavos: 180000,
          dataVencimento: '2026-03-10',
          dataPagamento: '2026-03-10',
          valorPagoCentavos: 180000,
          ignorado: false,
          observacao: null,
        },
      ],
    })

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-03-20' })

    expect(r.itens[0]?.nome).toBe('Aluguel')
    await app.encerrar()
  })

  it('devolve lista vazia quando nao ha gasto pago na janela', async () => {
    const app = await criarAppDoBackup({ ...COM_HISTORICO, ocorrencias: [] })

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-03-20' })

    expect(r.itens).toEqual([])
    expect(r.totalGeral.valorCentavos).toBe(0)
    await app.encerrar()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/tools/historico-de-gastos.test.ts
```

Esperado: FAIL, módulo `./historico-de-gastos.js` não encontrado.

- [ ] **Step 3: Implementar `mcp/tools/historico-de-gastos.ts`**

```ts
/**
 * "Quanto gastei com X nos ultimos meses?"
 *
 * Unica ferramenta com agregacao propria. Considera APENAS saidas ja pagas:
 * somar salario e conta de luz na mesma serie produziria um total que nao
 * significa nada, e incluir o que ainda nao foi pago transformaria previsao em
 * historico.
 */

import { competenciaDe, somarMeses } from '../../src/domain/calendar.js'
import { media } from '../../src/domain/money.js'
import type { AppEmMemoria } from '../app-em-memoria.js'
import { dinheiro, type Dinheiro } from '../formatacao.js'

export interface GastoNoMes {
  readonly competencia: string
  readonly total: Dinheiro
}

export interface GastoPorNome {
  readonly nome: string
  readonly total: Dinheiro
  /** Media sobre os meses em que houve gasto, nao sobre a janela inteira. */
  readonly media: Dinheiro
  readonly meses: readonly GastoNoMes[]
}

export interface HistoricoDeGastos {
  readonly de: string
  readonly ate: string
  readonly itens: readonly GastoPorNome[]
  readonly totalGeral: Dinheiro
}

const MESES_PADRAO = 6

export async function historicoDeGastos(
  app: AppEmMemoria,
  args: { meses?: number; nome?: string; hoje: string },
): Promise<HistoricoDeGastos> {
  const meses = args.meses ?? MESES_PADRAO
  const ate = competenciaDe(args.hoje)
  const de = somarMeses(ate, -(meses - 1))

  const resolvidas = await app.projecao.resolverIntervalo(de, ate, args.hoje)

  const filtro = args.nome?.trim().toLowerCase()

  const pagas = resolvidas.filter(
    (o) =>
      o.tipo === 'saida' &&
      o.situacao === 'pago' &&
      (filtro === undefined || o.nome.toLowerCase().includes(filtro)),
  )

  // nome -> competencia -> total
  const porNome = new Map<string, Map<string, number>>()

  for (const o of pagas) {
    // 'pago' implica dataPagamento preenchida, e o dominio garante que
    // valorPago acompanha. O fallback existe so para o tipo.
    const valor = o.valorPagoCentavos ?? o.valorPrevistoCentavos

    const porMes = porNome.get(o.nome) ?? new Map<string, number>()
    porMes.set(o.competencia, (porMes.get(o.competencia) ?? 0) + valor)
    porNome.set(o.nome, porMes)
  }

  const itens: GastoPorNome[] = [...porNome.entries()]
    .map(([nome, porMes]) => {
      const ordenados = [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b))
      const totais = ordenados.map(([, v]) => v)

      return {
        nome,
        total: dinheiro(totais.reduce((t, v) => t + v, 0)),
        media: dinheiro(media(totais) ?? 0),
        meses: ordenados.map(([competencia, v]) => ({
          competencia,
          total: dinheiro(v),
        })),
      }
    })
    .sort((a, b) => b.total.valorCentavos - a.total.valorCentavos)

  return {
    de,
    ate,
    itens,
    totalGeral: dinheiro(itens.reduce((t, i) => t + i.total.valorCentavos, 0)),
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npm test -- mcp/tools/historico-de-gastos.test.ts
```

Esperado: 8 testes PASS. Se `media` arredondar diferente do esperado, verifique a implementação em `src/domain/money.ts` e ajuste o valor esperado no teste — nunca a função do domínio.

- [ ] **Step 5: Commit**

```bash
git add mcp/tools/historico-de-gastos.ts mcp/tools/historico-de-gastos.test.ts
git commit -m "Ferramenta de historico de gastos por nome"
```

---

## Task 7: Ferramenta `simular_cenario`

**Files:**
- Create: `mcp/tools/simular-cenario.ts`
- Create: `mcp/tools/simular-cenario.test.ts`

**Interfaces:**
- Consumes: `criarAppDoBackup` de `mcp/app-em-memoria.js`; `dinheiro`, `ponto` de `mcp/formatacao.js`; `novoId` de `src/data/ids.js`; `competenciaDe`, `intervaloDeCompetencias` de `src/domain/calendar.js`; `DocumentoBackup` de `src/data/backup-serializer.js`
- Produces:
  - `type LancamentoHipotetico = { tipo: 'regra'; regra: Omit<Regra, 'id'> } | { tipo: 'parcelamento'; parcelamento: Omit<Parcelamento, 'id'> } | { tipo: 'avulso'; ocorrencia: Omit<Ocorrencia, 'id'> }`
  - `async function simularCenario(doc: DocumentoBackup, args: { lancamentos: readonly LancamentoHipotetico[]; ate: string; hoje: string }): Promise<Simulacao>`, com `Simulacao` exportado

**Nota de assinatura:** esta é a única ferramenta que recebe o `DocumentoBackup` em vez de um `AppEmMemoria`. Ela precisa construir **dois** apps descartáveis — um com o cenário, outro sem — e nunca pode tocar o app em cache. Receber um app pronto tornaria esse vazamento possível.

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/simular-cenario.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ORCAMENTO_SIMPLES } from '../fixtures/orcamento-simples.js'
import { simularCenario, type LancamentoHipotetico } from './simular-cenario.js'

const GELADEIRA: LancamentoHipotetico = {
  tipo: 'parcelamento',
  parcelamento: {
    nome: 'Geladeira',
    valorParcelaCentavos: 30000,
    quantidadeParcelas: 6,
    primeiroVencimento: '2026-04-20',
  },
}

describe('simularCenario', () => {
  it('devolve os dois cenarios mes a mes', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [GELADEIRA],
      ate: '2026-06',
      hoje: '2026-03-20',
    })

    expect(r.meses.map((m) => m.competencia)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ])
  })

  it('a parcela reduz a sobra a partir do primeiro vencimento', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [GELADEIRA],
      ate: '2026-06',
      hoje: '2026-03-20',
    })

    const marco = r.meses.find((m) => m.competencia === '2026-03')
    const abril = r.meses.find((m) => m.competencia === '2026-04')

    // Marco nao tem parcela: identico nos dois cenarios.
    expect(marco?.diferenca.valorCentavos).toBe(0)
    // Abril tem uma parcela de 300,00 a menos.
    expect(abril?.diferenca.valorCentavos).toBe(-30000)
  })

  it('aceita regra hipotetica', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [
        {
          tipo: 'regra',
          regra: {
            tipo: 'saida',
            nome: 'Academia',
            valorCentavos: 12000,
            valorEhEstimativa: false,
            diaDoMes: 8,
            ajusteFimDeSemana: 'nenhum',
            vigenteDe: '2026-04',
            vigenteAte: null,
          },
        },
      ],
      ate: '2026-05',
      hoje: '2026-03-20',
    })

    const abril = r.meses.find((m) => m.competencia === '2026-04')
    expect(abril?.diferenca.valorCentavos).toBe(-12000)
  })

  it('aceita lancamento avulso', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [
        {
          tipo: 'avulso',
          ocorrencia: {
            geradorTipo: 'avulso',
            geradorId: null,
            competencia: '2026-04',
            tipo: 'saida',
            nome: 'Pneu',
            valorPrevistoCentavos: 85000,
            dataVencimento: '2026-04-12',
            dataPagamento: null,
            valorPagoCentavos: null,
            ignorado: false,
            observacao: null,
          },
        },
      ],
      ate: '2026-04',
      hoje: '2026-03-20',
    })

    const abril = r.meses.find((m) => m.competencia === '2026-04')
    expect(abril?.diferenca.valorCentavos).toBe(-85000)
  })

  it('nao altera nada sem lancamentos', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [],
      ate: '2026-05',
      hoje: '2026-03-20',
    })

    expect(r.meses.every((m) => m.diferenca.valorCentavos === 0)).toBe(true)
  })

  it('e reproduzivel: duas execucoes dao o mesmo resultado', async () => {
    const args = {
      lancamentos: [GELADEIRA],
      ate: '2026-06',
      hoje: '2026-03-20',
    }

    const a = await simularCenario(ORCAMENTO_SIMPLES, args)
    const b = await simularCenario(ORCAMENTO_SIMPLES, args)

    expect(b.meses).toEqual(a.meses)
  })

  it('nao contamina uma simulacao seguinte', async () => {
    await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [GELADEIRA],
      ate: '2026-06',
      hoje: '2026-03-20',
    })

    const limpo = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [],
      ate: '2026-06',
      hoje: '2026-03-20',
    })

    expect(limpo.meses.every((m) => m.diferenca.valorCentavos === 0)).toBe(true)
  })

  it('aponta o primeiro mes negativo de cada cenario', async () => {
    const r = await simularCenario(ORCAMENTO_SIMPLES, {
      lancamentos: [
        {
          tipo: 'regra',
          regra: {
            tipo: 'saida',
            nome: 'Absurdo',
            valorCentavos: 900000,
            valorEhEstimativa: false,
            diaDoMes: 20,
            ajusteFimDeSemana: 'nenhum',
            vigenteDe: '2026-04',
            vigenteAte: null,
          },
        },
      ],
      ate: '2026-06',
      hoje: '2026-03-20',
    })

    expect(r.primeiroMesNegativoComCenario).toBe('2026-04')
  })

  it('recusa janela maior que 24 meses', async () => {
    await expect(
      simularCenario(ORCAMENTO_SIMPLES, {
        lancamentos: [],
        ate: '2030-01',
        hoje: '2026-03-20',
      }),
    ).rejects.toThrow(/24/)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/tools/simular-cenario.test.ts
```

Esperado: FAIL, módulo `./simular-cenario.js` não encontrado.

- [ ] **Step 3: Implementar `mcp/tools/simular-cenario.ts`**

```ts
/**
 * "Se eu assumir este gasto, atravesso os proximos meses?"
 *
 * Constroi DOIS bancos descartaveis a partir do mesmo documento -- um com os
 * lancamentos hipoteticos, outro sem -- e compara mes a mes.
 *
 * Os dois bancos sao sempre novos. Reaproveitar um app em cache faria um
 * cenario vazar para a consulta seguinte, que e o unico modo de esta
 * ferramenta produzir um numero errado sem falhar.
 *
 * Os lancamentos entram pelos repositorios, nao por escrita direta no banco:
 * e o que faz as invariantes de `src/data/invariants.ts` rejeitarem um dia 40
 * ou um valor fracionado antes de ele virar projecao.
 */

import { competenciaDe, intervaloDeCompetencias } from '../../src/domain/calendar.js'
import type { Ocorrencia, Parcelamento, Regra } from '../../src/domain/types.js'
import type { DocumentoBackup } from '../../src/data/backup-serializer.js'
import { novoId } from '../../src/data/ids.js'
import { criarAppDoBackup, type AppEmMemoria } from '../app-em-memoria.js'
import { dinheiro, ponto, type Dinheiro } from '../formatacao.js'

export type LancamentoHipotetico =
  | { readonly tipo: 'regra'; readonly regra: Omit<Regra, 'id'> }
  | { readonly tipo: 'parcelamento'; readonly parcelamento: Omit<Parcelamento, 'id'> }
  | { readonly tipo: 'avulso'; readonly ocorrencia: Omit<Ocorrencia, 'id'> }

export interface MesComparado {
  readonly competencia: string
  readonly semCenario: Dinheiro
  readonly comCenario: Dinheiro
  readonly diferenca: Dinheiro
  readonly diaMinimoComCenario: {
    readonly data: string
    readonly saldoCentavos: number
    readonly saldo: string
  }
}

export interface Simulacao {
  readonly de: string
  readonly ate: string
  readonly meses: readonly MesComparado[]
  readonly primeiroMesNegativoSemCenario: string | null
  readonly primeiroMesNegativoComCenario: string | null
  readonly saldoRelativo: boolean
}

/**
 * Teto de janela.
 *
 * Cada mes custa uma projecao completa em dois bancos. Sem teto, um `ate` de
 * dez anos transformaria uma pergunta casual em minutos de processamento.
 */
const MAXIMO_DE_MESES = 24

async function aplicar(
  app: AppEmMemoria,
  lancamentos: readonly LancamentoHipotetico[],
): Promise<void> {
  for (const l of lancamentos) {
    if (l.tipo === 'regra') {
      await app.repos.regras.salvar({ ...l.regra, id: novoId() })
    } else if (l.tipo === 'parcelamento') {
      await app.repos.parcelamentos.salvar({ ...l.parcelamento, id: novoId() })
    } else {
      await app.repos.ocorrencias.salvar({ ...l.ocorrencia, id: novoId() })
    }
  }
}

export async function simularCenario(
  doc: DocumentoBackup,
  args: {
    readonly lancamentos: readonly LancamentoHipotetico[]
    readonly ate: string
    readonly hoje: string
  },
): Promise<Simulacao> {
  const de = competenciaDe(args.hoje)
  const competencias = intervaloDeCompetencias(de, args.ate)

  if (competencias.length > MAXIMO_DE_MESES) {
    throw new Error(
      `Janela de ${competencias.length} meses excede o maximo de ${MAXIMO_DE_MESES}. ` +
        'Reduza a competencia final.',
    )
  }

  const base = await criarAppDoBackup(doc)
  const cenario = await criarAppDoBackup(doc)

  try {
    await aplicar(cenario, args.lancamentos)

    const meses: MesComparado[] = []
    let negativoSem: string | null = null
    let negativoCom: string | null = null

    for (const c of competencias) {
      const [sem, com] = await Promise.all([
        base.projecao.projetarMes(c, args.hoje),
        cenario.projecao.projetarMes(c, args.hoje),
      ])

      if (negativoSem === null && sem.sobraCentavos < 0) negativoSem = c
      if (negativoCom === null && com.sobraCentavos < 0) negativoCom = c

      meses.push({
        competencia: c,
        semCenario: dinheiro(sem.sobraCentavos),
        comCenario: dinheiro(com.sobraCentavos),
        diferenca: dinheiro(com.sobraCentavos - sem.sobraCentavos),
        diaMinimoComCenario: ponto(com.curva.diaMinimo),
      })
    }

    return {
      de,
      ate: args.ate,
      meses,
      primeiroMesNegativoSemCenario: negativoSem,
      primeiroMesNegativoComCenario: negativoCom,
      saldoRelativo: doc.ancoras.length === 0,
    }
  } finally {
    // Encerra mesmo se a projecao lancar: bancos abertos vazam entre chamadas.
    await base.encerrar()
    await cenario.encerrar()
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npm test -- mcp/tools/simular-cenario.test.ts
```

Esperado: 9 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/tools/simular-cenario.ts mcp/tools/simular-cenario.test.ts
git commit -m "Ferramenta de simulacao de cenario"
```

---

## Task 8: Servidor MCP e documentação

**Files:**
- Create: `mcp/server.ts`
- Create: `mcp/README.md`
- Modify: `README.md` (seção nova apontando para `mcp/README.md`)

**Interfaces:**
- Consumes: tudo produzido nas tarefas 1–7
- Produces: executável `npm run mcp`, servindo quatro ferramentas por stdio

**Decisão de cache tomada durante a execução da Task 3:** as três ferramentas de consulta compartilham um `AppEmMemoria` reusado enquanto o backup remoto não muda. Reconstruir o banco Dexie é o custo dominante de uma consulta — maior que o download e muito maior que a desserialização — e sem esse reuso o cache por SHA da fonte não economizaria nada que importe. O reuso se apoia na identidade da referência que `obter()` devolve: mesmo SHA, mesmo objeto. `simular_cenario` fica de fora por construção — ela usa `obterSemCache()` e constrói seus próprios bancos descartáveis, porque escreve neles.

- [ ] **Step 1: Implementar `mcp/server.ts`**

Esta tarefa não tem teste unitário próprio: o servidor é apenas registro e ligação, e toda a lógica já está coberta. A verificação é o Step 3, com o servidor rodando de verdade.

```ts
/**
 * Servidor MCP de consulta financeira.
 *
 * Somente leitura. Toda a matematica vem de src/domain/ e src/services/, sem
 * uma linha reimplementada -- um numero devolvido aqui e o mesmo que a tela do
 * app exibe, porque veio do mesmo projetor.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import type { DocumentoBackup } from '../src/data/backup-serializer.js'
import { criarAppDoBackup, type AppEmMemoria } from './app-em-memoria.js'
import { lerConfiguracao } from './configuracao.js'
import { criarFonteGitHub, type FonteBackup } from './fonte-github.js'
import { historicoDeGastos } from './tools/historico-de-gastos.js'
import { oQueVence } from './tools/o-que-vence.js'
import { situacaoDoMes } from './tools/situacao-do-mes.js'
import { simularCenario } from './tools/simular-cenario.js'

const COMPETENCIA = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Competencia no formato AAAA-MM')

const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD')

/**
 * Unico ponto do servidor que le o relogio.
 *
 * O dominio recebe a data corrente como parametro em todo lugar (RN-04), e
 * manter a leitura confinada aqui e o que permite testar as ferramentas em
 * qualquer data sem tocar no relogio da maquina.
 */
function hojeDoSistema(): string {
  const agora = new Date()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${mes}-${dia}`
}

function json(valor: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(valor, null, 2) }] }
}

/**
 * A configuracao e lida na primeira chamada, nao no boot.
 *
 * Um erro de boot se perde no log do cliente MCP e aparece so como "servidor
 * indisponivel", que leva ao diagnostico errado. Falhando na chamada, a
 * mensagem chega inteira ao usuario.
 */
function criarAcesso(): () => FonteBackup {
  let fonte: FonteBackup | null = null
  return () => {
    if (fonte === null) fonte = criarFonteGitHub(lerConfiguracao(process.env))
    return fonte
  }
}

const acesso = criarAcesso()

/**
 * App em memoria reusado enquanto o backup nao mudar.
 *
 * Reconstruir o banco Dexie a cada chamada e o custo real de uma consulta --
 * bem maior que o download ou a desserializacao. `obter()` devolve a MESMA
 * referencia de documento enquanto o sha remoto se repete, entao comparar por
 * identidade responde "mudou?" sem que este modulo precise conhecer sha algum.
 *
 * O app anterior e encerrado ao ser trocado, nunca abandonado: o fake-indexeddb
 * guarda bancos nao deletados pelo resto do processo.
 */
function criarAcessoAoApp(): () => Promise<AppEmMemoria> {
  let docDoApp: DocumentoBackup | null = null
  let appEmCache: AppEmMemoria | null = null

  return async () => {
    const doc = await acesso().obter()

    if (doc === docDoApp && appEmCache !== null) return appEmCache

    if (appEmCache !== null) await appEmCache.encerrar()

    appEmCache = await criarAppDoBackup(doc)
    docDoApp = doc
    return appEmCache
  }
}

const obterApp = criarAcessoAoApp()

const server = new McpServer({
  name: 'financas',
  version: '1.0.0',
})

server.registerTool(
  'situacao_do_mes',
  {
    title: 'Situacao do mes',
    description:
      'Quanto sobra no mes, quanto ainda entra e sai, e em que dia o saldo ' +
      'chega ao minimo. Quando saldoRelativo for verdadeiro, NAO afirme um ' +
      'saldo absoluto: leia avisoSaldoRelativo. Valores vem em centavos ' +
      '(valorCentavos) e em texto ja formatado (valor) -- use o texto ao escrever.',
    inputSchema: {
      competencia: COMPETENCIA.optional().describe('Mes AAAA-MM. Padrao: mes corrente'),
      hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
    },
  },
  async ({ competencia, hoje }) => {
    const app = await obterApp()
    return json(
      await situacaoDoMes(app, {
        ...(competencia === undefined ? {} : { competencia }),
        hoje: hoje ?? hojeDoSistema(),
      }),
    )
  },
)

server.registerTool(
  'o_que_vence',
  {
    title: 'O que vence',
    description:
      'Contas a pagar e recebimentos a confirmar numa janela de dias a partir ' +
      'de hoje, mais tudo que ja esta atrasado. Atraso vale apenas para ' +
      'saidas: uma entrada nao confirmada aparece em aConfirmar, nunca como atrasada.',
    inputSchema: {
      dias: z.number().int().min(1).max(365).optional().describe('Janela em dias. Padrao: 7'),
      hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
    },
  },
  async ({ dias, hoje }) => {
    const app = await obterApp()
    return json(
      await oQueVence(app, {
        ...(dias === undefined ? {} : { dias }),
        hoje: hoje ?? hojeDoSistema(),
      }),
    )
  },
)

server.registerTool(
  'historico_de_gastos',
  {
    title: 'Historico de gastos',
    description:
      'Quanto foi efetivamente pago, agregado por nome, nos ultimos meses. ' +
      'Considera apenas saidas ja pagas -- entradas e previsoes ficam de fora. ' +
      'Use para comparar meses e identificar tendencia.',
    inputSchema: {
      meses: z.number().int().min(1).max(60).optional().describe('Janela em meses. Padrao: 6'),
      nome: z.string().optional().describe('Filtra por nome, sem diferenciar maiuscula'),
      hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
    },
  },
  async ({ meses, nome, hoje }) => {
    const app = await obterApp()
    return json(
      await historicoDeGastos(app, {
        ...(meses === undefined ? {} : { meses }),
        ...(nome === undefined ? {} : { nome }),
        hoje: hoje ?? hojeDoSistema(),
      }),
    )
  },
)

server.registerTool(
  'simular_cenario',
  {
    title: 'Simular cenario',
    description:
      'Projeta o efeito de gastos hipoteticos, comparando mes a mes com e sem ' +
      'eles. Nada e gravado: a simulacao roda num banco descartavel. Use para ' +
      'responder se cabe assumir uma despesa nova ou um parcelamento.',
    inputSchema: {
      lancamentos: z
        .array(
          z.discriminatedUnion('tipo', [
            z.object({
              tipo: z.literal('regra'),
              regra: z.object({
                tipo: z.enum(['entrada', 'saida']),
                nome: z.string(),
                valorCentavos: z.number().int(),
                valorEhEstimativa: z.boolean(),
                diaDoMes: z.number().int().min(1).max(31),
                ajusteFimDeSemana: z.enum(['nenhum', 'antecipa', 'posterga']),
                vigenteDe: COMPETENCIA,
                vigenteAte: COMPETENCIA.nullable(),
              }),
            }),
            z.object({
              tipo: z.literal('parcelamento'),
              parcelamento: z.object({
                nome: z.string(),
                valorParcelaCentavos: z.number().int(),
                quantidadeParcelas: z.number().int().min(1),
                primeiroVencimento: DATA,
              }),
            }),
            z.object({
              tipo: z.literal('avulso'),
              ocorrencia: z.object({
                geradorTipo: z.literal('avulso'),
                geradorId: z.null(),
                competencia: COMPETENCIA,
                tipo: z.enum(['entrada', 'saida']),
                nome: z.string(),
                valorPrevistoCentavos: z.number().int(),
                dataVencimento: DATA,
                dataPagamento: DATA.nullable(),
                valorPagoCentavos: z.number().int().nullable(),
                ignorado: z.boolean(),
                observacao: z.string().nullable(),
              }),
            }),
          ]),
        )
        .describe('Gastos hipoteticos. Valores SEMPRE em centavos inteiros'),
      ate: COMPETENCIA.describe('Ultima competencia a projetar. Maximo de 24 meses'),
      hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
    },
  },
  async ({ lancamentos, ate, hoje }) => {
    // obterSemCache: uma simulacao nunca deve rodar sobre documento antigo.
    const doc = await acesso().obterSemCache()
    return json(
      await simularCenario(doc, {
        lancamentos,
        ate,
        hoje: hoje ?? hojeDoSistema(),
      }),
    )
  },
)

await server.connect(new StdioServerTransport())
```

- [ ] **Step 2: Verificar tipos e lint**

```bash
npm run lint && npm run typecheck
```

Esperado: sem erros.

O schema zod de `lancamentos` foi escrito para produzir exatamente o formato de `LancamentoHipotetico`, então o handler passa o valor direto, sem cast. Se o compilador acusar divergência, o schema está errado — corrija o schema para casar com o tipo, nunca o contrário, e jamais silencie com `as never`: o cast esconderia justamente o campo que ficou fora.

- [ ] **Step 3: Subir o servidor de verdade**

Gere um token fine-grained no GitHub com escopo `Contents: Read`, restrito ao repositório do backup. **Não reuse o token de escrita que o app usa.**

```bash
FINANCE_GITHUB_TOKEN=ghp_seu_token FINANCE_GITHUB_REPO=usuario/repo FINANCE_BACKUP_PATH=caminho/backup.json npm run mcp
```

Esperado: o processo sobe e fica aguardando em stdio, sem imprimir nada. Encerre com Ctrl+C.

Depois teste o caminho de erro, sem variáveis:

```bash
npm run mcp
```

Esperado: também sobe sem erro — a configuração só é lida na primeira chamada de ferramenta. Encerre com Ctrl+C.

- [ ] **Step 4: Registrar no Claude Code**

```bash
claude mcp add financas --env FINANCE_GITHUB_TOKEN=ghp_seu_token --env FINANCE_GITHUB_REPO=usuario/repo --env FINANCE_BACKUP_PATH=caminho/backup.json -- npx tsx /caminho/absoluto/para/finance-control/mcp/server.ts
```

Verifique com uma pergunta real ao assistente, como "o que vence essa semana?". Confirme que o número devolvido bate com a tela do app aberta no navegador. **Essa conferência é o critério de conclusão do plano** — testes provam consistência interna; só a comparação com a tela prova que o servidor está lendo o backup certo.

- [ ] **Step 5: Escrever `mcp/README.md`**

```markdown
# MCP de consulta financeira

Servidor MCP somente-leitura sobre o orçamento. Permite perguntar em linguagem
natural o que o app responde em tela, mais o que ele não responde: comparação
entre meses e simulação de cenário.

Desenho e justificativas: `docs/superpowers/specs/2026-08-28-mcp-consulta-financeira-design.md`

## Como funciona

O servidor baixa o backup JSON do repositório privado do GitHub, escreve num
banco Dexie volátil sobre `fake-indexeddb` e monta os mesmos serviços do PWA.
Nenhuma regra de cálculo é reimplementada: um valor devolvido aqui vem do mesmo
`projetarCurva` que desenha a tela.

O banco morre com o processo e não existe função que escreva no GitHub. Ser
somente-leitura é estrutural, não uma promessa.

## Configuração

| Variável | Conteúdo |
|---|---|
| `FINANCE_GITHUB_TOKEN` | Token fine-grained, escopo `Contents: Read`, restrito ao repositório do backup |
| `FINANCE_GITHUB_REPO` | `usuario/repositorio` |
| `FINANCE_BACKUP_PATH` | Caminho do arquivo dentro do repositório |

**Gere um token separado do que o app usa.** O do app tem permissão de escrita;
se o token do MCP vazar, o histórico continua intacto.

## Registro

```bash
claude mcp add financas \
  --env FINANCE_GITHUB_TOKEN=... \
  --env FINANCE_GITHUB_REPO=usuario/repo \
  --env FINANCE_BACKUP_PATH=caminho/backup.json \
  -- npx tsx /caminho/absoluto/mcp/server.ts
```

## Ferramentas

| Ferramenta | Responde |
|---|---|
| `situacao_do_mes` | Quanto sobra, o que falta pagar e entrar, em que dia o saldo chega ao mínimo |
| `o_que_vence` | O que vence numa janela de dias, e o que já está atrasado |
| `historico_de_gastos` | Quanto foi pago por nome nos últimos meses, com série mensal |
| `simular_cenario` | O efeito de gastos hipotéticos, mês a mês, com e sem eles |

Todo valor sai em dois campos: `valorCentavos` (inteiro) e `valor` (`"R$ 1.234,56"`).

## Limitações

**Só leitura.** Lançar gasto e marcar conta como paga continua sendo no app.
Escrever exigiria resolver a sincronização entre dois donos do mesmo estado, e o
PWA é dono do IndexedDB que este servidor não alcança.

**Os dados são os do último backup.** Se o app não sincronizou desde a última
mudança, o servidor lê o estado anterior.

**Sem âncora de saldo, os valores são relativos.** A forma da curva e o dia de
aperto continuam corretos, mas o nível está deslocado. `situacao_do_mes` sinaliza
isso em `saldoRelativo` e `avisoSaldoRelativo`.
```

- [ ] **Step 6: Apontar o README principal para ele**

Acrescente ao final de `README.md`, antes da seção "Documentação do processo":

```markdown
---

## Consulta por IA

`mcp/` traz um servidor MCP somente-leitura que expõe o orçamento a um
assistente de IA, reusando o mesmo domínio e os mesmos serviços do app. Permite
perguntar o que vence na semana, comparar gastos entre meses e simular o efeito
de uma despesa nova.

Configuração e uso: [`mcp/README.md`](mcp/README.md)
```

- [ ] **Step 7: Rodar a verificação completa**

```bash
npm run verify
```

Esperado: lint, typecheck, os 309 testes originais e os ~45 novos, todos passando.

- [ ] **Step 8: Commit**

```bash
git add mcp/server.ts mcp/README.md README.md
git commit -m "Servidor MCP com as quatro ferramentas"
```

---

## Verificação final

- [ ] `npm run verify` passa inteiro
- [ ] Nenhum arquivo dentro de `src/` foi modificado: confirmar com `git diff main --stat -- src/` (esperado: saída vazia)
- [ ] A regra de fronteira foi testada na prática (Task 1, Step 9), não apenas escrita
- [ ] Uma pergunta real ao assistente devolve número idêntico ao da tela do app
