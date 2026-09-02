# Corrigir contas que já existem — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Três ferramentas MCP para corrigir uma conta existente — ajustar valor ou vencimento, pular o mês, e registrar que só parte entrou — em vez de apagar e recriar.

**Architecture:** As cinco operações já existem em `src/services/payment-service.ts`, prontas e testadas; nenhuma depende do Dexie. O trabalho é expô-las: um helper que localiza a ocorrência pela chave de sobreposição (hoje inline em `marcar-pago.ts`), três ferramentas finas sobre ele, e o registro no servidor.

**Tech Stack:** TypeScript (ESM, `.js` nos imports), Postgres via `pg`, Express + `@modelcontextprotocol/sdk`, zod, vitest + `@testcontainers/postgresql`.

## Global Constraints

- **`src/` não é tocado neste projeto.** Todas as operações já existem lá; este plano só as consome. Se algo em `src/` parecer precisar de mudança, pare e reporte — não é o escopo.
- Dinheiro é sempre inteiro em centavos (RN-01). Valores entram como **texto** e passam por `deEntradaUsuario`, nunca como número.
- Datas são `text` `AAAA-MM-DD` (RN-04).
- ESM imports carregam `.js`, inclusive para arquivos `.ts` do projeto.
- Comentários e mensagens de erro em português **sem** acentuação, como o resto de `mcp/`. Strings do recibo (`resumo`, `avisos`) com acentuação normal.
- **`TipoDeEscrita` não ganha valores novos.** Nenhuma das três entra no `desfazer`: reverter exigiria guardar o valor anterior, que não guardamos. Cada uma devolve `ReciboDeAjuste`, com o antes e o depois.
- Typecheck: `npx tsc --noEmit` **e** `npx tsc -p mcp/tsconfig.json`. Vitest não faz checagem de tipos.

**Fatos já verificados, não re-investigue:**
- `payment-service` expõe `ajustarValorPrevisto(o, valor)`, `adiarVencimento(o, data)`, `ignorarNoMes(o)`, `reativarNoMes(o)` e `registrarParteAntecipada(o, parte)`. Todas recebem `OcorrenciaResolvida` e passam por `aplicar`, que materializa a ocorrência se ela ainda for virtual (RN-51, RN-52).
- `ignorarNoMes` também limpa `dataPagamento` e `valorPagoCentavos`.
- `registrarParteAntecipada` já valida que a parte é positiva e menor que o previsto, e **sobrescreve** `observacao`.

---

### Task 1: `localizarConta` e o tipo de recibo

Extrai a busca pela chave, hoje inline em `marcar-pago.ts`, para um módulo que as três ferramentas novas vão usar. Sem isso a mesma projeção-e-busca apareceria quatro vezes.

**Files:**
- Create: `mcp/tools/escrita/localizar-conta.ts`
- Modify: `mcp/tools/escrita/marcar-pago.ts` (passa a usar o helper)
- Modify: `mcp/recibo.ts` (acrescenta `ReciboDeAjuste`)
- Test: `mcp/tools/escrita/localizar-conta.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `localizarConta(app: AppPg, chave: string, hoje: string): Promise<OcorrenciaResolvida>`
  - `interface ReciboDeAjuste { chave, nome, antes, depois, resumo, avisos }`

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/escrita/localizar-conta.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'
import { situacaoDoMes } from '../situacao-do-mes.js'
import { cadastrarRecorrente } from './cadastrar-recorrente.js'
import { marcarPago } from './marcar-pago.js'
import { localizarConta } from './localizar-conta.js'

const HOJE = '2026-09-15'

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
  for (const t of ['regras', 'ancoras', 'ocorrencias', 'parcelamentos']) {
    await pool.query(`delete from ${t}`)
  }
})

async function chaveDoAluguel(): Promise<string> {
  await cadastrarRecorrente(app, {
    tipo: 'saida',
    nome: 'Aluguel',
    valor: '1800,00',
    diaDoMes: 10,
    vigenteDe: '2026-09',
  })
  const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
  return m.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave
}

describe('localizarConta', () => {
  it('acha uma conta que ainda e virtual', async () => {
    const chave = await chaveDoAluguel()

    const o = await localizarConta(app, chave, HOJE)

    expect(o.nome).toBe('Aluguel')
    // Virtual: nao existe linha no banco ate alguem interagir.
    expect(o.idReal).toBeNull()
  })

  // A competencia vem da PROPRIA chave, nao de `hoje`. Sem isso, mexer numa
  // conta de outro mes projeta o mes errado e nunca encontra.
  it('acha uma conta de mes diferente do de hoje', async () => {
    const chave = await chaveDoAluguel()

    const o = await localizarConta(app, chave, '2026-10-20')

    expect(o.nome).toBe('Aluguel')
    expect(o.competencia).toBe('2026-09')
  })

  // `ignorados` precisa entrar na busca: reativar uma conta ignorada exige
  // encontra-la primeiro, e ela nao esta em nenhuma das outras listas.
  it('acha uma conta ja paga', async () => {
    const chave = await chaveDoAluguel()
    await marcarPago(app, { chave, hoje: HOJE })

    const o = await localizarConta(app, chave, HOJE)

    expect(o.dataPagamento).not.toBeNull()
  })

  it('recusa uma chave que nao existe, nomeando a competencia', async () => {
    await expect(
      localizarConta(app, 'regra:nao-existe:2026-09', HOJE),
    ).rejects.toThrow(ErroDeUsuario)
    await expect(
      localizarConta(app, 'regra:nao-existe:2026-09', HOJE),
    ).rejects.toThrow(/2026-09/u)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run mcp/tools/escrita/localizar-conta.test.ts
```

Esperado: FAIL — `Failed to resolve import "./localizar-conta.js"`.

- [ ] **Step 3: Escrever o helper**

Crie `mcp/tools/escrita/localizar-conta.ts`:

```ts
/**
 * Localiza uma conta pela chave de sobreposicao.
 *
 * A maior parte das contas NAO existe no banco: as geradas por regra sao
 * virtuais ate alguem interagir. Por isso as ferramentas de escrita recebem a
 * CHAVE, que a consulta devolve em cada item, e nao um identificador de linha.
 *
 * A competencia vem da PROPRIA chave, nao de `hoje`: projetar o mes corrente
 * acha o mes ERRADO sempre que a chave e de outro mes -- corrigir em setembro
 * uma conta de outubro, por exemplo.
 *
 * `ignorados` entra na busca porque reativar uma conta ignorada exige
 * encontra-la, e ela nao aparece em nenhuma das outras listas.
 */

import type { OcorrenciaResolvida } from '../../../src/domain/types.js'
import type { AppPg } from '../../app-pg.js'
import { competenciaDaChave } from '../competencia-da-chave.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'

export async function localizarConta(
  app: AppPg,
  chave: string,
  hoje: string,
): Promise<OcorrenciaResolvida> {
  const competencia = competenciaDaChave(chave)
  const mes = await app.projecao.projetarMes(competencia, hoje)

  const alvo = [
    ...mes.faltaPagar,
    ...mes.aindaEntra,
    ...mes.jaResolvido,
    ...mes.ignorados,
  ].find((o) => o.chave === chave)

  if (alvo === undefined) {
    throw new ErroDeUsuario(
      `Nao encontrei nenhuma ocorrencia com a chave informada em ${competencia}. ` +
        'Consulte a situacao do mes e use a chave que vier na resposta.',
    )
  }

  return alvo
}
```

- [ ] **Step 4: `marcar-pago.ts` passa a usar o helper**

Em `mcp/tools/escrita/marcar-pago.ts`, substitua o bloco que projeta e busca — desde `const competencia = competenciaDaChave(args.chave)` até o `throw new ErroDeUsuario` do `alvo === undefined`, inclusive — por:

```ts
  const alvo = await localizarConta(app, args.chave, args.hoje)
```

Acrescente o import `import { localizarConta } from './localizar-conta.js'` e remova os imports que ficarem sem uso (`competenciaDaChave` e possivelmente `ErroDeUsuario`, se nenhuma outra guarda do arquivo o usar — confira antes de remover; há guardas de valor mais abaixo que provavelmente ainda o usam).

Mova para o cabeçalho de `localizar-conta.ts` os comentários que explicavam a busca — eles descrevem o helper agora. Deixe em `marcar-pago.ts` apenas o que é sobre pagamento.

- [ ] **Step 5: Acrescentar o tipo de recibo**

Ao fim de `mcp/recibo.ts`:

```ts
/**
 * O recibo de um ajuste em conta existente.
 *
 * Traz `antes` e `depois` porque e o que substitui o `desfazer`: reverter um
 * ajuste exigiria guardar o valor anterior, e nao guardamos. Em vez disso a
 * pessoa le o valor antigo e, se quiser, chama a ferramenta de novo com ele.
 *
 * Os dois sao texto ja formatado ("R$ 1.500,00", "2026-09-01", "ativa"):
 * quem le e uma pessoa, e o valor em centavos nao acrescenta nada aqui.
 */
export interface ReciboDeAjuste {
  readonly chave: string
  readonly nome: string
  readonly antes: string
  readonly depois: string
  readonly resumo: string
  readonly avisos: readonly string[]
}
```

- [ ] **Step 6: Rodar os testes afetados**

```bash
npx vitest run mcp/tools/escrita/localizar-conta.test.ts mcp/tools/escrita/escritas-ocorrencia.test.ts
```

Esperado: PASS. O segundo arquivo cobre `marcar_pago` e prova que a extração não mudou seu comportamento.

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit && npx tsc -p mcp/tsconfig.json
```

- [ ] **Step 8: Commit**

```bash
git add mcp/tools/escrita/localizar-conta.ts mcp/tools/escrita/localizar-conta.test.ts mcp/tools/escrita/marcar-pago.ts mcp/recibo.ts && git commit -m "Extrai a busca de conta pela chave de sobreposicao"
```

---

### Task 2: `ajustar_conta`

**Files:**
- Create: `mcp/tools/escrita/ajustar-conta.ts`
- Test: `mcp/tools/escrita/ajustar-conta.test.ts`

**Interfaces:**
- Consumes: `localizarConta`, `ReciboDeAjuste` (Task 1).
- Produces: `ajustarConta(app: AppPg, args: ArgsAjustarConta): Promise<ReciboDeAjuste>`, com `ArgsAjustarConta = { chave: string; valor?: string; vencimento?: string; hoje: string }`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/escrita/ajustar-conta.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'
import { situacaoDoMes } from '../situacao-do-mes.js'
import { cadastrarRecorrente } from './cadastrar-recorrente.js'
import { marcarPago } from './marcar-pago.js'
import { ajustarConta } from './ajustar-conta.js'

const HOJE = '2026-09-15'

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
  for (const t of ['regras', 'ancoras', 'ocorrencias', 'parcelamentos']) {
    await pool.query(`delete from ${t}`)
  }
})

async function aluguel() {
  await cadastrarRecorrente(app, {
    tipo: 'saida',
    nome: 'Aluguel',
    valor: '1800,00',
    diaDoMes: 10,
    vigenteDe: '2026-09',
  })
  const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
  return m.faltaPagar.find((i) => i.nome === 'Aluguel')!
}

async function itemNaProjecao(nome: string) {
  const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
  return [...m.faltaPagar, ...m.jaResolvido].find((i) => i.nome === nome)
}

describe('ajustarConta', () => {
  it('muda o valor e a projecao reflete', async () => {
    const a = await aluguel()

    const r = await ajustarConta(app, { chave: a.chave, valor: '2000,00', hoje: HOJE })

    expect(r.antes).toMatch(/R\$\s?1\.800,00/u)
    expect(r.depois).toMatch(/R\$\s?2\.000,00/u)
    expect((await itemNaProjecao('Aluguel'))?.valorCentavos).toBe(200_000)
  })

  it('muda o vencimento e o item se move de dia', async () => {
    const a = await aluguel()

    const r = await ajustarConta(app, {
      chave: a.chave,
      vencimento: '2026-09-25',
      hoje: HOJE,
    })

    expect(r.antes).toContain('2026-09-10')
    expect(r.depois).toContain('2026-09-25')
    expect((await itemNaProjecao('Aluguel'))?.dataVencimento).toBe('2026-09-25')
  })

  it('muda os dois de uma vez', async () => {
    const a = await aluguel()

    await ajustarConta(app, {
      chave: a.chave,
      valor: '2000,00',
      vencimento: '2026-09-25',
      hoje: HOJE,
    })

    const item = await itemNaProjecao('Aluguel')
    expect(item?.valorCentavos).toBe(200_000)
    expect(item?.dataVencimento).toBe('2026-09-25')
  })

  // Chamar sem nenhum campo e erro, nao uma operacao vazia bem-sucedida: o
  // recibo diria "ajustado" sem nada ter mudado.
  it('recusa quando nenhum campo vem, sem gravar', async () => {
    const a = await aluguel()

    await expect(ajustarConta(app, { chave: a.chave, hoje: HOJE })).rejects.toThrow(
      ErroDeUsuario,
    )
    expect(await app.repos.ocorrencias.listar()).toEqual([])
  })

  // RN-31: numa conta paga o valor PAGO prevalece, entao mexer no previsto
  // nao muda numero nenhum. Aceitar em silencio seria pior que recusar.
  it('recusa conta ja paga, nomeando marcar_pago, sem alterar', async () => {
    const a = await aluguel()
    await marcarPago(app, { chave: a.chave, valor: '1800,00', hoje: HOJE })

    await expect(
      ajustarConta(app, { chave: a.chave, valor: '2000,00', hoje: HOJE }),
    ).rejects.toThrow(/marcar_pago/u)

    const item = await itemNaProjecao('Aluguel')
    expect(item?.valorCentavos).toBe(180_000)
  })

  it('recusa mudar o vencimento de conta paga', async () => {
    const a = await aluguel()
    await marcarPago(app, { chave: a.chave, hoje: HOJE })

    await expect(
      ajustarConta(app, { chave: a.chave, vencimento: '2026-09-25', hoje: HOJE }),
    ).rejects.toThrow(/marcar_pago/u)
  })

  it('recusa valor ilegivel, sem gravar', async () => {
    const a = await aluguel()

    await expect(
      ajustarConta(app, { chave: a.chave, valor: 'dois mil', hoje: HOJE }),
    ).rejects.toThrow(ErroDeUsuario)
    expect(await app.repos.ocorrencias.listar()).toEqual([])
  })

  it('recusa valor zero ou negativo, sem gravar', async () => {
    const a = await aluguel()

    await expect(
      ajustarConta(app, { chave: a.chave, valor: '-100', hoje: HOJE }),
    ).rejects.toThrow(ErroDeUsuario)
    expect(await app.repos.ocorrencias.listar()).toEqual([])
  })

  // RN-51: a operacao e idempotente. Duas chamadas atualizam a mesma linha.
  it('chamada duas vezes nao cria duas linhas', async () => {
    const a = await aluguel()
    await ajustarConta(app, { chave: a.chave, valor: '2000,00', hoje: HOJE })
    await ajustarConta(app, { chave: a.chave, valor: '2100,00', hoje: HOJE })

    expect(await app.repos.ocorrencias.listar()).toHaveLength(1)
    expect((await itemNaProjecao('Aluguel'))?.valorCentavos).toBe(210_000)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run mcp/tools/escrita/ajustar-conta.test.ts
```

Esperado: FAIL — `Failed to resolve import "./ajustar-conta.js"`.

- [ ] **Step 3: Escrever a ferramenta**

Crie `mcp/tools/escrita/ajustar-conta.ts`:

```ts
/**
 * Corrige os dados de uma conta que ainda nao foi paga.
 *
 * Valor e vencimento sao a mesma pergunta -- "essa conta esta errada" -- e por
 * isso vivem numa ferramenta so. Separa-las obrigaria o assistente a escolher
 * entre duas ferramentas quase homonimas.
 *
 * Numa conta JA PAGA a operacao e recusada: o valor pago prevalece sobre o
 * previsto (RN-31), entao mexer no previsto nao mudaria numero nenhum, e a
 * data que importa passa a ser a do pagamento. Quem quer corrigir o que
 * pagou chama `marcar_pago` de novo -- ele e idempotente (RN-51) e atualiza o
 * mesmo registro.
 */

import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import type { AppPg } from '../../app-pg.js'
import type { ReciboDeAjuste } from '../../recibo.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'
import { localizarConta } from './localizar-conta.js'

export interface ArgsAjustarConta {
  readonly chave: string
  readonly valor?: string
  readonly vencimento?: string
  readonly hoje: string
}

export async function ajustarConta(
  app: AppPg,
  args: ArgsAjustarConta,
): Promise<ReciboDeAjuste> {
  if (args.valor === undefined && args.vencimento === undefined) {
    throw new ErroDeUsuario(
      'Informe o novo valor, o novo vencimento, ou os dois. ' +
        'Sem nenhum dos dois nao ha o que ajustar.',
    )
  }

  const alvo = await localizarConta(app, args.chave, args.hoje)

  if (alvo.dataPagamento !== null) {
    throw new ErroDeUsuario(
      `"${alvo.nome}" ja esta paga, e numa conta paga o valor pago prevalece ` +
        'sobre o previsto -- ajustar aqui nao mudaria o numero. Para corrigir ' +
        'o que foi pago, chame marcar_pago de novo com o valor certo.',
    )
  }

  const partes: string[] = []
  const antes: string[] = []
  const depois: string[] = []

  if (args.valor !== undefined) {
    const centavos = deEntradaUsuario(args.valor)
    if (centavos === null) {
      throw new ErroDeUsuario(
        `Nao entendi o valor "${args.valor}". Use algo como 2000 ou 2.000,00.`,
      )
    }
    if (centavos <= 0) {
      throw new ErroDeUsuario(
        `O valor previsto precisa ser positivo. Recebi "${args.valor}".`,
      )
    }

    antes.push(formatarBRL(alvo.valorPrevistoCentavos))
    depois.push(formatarBRL(centavos))
    partes.push('valor')
    await app.pagamento.ajustarValorPrevisto(alvo, centavos)
  }

  if (args.vencimento !== undefined) {
    antes.push(alvo.dataVencimento)
    depois.push(args.vencimento)
    partes.push('vencimento')
    // Relocaliza: o ajuste de valor acima pode ter materializado a ocorrencia,
    // e aplicar sobre a versao antiga sobrescreveria aquela mudanca.
    const atual = await localizarConta(app, args.chave, args.hoje)
    await app.pagamento.adiarVencimento(atual, args.vencimento)
  }

  return {
    chave: args.chave,
    nome: alvo.nome,
    antes: antes.join(' / '),
    depois: depois.join(' / '),
    resumo: `${alvo.nome}: ${partes.join(' e ')} ajustado de ${antes.join(' / ')} para ${depois.join(' / ')}.`,
    avisos: [
      'Vale só para este mês. A recorrência que gerou a conta não foi alterada.',
      'Não há desfazer: para reverter, chame de novo com o valor anterior.',
    ],
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run mcp/tools/escrita/ajustar-conta.test.ts
```

Esperado: PASS, 9 testes.

Se o teste "muda os dois de uma vez" falhar com o vencimento certo mas o valor revertido, o problema é a relocalização do Step 3 — confirme que ela acontece **entre** as duas operações e não antes de ambas.

- [ ] **Step 5: Typecheck e commit**

```bash
npx tsc -p mcp/tsconfig.json && git add mcp/tools/escrita/ajustar-conta.ts mcp/tools/escrita/ajustar-conta.test.ts && git commit -m "Ajusta valor e vencimento de uma conta"
```

---

### Task 3: `ignorar_conta` e `registrar_parte`

As duas menores, juntas porque cada uma é uma chamada fina sobre uma operação pronta.

**Files:**
- Create: `mcp/tools/escrita/ignorar-conta.ts`
- Create: `mcp/tools/escrita/registrar-parte.ts`
- Test: `mcp/tools/escrita/ignorar-e-parte.test.ts`

**Interfaces:**
- Consumes: `localizarConta`, `ReciboDeAjuste` (Task 1).
- Produces:
  - `ignorarConta(app, { chave, ignorar, hoje }): Promise<ReciboDeAjuste>`
  - `registrarParte(app, { chave, valor, hoje }): Promise<ReciboDeAjuste>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/escrita/ignorar-e-parte.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'
import { situacaoDoMes } from '../situacao-do-mes.js'
import { cadastrarRecorrente } from './cadastrar-recorrente.js'
import { marcarPago } from './marcar-pago.js'
import { ignorarConta } from './ignorar-conta.js'
import { registrarParte } from './registrar-parte.js'

const HOJE = '2026-09-15'

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
  for (const t of ['regras', 'ancoras', 'ocorrencias', 'parcelamentos']) {
    await pool.query(`delete from ${t}`)
  }
})

async function mercado(competencia = '2026-09') {
  await cadastrarRecorrente(app, {
    tipo: 'saida',
    nome: 'Mercado',
    valor: '1500,00',
    diaDoMes: 1,
    vigenteDe: '2026-09',
  })
  const m = await situacaoDoMes(app, { competencia, hoje: HOJE })
  return m.faltaPagar.find((i) => i.nome === 'Mercado')!
}

async function salario() {
  await cadastrarRecorrente(app, {
    tipo: 'entrada',
    nome: 'Salário',
    valor: '18000,00',
    diaDoMes: 30,
    vigenteDe: '2026-09',
  })
  const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
  return m.aindaEntra.find((i) => i.nome === 'Salário')!
}

async function faltaPagar(competencia = '2026-09') {
  const m = await situacaoDoMes(app, { competencia, hoje: HOJE })
  return m.faltaPagar.map((i) => i.nome)
}

describe('ignorarConta', () => {
  it('tira o item da projecao', async () => {
    const c = await mercado()

    const r = await ignorarConta(app, { chave: c.chave, ignorar: true, hoje: HOJE })

    expect(r.antes).toBe('ativa')
    expect(r.depois).toBe('ignorada')
    expect(await faltaPagar()).not.toContain('Mercado')
  })

  it('devolve o item quando reativa', async () => {
    const c = await mercado()
    await ignorarConta(app, { chave: c.chave, ignorar: true, hoje: HOJE })
    await ignorarConta(app, { chave: c.chave, ignorar: false, hoje: HOJE })

    expect(await faltaPagar()).toContain('Mercado')
  })

  // O mes seguinte segue prevendo a conta: ignorar vale so para o mes, e a
  // recorrencia nao e tocada. E o caso que motivou a ferramenta.
  it('nao afeta o mes seguinte', async () => {
    const c = await mercado()
    await ignorarConta(app, { chave: c.chave, ignorar: true, hoje: HOJE })

    expect(await faltaPagar('2026-10')).toContain('Mercado')
  })

  // `ignorarNoMes` limpa dataPagamento e valorPagoCentavos junto com o flag.
  // A operacao continua permitida -- as vezes e o que se quer --, mas o
  // recibo precisa dizer o que foi destruido.
  it('avisa, com o valor, quando apaga um pagamento registrado', async () => {
    const c = await mercado()
    await marcarPago(app, { chave: c.chave, valor: '1500,00', hoje: HOJE })

    const r = await ignorarConta(app, { chave: c.chave, ignorar: true, hoje: HOJE })

    expect(r.avisos.join(' ')).toMatch(/R\$\s?1\.500,00/u)
    expect(r.avisos.join(' ')).toMatch(/pagamento/iu)

    const [o] = await app.repos.ocorrencias.listar()
    expect(o?.dataPagamento).toBeNull()
  })

  it('nao avisa de pagamento quando nao havia nenhum', async () => {
    const c = await mercado()

    const r = await ignorarConta(app, { chave: c.chave, ignorar: true, hoje: HOJE })

    expect(r.avisos.join(' ')).not.toMatch(/pagamento registrado/iu)
  })
})

describe('registrarParte', () => {
  it('reduz o que ainda falta entrar', async () => {
    const s = await salario()

    const r = await registrarParte(app, { chave: s.chave, valor: '8000,00', hoje: HOJE })

    expect(r.antes).toMatch(/R\$\s?18\.000,00/u)
    expect(r.depois).toMatch(/R\$\s?10\.000,00/u)

    const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
    expect(m.aindaEntra.find((i) => i.nome === 'Salário')?.valorCentavos).toBe(1_000_000)
  })

  // Vale so para este mes: escreve uma ocorrencia que sobrepoe a virtual e
  // nao toca na regra.
  it('nao afeta o mes seguinte', async () => {
    const s = await salario()
    await registrarParte(app, { chave: s.chave, valor: '8000,00', hoje: HOJE })

    const out = await situacaoDoMes(app, { competencia: '2026-10', hoje: HOJE })
    expect(out.aindaEntra.find((i) => i.nome === 'Salário')?.valorCentavos).toBe(1_800_000)
  })

  it('recusa parte maior ou igual ao previsto, sem gravar', async () => {
    const s = await salario()

    await expect(
      registrarParte(app, { chave: s.chave, valor: '18000,00', hoje: HOJE }),
    ).rejects.toThrow()
    expect(await app.repos.ocorrencias.listar()).toEqual([])
  })

  it('recusa valor ilegivel, sem gravar', async () => {
    const s = await salario()

    await expect(
      registrarParte(app, { chave: s.chave, valor: 'oito mil', hoje: HOJE }),
    ).rejects.toThrow(ErroDeUsuario)
    expect(await app.repos.ocorrencias.listar()).toEqual([])
  })

  it('recusa conta ja paga', async () => {
    const c = await mercado()
    await marcarPago(app, { chave: c.chave, hoje: HOJE })

    await expect(
      registrarParte(app, { chave: c.chave, valor: '500,00', hoje: HOJE }),
    ).rejects.toThrow(ErroDeUsuario)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run mcp/tools/escrita/ignorar-e-parte.test.ts
```

Esperado: FAIL — imports não resolvem.

- [ ] **Step 3: Escrever `ignorar-conta.ts`**

```ts
/**
 * Pula uma conta neste mes, ou a traz de volta.
 *
 * Um booleano, e nao duas ferramentas: ignorar e reativar sao o mesmo botao em
 * duas posicoes, e separa-los obrigaria o assistente a distinguir dois nomes
 * quase homonimos.
 *
 * Vale so para o mes: a recorrencia que gerou a conta nao e tocada, e o mes
 * seguinte segue prevendo-a.
 */

import { formatarBRL } from '../../../src/domain/money.js'
import type { AppPg } from '../../app-pg.js'
import type { ReciboDeAjuste } from '../../recibo.js'
import { localizarConta } from './localizar-conta.js'

export interface ArgsIgnorarConta {
  readonly chave: string
  readonly ignorar: boolean
  readonly hoje: string
}

export async function ignorarConta(
  app: AppPg,
  args: ArgsIgnorarConta,
): Promise<ReciboDeAjuste> {
  const alvo = await localizarConta(app, args.chave, args.hoje)

  const avisos: string[] = [
    'Vale só para este mês. A recorrência que gerou a conta não foi alterada.',
  ]

  // `ignorarNoMes` limpa o pagamento junto com o flag -- e coerente com "esse
  // mes nao teve", mas destroi um registro. A operacao continua permitida:
  // recusa-la deixaria sem saida quem marcou pago por engano. O recibo diz o
  // que foi apagado, com o valor, para a pessoa poder recompor.
  if (args.ignorar && alvo.dataPagamento !== null) {
    const valor = formatarBRL(alvo.valorPagoCentavos ?? alvo.valorPrevistoCentavos)
    avisos.push(
      `O pagamento registrado de ${valor} em ${alvo.dataPagamento} foi apagado. ` +
        'Para recompô-lo, reative a conta e marque como paga de novo.',
    )
  }

  if (args.ignorar) {
    await app.pagamento.ignorarNoMes(alvo)
  } else {
    await app.pagamento.reativarNoMes(alvo)
  }

  const antes = alvo.ignorado ? 'ignorada' : 'ativa'
  const depois = args.ignorar ? 'ignorada' : 'ativa'

  return {
    chave: args.chave,
    nome: alvo.nome,
    antes,
    depois,
    resumo: args.ignorar
      ? `"${alvo.nome}" foi ignorada neste mês e saiu da projeção.`
      : `"${alvo.nome}" voltou para a projeção deste mês.`,
    avisos,
  }
}
```

- [ ] **Step 4: Escrever `registrar-parte.ts`**

```ts
/**
 * Parte do valor ja entrou (ou ja saiu) antes do vencimento.
 *
 * O caso concreto: o salario e 18.000 no dia 30, veio 8.000 de adiantamento,
 * restam 10.000 a receber. Os 8.000 ja estao na conta -- e portanto no saldo
 * declarado --, e o que muda e quanto AINDA falta.
 *
 * Recebimento integral nao passa por aqui: e um pagamento confirmado, com
 * data, e vai por `marcar_pago`.
 */

import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import type { AppPg } from '../../app-pg.js'
import type { ReciboDeAjuste } from '../../recibo.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'
import { localizarConta } from './localizar-conta.js'

export interface ArgsRegistrarParte {
  readonly chave: string
  readonly valor: string
  readonly hoje: string
}

export async function registrarParte(
  app: AppPg,
  args: ArgsRegistrarParte,
): Promise<ReciboDeAjuste> {
  const parte = deEntradaUsuario(args.valor)
  if (parte === null) {
    throw new ErroDeUsuario(
      `Nao entendi o valor "${args.valor}". Use algo como 8000 ou 8.000,00.`,
    )
  }

  const alvo = await localizarConta(app, args.chave, args.hoje)

  if (alvo.dataPagamento !== null) {
    throw new ErroDeUsuario(
      `"${alvo.nome}" ja esta paga. Registrar uma parte reduz o que ainda falta, ` +
        'e numa conta paga nao falta nada -- para corrigir o valor pago, chame ' +
        'marcar_pago de novo.',
    )
  }

  // `registrarParteAntecipada` valida que a parte e positiva e menor que o
  // previsto, e levanta ErroDeDominio quando nao e.
  const tinhaObservacao = alvo.observacao !== null

  await app.pagamento.registrarParteAntecipada(alvo, parte)

  const restante = alvo.valorPrevistoCentavos - parte
  const verbo = alvo.tipo === 'entrada' ? 'recebido' : 'pago'

  const avisos: string[] = [
    'Vale só para este mês. A recorrência que gerou a conta não foi alterada.',
  ]

  // A operacao sobrescreve a observacao com o texto do adiantamento. Quem
  // tinha escrito algo ali perde -- melhor saber agora que descobrir depois.
  if (tinhaObservacao) {
    avisos.push(
      `A observação que havia nesta conta foi substituída por "${formatarBRL(parte)} ${verbo} adiantado".`,
    )
  }

  return {
    chave: args.chave,
    nome: alvo.nome,
    antes: formatarBRL(alvo.valorPrevistoCentavos),
    depois: formatarBRL(restante),
    resumo:
      `${formatarBRL(parte)} já ${verbo} de "${alvo.nome}". ` +
      `Ainda falta ${formatarBRL(restante)}.`,
    avisos,
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
npx vitest run mcp/tools/escrita/ignorar-e-parte.test.ts
```

Esperado: PASS, 10 testes.

- [ ] **Step 6: Typecheck e commit**

```bash
npx tsc -p mcp/tsconfig.json && git add mcp/tools/escrita/ignorar-conta.ts mcp/tools/escrita/registrar-parte.ts mcp/tools/escrita/ignorar-e-parte.test.ts && git commit -m "Ignora conta no mes e registra parte antecipada"
```

---

### Task 4: Registrar as três no servidor

**Files:**
- Modify: `mcp/servidor-http.ts`
- Modify: `mcp/servidor-http.test.ts`
- Modify: `mcp/README-remoto.md`

**Interfaces:**
- Consumes: `ajustarConta`, `ignorarConta`, `registrarParte` (Tasks 2 e 3).
- Produces: as três ferramentas sobre o protocolo MCP. O servidor passa de 14 para 17.

- [ ] **Step 1: Escrever o teste que falha**

Em `mcp/servidor-http.test.ts` existe o helper `chamarFerramenta(nome, args)`, que devolve `{ content: { type: string; text: string }[]; isError?: boolean }`. Um erro **não** rejeita a promessa: volta como `isError: true` com o texto em `content[0].text`.

Acrescente ao `describe` das ferramentas financeiras:

```ts
    it('ajustar_conta muda o valor pelo protocolo', async () => {
      await chamarFerramenta('cadastrar_recorrente', {
        tipo: 'saida',
        nome: 'Aluguel protocolo',
        valor: '1800',
        diaDoMes: 10,
        vigenteDe: '2026-09',
      })
      const s = await chamarFerramenta('situacao_do_mes', { hoje: '2026-09-15' })
      const chave = (JSON.parse(s.content[0]?.text ?? '{}') as {
        faltaPagar: { nome: string; chave: string }[]
      }).faltaPagar.find((i) => i.nome === 'Aluguel protocolo')?.chave

      const r = await chamarFerramenta('ajustar_conta', {
        chave,
        valor: '2000,00',
        hoje: '2026-09-15',
      })

      expect(r.isError).not.toBe(true)
      const recibo = JSON.parse(r.content[0]?.text ?? '{}') as {
        antes: string
        depois: string
      }
      expect(recibo.antes).toMatch(/1\.800,00/u)
      expect(recibo.depois).toMatch(/2\.000,00/u)
    })

    // O booleano atravessa o schema zod. Sem teste de protocolo, um schema
    // errado so apareceria em producao.
    it('ignorar_conta aceita o booleano pelo protocolo', async () => {
      await chamarFerramenta('cadastrar_recorrente', {
        tipo: 'saida',
        nome: 'Mercado protocolo',
        valor: '1500',
        diaDoMes: 1,
        vigenteDe: '2026-09',
      })
      const s = await chamarFerramenta('situacao_do_mes', { hoje: '2026-09-15' })
      const chave = (JSON.parse(s.content[0]?.text ?? '{}') as {
        faltaPagar: { nome: string; chave: string }[]
      }).faltaPagar.find((i) => i.nome === 'Mercado protocolo')?.chave

      const r = await chamarFerramenta('ignorar_conta', {
        chave,
        ignorar: true,
        hoje: '2026-09-15',
      })

      expect(r.isError).not.toBe(true)
      expect(JSON.parse(r.content[0]?.text ?? '{}')).toMatchObject({ depois: 'ignorada' })

      const depois = await chamarFerramenta('situacao_do_mes', { hoje: '2026-09-15' })
      expect(depois.content[0]?.text).not.toContain('Mercado protocolo')
    })

    it('registrar_parte recusa parte maior que o previsto, pelo protocolo', async () => {
      await chamarFerramenta('cadastrar_recorrente', {
        tipo: 'entrada',
        nome: 'Salario protocolo',
        valor: '18000',
        diaDoMes: 30,
        vigenteDe: '2026-09',
      })
      const s = await chamarFerramenta('situacao_do_mes', { hoje: '2026-09-15' })
      const chave = (JSON.parse(s.content[0]?.text ?? '{}') as {
        aindaEntra: { nome: string; chave: string }[]
      }).aindaEntra.find((i) => i.nome === 'Salario protocolo')?.chave

      const r = await chamarFerramenta('registrar_parte', {
        chave,
        valor: '20000,00',
        hoje: '2026-09-15',
      })

      expect(r.isError).toBe(true)
    })
```

Atualize também o título do `describe` e o comentário acima de `chamarFerramenta`, que dizem "treze ferramentas financeiras" — passam a ser dezesseis (dezessete com `ping`).

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run mcp/servidor-http.test.ts
```

Esperado: FAIL — as ferramentas não existem.

- [ ] **Step 3: Registrar as três**

Em `mcp/servidor-http.ts`, acrescente os imports junto aos das outras ferramentas de escrita:

```ts
import { ajustarConta } from './tools/escrita/ajustar-conta.js'
import { ignorarConta } from './tools/escrita/ignorar-conta.js'
import { registrarParte } from './tools/escrita/registrar-parte.js'
```

E registre as três depois do bloco de `marcar_pago`:

```ts
  server.registerTool(
    'ajustar_conta',
    {
      title: 'Ajustar conta',
      description:
        'Corrige o valor previsto ou o vencimento de uma conta que ainda NAO ' +
        'foi paga, usando a chave que a consulta devolve. Vale so para o mes ' +
        'daquela conta -- a recorrencia que a gerou nao muda. Para corrigir o ' +
        'valor de algo JA PAGO, use marcar_pago de novo, que atualiza o mesmo ' +
        'registro.',
      inputSchema: {
        chave: z.string().min(1).describe('A chave devolvida pela consulta'),
        valor: z
          .string()
          .optional()
          .describe('Novo valor previsto, como a pessoa fala, nunca em centavos'),
        vencimento: DATA.optional().describe('Novo vencimento'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ chave, valor, vencimento, hoje }) =>
      executarFerramenta(() =>
        ajustarConta(app, {
          chave,
          ...(valor === undefined ? {} : { valor }),
          ...(vencimento === undefined ? {} : { vencimento }),
          hoje: hoje ?? hojeDoSistema(),
        }),
      ),
  )

  server.registerTool(
    'ignorar_conta',
    {
      title: 'Ignorar conta no mes',
      description:
        'Tira uma conta da projecao deste mes (ignorar=true) ou a traz de ' +
        'volta (ignorar=false). Use quando a conta simplesmente nao existe ' +
        'neste mes -- um gasto previsto que nao aconteceu, por exemplo. A ' +
        'recorrencia continua valendo nos meses seguintes. ATENCAO: ignorar ' +
        'uma conta ja paga APAGA o pagamento registrado; o recibo avisa e diz ' +
        'o valor apagado.',
      inputSchema: {
        chave: z.string().min(1).describe('A chave devolvida pela consulta'),
        ignorar: z
          .boolean()
          .describe('true tira da projecao deste mes, false traz de volta'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ chave, ignorar, hoje }) =>
      executarFerramenta(() =>
        ignorarConta(app, { chave, ignorar, hoje: hoje ?? hojeDoSistema() }),
      ),
  )

  server.registerTool(
    'registrar_parte',
    {
      title: 'Registrar parte antecipada',
      description:
        'Registra que PARTE do valor ja entrou ou saiu antes do vencimento, ' +
        'reduzindo o que ainda falta. Exemplo: o salario e 18.000 e vieram ' +
        '8.000 de adiantamento -- restam 10.000 a receber. Vale so para este ' +
        'mes. Recebimento ou pagamento INTEGRAL nao passa por aqui: use ' +
        'marcar_pago.',
      inputSchema: {
        chave: z.string().min(1).describe('A chave devolvida pela consulta'),
        valor: z
          .string()
          .describe('Quanto ja entrou ou saiu, como a pessoa fala, nunca em centavos'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ chave, valor, hoje }) =>
      executarFerramenta(() =>
        registrarParte(app, { chave, valor, hoje: hoje ?? hojeDoSistema() }),
      ),
  )
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run mcp/servidor-http.test.ts
```

Esperado: PASS.

- [ ] **Step 5: Atualizar o README**

Em `mcp/README-remoto.md`, a lista passa de catorze para dezessete. Acrescente, no formato das existentes:

```markdown
| `ajustar_conta` | Corrige o valor ou o vencimento de uma conta ainda não paga |
| `ignorar_conta` | Tira uma conta da projeção deste mês, ou traz de volta |
| `registrar_parte` | Registra que parte do valor já entrou, reduzindo o que falta |
```

Se o texto corrido declarar o número de ferramentas, atualize-o também.

- [ ] **Step 6: Suíte inteira, typechecks e lint**

```bash
npm test && npx tsc --noEmit && npx tsc -p mcp/tsconfig.json && npm run lint
```

Esperado: tudo passa.

- [ ] **Step 7: Commit**

```bash
git add mcp/servidor-http.ts mcp/servidor-http.test.ts mcp/README-remoto.md && git commit -m "Registra ajustar_conta, ignorar_conta e registrar_parte"
```

---

## Depois do plano

O deploy não é automático: `git push` publica o código, mas a Railway precisa ser disparada por `connect_service_source` na API.

Registrar a execução em `aidlc-docs/audit.md`, em modo append, conforme o `.claude/CLAUDE.md` do repositório.
