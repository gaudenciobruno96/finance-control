# Categorias de gasto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada lançamento carrega uma categoria de uma lista fixa, e o `historico_de_gastos` passa a responder "quanto foi para cada setor".

**Architecture:** `Categoria` é uma união de literais no domínio. O campo entra em `Regra`, `Parcelamento` e `Ocorrencia`, sempre aceitando nulo, e os expansores o copiam para a ocorrência virtual — categorizar uma recorrência é uma operação, não doze por ano. A agregação do `historico_de_gastos` já existe; muda a chave do agrupamento.

**Tech Stack:** TypeScript (ESM, `.js` nos imports), Postgres via `pg`, Dexie no navegador, Express + `@modelcontextprotocol/sdk`, zod, vitest + `@testcontainers/postgresql`.

## Global Constraints

- **As quinze categorias são exatamente estas**, sem acentuação nos valores: `moradia`, `mercado`, `alimentacao_fora`, `transporte`, `vestuario`, `saude`, `pet`, `servicos`, `dividas`, `familia`, `investimento`, `compras`, `cartao`, `lazer`, `outros`.
- **O campo aceita nulo em toda parte.** Nulo significa "não categorizado" — não é erro, não é valor faltando, e aparece no relatório como uma linha própria.
- Dinheiro é inteiro em centavos (RN-01). Datas são `text` `AAAA-MM-DD` (RN-04).
- ESM imports carregam `.js`. Comentários e mensagens de erro em português **sem** acentuação; strings de recibo e avisos ao usuário com acentuação normal.
- `TipoDeEscrita` não ganha valores — `definir_categoria` não entra no `desfazer`.
- Typecheck: `npx tsc --noEmit` **e** `npx tsc -p mcp/tsconfig.json`. Lint: `npm run lint`.

**Duas lições das execuções anteriores neste repositório, que este plano incorpora:**

1. **Tornar um campo obrigatório em `Ocorrencia`/`Regra` quebra dezenas de fixtures**, inclusive em `mcp/`, que é um projeto TypeScript separado. A Task 1 inclui o conserto do `mcp/` — não deixe o branch vermelho entre tarefas, ou regressões novas ficam indistinguíveis da quebra conhecida.
2. **`situacaoDoMes` expõe `faltaPagar` e `aindaEntra` como listas, mas `jaResolvido` como um `Dinheiro` total.** Só o projetor bruto (`app.projecao.projetarMes`) expõe as três como listas. Já se perdeu tempo com isso duas vezes.

---

### Task 1: `Categoria` no domínio, e a herança pelos expansores

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/rule-expander.ts`
- Modify: `src/domain/installment-expander.ts`
- Modify: `src/domain/occurrence-resolver.ts`
- Modify: `src/data/invariants.ts`
- Test: `src/domain/categoria.test.ts` (criar)
- Modify: fixtures em `src/` e `mcp/` que constroem `Regra`, `Parcelamento` ou `Ocorrencia`

**Interfaces:**
- Consumes: nada.
- Produces: `type Categoria`, `CATEGORIAS` (array), e o campo `categoria: Categoria | null` em `Regra`, `Parcelamento`, `Ocorrencia` e `OcorrenciaResolvida`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/domain/categoria.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { expandirRegras } from './rule-expander.js'
import { expandirParcelamentos } from './installment-expander.js'
import { resolver } from './occurrence-resolver.js'
import { CATEGORIAS } from './types.js'
import type { Ocorrencia, Parcelamento, Regra } from './types.js'

const INTERVALO = ['2026-09'] as const

function regra(over: Partial<Regra> = {}): Regra {
  return {
    id: 'r-1',
    tipo: 'saida',
    nome: 'Aluguel',
    valorCentavos: 180_000,
    valorEhEstimativa: false,
    diaDoMes: 10,
    ajusteFimDeSemana: 'nenhum',
    vigenteDe: '2026-09',
    vigenteAte: null,
    categoria: 'moradia',
    ...over,
  }
}

function parcelamento(over: Partial<Parcelamento> = {}): Parcelamento {
  return {
    id: 'p-1',
    nome: 'Geladeira',
    valorParcelaCentavos: 30_000,
    quantidadeParcelas: 3,
    primeiroVencimento: '2026-09-20',
    categoria: 'compras',
    ...over,
  }
}

describe('CATEGORIAS', () => {
  // A lista e fixa de proposito: categoria de texto livre fragmenta em
  // silencio ("Mercado", "mercado", "Supermercado" viram tres setores) e a
  // soma por setor deixa de fechar.
  it('tem as quinze categorias combinadas, sem acentuacao', () => {
    expect(CATEGORIAS).toEqual([
      'moradia',
      'mercado',
      'alimentacao_fora',
      'transporte',
      'vestuario',
      'saude',
      'pet',
      'servicos',
      'dividas',
      'familia',
      'investimento',
      'compras',
      'cartao',
      'lazer',
      'outros',
    ])
  })
})

describe('heranca da categoria', () => {
  it('a ocorrencia virtual de uma regra herda a categoria da regra', () => {
    const [o] = expandirRegras([regra()], INTERVALO)

    expect(o?.categoria).toBe('moradia')
  })

  it('a ocorrencia virtual de um parcelamento herda a do parcelamento', () => {
    const [o] = expandirParcelamentos([parcelamento()], INTERVALO)

    expect(o?.categoria).toBe('compras')
  })

  it('regra sem categoria gera ocorrencia com categoria nula', () => {
    const [o] = expandirRegras([regra({ categoria: null })], INTERVALO)

    expect(o?.categoria).toBeNull()
  })

  it('parcelamento sem categoria gera ocorrencia com categoria nula', () => {
    const [o] = expandirParcelamentos([parcelamento({ categoria: null })], INTERVALO)

    expect(o?.categoria).toBeNull()
  })

  // RN-52: a materializada congela o estado do momento, como ja congela nome
  // e valor. Recategorizar a regra nao reescreve o passado -- o historico
  // registra como o gasto era classificado quando aconteceu.
  it('a materializada preserva a propria categoria, nao a da regra atual', () => {
    const real: Ocorrencia = {
      id: 'o-1',
      geradorTipo: 'regra',
      geradorId: 'r-1',
      competencia: '2026-09',
      tipo: 'saida',
      nome: 'Aluguel',
      valorPrevistoCentavos: 180_000,
      dataVencimento: '2026-09-10',
      dataPagamento: '2026-09-10',
      valorPagoCentavos: 180_000,
      pagamentoRegistradoEm: null,
      ignorado: false,
      observacao: null,
      categoria: 'moradia',
    }

    // A regra agora diz outra coisa; a materializada nao acompanha.
    const virtuais = expandirRegras([regra({ categoria: 'outros' })], INTERVALO)
    const [resolvida] = resolver(virtuais, [real], '2026-09-15')

    expect(resolvida?.categoria).toBe('moradia')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/domain/categoria.test.ts
```

Esperado: FAIL — `CATEGORIAS` não existe.

- [ ] **Step 3: O tipo e a lista**

Em `src/domain/types.ts`, antes de `Regra`:

```ts
/**
 * Categoria de gasto.
 *
 * Lista FIXA de proposito. Categoria de texto livre fragmenta em silencio --
 * "Mercado", "mercado" e "Supermercado" viram tres setores, cada um com parte
 * do dinheiro, e a soma por setor deixa de fechar sem que nada indique o
 * problema.
 *
 * Os valores sao sem acentuacao, como o resto do codigo; o rotulo exibido ao
 * usuario pode ter.
 */
export const CATEGORIAS = [
  'moradia',
  'mercado',
  'alimentacao_fora',
  'transporte',
  'vestuario',
  'saude',
  'pet',
  'servicos',
  'dividas',
  'familia',
  'investimento',
  'compras',
  'cartao',
  'lazer',
  'outros',
] as const

export type Categoria = (typeof CATEGORIAS)[number]
```

Acrescente o campo a `Regra`, `Parcelamento`, `Ocorrencia` e `OcorrenciaResolvida`:

```ts
  /**
   * Nulo significa "nao categorizado" -- nao e erro nem valor faltando, e
   * aparece no relatorio como uma linha propria.
   */
  readonly categoria: Categoria | null
```

- [ ] **Step 4: A herança nos expansores e no resolver**

Em `src/domain/rule-expander.ts`, no objeto que monta a ocorrência virtual, junto de `nome` e `valorPrevistoCentavos`:

```ts
        categoria: regra.categoria,
```

Em `src/domain/installment-expander.ts`, no lugar equivalente:

```ts
        categoria: p.categoria,
```

Em `src/domain/occurrence-resolver.ts`, na função que mescla real e virtual, junto de `observacao`:

```ts
    // Da REAL, nao da virtual: a materializada congela a categoria que tinha
    // quando foi criada (RN-52), do mesmo jeito que congela nome e valor.
    categoria: real.categoria,
```

- [ ] **Step 5: Validar a categoria**

Em `src/data/invariants.ts`, acrescente o helper e as três checagens:

```ts
function ehCategoriaValida(v: unknown): boolean {
  return typeof v === 'string' && (CATEGORIAS as readonly string[]).includes(v)
}
```

Importe `CATEGORIAS` de `../domain/types.js`. Em `validarRegra`, `validarParcelamento` e `validarOcorrencia`, acrescente:

```ts
  if (x.categoria !== null) {
    exigir(ehCategoriaValida(x.categoria), 'CATEGORIA_INVALIDA')
  }
```

trocando `x` pelo nome do parâmetro de cada função. Acrescente `CATEGORIA_INVALIDA` à união de códigos em `src/domain/errors.ts`, com a mensagem `'categoria fora da lista conhecida'`.

- [ ] **Step 6: Consertar os fixtures, em `src/` E em `mcp/`**

Rodar os dois typechecks lista todos os literais que agora precisam do campo:

```bash
npx tsc --noEmit; npx tsc -p mcp/tsconfig.json
```

Acrescente `categoria: null` a cada um. **Não** torne o campo opcional (`?`) para evitar este trabalho: opcional e nulo significariam a mesma coisa, e ter as duas formas convida a esquecer uma.

O `mcp/` faz parte desta tarefa de propósito — deixá-lo quebrado até uma tarefa posterior tornaria qualquer regressão nova indistinguível da quebra conhecida.

- [ ] **Step 7: Rodar tudo**

```bash
npx vitest run src && npx vitest run mcp && npx tsc --noEmit && npx tsc -p mcp/tsconfig.json
```

Esperado: tudo passa. Nenhum teste existente deve mudar de resultado — o campo é aditivo e nulo em todos os fixtures.

- [ ] **Step 8: Commit**

```bash
git add src mcp && git commit -m "Categoria de gasto no dominio, herdada pelos expansores"
```

---

### Task 2: Persistir a categoria

**Files:**
- Modify: `mcp/dados/migracoes.ts`
- Modify: `mcp/dados/repositorios-pg.ts`
- Modify: `mcp/dados/contrato.test.ts`

**Interfaces:**
- Consumes: `Categoria` e o campo `categoria` (Task 1).
- Produces: a coluna `categoria` em `regras`, `parcelamentos` e `ocorrencias`, lida e gravada pelo repositório Postgres.

- [ ] **Step 1: Escrever o teste que falha**

Em `mcp/dados/contrato.test.ts`, dentro do bloco que roda contra as duas implementações:

```ts
  it('preserva a categoria da regra', async () => {
    await repos.regras.salvar({ ...REGRA, categoria: 'moradia' })

    expect((await repos.regras.obter(REGRA.id))?.categoria).toBe('moradia')
  })

  it('preserva a categoria do parcelamento', async () => {
    await repos.parcelamentos.salvar({ ...PARCELAMENTO, categoria: 'compras' })

    expect((await repos.parcelamentos.obter(PARCELAMENTO.id))?.categoria).toBe('compras')
  })

  it('preserva a categoria da ocorrencia', async () => {
    await repos.ocorrencias.salvar({ ...OCORRENCIA, categoria: 'mercado' })

    expect((await repos.ocorrencias.obter(OCORRENCIA.id))?.categoria).toBe('mercado')
  })

  // Nulo tem significado: e o que faz o lancamento aparecer como "sem
  // categoria" no relatorio. Se o driver devolvesse `undefined`, a agregacao
  // continuaria funcionando por acidente enquanto o contrato entre as duas
  // implementacoes estaria quebrado.
  it('devolve null, nao undefined, quando nao ha categoria', async () => {
    await repos.regras.salvar(REGRA)

    expect((await repos.regras.obter(REGRA.id))?.categoria).toBeNull()
  })
```

Os fixtures `REGRA`, `PARCELAMENTO` e `OCORRENCIA` já ganharam `categoria: null` na Task 1. Se algum deles não existir no arquivo com esse nome, use os que existem.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run mcp/dados/contrato.test.ts
```

Esperado: FAIL na implementação Postgres — a coluna não existe. A Dexie deve passar, porque `put()` grava o objeto inteiro.

- [ ] **Step 3: A migração**

Ao fim do array `MIGRACOES` em `mcp/dados/migracoes.ts`, como entrada nova — sem tocar nas anteriores, porque o mecanismo só aplica versões acima da atual e um banco já migrado nunca reveria uma entrada editada:

```ts
  // Categoria de gasto. `text` e nullable: nulo significa "nao categorizado",
  // e os lancamentos que ja existem comecam assim.
  //
  // Sem restricao de dominio no banco de proposito -- a lista fixa vive no
  // TypeScript (`CATEGORIAS`) e e validada em `validarRegra` e irmas.
  // Duplica-la aqui criaria duas fontes que divergem no primeiro valor novo.
  `
  alter table regras add column if not exists categoria text;
  alter table parcelamentos add column if not exists categoria text;
  alter table ocorrencias add column if not exists categoria text;
  `,
```

- [ ] **Step 4: Ler e gravar a coluna**

Em `mcp/dados/repositorios-pg.ts`:

Acrescente `categoria: string | null` a `LinhaRegra`, `LinhaParcelamento` e `LinhaOcorrencia`.

Nos conversores (`paraRegra`, `paraParcelamento`, `paraOcorrencia`), acrescente:

```ts
  categoria: l.categoria as Categoria | null,
```

Importe `Categoria` como type de `../../src/domain/types.js`.

Nos três `insert`, acrescente a coluna **no fim** da lista, o valor **no fim** do array de parâmetros, e `categoria = excluded.categoria` ao `do update`.

**Confira a posição dos parâmetros antes de rodar.** A query de `ocorrencias` tem mais de dez colunas, e deslocar um `$n` não gera erro de sintaxe nem de tipo — grava o valor certo na coluna errada, em silêncio. Depois de editar, conte: o último `$n` de `values` tem de ser igual ao número de elementos do array, e a ordem das colunas tem de espelhar a ordem do array. O teste de contrato pega uma troca envolvendo `categoria`, mas **não** pega uma troca entre duas colunas antigas que você tenha deslocado.

- [ ] **Step 5: Rodar e ver passar**

```bash
npx vitest run mcp/dados
```

- [ ] **Step 6: Typecheck e commit**

```bash
npx tsc -p mcp/tsconfig.json && git add mcp/dados && git commit -m "Persiste a categoria em regras, parcelamentos e ocorrencias"
```

---

### Task 3: As ferramentas de escrita e `definir_categoria`

**Files:**
- Modify: `mcp/tools/escrita/cadastrar-recorrente.ts`
- Modify: `mcp/tools/escrita/lancar-avulso.ts`
- Modify: `mcp/tools/escrita/cadastrar-parcelamento.ts`
- Create: `mcp/tools/escrita/definir-categoria.ts`
- Test: `mcp/tools/escrita/categoria.test.ts`

**Interfaces:**
- Consumes: `Categoria`, `CATEGORIAS` (Task 1); a persistência (Task 2).
- Produces: `categoria?: Categoria` nas três ferramentas de escrita; `definirCategoria(app, { tipo, id, categoria, hoje }): Promise<ReciboDeAjuste>`, com `tipo: 'recorrente' | 'parcelamento' | 'avulso'`.

`ReciboDeAjuste` já existe em `mcp/recibo.ts`: `{ chave, nome, antes, depois, resumo, avisos }`. Para esta ferramenta, `chave` recebe o **id** — é o que identifica o alvo aqui — e `antes`/`depois` trazem a categoria anterior e a nova, ou `'sem categoria'` quando nula.

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/escrita/categoria.test.ts`:

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
import { cadastrarParcelamento } from './cadastrar-parcelamento.js'
import { lancarAvulso } from './lancar-avulso.js'
import { marcarPago } from './marcar-pago.js'
import { definirCategoria } from './definir-categoria.js'

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

describe('categoria nas escritas', () => {
  it('cadastrar_recorrente grava a categoria', async () => {
    const r = await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
      categoria: 'moradia',
    })

    expect((await app.repos.regras.obter(r.id))?.categoria).toBe('moradia')
  })

  it('cadastrar_recorrente sem categoria grava nulo', async () => {
    const r = await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Sem categoria',
      valor: '100,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    expect((await app.repos.regras.obter(r.id))?.categoria).toBeNull()
  })

  it('lancar_avulso grava a categoria', async () => {
    const r = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Jaguar Sushi',
      valor: '111,00',
      hoje: HOJE,
      categoria: 'alimentacao_fora',
    })

    expect((await app.repos.ocorrencias.obter(r.id))?.categoria).toBe('alimentacao_fora')
  })

  it('cadastrar_parcelamento grava a categoria', async () => {
    const r = await cadastrarParcelamento(app, {
      nome: 'Geladeira',
      valorParcela: '300,00',
      quantidadeParcelas: 3,
      primeiroVencimento: '2026-10-20',
      categoria: 'compras',
    })

    expect((await app.repos.parcelamentos.obter(r.id))?.categoria).toBe('compras')
  })

  // A heranca e o que torna a feature barata: categorizar o aluguel e UMA
  // operacao, nao doze por ano.
  it('a conta gerada pela regra ja vem com a categoria da regra', async () => {
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
      categoria: 'moradia',
    })

    const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
    expect(m.faltaPagar.find((i) => i.nome === 'Aluguel')?.categoria).toBe('moradia')
  })
})

describe('definirCategoria', () => {
  async function regraSemCategoria() {
    return cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })
  }

  it('categoriza uma recorrencia que ja existia', async () => {
    const r = await regraSemCategoria()

    const recibo = await definirCategoria(app, {
      tipo: 'recorrente',
      id: r.id,
      categoria: 'moradia',
      hoje: HOJE,
    })

    expect(recibo.antes).toBe('sem categoria')
    expect(recibo.depois).toBe('moradia')
    expect((await app.repos.regras.obter(r.id))?.categoria).toBe('moradia')
  })

  it('categoriza um parcelamento que ja existia', async () => {
    const p = await cadastrarParcelamento(app, {
      nome: 'Geladeira',
      valorParcela: '300,00',
      quantidadeParcelas: 3,
      primeiroVencimento: '2026-10-20',
    })

    await definirCategoria(app, {
      tipo: 'parcelamento',
      id: p.id,
      categoria: 'compras',
      hoje: HOJE,
    })

    expect((await app.repos.parcelamentos.obter(p.id))?.categoria).toBe('compras')
  })

  it('categoriza um avulso que ja existia', async () => {
    const a = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Jaguar Sushi',
      valor: '111,00',
      hoje: HOJE,
    })

    await definirCategoria(app, {
      tipo: 'avulso',
      id: a.id,
      categoria: 'alimentacao_fora',
      hoje: HOJE,
    })

    expect((await app.repos.ocorrencias.obter(a.id))?.categoria).toBe('alimentacao_fora')
  })

  it('uma segunda chamada sobrescreve, e o recibo mostra a anterior', async () => {
    const r = await regraSemCategoria()
    await definirCategoria(app, { tipo: 'recorrente', id: r.id, categoria: 'outros', hoje: HOJE })

    const recibo = await definirCategoria(app, {
      tipo: 'recorrente',
      id: r.id,
      categoria: 'moradia',
      hoje: HOJE,
    })

    expect(recibo.antes).toBe('outros')
    expect(recibo.depois).toBe('moradia')
    expect((await app.repos.regras.obter(r.id))?.categoria).toBe('moradia')
  })

  it('recusa um id inexistente, sem gravar', async () => {
    await expect(
      definirCategoria(app, {
        tipo: 'recorrente',
        id: 'nao-existe',
        categoria: 'moradia',
        hoje: HOJE,
      }),
    ).rejects.toThrow(ErroDeUsuario)

    expect(await app.repos.regras.listar()).toEqual([])
  })

  // RN-52: recategorizar a regra nao reescreve o historico. A conta de
  // setembro, ja materializada, guarda a categoria que tinha.
  it('recategorizar a regra nao muda a ocorrencia ja materializada', async () => {
    const r = await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
      categoria: 'moradia',
    })

    const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
    const chave = m.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave
    await marcarPago(app, { chave, hoje: HOJE })

    await definirCategoria(app, { tipo: 'recorrente', id: r.id, categoria: 'outros', hoje: HOJE })

    const [materializada] = await app.repos.ocorrencias.listar()
    expect(materializada?.categoria).toBe('moradia')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run mcp/tools/escrita/categoria.test.ts
```

Esperado: FAIL — `definir-categoria.js` não resolve, e as três ferramentas ainda não aceitam `categoria`.

- [ ] **Step 3: As três ferramentas aceitam a categoria**

Em cada uma das três, acrescente ao tipo de args:

```ts
  readonly categoria?: Categoria
```

importando `Categoria` como type de `../../../src/domain/types.js`, e passe `categoria: args.categoria ?? null` no objeto salvo, junto dos demais campos.

Em `lancar-avulso.ts` o objeto é a `Ocorrencia`; em `cadastrar-recorrente.ts` é a `Regra`; em `cadastrar-parcelamento.ts` é o `Parcelamento`.

Acrescente ao `resumo` de cada recibo, quando houver categoria, um trecho como ` Categoria: ${args.categoria}.` — para a pessoa conferir o que o modelo escolheu.

- [ ] **Step 4: Escrever `definir-categoria.ts`**

```ts
/**
 * Define ou corrige a categoria de algo que ja existe.
 *
 * Sem esta ferramenta, os lancamentos anteriores a este projeto ficariam sem
 * categoria para sempre -- e o relatorio por setor nasceria vazio, so ficando
 * util depois de meses de lancamentos novos.
 *
 * Nao entra no `desfazer`: reverter e chamar de novo com a categoria anterior,
 * que o recibo mostra.
 */

import type { Categoria } from '../../../src/domain/types.js'
import type { AppPg } from '../../app-pg.js'
import type { ReciboDeAjuste } from '../../recibo.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'

export type TipoCategorizavel = 'recorrente' | 'parcelamento' | 'avulso'

export interface ArgsDefinirCategoria {
  readonly tipo: TipoCategorizavel
  readonly id: string
  readonly categoria: Categoria
  readonly hoje: string
}

/** Rotulo para o recibo: nulo vira texto, nao string vazia. */
function rotulo(c: Categoria | null): string {
  return c ?? 'sem categoria'
}

export async function definirCategoria(
  app: AppPg,
  args: ArgsDefinirCategoria,
): Promise<ReciboDeAjuste> {
  if (args.tipo === 'recorrente') {
    const regra = await app.repos.regras.obter(args.id)
    if (regra === null) {
      throw new ErroDeUsuario(
        `Nao encontrei nenhuma recorrencia com esse id. Confira em exportar ou no recibo do cadastro.`,
      )
    }

    await app.repos.regras.salvar({ ...regra, categoria: args.categoria })

    return {
      chave: args.id,
      nome: regra.nome,
      antes: rotulo(regra.categoria),
      depois: args.categoria,
      resumo: `"${regra.nome}" agora é ${args.categoria}.`,
      avisos: [
        'Vale para os próximos meses. As contas já materializadas guardam a categoria que tinham quando aconteceram.',
      ],
    }
  }

  if (args.tipo === 'parcelamento') {
    const p = await app.repos.parcelamentos.obter(args.id)
    if (p === null) {
      throw new ErroDeUsuario(
        `Nao encontrei nenhum parcelamento com esse id. Confira em exportar ou no recibo do cadastro.`,
      )
    }

    await app.repos.parcelamentos.salvar({ ...p, categoria: args.categoria })

    return {
      chave: args.id,
      nome: p.nome,
      antes: rotulo(p.categoria),
      depois: args.categoria,
      resumo: `"${p.nome}" agora é ${args.categoria}.`,
      avisos: [
        'Vale para as próximas parcelas. As já materializadas guardam a categoria que tinham.',
      ],
    }
  }

  const o = await app.repos.ocorrencias.obter(args.id)
  if (o === null) {
    throw new ErroDeUsuario(
      `Nao encontrei nenhum lancamento avulso com esse id. Confira em exportar ou no recibo do lancamento.`,
    )
  }

  await app.repos.ocorrencias.salvar({ ...o, categoria: args.categoria })

  return {
    chave: args.id,
    nome: o.nome,
    antes: rotulo(o.categoria),
    depois: args.categoria,
    resumo: `"${o.nome}" agora é ${args.categoria}.`,
    avisos: [],
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
npx vitest run mcp/tools/escrita/categoria.test.ts
```

Esperado: PASS, 11 testes.

- [ ] **Step 6: Typecheck e commit**

```bash
npx tsc -p mcp/tsconfig.json && git add mcp/tools/escrita && git commit -m "Categoria nas escritas e definir_categoria para o retroativo"
```

---

### Task 4: O relatório por categoria e o registro no servidor

**Files:**
- Modify: `mcp/tools/historico-de-gastos.ts`
- Modify: `mcp/formatacao.ts` (expor `categoria` em `ItemFormatado`)
- Modify: `mcp/servidor-http.ts`
- Modify: `mcp/servidor-http.test.ts`
- Modify: `mcp/README-remoto.md`
- Test: `mcp/historico-por-categoria.test.ts`

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: `historicoDeGastos` com `agruparPor?: 'nome' | 'categoria'`; as ferramentas `definir_categoria` e o parâmetro novo no protocolo.

**Decisão de nome que o implementador deve seguir:** o campo `nome` de `GastoPorNome` passa a se chamar `grupo`, e o tipo passa a se chamar `GastoPorGrupo`. Com `agruparPor: 'categoria'`, um campo chamado `nome` contendo `"mercado"` é confuso para quem lê a resposta. A ferramenta é lida pelo modelo a cada chamada, então renomear não quebra nada persistido.

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/historico-por-categoria.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from './dados/conexao.js'
import { aplicarMigracoes } from './dados/migracoes.js'
import { criarAppPg, type AppPg } from './app-pg.js'
import { historicoDeGastos } from './tools/historico-de-gastos.js'
import { situacaoDoMes } from './tools/situacao-do-mes.js'
import { lancarAvulso } from './tools/escrita/lancar-avulso.js'
import { marcarPago } from './tools/escrita/marcar-pago.js'

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

/** Lanca um avulso e ja o marca como pago -- o relatorio so conta pagos. */
async function gastoPago(
  nome: string,
  valor: string,
  categoria?: 'mercado' | 'alimentacao_fora',
): Promise<void> {
  await lancarAvulso(app, {
    tipo: 'saida',
    nome,
    valor,
    hoje: HOJE,
    ...(categoria === undefined ? {} : { categoria }),
  })
  const m = await situacaoDoMes(app, { competencia: '2026-09', hoje: HOJE })
  const alvo = m.faltaPagar.find((i) => i.nome === nome)
  if (alvo === undefined) throw new Error(`${nome} nao encontrado`)
  await marcarPago(app, { chave: alvo.chave, hoje: HOJE })
}

describe('historicoDeGastos por categoria', () => {
  it('soma varios lancamentos do mesmo setor', async () => {
    await gastoPago('Supermercado A', '200,00', 'mercado')
    await gastoPago('Supermercado B', '150,00', 'mercado')
    await gastoPago('Jaguar Sushi', '111,00', 'alimentacao_fora')

    const h = await historicoDeGastos(app, { agruparPor: 'categoria', hoje: HOJE })

    const mercado = h.itens.find((i) => i.grupo === 'mercado')
    expect(mercado?.total.valorCentavos).toBe(35_000)
    const fora = h.itens.find((i) => i.grupo === 'alimentacao_fora')
    expect(fora?.total.valorCentavos).toBe(11_100)
  })

  // Um relatorio que soma parte do dinheiro e o apresenta como o todo e pior
  // que um que admite a lacuna.
  it('mostra os sem categoria numa linha propria, dentro do total geral', async () => {
    await gastoPago('Supermercado', '200,00', 'mercado')
    await gastoPago('Coisa nao classificada', '50,00')

    const h = await historicoDeGastos(app, { agruparPor: 'categoria', hoje: HOJE })

    const sem = h.itens.find((i) => i.grupo === 'sem_categoria')
    expect(sem?.total.valorCentavos).toBe(5_000)
    expect(h.totalGeral.valorCentavos).toBe(25_000)
  })

  it('agrupa por nome quando nao se pede categoria', async () => {
    await gastoPago('Supermercado A', '200,00', 'mercado')
    await gastoPago('Supermercado B', '150,00', 'mercado')

    const h = await historicoDeGastos(app, { hoje: HOJE })

    expect(h.itens.map((i) => i.grupo).sort()).toEqual(['Supermercado A', 'Supermercado B'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run mcp/historico-por-categoria.test.ts
```

Esperado: FAIL — `agruparPor` não existe e os itens ainda têm `nome`.

- [ ] **Step 3: O agrupamento**

Em `mcp/tools/historico-de-gastos.ts`:

Renomeie a interface `GastoPorNome` para `GastoPorGrupo` e o campo `nome` para `grupo`. Acrescente ao tipo dos args:

```ts
  agruparPor?: 'nome' | 'categoria'
```

Troque a linha que monta a chave do agrupamento. Onde hoje há `const porMes = porNome.get(o.nome) ?? ...`, use uma chave calculada antes do laço:

```ts
  const porGrupo = new Map<string, Map<string, number>>()

  for (const o of pagas) {
    const valor = o.valorPagoCentavos ?? o.valorPrevistoCentavos

    // Nulo vira uma linha propria em vez de sumir: um relatorio que soma
    // parte do dinheiro e o apresenta como o todo e pior que um que admite a
    // lacuna.
    const chave =
      args.agruparPor === 'categoria' ? (o.categoria ?? 'sem_categoria') : o.nome

    const porMes = porGrupo.get(chave) ?? new Map<string, number>()
    porMes.set(o.competencia, (porMes.get(o.competencia) ?? 0) + valor)
    porGrupo.set(chave, porMes)
  }
```

E no `.map` que monta os itens, troque `nome` por `grupo`. Ajuste o comentário de cabeçalho do arquivo para mencionar os dois eixos.

**O filtro `nome` continua filtrando por nome** mesmo quando se agrupa por categoria — são coisas diferentes: um recorta o conjunto, o outro escolhe o eixo.

- [ ] **Step 4: Expor a categoria nas listas**

Em `mcp/formatacao.ts`, acrescente a `ItemFormatado`:

```ts
  readonly categoria: string | null
```

e no mapeador `item`:

```ts
    categoria: o.categoria,
```

Isso é o que faz a categoria aparecer em `situacao_do_mes` — sem ela, o usuário não vê o que foi classificado nem consegue conferir a sugestão do modelo.

- [ ] **Step 5: Registrar no servidor**

Em `mcp/servidor-http.ts`, acrescente o import de `definirCategoria` e de `CATEGORIAS`:

```ts
import { CATEGORIAS } from '../src/domain/types.js'
import { definirCategoria } from './tools/escrita/definir-categoria.js'
```

Acrescente `categoria` ao `inputSchema` das três ferramentas de escrita já registradas:

```ts
        categoria: z
          .enum(CATEGORIAS)
          .optional()
          .describe('Categoria do gasto. Sugira a partir do nome e confirme com o usuario'),
```

e espalhe no corpo com `...(categoria === undefined ? {} : { categoria })`.

Acrescente `agruparPor` ao `inputSchema` de `historico_de_gastos`:

```ts
        agruparPor: z
          .enum(['nome', 'categoria'])
          .optional()
          .describe('Eixo do agrupamento. Padrao: nome'),
```

E registre a ferramenta nova:

```ts
  server.registerTool(
    'definir_categoria',
    {
      title: 'Definir categoria',
      description:
        'Define ou corrige a categoria de algo que ja existe, usando o id do ' +
        'recibo ou de exportar. E como se categoriza o que foi cadastrado ' +
        'antes de as categorias existirem. Vale para os proximos meses: as ' +
        'contas ja materializadas guardam a categoria que tinham quando ' +
        'aconteceram.',
      inputSchema: {
        tipo: z.enum(['recorrente', 'parcelamento', 'avulso']),
        id: z.string().min(1).describe('O id do recibo ou de exportar'),
        categoria: z.enum(CATEGORIAS),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ tipo, id, categoria, hoje }) =>
      executarFerramenta(() =>
        definirCategoria(app, { tipo, id, categoria, hoje: hoje ?? hojeDoSistema() }),
      ),
  )
```

Atualize a descrição de `historico_de_gastos` para mencionar os dois eixos.

- [ ] **Step 6: Teste de protocolo**

Em `mcp/servidor-http.test.ts`, dentro do `describe` das ferramentas financeiras:

```ts
    it('historico_de_gastos agrupa por categoria pelo protocolo', async () => {
      await chamarFerramenta('lancar_avulso', {
        tipo: 'saida',
        nome: 'Mercado protocolo',
        valor: '200,00',
        hoje: '2026-09-15',
        categoria: 'mercado',
      })
      const s = await chamarFerramenta('situacao_do_mes', { hoje: '2026-09-15' })
      const chave = (JSON.parse(s.content[0]?.text ?? '{}') as {
        faltaPagar: { nome: string; chave: string }[]
      }).faltaPagar.find((i) => i.nome === 'Mercado protocolo')?.chave
      await chamarFerramenta('marcar_pago', { chave, hoje: '2026-09-15' })

      const r = await chamarFerramenta('historico_de_gastos', {
        agruparPor: 'categoria',
        hoje: '2026-09-15',
      })

      expect(r.isError).not.toBe(true)
      const h = JSON.parse(r.content[0]?.text ?? '{}') as {
        itens: { grupo: string; total: { valorCentavos: number } }[]
      }
      expect(h.itens.find((i) => i.grupo === 'mercado')?.total.valorCentavos).toBe(20_000)
    })

    it('definir_categoria recusa id inexistente pelo protocolo', async () => {
      const r = await chamarFerramenta('definir_categoria', {
        tipo: 'recorrente',
        id: 'nao-existe',
        categoria: 'moradia',
        hoje: '2026-09-15',
      })

      expect(r.isError).toBe(true)
      expect(r.content[0]?.text).toMatch(/recorrencia|id/iu)
    })
```

Esta feature não cria tabela nova, então a lista de tabelas limpas no `beforeEach` não muda. Atualize o título do `describe` e o comentário acima de `chamarFerramenta`, que dizem "dezesseis ferramentas financeiras" — passam a ser dezessete (dezoito com `ping`).

- [ ] **Step 7: Atualizar o README**

Em `mcp/README-remoto.md`, a lista passa de dezessete para dezoito ferramentas. Acrescente:

```markdown
| `definir_categoria` | Define ou corrige a categoria de uma recorrência, parcelamento ou avulso |
```

E mencione, na linha de `historico_de_gastos`, que ela agrupa por nome ou por categoria. Se o texto corrido declarar um número de ferramentas, atualize-o.

- [ ] **Step 8: Suíte inteira, typechecks e lint**

```bash
npm test && npx tsc --noEmit && npx tsc -p mcp/tsconfig.json && npm run lint
```

- [ ] **Step 9: Commit**

```bash
git add mcp && git commit -m "Relatorio por categoria e registro de definir_categoria"
```

---

## Depois do plano

O deploy não é automático: `git push` publica o código, mas a Railway precisa ser disparada por `connect_service_source` na API.

Registrar a execução em `aidlc-docs/audit.md`, em modo append, conforme o `.claude/CLAUDE.md` do repositório.

**Depois do deploy, o usuário precisa categorizar o que já existe** — sete recorrências e sete parcelamentos — com `definir_categoria`. Até lá o relatório por categoria mostra quase tudo em `sem_categoria`, o que é o comportamento correto e não um defeito.
