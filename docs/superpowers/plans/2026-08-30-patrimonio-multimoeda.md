# Patrimônio multimoeda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar saldos em moeda estrangeira e responder "quanto eu tenho no total", sem que esse dinheiro entre na projeção do mês.

**Architecture:** Uma tabela `saldos_estrangeiros` com a moeda como chave primária, um repositório próprio pendurado em `AppPg` **fora** de `Repositorios`, e duas ferramentas MCP novas. A conversão para reais usa aritmética inteira num módulo puro (`mcp/cambio.ts`). Nenhum arquivo em `src/` é tocado.

**Tech Stack:** TypeScript (ESM, `.js` nos imports), Postgres via `pg`, Express + `@modelcontextprotocol/sdk`, zod para schemas, vitest + `@testcontainers/postgresql` para os testes.

## Global Constraints

- **Dinheiro é sempre inteiro na menor unidade da moeda (RN-01).** Nunca `float`, nunca `parseFloat` sobre um valor monetário. Colunas de dinheiro são `bigint`.
- **Datas são `text` no formato `AAAA-MM-DD` (RN-04).** Nunca colunas `date`, nunca `new Date('2026-08-10')` — o driver `pg` aplicaria fuso e deslocaria o dia.
- **`src/` está congelado.** Nenhuma tarefa deste plano cria, modifica ou apaga arquivo sob `src/`. Os 309 testes do domínio devem continuar passando sem alteração.
- **`Repositorios` não ganha campos.** Esse tipo é derivado da implementação Dexie; acrescentar um campo obrigaria a implementar o mesmo repositório em Dexie e alteraria a suíte de contrato.
- **O saldo em moeda estrangeira não entra na projeção.** `situacao_do_mes`, `o_que_vence` e `simular_cenario` não mudam de comportamento.
- **Imports ESM levam extensão `.js`**, inclusive para arquivos `.ts` do próprio projeto (ex.: `import { converter } from '../cambio.js'`).
- **Comentários e mensagens em português sem acentuação** dentro do código, seguindo o restante de `mcp/` (as strings voltadas ao usuário final, como resumos de recibo, usam acentuação normal).
- **Ordem determinística nas listas devolvidas**: `emMoedaEstrangeira` sai ordenado por código de moeda.
- Rodar a suíte com `npx vitest run <caminho>`. Typecheck com `npx tsc -p mcp/tsconfig.json` — `vitest` transpila com esbuild e **não** faz checagem de tipos.

---

### Task 1: `mcp/cambio.ts` — conversão sem ponto flutuante

Módulo puro, sem banco e sem dependências do projeto. É a única peça que faz aritmética entre moedas, e a que mais pode errar em silêncio.

**Files:**
- Create: `mcp/cambio.ts`
- Test: `mcp/cambio.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `paraDezMilesimos(texto: string): number | null`
  - `converter(valorCentavos: number, cotacaoEmDezMilesimos: number): number`
  - `formatarMoeda(centavos: number, moeda: string): string`
  - `normalizarMoeda(texto: string): string | null`

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/cambio.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { converter, formatarMoeda, normalizarMoeda, paraDezMilesimos } from './cambio.js'

describe('paraDezMilesimos', () => {
  it('aceita as formas em que uma cotacao e escrita', () => {
    expect(paraDezMilesimos('5,4321')).toBe(54321)
    expect(paraDezMilesimos('5.4321')).toBe(54321)
    expect(paraDezMilesimos('5,4')).toBe(54000)
    expect(paraDezMilesimos('5')).toBe(50000)
    expect(paraDezMilesimos('  5,40  ')).toBe(54000)
  })

  it('recusa o que nao e uma cotacao utilizavel', () => {
    expect(paraDezMilesimos('')).toBeNull()
    expect(paraDezMilesimos('   ')).toBeNull()
    expect(paraDezMilesimos('abc')).toBeNull()
    expect(paraDezMilesimos('0')).toBeNull()
    expect(paraDezMilesimos('0,00')).toBeNull()
    expect(paraDezMilesimos('-5,40')).toBeNull()
    expect(paraDezMilesimos('1,2,3')).toBeNull()
  })

  // Truncar em silencio descartaria precisao que o usuario informou de
  // proposito. Quatro casas e o formato usual de cotacao.
  it('recusa mais de quatro casas decimais em vez de truncar', () => {
    expect(paraDezMilesimos('5,43210')).toBeNull()
  })
})

describe('converter', () => {
  it('arredonda para o centavo mais proximo, para cima e para baixo', () => {
    // 1 cent a 5,5000 = 5,5 centavos de real -> 6
    expect(converter(1, 55000)).toBe(6)
    // 1 cent a 5,4000 = 5,4 centavos de real -> 5
    expect(converter(1, 54000)).toBe(5)
  })

  // Este e o caso que justifica a aritmetica inteira: em ponto flutuante o
  // produto perderia exatidao e o total do patrimonio sairia com centavos
  // fantasmas.
  it('mantem exatidao num valor grande', () => {
    // US$ 5.000,00 a 5,4321 = R$ 27.160,50
    expect(converter(500_000, 54321)).toBe(2_716_050)
  })

  it('converte zero em zero', () => {
    expect(converter(0, 54321)).toBe(0)
  })
})

describe('formatarMoeda', () => {
  it('formata na moeda pedida, nao em reais', () => {
    // O separador antes do numero pode ser espaco estreito (U+202F ou
    // U+00A0), nao ASCII -- por isso `\s?` em vez de um espaco literal.
    expect(formatarMoeda(500_000, 'USD')).toMatch(/US\$\s?5\.000,00/u)
    expect(formatarMoeda(12_345, 'EUR')).toMatch(/€\s?123,45/u)
  })
})

describe('normalizarMoeda', () => {
  it('aceita tres letras em qualquer caixa e devolve em maiusculas', () => {
    expect(normalizarMoeda('usd')).toBe('USD')
    expect(normalizarMoeda('  Eur ')).toBe('EUR')
  })

  it('recusa o que nao tem formato de codigo ISO 4217', () => {
    expect(normalizarMoeda('dolar')).toBeNull()
    expect(normalizarMoeda('US')).toBeNull()
    expect(normalizarMoeda('US1')).toBeNull()
    expect(normalizarMoeda('')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
npx vitest run mcp/cambio.test.ts
```

Esperado: FAIL — `Failed to resolve import "./cambio.js"`.

- [ ] **Step 3: Escrever o módulo**

Crie `mcp/cambio.ts`:

```ts
/**
 * Conversao entre moedas sem ponto flutuante.
 *
 * Multiplicar centavos por uma cotacao decimal reintroduziria float na unica
 * parte do sistema que o evita em todo lugar onde ha dinheiro. A cotacao vira
 * inteiro em decimos de milesimo (quatro casas), a conta e inteira, e o
 * arredondamento acontece uma vez, explicito, no fim.
 */

/** Casas decimais de uma cotacao. `5,4321` -> `54321`. */
const ESCALA = 10_000

/**
 * Le uma cotacao escrita como texto e devolve decimos de milesimo.
 *
 * `null` quando o texto nao e uma cotacao utilizavel. Cotacao entra como
 * texto pelo mesmo motivo que os valores entram: tirar aritmetica das maos do
 * modelo.
 */
export function paraDezMilesimos(texto: string): number | null {
  // `replace` sem flag global troca so o primeiro separador -- entao "1,2,3"
  // vira "1.2,3" e e recusado pela expressao abaixo, como deve ser.
  const limpo = texto.trim().replace(',', '.')

  // Ate quatro casas decimais. Truncar em silencio descartaria precisao
  // informada de proposito.
  if (!/^\d+(\.\d{1,4})?$/u.test(limpo)) return null

  const [inteira = '0', decimal = ''] = limpo.split('.')
  const valor = Number(inteira) * ESCALA + Number(decimal.padEnd(4, '0'))

  return valor > 0 ? valor : null
}

/**
 * Converte um valor na menor unidade da moeda de origem para centavos de
 * real, arredondando para o centavo mais proximo.
 *
 * O produto de um saldo alto por uma cotacao fica na casa de 10^10 -- muito
 * abaixo de `Number.MAX_SAFE_INTEGER`, entao a multiplicacao e exata.
 */
export function converter(valorCentavos: number, cotacaoEmDezMilesimos: number): number {
  return Math.round((valorCentavos * cotacaoEmDezMilesimos) / ESCALA)
}

/**
 * Formata na moeda de origem.
 *
 * Fica aqui e nao em `src/domain/money.ts` porque `src/` esta congelado e
 * `formatarBRL` continua sendo a funcao do dominio, fixa em BRL.
 */
export function formatarMoeda(centavos: number, moeda: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(
    centavos / 100,
  )
}

/**
 * Normaliza um codigo de moeda para maiusculas.
 *
 * Valida so o formato ISO 4217 (tres letras). Uma lista fechada de moedas
 * validas seria manutencao sem ganho: o formato ja recusa lixo, e o saldo
 * gravado com um codigo inexistente aparece no proprio resultado.
 */
export function normalizarMoeda(texto: string): string | null {
  const limpo = texto.trim().toUpperCase()
  return /^[A-Z]{3}$/u.test(limpo) ? limpo : null
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
npx vitest run mcp/cambio.test.ts
```

Esperado: PASS, 9 testes.

- [ ] **Step 5: Typecheck**

```bash
npx tsc -p mcp/tsconfig.json
```

Esperado: sem saída (sucesso).

- [ ] **Step 6: Commit**

```bash
git add mcp/cambio.ts mcp/cambio.test.ts && git commit -m "Converte entre moedas com aritmetica inteira"
```

---

### Task 2: Tabela e repositório de saldos estrangeiros

**Files:**
- Modify: `mcp/dados/migracoes.ts` (acrescentar uma entrada ao fim do array `MIGRACOES`)
- Create: `mcp/dados/saldos-estrangeiros-pg.ts`
- Modify: `mcp/app-pg.ts`
- Test: `mcp/dados/saldos-estrangeiros-pg.test.ts`

**Interfaces:**
- Consumes: nada da Task 1.
- Produces:
  - `interface SaldoEstrangeiro { readonly moeda: string; readonly valorCentavos: number; readonly data: string }`
  - `interface SaldosEstrangeirosRepo { listar(): Promise<SaldoEstrangeiro[]>; salvar(s: SaldoEstrangeiro): Promise<void> }`
  - `criarSaldosEstrangeirosPg(pool: Pool): SaldosEstrangeirosRepo`
  - `AppPg` ganha o campo `readonly saldosEstrangeiros: SaldosEstrangeirosRepo`

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/dados/saldos-estrangeiros-pg.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from './conexao.js'
import { aplicarMigracoes } from './migracoes.js'
import { criarSaldosEstrangeirosPg, type SaldosEstrangeirosRepo } from './saldos-estrangeiros-pg.js'

let container: StartedPostgreSqlContainer
let pool: Pool
let repo: SaldosEstrangeirosRepo

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  pool = criarPool(container.getConnectionUri())
  await aplicarMigracoes(pool)
  repo = criarSaldosEstrangeirosPg(pool)
}, 120_000)

afterAll(async () => {
  await pool.end()
  await container.stop()
})

beforeEach(async () => {
  await pool.query('delete from saldos_estrangeiros')
})

it('grava e le um saldo', async () => {
  await repo.salvar({ moeda: 'USD', valorCentavos: 500_000, data: '2026-08-30' })

  expect(await repo.listar()).toEqual([
    { moeda: 'USD', valorCentavos: 500_000, data: '2026-08-30' },
  ])
})

// `valor_centavos` e bigint, e o driver `pg` devolve bigint como STRING por
// padrao. Sem o parser de tipo, este teste veria "500000" e a soma do
// patrimonio concatenaria em vez de somar.
it('devolve o valor como numero, nao como string', async () => {
  await repo.salvar({ moeda: 'USD', valorCentavos: 500_000, data: '2026-08-30' })

  const [s] = await repo.listar()
  expect(typeof s?.valorCentavos).toBe('number')
})

it('declarar a mesma moeda de novo substitui, deixando uma linha so', async () => {
  await repo.salvar({ moeda: 'USD', valorCentavos: 500_000, data: '2026-08-01' })
  await repo.salvar({ moeda: 'USD', valorCentavos: 620_000, data: '2026-08-30' })

  expect(await repo.listar()).toEqual([
    { moeda: 'USD', valorCentavos: 620_000, data: '2026-08-30' },
  ])
})

it('mantem criado_em da primeira declaracao e avanca atualizado_em', async () => {
  await repo.salvar({ moeda: 'USD', valorCentavos: 500_000, data: '2026-08-01' })
  const antes = await pool.query<{ criado_em: Date; atualizado_em: Date }>(
    'select criado_em, atualizado_em from saldos_estrangeiros where moeda = $1',
    ['USD'],
  )

  await repo.salvar({ moeda: 'USD', valorCentavos: 620_000, data: '2026-08-30' })
  const depois = await pool.query<{ criado_em: Date; atualizado_em: Date }>(
    'select criado_em, atualizado_em from saldos_estrangeiros where moeda = $1',
    ['USD'],
  )

  expect(depois.rows[0]?.criado_em.getTime()).toBe(antes.rows[0]?.criado_em.getTime())
  expect(depois.rows[0]?.atualizado_em.getTime()).toBeGreaterThanOrEqual(
    antes.rows[0]?.atualizado_em.getTime() ?? 0,
  )
})

it('guarda moedas diferentes lado a lado, ordenadas por codigo', async () => {
  await repo.salvar({ moeda: 'USD', valorCentavos: 500_000, data: '2026-08-30' })
  await repo.salvar({ moeda: 'EUR', valorCentavos: 100_000, data: '2026-08-30' })

  expect((await repo.listar()).map((s) => s.moeda)).toEqual(['EUR', 'USD'])
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
npx vitest run mcp/dados/saldos-estrangeiros-pg.test.ts
```

Esperado: FAIL — `Failed to resolve import "./saldos-estrangeiros-pg.js"`.

- [ ] **Step 3: Acrescentar a migração**

Em `mcp/dados/migracoes.ts`, o array `MIGRACOES` termina com a entrada dos `alter table ... add column if not exists atualizado_em`, seguida de `]`. Acrescente **uma nova entrada depois dela**, sem tocar em nenhuma das anteriores — o mecanismo aplica apenas as versões acima da atual, e um banco já migrado nunca reveria uma versão editada:

```ts
  // O saldo em moeda estrangeira fica FORA da projecao de propósito. Se
  // entrasse na ancora, o app afirmaria que o mes fecha com dinheiro que
  // ainda precisa passar por uma conversao a uma cotacao que nao aconteceu.
  //
  // `moeda` e a chave primaria: um saldo por moeda, declarar de novo
  // substitui. Nao ha historico -- e por isso esta escrita nao entra no
  // `desfazer`.
  `
  create table if not exists saldos_estrangeiros (
    moeda text primary key,
    valor_centavos bigint not null,
    data text not null,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
  );
  `,
```

- [ ] **Step 4: Escrever o repositório**

Crie `mcp/dados/saldos-estrangeiros-pg.ts`:

```ts
/**
 * Saldos em moeda estrangeira.
 *
 * Fica FORA de `Repositorios`: aquele tipo e derivado da implementacao Dexie,
 * e acrescentar um campo obrigaria a implementar o mesmo repositorio em Dexie
 * e alteraria a suite de contrato. Aqui `AppPg` ganha um campo proprio, irmao
 * de `repos`.
 */

import type { Pool } from 'pg'

// Efeito colateral deliberado: registra o parser que devolve `bigint` como
// numero. Sem ele `valor_centavos` chegaria como string e a soma do
// patrimonio concatenaria em vez de somar.
import './conexao.js'

export interface SaldoEstrangeiro {
  readonly moeda: string
  readonly valorCentavos: number
  readonly data: string
}

export interface SaldosEstrangeirosRepo {
  listar(): Promise<SaldoEstrangeiro[]>
  salvar(s: SaldoEstrangeiro): Promise<void>
}

interface Linha {
  readonly moeda: string
  readonly valor_centavos: number
  readonly data: string
}

export function criarSaldosEstrangeirosPg(pool: Pool): SaldosEstrangeirosRepo {
  return {
    listar: async (): Promise<SaldoEstrangeiro[]> => {
      // Ordem fixa por moeda: o resultado do patrimonio e lido por uma
      // pessoa, e uma lista que troca de ordem entre chamadas parece
      // instabilidade nos dados.
      const r = await pool.query<Linha>(
        'select moeda, valor_centavos, data from saldos_estrangeiros order by moeda',
      )
      return r.rows.map((l) => ({
        moeda: l.moeda,
        valorCentavos: l.valor_centavos,
        data: l.data,
      }))
    },

    salvar: async (s: SaldoEstrangeiro): Promise<void> => {
      await pool.query(
        `insert into saldos_estrangeiros (moeda, valor_centavos, data, atualizado_em)
         values ($1,$2,$3,now())
         on conflict (moeda) do update set
           valor_centavos = excluded.valor_centavos,
           data = excluded.data,
           atualizado_em = now()`,
        [s.moeda, s.valorCentavos, s.data],
      )
    },
  }
}
```

- [ ] **Step 5: Pendurar em `AppPg`**

Em `mcp/app-pg.ts`, acrescente o import, o campo na interface e a construção. O arquivo fica assim (as três mudanças estão marcadas com `// NOVO`):

```ts
import type { Pool } from 'pg'
import type { Repositorios } from '../src/data/repositories.js'
import {
  criarProjectionService,
  type ProjectionService,
} from '../src/services/projection-service.js'
import { criarPaymentService, type PaymentService } from '../src/services/payment-service.js'
import { criarRepositoriosPg } from './dados/repositorios-pg.js'
import { criarAuditoria } from './dados/auditoria.js'
// NOVO
import {
  criarSaldosEstrangeirosPg,
  type SaldosEstrangeirosRepo,
} from './dados/saldos-estrangeiros-pg.js'

export interface AppPg {
  readonly repos: Repositorios
  // NOVO -- irmao de `repos`, e nao um campo dentro dele: `Repositorios` e
  // derivado da implementacao Dexie e nao pode ganhar campos.
  readonly saldosEstrangeiros: SaldosEstrangeirosRepo
  readonly projecao: ProjectionService
  readonly pagamento: PaymentService
  readonly auditoria: ReturnType<typeof criarAuditoria>
}

export function criarAppPg(pool: Pool): AppPg {
  const repos = criarRepositoriosPg(pool)

  return {
    repos,
    saldosEstrangeiros: criarSaldosEstrangeirosPg(pool), // NOVO
    projecao: criarProjectionService(repos),
    pagamento: criarPaymentService(repos),
    auditoria: criarAuditoria(pool),
  }
}
```

Preserve o comentário de cabeçalho existente do arquivo.

- [ ] **Step 6: Rodar o teste e ver passar**

```bash
npx vitest run mcp/dados/saldos-estrangeiros-pg.test.ts
```

Esperado: PASS, 5 testes.

- [ ] **Step 7: Typecheck**

```bash
npx tsc -p mcp/tsconfig.json
```

Esperado: sem saída.

- [ ] **Step 8: Commit**

```bash
git add mcp/dados/migracoes.ts mcp/dados/saldos-estrangeiros-pg.ts mcp/dados/saldos-estrangeiros-pg.test.ts mcp/app-pg.ts && git commit -m "Guarda saldos em moeda estrangeira fora de Repositorios"
```

---

### Task 3: `declarar_saldo_estrangeiro`

**Files:**
- Create: `mcp/tools/escrita/declarar-saldo-estrangeiro.ts`
- Test: `mcp/tools/escrita/declarar-saldo-estrangeiro.test.ts`

**Interfaces:**
- Consumes: `normalizarMoeda`, `formatarMoeda` de `mcp/cambio.ts` (Task 1); `AppPg.saldosEstrangeiros` (Task 2); `ErroDeUsuario` de `mcp/tools/erro-do-usuario.js`; `deEntradaUsuario` de `src/domain/money.js`.
- Produces:
  - `interface ArgsDeclararSaldoEstrangeiro { readonly moeda: string; readonly valor: string; readonly data?: string; readonly hoje: string }`
  - `interface ReciboSaldoEstrangeiro { readonly moeda: string; readonly valor: string; readonly valorCentavos: number; readonly data: string; readonly resumo: string; readonly avisos: readonly string[] }`
  - `declararSaldoEstrangeiro(app, args): Promise<ReciboSaldoEstrangeiro>`

**Nota de desenho — por que não é um `Recibo`:** `montarRecibo` exige um `TipoDeEscrita`, e `TipoDeEscrita` é a lista do que `desfazer` sabe reverter. Esta escrita é um upsert sem histórico: não há estado anterior para onde voltar, e um `desfazer` que apagasse a linha destruiria o saldo em vez de restaurá-lo. Devolver um `Recibo` colocaria a ferramenta numa promessa que ela não pode cumprir, então ela tem seu próprio tipo de retorno e diz nos avisos que a correção é declarar de novo.

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/escrita/declarar-saldo-estrangeiro.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'
import { declararSaldoEstrangeiro } from './declarar-saldo-estrangeiro.js'

let container: StartedPostgreSqlContainer
let pool: Pool
let app: AppPg

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  pool = criarPool(container.getConnectionUri())
  await aplicarMigracoes(pool)
  app = criarAppPg(pool)
}, 120_000)

afterAll(async () => {
  await pool.end()
  await container.stop()
})

beforeEach(async () => {
  await pool.query('delete from saldos_estrangeiros')
})

describe('declararSaldoEstrangeiro', () => {
  it('grava e devolve o valor formatado na moeda de origem', async () => {
    const r = await declararSaldoEstrangeiro(app, {
      moeda: 'USD',
      valor: '5000',
      hoje: '2026-08-30',
    })

    expect(r.moeda).toBe('USD')
    expect(r.valorCentavos).toBe(500_000)
    expect(r.data).toBe('2026-08-30')
    expect(r.valor).toMatch(/US\$\s?5\.000,00/u)

    expect(await app.saldosEstrangeiros.listar()).toEqual([
      { moeda: 'USD', valorCentavos: 500_000, data: '2026-08-30' },
    ])
  })

  it('normaliza a moeda para maiusculas', async () => {
    const r = await declararSaldoEstrangeiro(app, {
      moeda: 'usd',
      valor: '5000',
      hoje: '2026-08-30',
    })

    expect(r.moeda).toBe('USD')
    expect((await app.saldosEstrangeiros.listar())[0]?.moeda).toBe('USD')
  })

  it('usa a data informada em vez de hoje', async () => {
    const r = await declararSaldoEstrangeiro(app, {
      moeda: 'USD',
      valor: '5000',
      data: '2026-08-15',
      hoje: '2026-08-30',
    })

    expect(r.data).toBe('2026-08-15')
  })

  it('aceita as formas em que a pessoa fala o valor', async () => {
    for (const [texto, esperado] of [
      ['80', 8000],
      ['80,00', 8000],
      ['1.234,56', 123456],
      ['1234.56', 123456],
    ] as const) {
      await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: texto, hoje: '2026-08-30' })
      expect((await app.saldosEstrangeiros.listar())[0]?.valorCentavos).toBe(esperado)
    }
  })

  it('declarar de novo substitui', async () => {
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: '2026-08-30' })
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '6200', hoje: '2026-08-30' })

    expect(await app.saldosEstrangeiros.listar()).toEqual([
      { moeda: 'USD', valorCentavos: 620_000, data: '2026-08-30' },
    ])
  })

  it('avisa que nao ha desfazer e que o valor nao entra na projecao', async () => {
    const r = await declararSaldoEstrangeiro(app, {
      moeda: 'USD',
      valor: '5000',
      hoje: '2026-08-30',
    })

    expect(r.avisos.join(' ')).toMatch(/desfazer/iu)
    expect(r.avisos.join(' ')).toMatch(/convert/iu)
  })

  it('recusa moeda mal formada sem gravar', async () => {
    await expect(
      declararSaldoEstrangeiro(app, { moeda: 'dolar', valor: '5000', hoje: '2026-08-30' }),
    ).rejects.toThrow(ErroDeUsuario)

    expect(await app.saldosEstrangeiros.listar()).toEqual([])
  })

  it('recusa valor ilegivel sem gravar', async () => {
    await expect(
      declararSaldoEstrangeiro(app, { moeda: 'USD', valor: 'muito', hoje: '2026-08-30' }),
    ).rejects.toThrow(ErroDeUsuario)

    expect(await app.saldosEstrangeiros.listar()).toEqual([])
  })

  // Uma reserva em moeda estrangeira negativa nao tem significado -- ao
  // contrario da ancora em reais, que pode estar no vermelho.
  it('recusa valor negativo sem gravar', async () => {
    await expect(
      declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '-100', hoje: '2026-08-30' }),
    ).rejects.toThrow(ErroDeUsuario)

    expect(await app.saldosEstrangeiros.listar()).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
npx vitest run mcp/tools/escrita/declarar-saldo-estrangeiro.test.ts
```

Esperado: FAIL — `Failed to resolve import "./declarar-saldo-estrangeiro.js"`.

- [ ] **Step 3: Escrever a ferramenta**

Crie `mcp/tools/escrita/declarar-saldo-estrangeiro.ts`:

```ts
/**
 * Declara quanto ha em uma moeda estrangeira.
 *
 * Este dinheiro NAO entra na projecao do mes. Ele so vira capacidade de pagar
 * contas quando convertido, a uma cotacao que ainda nao aconteceu -- somar na
 * ancora faria o app afirmar que o mes fecha com dinheiro indisponivel.
 */

import { deEntradaUsuario } from '../../../src/domain/money.js'
import type { AppPg } from '../../app-pg.js'
import { formatarMoeda, normalizarMoeda } from '../../cambio.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'

export interface ArgsDeclararSaldoEstrangeiro {
  readonly moeda: string
  readonly valor: string
  readonly data?: string
  readonly hoje: string
}

export interface ReciboSaldoEstrangeiro {
  readonly moeda: string
  readonly valor: string
  readonly valorCentavos: number
  readonly data: string
  readonly resumo: string
  readonly avisos: readonly string[]
}

export async function declararSaldoEstrangeiro(
  app: AppPg,
  args: ArgsDeclararSaldoEstrangeiro,
): Promise<ReciboSaldoEstrangeiro> {
  const moeda = normalizarMoeda(args.moeda)
  if (moeda === null) {
    throw new ErroDeUsuario(
      `Nao reconheci a moeda "${args.moeda}". Use o codigo de tres letras, como USD ou EUR.`,
    )
  }

  const centavos = deEntradaUsuario(args.valor)
  if (centavos === null) {
    throw new ErroDeUsuario(
      `Nao entendi o valor "${args.valor}". Use algo como 5000 ou 5.000,00.`,
    )
  }

  // Diferente da ancora em reais, que pode ser negativa: uma reserva em moeda
  // estrangeira negativa nao tem significado.
  if (centavos < 0) {
    throw new ErroDeUsuario(
      `O saldo em ${moeda} nao pode ser negativo. Recebi "${args.valor}".`,
    )
  }

  const data = args.data ?? args.hoje

  await app.saldosEstrangeiros.salvar({ moeda, valorCentavos: centavos, data })

  const valor = formatarMoeda(centavos, moeda)

  return {
    moeda,
    valor,
    valorCentavos: centavos,
    data,
    resumo: `Saldo em ${moeda} na data ${data} declarado como ${valor}.`,
    avisos: [
      'Este valor não entra na projeção do mês: ele só paga contas depois de convertido em reais.',
      'Não há desfazer para esta escrita. Para corrigir, declare o saldo de novo — o valor anterior é substituído.',
    ],
  }
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
npx vitest run mcp/tools/escrita/declarar-saldo-estrangeiro.test.ts
```

Esperado: PASS, 9 testes.

- [ ] **Step 5: Typecheck**

```bash
npx tsc -p mcp/tsconfig.json
```

Esperado: sem saída.

- [ ] **Step 6: Commit**

```bash
git add mcp/tools/escrita/declarar-saldo-estrangeiro.ts mcp/tools/escrita/declarar-saldo-estrangeiro.test.ts && git commit -m "Declara o saldo em moeda estrangeira"
```

---

### Task 4: `patrimonio`

**Files:**
- Create: `mcp/tools/patrimonio.ts`
- Test: `mcp/tools/patrimonio.test.ts`

**Interfaces:**
- Consumes: `converter`, `formatarMoeda`, `normalizarMoeda`, `paraDezMilesimos` de `mcp/cambio.ts` (Task 1); `SaldosEstrangeirosRepo` de `mcp/dados/saldos-estrangeiros-pg.js` (Task 2); `declararSaldoEstrangeiro` (Task 3, só nos testes); `dinheiro`, `AVISO_SALDO_RELATIVO`, `type Dinheiro` de `mcp/formatacao.js`; `competenciaDe` de `src/domain/calendar.js`; `type ProjectionService` de `src/services/projection-service.js`.
- Produces:
  - `interface LinhaEmMoeda { readonly moeda: string; readonly valor: string; readonly cotacao: string; readonly equivalenteEmReais: Dinheiro }`
  - `interface Patrimonio { ... }` (abaixo)
  - `patrimonio(app, args): Promise<Patrimonio>`
  - `const AVISO_CONVERSAO: string`

**Nota de desenho — o parâmetro `app` é estreitado.** A ferramenta recebe `{ readonly projecao: ProjectionService; readonly saldosEstrangeiros: SaldosEstrangeirosRepo }`, não `AppPg`. É o mesmo estreitamento estrutural que `situacao_do_mes` usa: declara exatamente o que consome, e um `AppPg` completo satisfaz o tipo sem conversão.

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/patrimonio.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../dados/conexao.js'
import { aplicarMigracoes } from '../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../app-pg.js'
import { ErroDeUsuario } from './erro-do-usuario.js'
import { situacaoDoMes } from './situacao-do-mes.js'
import { declararSaldo } from './escrita/declarar-saldo.js'
import { declararSaldoEstrangeiro } from './escrita/declarar-saldo-estrangeiro.js'
import { cadastrarRecorrente } from './escrita/cadastrar-recorrente.js'
import { patrimonio } from './patrimonio.js'

const HOJE = '2026-08-30'

let container: StartedPostgreSqlContainer
let pool: Pool
let app: AppPg

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  pool = criarPool(container.getConnectionUri())
  await aplicarMigracoes(pool)
  app = criarAppPg(pool)
}, 120_000)

afterAll(async () => {
  await pool.end()
  await container.stop()
})

beforeEach(async () => {
  for (const t of ['regras', 'ancoras', 'ocorrencias', 'parcelamentos', 'saldos_estrangeiros']) {
    await pool.query(`delete from ${t}`)
  }
})

describe('patrimonio', () => {
  it('sem moeda estrangeira, devolve o mesmo saldo que situacao_do_mes', async () => {
    await declararSaldo(app, { valor: '10000,00', data: HOJE, hoje: HOJE })

    const p = await patrimonio(app, { hoje: HOJE })
    const s = await situacaoDoMes(app, { hoje: HOJE })

    expect(p.emReais.valorCentavos).toBe(s.saldoNaReferencia.valorCentavos)
    expect(p.total.valorCentavos).toBe(s.saldoNaReferencia.valorCentavos)
    expect(p.emMoedaEstrangeira).toEqual([])
    expect(p.avisoConversao).toBeNull()
  })

  // O saldo vem da PROJECAO, nao da ancora crua: a ancora e o que foi
  // declarado numa data, e entre ela e hoje ha movimentos. `dataDaReferencia`
  // e o que prova de onde o numero saiu -- se viesse da ancora, seria a data
  // da ancora e nao a de hoje.
  it('parte do saldo projetado de hoje, nao do valor cru da ancora', async () => {
    await declararSaldo(app, { valor: '10000,00', data: '2026-08-01', hoje: HOJE })
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-08',
    })

    const p = await patrimonio(app, { hoje: HOJE })
    const s = await situacaoDoMes(app, { hoje: HOJE })

    expect(p.emReais.valorCentavos).toBe(s.saldoNaReferencia.valorCentavos)
    expect(p.dataDaReferencia).toBe(s.dataDaReferencia)
    expect(p.dataDaReferencia).not.toBe('2026-08-01')
  })

  it('soma o saldo em dolar pela cotacao informada e mostra qual usou', async () => {
    await declararSaldo(app, { valor: '10000,00', data: HOJE, hoje: HOJE })
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: HOJE })

    const p = await patrimonio(app, { cotacoes: { USD: '5,4321' }, hoje: HOJE })

    expect(p.emMoedaEstrangeira).toHaveLength(1)
    const [linha] = p.emMoedaEstrangeira
    expect(linha?.moeda).toBe('USD')
    expect(linha?.valor).toMatch(/US\$\s?5\.000,00/u)
    expect(linha?.cotacao).toBe('5,4321')
    // US$ 5.000,00 a 5,4321 = R$ 27.160,50
    expect(linha?.equivalenteEmReais.valorCentavos).toBe(2_716_050)

    expect(p.emReais.valorCentavos).toBe(1_000_000)
    expect(p.total.valorCentavos).toBe(1_000_000 + 2_716_050)
    expect(p.avisoConversao).not.toBeNull()
  })

  it('aceita a moeda da cotacao em minusculas', async () => {
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: HOJE })

    const p = await patrimonio(app, { cotacoes: { usd: '5,4321' }, hoje: HOJE })

    expect(p.emMoedaEstrangeira[0]?.equivalenteEmReais.valorCentavos).toBe(2_716_050)
  })

  it('ordena as linhas por codigo de moeda', async () => {
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: HOJE })
    await declararSaldoEstrangeiro(app, { moeda: 'EUR', valor: '1000', hoje: HOJE })

    const p = await patrimonio(app, { cotacoes: { USD: '5,40', EUR: '6,20' }, hoje: HOJE })

    expect(p.emMoedaEstrangeira.map((l) => l.moeda)).toEqual(['EUR', 'USD'])
  })

  // Um total que descarta uma moeda em silencio e um numero errado com cara
  // de certo.
  it('falha nomeando a moeda quando falta cotacao', async () => {
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: HOJE })

    await expect(patrimonio(app, { hoje: HOJE })).rejects.toThrow(ErroDeUsuario)
    await expect(patrimonio(app, { hoje: HOJE })).rejects.toThrow(/USD/u)
  })

  it('falha quando a cotacao informada e ilegivel', async () => {
    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: HOJE })

    await expect(
      patrimonio(app, { cotacoes: { USD: 'cinco e pouco' }, hoje: HOJE }),
    ).rejects.toThrow(ErroDeUsuario)
  })

  it('ignora cotacao de moeda sem saldo', async () => {
    await declararSaldo(app, { valor: '10000,00', data: HOJE, hoje: HOJE })

    const p = await patrimonio(app, { cotacoes: { JPY: '0,0350' }, hoje: HOJE })

    expect(p.emMoedaEstrangeira).toEqual([])
    expect(p.total.valorCentavos).toBe(1_000_000)
  })

  it('sem ancora, marca o total como relativo e avisa', async () => {
    const p = await patrimonio(app, { hoje: HOJE })

    expect(p.saldoRelativo).toBe(true)
    expect(p.avisoSaldoRelativo).not.toBeNull()
  })

  // A garantia que sustenta a decisao central do desenho, verificada em vez
  // de assumida: o dolar nao pode aparecer na projecao do mes.
  it('nao altera situacao_do_mes', async () => {
    await declararSaldo(app, { valor: '10000,00', data: HOJE, hoje: HOJE })
    const antes = await situacaoDoMes(app, { hoje: HOJE })

    await declararSaldoEstrangeiro(app, { moeda: 'USD', valor: '5000', hoje: HOJE })
    const depois = await situacaoDoMes(app, { hoje: HOJE })

    expect(depois).toEqual(antes)
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
npx vitest run mcp/tools/patrimonio.test.ts
```

Esperado: FAIL — `Failed to resolve import "./patrimonio.js"`.

- [ ] **Step 3: Escrever a ferramenta**

Crie `mcp/tools/patrimonio.ts`:

```ts
/**
 * "Quanto eu tenho no total, somando tudo?"
 *
 * Soma o saldo em reais com os saldos em moeda estrangeira, convertidos pela
 * cotacao que o assistente informa. E a unica ferramenta que ve as duas
 * coisas juntas -- a projecao continua sem saber que a moeda estrangeira
 * existe.
 */

import { competenciaDe } from '../../src/domain/calendar.js'
import type { ProjectionService } from '../../src/services/projection-service.js'
import { converter, formatarMoeda, normalizarMoeda, paraDezMilesimos } from '../cambio.js'
import type { SaldosEstrangeirosRepo } from '../dados/saldos-estrangeiros-pg.js'
import { AVISO_SALDO_RELATIVO, dinheiro, type Dinheiro } from '../formatacao.js'
import { ErroDeUsuario } from './erro-do-usuario.js'

/**
 * Texto pronto para o assistente repetir sempre que houver moeda
 * estrangeira no total.
 *
 * Sem ele, o assistente soma tudo e responde "voce tem R$ X" sobre dinheiro
 * que ainda precisa passar por uma conversao a uma cotacao que nao aconteceu.
 */
export const AVISO_CONVERSAO =
  'O valor em moeda estrangeira ainda não está disponível para pagar contas: ' +
  'ele só entra no fluxo depois de convertido em reais. O equivalente mostrado ' +
  'é uma estimativa pela cotação informada, não um valor garantido.'

export interface LinhaEmMoeda {
  readonly moeda: string
  readonly valor: string
  /** Como veio nos argumentos, para o usuario conferir. */
  readonly cotacao: string
  readonly equivalenteEmReais: Dinheiro
}

export interface Patrimonio {
  readonly emReais: Dinheiro
  readonly dataDaReferencia: string | null
  readonly emMoedaEstrangeira: readonly LinhaEmMoeda[]
  readonly total: Dinheiro
  readonly saldoRelativo: boolean
  readonly avisoSaldoRelativo: string | null
  readonly avisoConversao: string | null
}

export async function patrimonio(
  app: {
    readonly projecao: ProjectionService
    readonly saldosEstrangeiros: SaldosEstrangeirosRepo
  },
  args: { cotacoes?: Record<string, string>; hoje: string },
): Promise<Patrimonio> {
  // O saldo em reais vem da PROJECAO, nao da ancora crua: a ancora e o que
  // foi declarado numa data, e desde entao houve pagamentos e recebimentos.
  // Este e o mesmo numero que `situacao_do_mes` mostra.
  const m = await app.projecao.projetarMes(competenciaDe(args.hoje), args.hoje)

  const saldos = await app.saldosEstrangeiros.listar()

  // Normaliza as chaves para maiusculas: o assistente pode mandar "usd".
  const cotacoes = new Map<string, string>()
  for (const [chave, valor] of Object.entries(args.cotacoes ?? {})) {
    const moeda = normalizarMoeda(chave)
    if (moeda !== null) cotacoes.set(moeda, valor)
  }

  // Uma moeda com saldo e sem cotacao e erro, nao uma linha omitida: um total
  // que descarta uma moeda em silencio e um numero errado com cara de certo.
  const semCotacao = saldos.filter((s) => !cotacoes.has(s.moeda)).map((s) => s.moeda)
  if (semCotacao.length > 0) {
    throw new ErroDeUsuario(
      `Falta a cotacao de ${semCotacao.join(', ')} para somar o patrimonio. ` +
        'Busque a cotacao do dia e informe em `cotacoes`, por exemplo ' +
        '{ "USD": "5,4321" }.',
    )
  }

  const emMoedaEstrangeira: LinhaEmMoeda[] = []
  let somaEstrangeira = 0

  // `saldos` ja vem ordenado por moeda do repositorio.
  for (const s of saldos) {
    const texto = cotacoes.get(s.moeda) as string
    const cotacao = paraDezMilesimos(texto)
    if (cotacao === null) {
      throw new ErroDeUsuario(
        `Nao entendi a cotacao "${texto}" para ${s.moeda}. ` +
          'Use algo como 5,4321, com ate quatro casas decimais.',
      )
    }

    const equivalente = converter(s.valorCentavos, cotacao)
    somaEstrangeira += equivalente

    emMoedaEstrangeira.push({
      moeda: s.moeda,
      valor: formatarMoeda(s.valorCentavos, s.moeda),
      cotacao: texto,
      equivalenteEmReais: dinheiro(equivalente),
    })
  }

  return {
    emReais: dinheiro(m.saldoNaReferenciaCentavos),
    dataDaReferencia: m.dataDaReferencia,
    emMoedaEstrangeira,
    total: dinheiro(m.saldoNaReferenciaCentavos + somaEstrangeira),
    saldoRelativo: m.saldoRelativo,
    avisoSaldoRelativo: m.saldoRelativo ? AVISO_SALDO_RELATIVO : null,
    avisoConversao: emMoedaEstrangeira.length > 0 ? AVISO_CONVERSAO : null,
  }
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
npx vitest run mcp/tools/patrimonio.test.ts
```

Esperado: PASS, 10 testes.

Se alguma asserção falhar, **não a altere para acomodar o resultado** — descubra primeiro qual é o número correto e por quê. As asserções contra `situacaoDoMes` são derivadas do mesmo projetor de propósito: se divergirem, o defeito está em `patrimonio`, não no valor esperado.

- [ ] **Step 5: Typecheck**

```bash
npx tsc -p mcp/tsconfig.json
```

Esperado: sem saída.

- [ ] **Step 6: Commit**

```bash
git add mcp/tools/patrimonio.ts mcp/tools/patrimonio.test.ts && git commit -m "Soma o patrimonio em reais e moedas estrangeiras"
```

---

### Task 5: Registrar as duas ferramentas no servidor

**Files:**
- Modify: `mcp/servidor-http.ts`
- Test: `mcp/servidor-http.test.ts`

**Interfaces:**
- Consumes: `declararSaldoEstrangeiro` (Task 3), `patrimonio` (Task 4).
- Produces: as ferramentas `declarar_saldo_estrangeiro` e `patrimonio` sobre o protocolo MCP. O servidor passa de 12 para 14 ferramentas.

- [ ] **Step 1: Escrever o teste que falha**

Em `mcp/servidor-http.test.ts` existe o helper `chamarFerramenta(nome, args)`, que sobe o servidor, faz `initialize` e depois `tools/call`, devolvendo `{ content: { type: string; text: string }[]; isError?: boolean }`. Um erro **não** rejeita a promessa: volta como `isError: true` com o texto do erro em `content[0].text`. As asserções abaixo seguem esse contrato.

Primeiro, acrescente `'saldos_estrangeiros'` à lista de tabelas do `beforeEach` dentro do `describe('tools/call sobre as onze ferramentas financeiras', ...)`:

```ts
      for (const t of [
        'regras',
        'ancoras',
        'ocorrencias',
        'parcelamentos',
        'saldos_estrangeiros',
      ]) {
```

Depois acrescente estes testes dentro do mesmo `describe`, junto dos outros:

```ts
    it('declarar_saldo_estrangeiro grava e devolve o valor na moeda de origem', async () => {
      const r = await chamarFerramenta('declarar_saldo_estrangeiro', {
        moeda: 'usd',
        valor: '5000',
        hoje: '2026-09-15',
      })

      expect(r.isError).not.toBe(true)
      const recibo = JSON.parse(r.content[0]?.text ?? '{}') as {
        moeda: string
        valorCentavos: number
        data: string
      }
      expect(recibo.moeda).toBe('USD')
      expect(recibo.valorCentavos).toBe(500_000)
      expect(recibo.data).toBe('2026-09-15')
    })

    // O `cotacoes` atravessa o schema zod como record de strings. Sem um teste
    // sobre o protocolo, um schema errado so apareceria em producao: a
    // FIACAO nao e exercitada chamando a funcao da ferramenta diretamente.
    it('patrimonio soma o saldo em dolar pela cotacao informada', async () => {
      await chamarFerramenta('declarar_saldo', {
        valor: '10000,00',
        data: '2026-09-15',
        hoje: '2026-09-15',
      })
      await chamarFerramenta('declarar_saldo_estrangeiro', {
        moeda: 'USD',
        valor: '5000',
        hoje: '2026-09-15',
      })

      const r = await chamarFerramenta('patrimonio', {
        cotacoes: { USD: '5,4321' },
        hoje: '2026-09-15',
      })

      expect(r.isError).not.toBe(true)
      const p = JSON.parse(r.content[0]?.text ?? '{}') as {
        emReais: { valorCentavos: number }
        total: { valorCentavos: number }
        emMoedaEstrangeira: { moeda: string; cotacao: string }[]
        avisoConversao: string | null
      }
      expect(p.emReais.valorCentavos).toBe(1_000_000)
      // US$ 5.000,00 a 5,4321 = R$ 27.160,50
      expect(p.total.valorCentavos).toBe(1_000_000 + 2_716_050)
      expect(p.emMoedaEstrangeira[0]?.moeda).toBe('USD')
      expect(p.emMoedaEstrangeira[0]?.cotacao).toBe('5,4321')
      expect(p.avisoConversao).not.toBeNull()
    })

    it('patrimonio recusa, nomeando a moeda, quando falta a cotacao', async () => {
      await chamarFerramenta('declarar_saldo_estrangeiro', {
        moeda: 'USD',
        valor: '5000',
        hoje: '2026-09-15',
      })

      const r = await chamarFerramenta('patrimonio', { hoje: '2026-09-15' })

      expect(r.isError).toBe(true)
      expect(r.content[0]?.text).toContain('USD')
    })
```

Atualize também o texto do `describe` e o comentário de bloco acima de `chamarFerramenta`, que falam em "onze ferramentas financeiras" — passam a ser treze (mais `ping`, catorze no total).

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
npx vitest run mcp/servidor-http.test.ts
```

Esperado: FAIL — a ferramenta `declarar_saldo_estrangeiro` não existe.

- [ ] **Step 3: Registrar as ferramentas**

Em `mcp/servidor-http.ts`, acrescente os imports junto aos das outras ferramentas:

```ts
import { declararSaldoEstrangeiro } from './tools/escrita/declarar-saldo-estrangeiro.js'
import { patrimonio } from './tools/patrimonio.js'
```

E registre as duas logo depois do bloco de `declarar_saldo`:

```ts
  server.registerTool(
    'declarar_saldo_estrangeiro',
    {
      title: 'Declarar saldo em moeda estrangeira',
      description:
        'Informa quanto ha em uma moeda estrangeira, como dolares parados em ' +
        'conta internacional. Este valor NAO entra na projecao do mes: ele so ' +
        'paga contas depois de convertido em reais. Declarar de novo substitui ' +
        'o valor anterior, e nao ha desfazer.',
      inputSchema: {
        moeda: z.string().describe('Codigo de tres letras, como USD ou EUR'),
        valor: z
          .string()
          .describe('Saldo na moeda de origem, como a pessoa fala, nunca em centavos'),
        data: DATA.optional().describe('Data do saldo. Padrao: hoje'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ moeda, valor, data, hoje }) =>
      executarFerramenta(() =>
        declararSaldoEstrangeiro(app, {
          moeda,
          valor,
          ...(data === undefined ? {} : { data }),
          hoje: hoje ?? hojeDoSistema(),
        }),
      ),
  )

  server.registerTool(
    'patrimonio',
    {
      title: 'Patrimonio total',
      description:
        'Responde "quanto eu tenho no total?" -- o saldo em reais mais os ' +
        'saldos em moeda estrangeira convertidos. Para "como estou este mes?" ' +
        'use situacao_do_mes, que so olha reais e o fluxo do mes. ' +
        'ANTES de chamar, busque a cotacao do dia de cada moeda com saldo e ' +
        'informe em `cotacoes`; diga ao usuario qual cotacao usou. Se nao ' +
        'conseguir uma cotacao confiavel, pergunte -- nunca estime de memoria.',
      inputSchema: {
        cotacoes: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Cotacao em reais de cada moeda, como texto. Exemplo: ' +
              '{ "USD": "5,4321" }. Ate quatro casas decimais.',
          ),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ cotacoes, hoje }) =>
      executarFerramenta(() =>
        patrimonio(app, {
          ...(cotacoes === undefined ? {} : { cotacoes }),
          hoje: hoje ?? hojeDoSistema(),
        }),
      ),
  )
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
npx vitest run mcp/servidor-http.test.ts
```

Esperado: PASS.

- [ ] **Step 5: Rodar a suíte inteira de `mcp/` e o typecheck**

```bash
npx vitest run mcp/ && npx tsc -p mcp/tsconfig.json
```

Esperado: todos os arquivos passam. Nota: a suíte de `mcp/` às vezes falha no teardown quando vários contêineres Postgres competem para parar — isso não é uma asserção falhando e não é regressão deste plano. `src/ui/screens/flows.test.tsx` falha por deriva da data do sistema e é uma falha pré-existente em `main`, fora do escopo.

- [ ] **Step 6: Atualizar o README do servidor remoto**

Em `mcp/README-remoto.md`, a lista de ferramentas passa de doze para catorze. Acrescente as duas linhas, no mesmo formato das existentes:

```markdown
- `declarar_saldo_estrangeiro` — quanto há em uma moeda estrangeira (não entra na projeção)
- `patrimonio` — quanto há no total, reais mais moedas estrangeiras convertidas
```

Se o README declarar o número de ferramentas em algum ponto do texto corrido, atualize-o também.

- [ ] **Step 7: Commit**

```bash
git add mcp/servidor-http.ts mcp/servidor-http.test.ts mcp/README-remoto.md && git commit -m "Registra declarar_saldo_estrangeiro e patrimonio no servidor"
```

---

## Depois do plano

O deploy no Railway não é automático: o webhook do GitHub não está autorizado, então `git push` sozinho não redeploya. O deploy precisa ser disparado via `connect_service_source` na API do Railway, como nos projetos anteriores.

Registrar a execução em `aidlc-docs/audit.md`, em modo append, conforme o `.claude/CLAUDE.md` do repositório.
