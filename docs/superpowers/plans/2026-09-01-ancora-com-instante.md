# Âncora com instante de declaração — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um pagamento feito no mesmo dia da âncora, mas registrado depois dela, passa a descontar do saldo.

**Architecture:** `AncoraSaldo` ganha `declaradaEm` e `Ocorrencia` ganha `pagamentoRegistradoEm` — instantes ISO em UTC, ambos aceitando nulo. A RN-32, em `balance-projector.ts`, passa a desempatar pelo instante quando as datas coincidem; quando algum instante falta, mantém o comportamento atual. Nada é retroativo.

**Tech Stack:** TypeScript (ESM, `.js` nos imports), Postgres via `pg`, Dexie no navegador, vitest + `@testcontainers/postgresql`.

## Global Constraints

- Dinheiro é sempre inteiro em centavos (RN-01). Datas de calendário são `text` em `AAAA-MM-DD` (RN-04) — os instantes desta mudança são a exceção justificada abaixo.
- **Os instantes são ISO 8601 em UTC** (`new Date().toISOString()`, terminando em `Z`), `timestamptz` no banco. São instantes absolutos, não datas de calendário: precisam de fuso para ordenar corretamente entre um container em UTC e um usuário em BRT. Comparáveis por ordem lexicográfica — **nunca** construa um `Date` para compará-los.
- **Ambos os campos aceitam nulo, e nulo significa "comportamento anterior"**. Nenhum back-fill, nenhum saldo histórico se desloca.
- Uma entrada existente do array `MIGRACOES` nunca é editada; a migração nova vai ao fim.
- `Repositorios` não ganha campos novos. As duas implementações (Dexie e Postgres) continuam satisfazendo o mesmo tipo.
- ESM imports carregam `.js`. Comentários em português sem acentuação no código; strings ao usuário final com acentuação normal.
- Typecheck: `npx tsc --noEmit` (raiz) **e** `npx tsc -p mcp/tsconfig.json`. Vitest não faz checagem de tipos.

**Fato já verificado, não re-investigue:** o Dexie declara apenas índices (`ancoras: 'id, data'`) e `put()` grava o objeto inteiro. Campos novos não indexados persistem sem migração de schema. Não altere `src/data/db.ts`.

---

### Task 1: Os dois campos e a regra revisada, no domínio

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/balance-projector.ts`
- Modify: `src/data/invariants.ts`
- Test: `src/domain/ancora-com-instante.test.ts` (criar)

**Interfaces:**
- Consumes: nada.
- Produces: `AncoraSaldo.declaradaEm: string | null`; `Ocorrencia.pagamentoRegistradoEm: string | null`; a condição revisada dentro de `projetarCurva`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/domain/ancora-com-instante.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { projetarCurva } from './balance-projector.js'
import type { AncoraSaldo, OcorrenciaResolvida } from './types.js'

/**
 * RN-32 revisada: a ancora e um saldo num INSTANTE, nao num dia.
 *
 * Antes, qualquer pagamento com data <= a da ancora era ignorado, porque o
 * saldo declarado e leitura de extrato. Isso vale para quem confere a noite e
 * declara com tudo pago -- e erra para quem declara de manha e gasta durante
 * o dia, mostrando um saldo MAIOR que o do banco.
 */

const DIA = '2026-09-01'

function ancora(declaradaEm: string | null): AncoraSaldo {
  return { id: 'a-1', data: DIA, saldoCentavos: 1_000_000, declaradaEm }
}

function pagamento(registradoEm: string | null): OcorrenciaResolvida {
  return {
    chave: 'k',
    idReal: 'o-1',
    origem: 'real',
    geradorTipo: 'avulso',
    geradorId: null,
    nome: 'Sushi',
    tipo: 'saida',
    dataVencimento: DIA,
    dataPagamento: DIA,
    valorPrevistoCentavos: 11_100,
    valorPagoCentavos: 11_100,
    pagamentoRegistradoEm: registradoEm,
    competencia: '2026-09',
    numeroParcela: null,
    ignorado: false,
    situacao: 'pago',
  } as OcorrenciaResolvida
}

/** Saldo do ultimo ponto da curva do mes. */
function saldoFinal(a: AncoraSaldo, o: OcorrenciaResolvida): number {
  const curva = projetarCurva([o], a, '2026-09', DIA)
  return curva.pontos[curva.pontos.length - 1]?.saldoCentavos ?? 0
}

describe('RN-32 com instante', () => {
  // O caso do usuario: declarou de manha, pagou a tarde. O dinheiro saiu
  // DEPOIS da leitura do extrato, entao precisa descontar.
  it('desconta o pagamento registrado DEPOIS da ancora', () => {
    const a = ancora('2026-09-01T09:00:00.000Z')
    const o = pagamento('2026-09-01T18:00:00.000Z')

    expect(saldoFinal(a, o)).toBe(1_000_000 - 11_100)
  })

  // O caso oposto, que a RN-32 sempre protegeu: conferiu o extrato depois de
  // pagar, entao o valor digitado JA desconta. Descontar de novo daria um
  // saldo menor que o do banco.
  it('NAO desconta o pagamento registrado ANTES da ancora', () => {
    const a = ancora('2026-09-01T18:00:00.000Z')
    const o = pagamento('2026-09-01T09:00:00.000Z')

    expect(saldoFinal(a, o)).toBe(1_000_000)
  })

  it('trata instantes iguais como ja refletidos', () => {
    const mesmo = '2026-09-01T12:00:00.000Z'

    expect(saldoFinal(ancora(mesmo), pagamento(mesmo))).toBe(1_000_000)
  })

  // Sem instante nao ha como ordenar, e a escolha e preservar o que o app ja
  // fazia -- nenhum saldo historico se desloca sozinho.
  it('sem nenhum dos dois instantes, mantem o comportamento anterior', () => {
    expect(saldoFinal(ancora(null), pagamento(null))).toBe(1_000_000)
  })

  it('com so o instante da ancora, mantem o comportamento anterior', () => {
    expect(saldoFinal(ancora('2026-09-01T09:00:00.000Z'), pagamento(null))).toBe(1_000_000)
  })

  it('com so o instante do pagamento, mantem o comportamento anterior', () => {
    expect(saldoFinal(ancora(null), pagamento('2026-09-01T18:00:00.000Z'))).toBe(1_000_000)
  })
})

describe('RN-32 em datas diferentes nao depende de instante', () => {
  // O caso 1 da regra: data anterior a ancora, sempre ignorado. O instante
  // nao entra na conta -- se entrasse, um pagamento de ontem as 18h contra
  // uma ancora de hoje as 9h seria descontado indevidamente.
  it('pagamento de dia anterior nunca desconta, mesmo com hora maior', () => {
    const a = ancora('2026-09-01T09:00:00.000Z')
    const o = {
      ...pagamento('2026-08-31T23:00:00.000Z'),
      dataVencimento: '2026-08-31',
      dataPagamento: '2026-08-31',
    } as OcorrenciaResolvida

    expect(saldoFinal(a, o)).toBe(1_000_000)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/domain/ancora-com-instante.test.ts
```

Esperado: FAIL. O primeiro caso devolve `1000000` em vez de `988900` — a regra atual ignora o pagamento.

- [ ] **Step 3: Acrescentar os campos aos tipos**

Em `src/domain/types.ts`, na interface `Ocorrencia`, logo depois de `valorPagoCentavos`:

```ts
  /**
   * Instante ISO 8601 em UTC em que o pagamento foi registrado.
   *
   * Serve para desempatar contra `AncoraSaldo.declaradaEm` quando os dois
   * caem no mesmo dia: o saldo declarado reflete o que ja tinha saido naquele
   * instante, e nao o que saiu depois. Nulo em registros anteriores a esta
   * mudanca, e tambem quando o pagamento vem de um caminho que nao informa o
   * instante -- nesse caso vale o comportamento anterior, que compara so datas.
   */
  readonly pagamentoRegistradoEm: string | null
```

E em `AncoraSaldo`, depois de `saldoCentavos`:

```ts
  /**
   * Instante ISO 8601 em UTC da declaracao.
   *
   * `data` continua sendo o que indexa a ancora, seleciona a vigente (RN-49)
   * e o que o usuario ve. Este campo e informacao adicional, usada apenas
   * para ordenar contra pagamentos do MESMO dia.
   */
  readonly declaradaEm: string | null
```

A interface `OcorrenciaResolvida` também precisa carregar `pagamentoRegistradoEm`, porque é o que o projetor recebe. Acrescente-o lá com o mesmo tipo (`readonly pagamentoRegistradoEm: string | null`) e propague em `src/domain/occurrence-resolver.ts`, `src/domain/rule-expander.ts` e `src/domain/installment-expander.ts` — os dois expansores criam ocorrências virtuais e devem preencher `pagamentoRegistradoEm: null` junto de `dataPagamento: null`, que já está lá.

- [ ] **Step 4: Revisar a condição da RN-32**

Em `src/domain/balance-projector.ts`, substitua o bloco existente:

```ts
    if (
      temAncora &&
      o.dataPagamento !== null &&
      comparar(o.dataPagamento, dataDaAncora) <= 0
    ) {
      continue
    }
```

por:

```ts
    if (temAncora && o.dataPagamento !== null && jaRefletidoNaAncora(o, ancora)) {
      continue
    }
```

E acrescente a função, acima de `projetarCurva`:

```ts
/**
 * RN-32: o pagamento ja esta dentro do saldo declarado?
 *
 * Data anterior: sempre sim -- o extrato daquele dia ja o descontou, e o
 * instante nao entra na conta (um pagamento de ontem as 23h contra uma ancora
 * de hoje as 9h seria descontado indevidamente se entrasse).
 *
 * Mesmo dia: depende da ORDEM. Quem confere o extrato depois de pagar digita
 * um valor que ja desconta; quem declara de manha e gasta a tarde, nao. Sem
 * os dois instantes nao ha como ordenar, e a escolha e preservar o
 * comportamento anterior -- nenhum saldo ja conferido se desloca sozinho.
 *
 * Os instantes sao ISO 8601 em UTC e por isso ordenam por comparacao de
 * string: nenhum `Date` e construido aqui.
 */
function jaRefletidoNaAncora(
  o: OcorrenciaResolvida,
  ancora: AncoraSaldo | null,
): boolean {
  if (ancora === null || o.dataPagamento === null) return false

  const ordem = comparar(o.dataPagamento, ancora.data)
  if (ordem > 0) return false
  if (ordem < 0) return true

  // Mesmo dia.
  if (ancora.declaradaEm === null || o.pagamentoRegistradoEm === null) return true

  return o.pagamentoRegistradoEm <= ancora.declaradaEm
}
```

Note que a função recebe `ancora`, não `dataDaAncora`. Dentro de `projetarCurva`, `ancora` é o parâmetro original (`AncoraSaldo | null`) e continua disponível no escopo; `temAncora` já garante que ela não é nula e não está no futuro.

- [ ] **Step 5: Validar o formato do instante**

Em `src/data/invariants.ts`, acrescente o helper e as duas checagens:

```ts
/** Instante ISO 8601 em UTC, como `new Date().toISOString()` produz. */
function ehInstanteValido(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v)
}
```

Em `validarAncora`, depois das checagens existentes:

```ts
  if (a.declaradaEm !== null) {
    exigir(ehInstanteValido(a.declaradaEm), 'INSTANTE_INVALIDO')
  }
```

Em `validarOcorrencia`, junto das demais:

```ts
  if (o.pagamentoRegistradoEm !== null) {
    exigir(ehInstanteValido(o.pagamentoRegistradoEm), 'INSTANTE_INVALIDO')
  }
```

Se `validarOcorrencia` tiver uma lista de códigos de erro tipada, acrescente `INSTANTE_INVALIDO` a ela.

- [ ] **Step 6: Rodar o teste novo e ver passar**

```bash
npx vitest run src/domain/ancora-com-instante.test.ts
```

Esperado: PASS, 7 testes.

- [ ] **Step 7: Rodar o domínio e os serviços inteiros**

```bash
npx vitest run src/domain src/services && npx tsc --noEmit
```

Esperado: tudo passa. Os testes existentes constroem âncoras e ocorrências sem os campos novos — se o TypeScript reclamar de propriedade faltante em algum fixture, acrescente `declaradaEm: null` / `pagamentoRegistradoEm: null` ao fixture. **Não** torne os campos opcionais (`?`) para evitar esse trabalho: opcional e nulo significam a mesma coisa aqui, e ter as duas formas convida a esquecer uma delas.

- [ ] **Step 8: Commit**

```bash
git add src/domain src/data/invariants.ts && git commit -m "A ancora de saldo passa a ter instante de declaracao"
```

---

### Task 2: Persistência das duas colunas

**Files:**
- Modify: `mcp/dados/migracoes.ts`
- Modify: `mcp/dados/repositorios-pg.ts`
- Modify: `mcp/dados/contrato.test.ts`
- Test: `mcp/dados/migracoes.test.ts` (acrescentar asserção)

**Interfaces:**
- Consumes: `AncoraSaldo.declaradaEm` e `Ocorrencia.pagamentoRegistradoEm` (Task 1).
- Produces: as colunas `declarada_em` e `pagamento_registrado_em`, lidas e gravadas pelo repositório Postgres.

- [ ] **Step 1: Escrever o teste que falha**

Em `mcp/dados/contrato.test.ts`, acrescente ao bloco de casos que roda contra as duas implementações:

```ts
  it('preserva o instante da declaracao da ancora', async () => {
    const instante = '2026-03-01T14:30:00.000Z'
    await repos.ancoras.salvar({ ...ANCORA, declaradaEm: instante }, '2026-03-20')

    expect((await repos.ancoras.vigenteEm('2026-03-20'))?.declaradaEm).toBe(instante)
  })

  it('preserva o instante do pagamento na ocorrencia', async () => {
    const instante = '2026-03-10T18:45:00.000Z'
    await repos.ocorrencias.salvar({
      ...OCORRENCIA,
      dataPagamento: '2026-03-10',
      valorPagoCentavos: 180000,
      pagamentoRegistradoEm: instante,
    })

    expect((await repos.ocorrencias.obter(OCORRENCIA.id))?.pagamentoRegistradoEm).toBe(instante)
  })

  // Nulo tem significado: e o que faz o registro cair no comportamento
  // anterior. Se o driver devolvesse `undefined`, a comparacao da RN-32
  // continuaria funcionando por acidente, mas o contrato entre as duas
  // implementacoes estaria quebrado.
  it('devolve null, nao undefined, quando nao ha instante', async () => {
    await repos.ancoras.salvar(ANCORA, '2026-03-20')

    expect((await repos.ancoras.vigenteEm('2026-03-20'))?.declaradaEm).toBeNull()
  })
```

Acrescente `declaradaEm: null` ao fixture `ANCORA` e `pagamentoRegistradoEm: null` ao fixture `OCORRENCIA`, no topo do arquivo.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run mcp/dados/contrato.test.ts
```

Esperado: FAIL na implementação Postgres — a coluna não existe. A implementação Dexie deve passar, porque `put()` grava o objeto inteiro.

- [ ] **Step 3: Acrescentar a migração**

Ao fim do array `MIGRACOES` em `mcp/dados/migracoes.ts`, como entrada nova — sem tocar nas anteriores:

```ts
  // RN-32 revisada: a ancora e um saldo num INSTANTE, nao num dia.
  //
  // `timestamptz`, e nao `text` como as datas (RN-04): estes campos NAO sao
  // datas de calendario, sao instantes absolutos, e precisam de fuso para
  // ordenar corretamente entre um container em UTC e um usuario em BRT. E a
  // unica excecao a RN-04 no schema.
  //
  // Nullable e sem back-fill de proposito: nulo significa "comportamento
  // anterior", e nenhum saldo ja conferido se desloca.
  `
  alter table ancoras add column if not exists declarada_em timestamptz;
  alter table ocorrencias add column if not exists pagamento_registrado_em timestamptz;
  `,
```

- [ ] **Step 4: Ler e gravar as colunas**

Em `mcp/dados/repositorios-pg.ts`:

No tipo `LinhaAncora`, acrescente `declarada_em: Date | null`; em `LinhaOcorrencia`, `pagamento_registrado_em: Date | null`.

Nos conversores `paraAncora` e `paraOcorrencia`, acrescente o campo. O driver devolve `Date` para `timestamptz`, e o domínio espera string ISO em UTC:

```ts
  declaradaEm: l.declarada_em === null ? null : l.declarada_em.toISOString(),
```

```ts
  pagamentoRegistradoEm:
    l.pagamento_registrado_em === null ? null : l.pagamento_registrado_em.toISOString(),
```

No `insert` de `ancoras.salvar`, acrescente a coluna e o parâmetro, e inclua-a no `do update`:

```ts
            `insert into ancoras (id, data, saldo_centavos, declarada_em, atualizado_em)
             values ($1,$2,$3,$4,now())
             on conflict (id) do update set
               data = excluded.data, saldo_centavos = excluded.saldo_centavos,
               declarada_em = excluded.declarada_em, atualizado_em = now()`,
            [a.id, a.data, a.saldoCentavos, a.declaradaEm],
```

Faça o mesmo em `ocorrencias.salvar` para `pagamento_registrado_em`: acrescente a coluna **no fim** da lista do `insert`, o valor **no fim** do array de parâmetros, e `pagamento_registrado_em = excluded.pagamento_registrado_em` ao `do update`.

**Confira a posição dos parâmetros antes de rodar.** Essa query tem mais de dez colunas, e trocar `$n` de posição não gera erro de sintaxe nem de tipo — grava o valor errado na coluna errada, em silêncio. Depois de editar, conte: o último `$n` da lista de `values` tem de ser igual ao número de elementos do array, e a ordem das colunas tem de espelhar exatamente a ordem do array. Se a coluna nova ficou em `$13`, o valor dela é o décimo terceiro elemento.

O teste de contrato do Step 1 pega uma troca envolvendo `pagamento_registrado_em`, mas **não** pega uma troca entre duas colunas antigas que você tenha deslocado por engano — por isso a conferência manual.

- [ ] **Step 5: Cobrir a migração**

Em `mcp/dados/migracoes.test.ts`, no teste que verifica as tabelas criadas, acrescente a checagem das colunas novas:

```ts
  it('cria as colunas de instante em ancoras e ocorrencias', async () => {
    const r = await pool.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where column_name in ('declarada_em', 'pagamento_registrado_em')`,
    )
    const pares = r.rows.map((l) => `${l.table_name}.${l.column_name}`)

    expect(pares).toContain('ancoras.declarada_em')
    expect(pares).toContain('ocorrencias.pagamento_registrado_em')
  })
```

- [ ] **Step 6: Rodar e ver passar**

```bash
npx vitest run mcp/dados
```

Esperado: tudo passa, incluindo a suíte de contrato nas duas implementações.

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit && npx tsc -p mcp/tsconfig.json
```

- [ ] **Step 8: Commit**

```bash
git add mcp/dados && git commit -m "Persiste os instantes de declaracao e de pagamento"
```

---

### Task 3: As ferramentas gravam o instante

**Files:**
- Modify: `src/services/payment-service.ts`
- Modify: `mcp/tools/escrita/marcar-pago.ts`
- Modify: `mcp/tools/escrita/declarar-saldo.ts`
- Test: `mcp/tools/escrita/saldo-com-instante.test.ts` (criar)

**Interfaces:**
- Consumes: tudo das Tasks 1 e 2.
- Produces: `registrarPagamento(o, data, valor, registradoEm?: string)`; `declararSaldo` e `marcarPago` gravando o instante corrente.

**Nota de desenho — por que o parâmetro é opcional.** `registrarPagamento` tem cerca de quinze chamadores, quase todos em testes que não se importam com o instante. Ausente, o campo fica nulo e o registro cai no comportamento anterior — que é exatamente o que esses testes verificam hoje. O único caminho de produção é o MCP, e ele passa o instante. Tornar obrigatório forçaria editar quinze testes para acrescentar um valor que eles ignoram.

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/escrita/saldo-com-instante.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { situacaoDoMes } from '../situacao-do-mes.js'
import { declararSaldo } from './declarar-saldo.js'
import { lancarAvulso } from './lancar-avulso.js'
import { marcarPago } from './marcar-pago.js'

const HOJE = '2026-09-01'

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

async function saldo(): Promise<number> {
  const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
  return m.saldoNaReferencia.valorCentavos
}

async function contaDe(nome: string) {
  const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
  const o = [...m.faltaPagar, ...m.jaResolvido].find((x) => x.nome === nome)
  if (o === undefined) throw new Error(`${nome} nao encontrada`)
  return o
}

describe('as ferramentas gravam o instante', () => {
  it('declarar_saldo grava declaradaEm', async () => {
    await declararSaldo(app, { valor: '1000,00', hoje: HOJE })

    const [a] = await app.repos.ancoras.listar()
    expect(a?.declaradaEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  })

  it('marcar_pago grava pagamentoRegistradoEm', async () => {
    await lancarAvulso(app, { tipo: 'saida', nome: 'Sushi', valor: '111,00', hoje: HOJE })
    await marcarPago(app, { chave: (await contaDe('Sushi')).chave, hoje: HOJE })

    const [o] = await app.repos.ocorrencias.listar()
    expect(o?.pagamentoRegistradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  })

  // O cenario do usuario, ponta a ponta.
  it('declarar saldo e DEPOIS pagar deixa o saldo menor', async () => {
    await declararSaldo(app, { valor: '1000,00', hoje: HOJE })
    await lancarAvulso(app, { tipo: 'saida', nome: 'Sushi', valor: '111,00', hoje: HOJE })

    const antes = await saldo()
    await marcarPago(app, { chave: (await contaDe('Sushi')).chave, hoje: HOJE })

    expect(antes).toBe(100_000)
    expect(await saldo()).toBe(100_000 - 11_100)
  })

  // O caso oposto, que a RN-32 sempre protegeu. E a regressao que esta
  // mudanca arrisca: se o pagamento anterior a ancora passasse a descontar, o
  // app mostraria um saldo MENOR que o do extrato -- e o valor digitado pelo
  // usuario deixaria de ser o que ele ve.
  it('pagar e DEPOIS declarar saldo nao desconta de novo', async () => {
    await lancarAvulso(app, { tipo: 'saida', nome: 'Sushi', valor: '111,00', hoje: HOJE })
    await marcarPago(app, { chave: (await contaDe('Sushi')).chave, hoje: HOJE })
    await declararSaldo(app, { valor: '1000,00', hoje: HOJE })

    expect(await saldo()).toBe(100_000)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run mcp/tools/escrita/saldo-com-instante.test.ts
```

Esperado: FAIL — `declaradaEm` e `pagamentoRegistradoEm` vêm nulos, e o terceiro teste devolve `100000` em vez de `88900`.

- [ ] **Step 3: `registrarPagamento` aceita o instante**

Em `src/services/payment-service.ts`, na função `materializar`, acrescente o campo junto dos demais:

```ts
    pagamentoRegistradoEm: o.pagamentoRegistradoEm,
```

E troque a definição de `registrarPagamento`:

```ts
    /**
     * `registradoEm` e o instante ISO em UTC da escrita, usado para desempatar
     * contra a ancora quando os dois caem no mesmo dia (RN-32 revisada).
     *
     * Opcional porque a maioria dos chamadores nao se importa com a ordem
     * dentro do dia: ausente, o campo fica nulo e o registro cai no
     * comportamento anterior, que compara so datas.
     */
    registrarPagamento: (
      o: OcorrenciaResolvida,
      data: DataISO,
      valor: Centavos,
      registradoEm?: string,
    ) =>
      aplicar(o, {
        dataPagamento: data,
        valorPagoCentavos: valor,
        ignorado: false,
        pagamentoRegistradoEm: registradoEm ?? null,
      }),
```

E em `desfazerPagamento`, limpe o instante junto com o resto:

```ts
    desfazerPagamento: (o: OcorrenciaResolvida) =>
      aplicar(o, {
        dataPagamento: null,
        valorPagoCentavos: null,
        pagamentoRegistradoEm: null,
      }),
```

- [ ] **Step 4: As duas ferramentas passam o instante**

Em `mcp/tools/escrita/marcar-pago.ts`, na chamada existente:

```ts
  await app.pagamento.registrarPagamento(alvo, data, valorPago, new Date().toISOString())
```

Em `mcp/tools/escrita/declarar-saldo.ts`, no objeto salvo:

```ts
  await app.repos.ancoras.salvar(
    { id, data, saldoCentavos: centavos, declaradaEm: new Date().toISOString() },
    args.hoje,
  )
```

Em ambos os arquivos, acrescente um comentário curto explicando por que o instante é do servidor e não vem do usuário:

```ts
  // O instante e do servidor, em UTC. Pedir ao modelo que informe o horario
  // seria pedir que ele inventasse um -- e diferente de `hoje`, que a pessoa
  // pode legitimamente querer sobrescrever para lancar algo retroativo.
```

- [ ] **Step 5: Rodar e ver passar**

```bash
npx vitest run mcp/tools/escrita/saldo-com-instante.test.ts
```

Esperado: PASS, 4 testes.

- [ ] **Step 6: Suíte completa e typecheck**

```bash
npm test && npx tsc --noEmit && npx tsc -p mcp/tsconfig.json && npm run lint
```

Esperado: tudo passa. Se algum teste existente de `desfazer` falhar porque agora o instante é limpo, verifique se a expectativa dele descrevia o comportamento antigo antes de alterá-la — o instante deve mesmo voltar a nulo quando o pagamento é desfeito.

- [ ] **Step 7: Commit**

```bash
git add src/services/payment-service.ts mcp/tools/escrita && git commit -m "declarar_saldo e marcar_pago gravam o instante da escrita"
```

---

## Depois do plano

O deploy não é automático: `git push` publica o código, mas a Railway precisa ser disparada por `connect_service_source` na API.

Registrar a execução em `aidlc-docs/audit.md`, em modo append, conforme o `.claude/CLAUDE.md` do repositório.

**Depois do deploy, o usuário precisa declarar o saldo uma vez** para que a âncora corrente passe a ter instante. Até lá, a âncora de 01/09 continua sem `declaradaEm` e os pagamentos daquele dia seguem no comportamento anterior — que é o desejado, já que o saldo dele já foi realinhado manualmente para R$ 6.456,97.
