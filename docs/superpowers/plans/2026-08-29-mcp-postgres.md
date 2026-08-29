# MCP com Postgres — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a persistência de IndexedDB para Postgres e dar ao servidor MCP remoto as ferramentas de escrita que o tornam utilizável — cadastrar, lançar, pagar, declarar saldo — mais a consulta do mês.

**Architecture:** Uma implementação de `Repositorios` sobre Postgres, satisfeita estruturalmente, faz `criarProjectionService` e `criarPaymentService` funcionarem sem alteração. O domínio e os serviços não são tocados. As ferramentas de escrita devolvem recibo e existe `desfazer` com janela de 24 horas.

**Tech Stack:** TypeScript, Node 20+, `pg` (node-postgres), `@modelcontextprotocol/sdk` 1.30.0, Express 5, `testcontainers`, Vitest, Railway.

## Global Constraints

- **Nenhum arquivo dentro de `src/` pode ser modificado.** Todo código novo vive em `mcp/`. `src/` morre no Projeto 3, não aqui.
- **`mcp/server.ts`, o servidor stdio antigo, não é tocado.** Ele lê o backup do GitHub e também morre no Projeto 3.
- **Dinheiro é `BIGINT` no banco e inteiro em centavos no código.** Nunca `NUMERIC`, `DECIMAL` ou `FLOAT` — o driver devolveria string ou float e reintroduziria a classe de erro que RN-01 elimina.
- **Datas e competências são `TEXT` no banco.** Nunca `DATE`: o driver `pg` converte `DATE` em `Date` do JavaScript aplicando fuso, e um salário do dia 10 voltaria como dia 9 às 21h (RN-04).
- **A data corrente nunca é lida do relógio dentro de lógica** — entra como parâmetro `hoje: DataISO`. Só `mcp/servidor-http.ts` consulta o relógio.
- **A `DATABASE_URL` contém a senha do banco.** Nenhum log ou mensagem de erro pode carregar a mensagem crua de um erro do `pg`, nem o objeto de erro. Registra-se a classe do erro e o `code` do Postgres, nada mais.
- **Nenhum segredo, valor monetário ou corpo de requisição vai para log.**
- **Imports internos levam a extensão `.js`.**
- **Asserção de moeda nunca usa espaço ASCII literal** — `Intl` em pt-BR emite U+202F. Use `toMatch(/^R\$\s?1\.234,56$/u)`.
- Branch: `mcp-postgres`. Spec: `docs/superpowers/specs/2026-08-29-mcp-postgres-design.md`.

---

## Fatos verificados no código, não presuma outra coisa

**`criarProjectionService(repos)` e `criarPaymentService(repos)` dependem apenas de `Repositorios`.** Podem ser usados sem alteração.

**`criarRuleService(db, repos)` recebe o `BancoFinanceiro` do Dexie**, por causa da transação em `editarRegra`. **Não use o rule-service neste projeto.** `cadastrar_recorrente` só precisa criar, e criar é duas linhas pelo repositório:

```ts
const regra: Regra = { ...dados, id: novoId() }
await repos.regras.salvar(regra)
```

`editarRegra` não está no escopo. Quando estiver, a transação precisará de uma solução própria em Postgres.

**`repos.ancoras.salvar(a, hoje)` recebe dois argumentos** — o segundo é a data corrente, usada por `validarAncora` para rejeitar âncora futura. As outras entidades têm `salvar(x)` com um argumento.

**As validações de `src/data/invariants.ts` são funções puras** e devem ser chamadas pela implementação Postgres exatamente como a Dexie chama: `validarRegra`, `validarParcelamento`, `validarOcorrencia`, `validarAncora`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `mcp/dados/conexao.ts` | Pool do `pg` em escopo de módulo, leitura da `DATABASE_URL`, tradução de erro sem vazar |
| `mcp/dados/migracoes.ts` | SQL das migrações e o aplicador sob advisory lock |
| `mcp/dados/repositorios-pg.ts` | `criarRepositoriosPg(pool)` — os cinco repositórios |
| `mcp/dados/auditoria.ts` | `criadoEm(tabela, id)` — insumo da janela de desfazer |
| `mcp/dados/contrato.test.ts` | Suíte de contrato rodada contra Dexie e Postgres |
| `mcp/app-pg.ts` | Monta repositórios e serviços sobre o pool |
| `mcp/recibo.ts` | Tipo `Recibo` e montagem do resumo legível |
| `mcp/tools/escrita/*.ts` | Uma ferramenta de escrita por arquivo |
| `mcp/tools/desfazer.ts`, `mcp/tools/exportar.ts` | Utilidades |

---

## Task 1: Conexão, esquema e migrações

**Files:**
- Create: `mcp/dados/conexao.ts`, `mcp/dados/migracoes.ts`, `mcp/dados/migracoes.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `function criarPool(url: string): Pool`
  - `function lerUrlDoBanco(env: Record<string, string | undefined>): string` — lança quando ausente
  - `function descreverErro(e: unknown): string` — nunca inclui a mensagem crua
  - `async function aplicarMigracoes(pool: Pool): Promise<number>` — devolve a versão final

- [ ] **Step 1: Instalar dependências**

```bash
npm install pg
npm install --save-dev @types/pg testcontainers @testcontainers/postgresql
```

`pg` é dependência de execução; os containers só rodam em teste.

- [ ] **Step 2: Escrever o teste que falha**

Crie `mcp/dados/migracoes.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool, descreverErro, lerUrlDoBanco } from './conexao.js'
import { aplicarMigracoes } from './migracoes.js'

describe('lerUrlDoBanco', () => {
  it('devolve a url quando definida', () => {
    expect(lerUrlDoBanco({ DATABASE_URL: 'postgres://x' })).toBe('postgres://x')
  })

  it('lanca quando ausente', () => {
    expect(() => lerUrlDoBanco({})).toThrow(/DATABASE_URL/)
  })

  it('nao repete a url na mensagem de erro', () => {
    // A url carrega a senha do banco. A mensagem cita o NOME da variavel.
    const url = 'postgres://usuario:senha-secreta@host/banco'
    try {
      lerUrlDoBanco({ DATABASE_URL: '   ' })
      expect.unreachable('deveria ter lancado')
    } catch (e) {
      expect(String(e)).not.toContain('senha-secreta')
      expect(String(e)).not.toContain(url)
    }
  })
})

describe('descreverErro', () => {
  it('nao inclui a mensagem crua', () => {
    const erro = Object.assign(new Error('connection to postgres://u:senha@h failed'), {
      code: '28P01',
    })

    const texto = descreverErro(erro)

    expect(texto).not.toContain('senha')
    expect(texto).not.toContain('connection to')
    expect(texto).toContain('28P01')
    expect(texto).toContain('Error')
  })

  it('lida com valor que nao e Error', () => {
    expect(descreverErro('qualquer coisa')).not.toContain('qualquer coisa')
  })
})

describe('aplicarMigracoes', () => {
  let container: StartedPostgreSqlContainer
  let pool: Pool

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start()
    pool = criarPool(container.getConnectionUri())
  }, 120_000)

  afterAll(async () => {
    await pool.end()
    await container.stop()
  })

  it('cria as cinco tabelas', async () => {
    await aplicarMigracoes(pool)

    const r = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`,
    )
    const nomes = r.rows.map((x) => x.table_name)

    expect(nomes).toContain('regras')
    expect(nomes).toContain('parcelamentos')
    expect(nomes).toContain('ocorrencias')
    expect(nomes).toContain('ancoras')
    expect(nomes).toContain('configuracoes')
  })

  it('e idempotente: aplicar duas vezes nao falha', async () => {
    const primeira = await aplicarMigracoes(pool)
    const segunda = await aplicarMigracoes(pool)

    expect(segunda).toBe(primeira)
  })

  it('o banco rejeita chave de sobreposicao duplicada', async () => {
    // Isto e metade do valor de migrar: a nao-duplicacao deixa de ser
    // convencao do codigo e passa a ser invariante do banco.
    await aplicarMigracoes(pool)

    const inserir = (id: string) =>
      pool.query(
        `insert into ocorrencias
         (id, gerador_tipo, gerador_id, competencia, tipo, nome,
          valor_previsto_centavos, data_vencimento, data_pagamento,
          valor_pago_centavos, ignorado, observacao)
         values ($1,'regra','r-1','2026-03','saida','Aluguel',
                 180000,'2026-03-10',null,null,false,null)`,
        [id],
      )

    await inserir('o-1')
    await expect(inserir('o-2')).rejects.toThrow()
  })

  it('o banco rejeita duas ancoras na mesma data', async () => {
    await aplicarMigracoes(pool)

    const inserir = (id: string) =>
      pool.query(`insert into ancoras (id, data, saldo_centavos) values ($1,'2026-04-01',120000)`, [
        id,
      ])

    await inserir('a-1')
    await expect(inserir('a-2')).rejects.toThrow()
  })

  it('dinheiro volta como numero inteiro, nao string', async () => {
    // BIGINT volta como string no driver pg por padrao. A conversao precisa
    // acontecer, senao centavos viram texto e a aritmetica do dominio quebra
    // silenciosamente ('100' + 1 === '1001').
    await aplicarMigracoes(pool)
    await pool.query(
      `insert into ancoras (id, data, saldo_centavos) values ('a-num','2026-05-01',123456)`,
    )

    const r = await pool.query<{ saldo_centavos: number }>(
      `select saldo_centavos from ancoras where id = 'a-num'`,
    )

    expect(r.rows[0]?.saldo_centavos).toBe(123456)
    expect(typeof r.rows[0]?.saldo_centavos).toBe('number')
  })
})
```

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
npm test -- mcp/dados/migracoes.test.ts
```

Esperado: FAIL, módulos não encontrados. O container pode demorar na primeira execução, baixando a imagem.

- [ ] **Step 4: Implementar `mcp/dados/conexao.ts`**

```ts
/**
 * Conexao com o Postgres.
 *
 * O pool vive em escopo de modulo, nao por requisicao: `criarServidorMcp()`
 * roda a cada chamada, e um pool criado la abriria uma conexao por consulta.
 */

import pg, { type Pool } from 'pg'

const NOME_DA_VARIAVEL = 'DATABASE_URL'

/**
 * BIGINT volta como string no driver por padrao, para nao perder precisao
 * acima de 2^53. Centavos nunca chegam perto disso, e string quebraria a
 * aritmetica do dominio em silencio: '100' + 1 da '1001'.
 *
 * O parser 20 e o do BIGINT (int8).
 */
pg.types.setTypeParser(20, (valor: string) => Number.parseInt(valor, 10))

export function lerUrlDoBanco(env: Record<string, string | undefined>): string {
  const valor = env[NOME_DA_VARIAVEL]

  if (valor === undefined || valor.trim() === '') {
    throw new Error(
      `${NOME_DA_VARIAVEL} nao esta definida. O servidor nao sobe sem banco.`,
    )
  }

  return valor.trim()
}

export function criarPool(url: string): Pool {
  return new pg.Pool({ connectionString: url, max: 5 })
}

/**
 * Descricao segura de um erro do banco.
 *
 * A mensagem crua do `pg` pode conter a string de conexao inteira, senha
 * inclusa. O que se registra e a classe e o codigo do Postgres -- suficiente
 * para diagnosticar, insuficiente para vazar.
 */
export function descreverErro(e: unknown): string {
  if (!(e instanceof Error)) return 'erro nao-Error'

  const codigo = (e as { code?: unknown }).code
  const sufixo = typeof codigo === 'string' ? ` code=${codigo}` : ''

  return `${e.name}${sufixo}`
}
```

- [ ] **Step 5: Implementar `mcp/dados/migracoes.ts`**

```ts
/**
 * Migracoes do esquema.
 *
 * O SQL vive embutido, nao em arquivos .sql: ler arquivo em runtime depende do
 * diretorio de trabalho e do que o empacotador copiou, e ja quebrou um deploy
 * neste projeto por motivo parecido.
 *
 * DINHEIRO e BIGINT. Nunca NUMERIC, DECIMAL ou FLOAT: o driver devolveria
 * string ou float e reintroduziria o erro que centavos inteiros eliminam.
 *
 * DATAS sao TEXT. Nunca DATE: o driver converte DATE em Date do JavaScript
 * aplicando fuso, e um salario do dia 10 voltaria como dia 9 as 21h.
 */

import type { Pool } from 'pg'

/** Identificador do lock. Qualquer numero serve, desde que seja sempre o mesmo. */
const CHAVE_DO_LOCK = 8_742_301

const MIGRACOES: readonly string[] = [
  `
  create table if not exists regras (
    id text primary key,
    tipo text not null,
    nome text not null,
    valor_centavos bigint not null,
    valor_eh_estimativa boolean not null,
    dia_do_mes integer not null,
    ajuste_fim_de_semana text not null,
    vigente_de text not null,
    vigente_ate text,
    criado_em timestamptz not null default now()
  );

  create table if not exists parcelamentos (
    id text primary key,
    nome text not null,
    valor_parcela_centavos bigint not null,
    quantidade_parcelas integer not null,
    primeiro_vencimento text not null,
    criado_em timestamptz not null default now()
  );

  create table if not exists ocorrencias (
    id text primary key,
    gerador_tipo text not null,
    gerador_id text,
    competencia text not null,
    tipo text not null,
    nome text not null,
    valor_previsto_centavos bigint not null,
    data_vencimento text not null,
    data_pagamento text,
    valor_pago_centavos bigint,
    ignorado boolean not null,
    observacao text,
    criado_em timestamptz not null default now()
  );

  create index if not exists ocorrencias_competencia on ocorrencias (competencia);
  create index if not exists ocorrencias_gerador on ocorrencias (gerador_tipo, gerador_id);

  -- A chave de sobreposicao (RN-51). Avulsas tem gerador_id nulo e ficam fora
  -- do indice, que e correto: nunca sao buscadas por chave.
  create unique index if not exists ocorrencias_chave
    on ocorrencias (gerador_tipo, gerador_id, competencia)
    where gerador_id is not null;

  create table if not exists ancoras (
    id text primary key,
    data text not null,
    saldo_centavos bigint not null,
    criado_em timestamptz not null default now()
  );

  -- RN-50: nao existem duas ancoras na mesma data. A versao anterior mantinha
  -- as duas e desempatava por UUID, entao corrigir um saldo digitado errado
  -- funcionava em cerca de metade das vezes.
  create unique index if not exists ancoras_data on ancoras (data);

  create table if not exists configuracoes (
    chave text primary key,
    valor text not null,
    criado_em timestamptz not null default now()
  );
  `,
]

export async function aplicarMigracoes(pool: Pool): Promise<number> {
  const cliente = await pool.connect()

  try {
    // O lock impede que dois processos apliquem a mesma migracao ao subir
    // juntos. Ele e liberado no finally, e tambem se a conexao cair.
    await cliente.query('select pg_advisory_lock($1)', [CHAVE_DO_LOCK])

    await cliente.query(
      `create table if not exists migracoes (
        versao integer primary key,
        aplicada_em timestamptz not null default now()
      )`,
    )

    const r = await cliente.query<{ versao: number }>(
      'select coalesce(max(versao), 0) as versao from migracoes',
    )
    const atual = r.rows[0]?.versao ?? 0

    for (let i = atual; i < MIGRACOES.length; i += 1) {
      const sql = MIGRACOES[i]
      if (sql === undefined) continue

      await cliente.query('begin')
      try {
        await cliente.query(sql)
        await cliente.query('insert into migracoes (versao) values ($1)', [i + 1])
        await cliente.query('commit')
      } catch (e) {
        await cliente.query('rollback')
        throw e
      }
    }

    return MIGRACOES.length
  } finally {
    await cliente.query('select pg_advisory_unlock($1)', [CHAVE_DO_LOCK])
    cliente.release()
  }
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
npm test -- mcp/dados/migracoes.test.ts
```

Esperado: 9 testes PASS. A primeira execução baixa a imagem `postgres:16-alpine` e demora; as seguintes são rápidas.

- [ ] **Step 7: Verificar lint e tipos**

```bash
npm run lint && npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add mcp/dados/ package.json package-lock.json
git commit -m "Conexao, esquema e migracoes do Postgres"
```

---

## Task 2: Repositórios Postgres e suíte de contrato

**Files:**
- Create: `mcp/dados/repositorios-pg.ts`, `mcp/dados/auditoria.ts`, `mcp/dados/contrato.test.ts`

**Interfaces:**
- Consumes: `criarPool`, `descreverErro` de `mcp/dados/conexao.js`; `aplicarMigracoes` de `mcp/dados/migracoes.js`; `validarRegra`, `validarParcelamento`, `validarOcorrencia`, `validarAncora` de `src/data/invariants.js`; `Repositorios` de `src/data/repositories.js`
- Produces:
  - `function criarRepositoriosPg(pool: Pool): Repositorios`
  - `function criarAuditoria(pool: Pool): { criadoEm: (tabela: string, id: string) => Promise<Date | null> }`

- [ ] **Step 1: Escrever a suíte de contrato**

Crie `mcp/dados/contrato.test.ts`. Ela roda os mesmos casos contra as duas implementações — é o que pega divergência sutil entre Dexie e Postgres.

```ts
import 'fake-indexeddb/auto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import type { Repositorios } from '../../src/data/repositories.js'
import { criarRepositorios } from '../../src/data/repositories.js'
import { criarBanco } from '../../src/data/db.js'
import type { AncoraSaldo, Ocorrencia, Regra } from '../../src/domain/types.js'
import { criarPool } from './conexao.js'
import { aplicarMigracoes } from './migracoes.js'
import { criarRepositoriosPg } from './repositorios-pg.js'

const REGRA: Regra = {
  id: 'r-1',
  tipo: 'saida',
  nome: 'Aluguel',
  valorCentavos: 180000,
  valorEhEstimativa: false,
  diaDoMes: 10,
  ajusteFimDeSemana: 'nenhum',
  vigenteDe: '2026-01',
  vigenteAte: null,
}

const OCORRENCIA: Ocorrencia = {
  id: 'o-1',
  geradorTipo: 'regra',
  geradorId: 'r-1',
  competencia: '2026-03',
  tipo: 'saida',
  nome: 'Aluguel',
  valorPrevistoCentavos: 180000,
  dataVencimento: '2026-03-10',
  dataPagamento: null,
  valorPagoCentavos: null,
  ignorado: false,
  observacao: null,
}

const ANCORA: AncoraSaldo = { id: 'a-1', data: '2026-03-01', saldoCentavos: 120000 }

let container: StartedPostgreSqlContainer
let pool: Pool

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  pool = criarPool(container.getConnectionUri())
  await aplicarMigracoes(pool)
}, 120_000)

afterAll(async () => {
  await pool.end()
  await container.stop()
})

/**
 * Os mesmos casos contra as duas implementacoes.
 *
 * Uma divergencia entre Dexie e Postgres em `vigenteEm` ou
 * `listarPorIntervalo` so apareceria numa projecao errada meses depois. Aqui
 * ela falha na hora.
 */
const IMPLEMENTACOES: readonly [string, () => Promise<Repositorios>][] = [
  [
    'dexie',
    async () => {
      const db = criarBanco(`contrato-${crypto.randomUUID()}`)
      await db.open()
      return criarRepositorios(db)
    },
  ],
  [
    'postgres',
    async () => {
      for (const t of ['regras', 'parcelamentos', 'ocorrencias', 'ancoras', 'configuracoes']) {
        await pool.query(`delete from ${t}`)
      }
      return criarRepositoriosPg(pool)
    },
  ],
]

describe.each(IMPLEMENTACOES)('contrato de Repositorios (%s)', (_nome, montar) => {
  let repos: Repositorios

  beforeEach(async () => {
    repos = await montar()
  })

  it('salva e le uma regra', async () => {
    await repos.regras.salvar(REGRA)

    expect(await repos.regras.obter('r-1')).toEqual(REGRA)
    expect(await repos.regras.listar()).toEqual([REGRA])
  })

  it('devolve null para regra inexistente', async () => {
    expect(await repos.regras.obter('nao-existe')).toBeNull()
  })

  it('rejeita regra invalida', async () => {
    await expect(repos.regras.salvar({ ...REGRA, diaDoMes: 40 })).rejects.toThrow()
  })

  it('salvar duas vezes atualiza em vez de duplicar', async () => {
    await repos.regras.salvar(REGRA)
    await repos.regras.salvar({ ...REGRA, nome: 'Aluguel novo' })

    const todas = await repos.regras.listar()
    expect(todas).toHaveLength(1)
    expect(todas[0]?.nome).toBe('Aluguel novo')
  })

  it('remove regra sem cascatear para ocorrencias (RN-46)', async () => {
    await repos.regras.salvar(REGRA)
    await repos.ocorrencias.salvar(OCORRENCIA)

    await repos.regras.remover('r-1')

    expect(await repos.regras.obter('r-1')).toBeNull()
    expect(await repos.ocorrencias.obter('o-1')).toEqual(OCORRENCIA)
  })

  it('lista ocorrencias por intervalo, inclusive nas pontas', async () => {
    await repos.ocorrencias.salvar(OCORRENCIA)
    await repos.ocorrencias.salvar({ ...OCORRENCIA, id: 'o-2', competencia: '2026-05', geradorId: 'r-2' })
    await repos.ocorrencias.salvar({ ...OCORRENCIA, id: 'o-3', competencia: '2026-07', geradorId: 'r-3' })

    const achadas = await repos.ocorrencias.listarPorIntervalo('2026-03', '2026-05')

    expect(achadas.map((o) => o.id).sort()).toEqual(['o-1', 'o-2'])
  })

  it('acha por chave de sobreposicao', async () => {
    await repos.ocorrencias.salvar(OCORRENCIA)

    const achada = await repos.ocorrencias.obterPorChave('regra', 'r-1', '2026-03')

    expect(achada?.id).toBe('o-1')
  })

  it('devolve null quando a chave nao existe', async () => {
    expect(await repos.ocorrencias.obterPorChave('regra', 'nada', '2026-03')).toBeNull()
  })

  it('lista o historico de um gerador', async () => {
    await repos.ocorrencias.salvar(OCORRENCIA)
    await repos.ocorrencias.salvar({ ...OCORRENCIA, id: 'o-2', competencia: '2026-04' })

    const historico = await repos.ocorrencias.porGerador('regra', 'r-1')

    expect(historico).toHaveLength(2)
  })

  it('preserva nulos da ocorrencia', async () => {
    await repos.ocorrencias.salvar(OCORRENCIA)

    const lida = await repos.ocorrencias.obter('o-1')

    expect(lida?.dataPagamento).toBeNull()
    expect(lida?.valorPagoCentavos).toBeNull()
    expect(lida?.observacao).toBeNull()
  })

  it('preserva valores de pagamento quando presentes', async () => {
    await repos.ocorrencias.salvar({
      ...OCORRENCIA,
      dataPagamento: '2026-03-09',
      valorPagoCentavos: 179550,
      observacao: 'desconto',
    })

    const lida = await repos.ocorrencias.obter('o-1')

    expect(lida?.dataPagamento).toBe('2026-03-09')
    expect(lida?.valorPagoCentavos).toBe(179550)
    expect(typeof lida?.valorPagoCentavos).toBe('number')
    expect(lida?.observacao).toBe('desconto')
  })

  it('salva ancora e devolve a vigente na data', async () => {
    await repos.ancoras.salvar(ANCORA, '2026-03-20')

    expect(await repos.ancoras.vigenteEm('2026-03-20')).toEqual(ANCORA)
  })

  it('vigenteEm devolve a de maior data que nao ultrapassa (RN-49)', async () => {
    await repos.ancoras.salvar(ANCORA, '2026-05-20')
    await repos.ancoras.salvar({ id: 'a-2', data: '2026-04-01', saldoCentavos: 90000 }, '2026-05-20')

    const vigente = await repos.ancoras.vigenteEm('2026-04-15')

    expect(vigente?.id).toBe('a-2')
  })

  it('vigenteEm devolve null quando nao ha ancora anterior', async () => {
    await repos.ancoras.salvar(ANCORA, '2026-03-20')

    expect(await repos.ancoras.vigenteEm('2026-02-01')).toBeNull()
  })

  it('declarar saldo na mesma data substitui (RN-50)', async () => {
    await repos.ancoras.salvar(ANCORA, '2026-03-20')
    await repos.ancoras.salvar({ id: 'a-outra', data: '2026-03-01', saldoCentavos: 555 }, '2026-03-20')

    const todas = await repos.ancoras.listar()
    expect(todas).toHaveLength(1)
    expect(todas[0]?.saldoCentavos).toBe(555)
  })

  it('rejeita ancora com data futura', async () => {
    await expect(
      repos.ancoras.salvar({ id: 'a-f', data: '2027-01-01', saldoCentavos: 1 }, '2026-03-20'),
    ).rejects.toThrow()
  })

  it('guarda e le configuracao', async () => {
    await repos.configuracoes.definir('cor', 'azul')

    expect(await repos.configuracoes.obter('cor')).toBe('azul')
    expect(await repos.configuracoes.obter('inexistente')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que a metade Postgres falha**

```bash
npm test -- mcp/dados/contrato.test.ts
```

Esperado: os casos `dexie` PASSAM (a implementação existe), os `postgres` FALHAM com módulo não encontrado. Essa assimetria é a prova de que a suíte discrimina.

- [ ] **Step 3: Implementar `mcp/dados/repositorios-pg.ts`**

```ts
/**
 * Repositorios sobre Postgres.
 *
 * Satisfaz `Repositorios` estruturalmente: os servicos e o dominio nao sabem
 * que a persistencia mudou.
 *
 * As invariantes de `src/data/invariants.ts` sao chamadas aqui exatamente como
 * a implementacao Dexie chama. Elas sao o que impede um diaDoMes 40 ou um
 * centavo fracionado de entrar, e valem para qualquer banco.
 */

import type { Pool } from 'pg'
import type { Repositorios } from '../../src/data/repositories.js'
import {
  validarAncora,
  validarOcorrencia,
  validarParcelamento,
  validarRegra,
} from '../../src/data/invariants.js'
import type {
  AncoraSaldo,
  Competencia,
  DataISO,
  Ocorrencia,
  Parcelamento,
  Regra,
  TipoGerador,
} from '../../src/domain/types.js'

interface LinhaRegra {
  id: string
  tipo: string
  nome: string
  valor_centavos: number
  valor_eh_estimativa: boolean
  dia_do_mes: number
  ajuste_fim_de_semana: string
  vigente_de: string
  vigente_ate: string | null
}

function paraRegra(l: LinhaRegra): Regra {
  return {
    id: l.id,
    tipo: l.tipo as Regra['tipo'],
    nome: l.nome,
    valorCentavos: l.valor_centavos,
    valorEhEstimativa: l.valor_eh_estimativa,
    diaDoMes: l.dia_do_mes,
    ajusteFimDeSemana: l.ajuste_fim_de_semana as Regra['ajusteFimDeSemana'],
    vigenteDe: l.vigente_de,
    vigenteAte: l.vigente_ate,
  }
}

interface LinhaParcelamento {
  id: string
  nome: string
  valor_parcela_centavos: number
  quantidade_parcelas: number
  primeiro_vencimento: string
}

function paraParcelamento(l: LinhaParcelamento): Parcelamento {
  return {
    id: l.id,
    nome: l.nome,
    valorParcelaCentavos: l.valor_parcela_centavos,
    quantidadeParcelas: l.quantidade_parcelas,
    primeiroVencimento: l.primeiro_vencimento,
  }
}

interface LinhaOcorrencia {
  id: string
  gerador_tipo: string
  gerador_id: string | null
  competencia: string
  tipo: string
  nome: string
  valor_previsto_centavos: number
  data_vencimento: string
  data_pagamento: string | null
  valor_pago_centavos: number | null
  ignorado: boolean
  observacao: string | null
}

function paraOcorrencia(l: LinhaOcorrencia): Ocorrencia {
  return {
    id: l.id,
    geradorTipo: l.gerador_tipo as TipoGerador,
    geradorId: l.gerador_id,
    competencia: l.competencia,
    tipo: l.tipo as Ocorrencia['tipo'],
    nome: l.nome,
    valorPrevistoCentavos: l.valor_previsto_centavos,
    dataVencimento: l.data_vencimento,
    dataPagamento: l.data_pagamento,
    valorPagoCentavos: l.valor_pago_centavos,
    ignorado: l.ignorado,
    observacao: l.observacao,
  }
}

interface LinhaAncora {
  id: string
  data: string
  saldo_centavos: number
}

function paraAncora(l: LinhaAncora): AncoraSaldo {
  return { id: l.id, data: l.data, saldoCentavos: l.saldo_centavos }
}

export function criarRepositoriosPg(pool: Pool): Repositorios {
  return {
    regras: {
      listar: async (): Promise<Regra[]> => {
        const r = await pool.query<LinhaRegra>('select * from regras')
        return r.rows.map(paraRegra)
      },

      obter: async (id: string): Promise<Regra | null> => {
        const r = await pool.query<LinhaRegra>('select * from regras where id = $1', [id])
        const linha = r.rows[0]
        return linha === undefined ? null : paraRegra(linha)
      },

      salvar: async (x: Regra): Promise<void> => {
        validarRegra(x)
        await pool.query(
          `insert into regras
           (id, tipo, nome, valor_centavos, valor_eh_estimativa, dia_do_mes,
            ajuste_fim_de_semana, vigente_de, vigente_ate)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (id) do update set
             tipo = excluded.tipo, nome = excluded.nome,
             valor_centavos = excluded.valor_centavos,
             valor_eh_estimativa = excluded.valor_eh_estimativa,
             dia_do_mes = excluded.dia_do_mes,
             ajuste_fim_de_semana = excluded.ajuste_fim_de_semana,
             vigente_de = excluded.vigente_de, vigente_ate = excluded.vigente_ate`,
          [
            x.id,
            x.tipo,
            x.nome,
            x.valorCentavos,
            x.valorEhEstimativa,
            x.diaDoMes,
            x.ajusteFimDeSemana,
            x.vigenteDe,
            x.vigenteAte,
          ],
        )
      },

      /** RN-46: a remocao NAO cascateia. Ocorrencias materializadas permanecem. */
      remover: async (id: string): Promise<void> => {
        await pool.query('delete from regras where id = $1', [id])
      },
    },

    parcelamentos: {
      listar: async (): Promise<Parcelamento[]> => {
        const r = await pool.query<LinhaParcelamento>('select * from parcelamentos')
        return r.rows.map(paraParcelamento)
      },

      obter: async (id: string): Promise<Parcelamento | null> => {
        const r = await pool.query<LinhaParcelamento>(
          'select * from parcelamentos where id = $1',
          [id],
        )
        const linha = r.rows[0]
        return linha === undefined ? null : paraParcelamento(linha)
      },

      salvar: async (x: Parcelamento): Promise<void> => {
        validarParcelamento(x)
        await pool.query(
          `insert into parcelamentos
           (id, nome, valor_parcela_centavos, quantidade_parcelas, primeiro_vencimento)
           values ($1,$2,$3,$4,$5)
           on conflict (id) do update set
             nome = excluded.nome,
             valor_parcela_centavos = excluded.valor_parcela_centavos,
             quantidade_parcelas = excluded.quantidade_parcelas,
             primeiro_vencimento = excluded.primeiro_vencimento`,
          [x.id, x.nome, x.valorParcelaCentavos, x.quantidadeParcelas, x.primeiroVencimento],
        )
      },

      remover: async (id: string): Promise<void> => {
        await pool.query('delete from parcelamentos where id = $1', [id])
      },
    },

    ocorrencias: {
      listar: async (): Promise<Ocorrencia[]> => {
        const r = await pool.query<LinhaOcorrencia>('select * from ocorrencias')
        return r.rows.map(paraOcorrencia)
      },

      obter: async (id: string): Promise<Ocorrencia | null> => {
        const r = await pool.query<LinhaOcorrencia>('select * from ocorrencias where id = $1', [id])
        const linha = r.rows[0]
        return linha === undefined ? null : paraOcorrencia(linha)
      },

      salvar: async (x: Ocorrencia): Promise<void> => {
        validarOcorrencia(x)
        await pool.query(
          `insert into ocorrencias
           (id, gerador_tipo, gerador_id, competencia, tipo, nome,
            valor_previsto_centavos, data_vencimento, data_pagamento,
            valor_pago_centavos, ignorado, observacao)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           on conflict (id) do update set
             gerador_tipo = excluded.gerador_tipo, gerador_id = excluded.gerador_id,
             competencia = excluded.competencia, tipo = excluded.tipo,
             nome = excluded.nome,
             valor_previsto_centavos = excluded.valor_previsto_centavos,
             data_vencimento = excluded.data_vencimento,
             data_pagamento = excluded.data_pagamento,
             valor_pago_centavos = excluded.valor_pago_centavos,
             ignorado = excluded.ignorado, observacao = excluded.observacao`,
          [
            x.id,
            x.geradorTipo,
            x.geradorId,
            x.competencia,
            x.tipo,
            x.nome,
            x.valorPrevistoCentavos,
            x.dataVencimento,
            x.dataPagamento,
            x.valorPagoCentavos,
            x.ignorado,
            x.observacao,
          ],
        )
      },

      remover: async (id: string): Promise<void> => {
        await pool.query('delete from ocorrencias where id = $1', [id])
      },

      listarPorIntervalo: async (de: Competencia, ate: Competencia): Promise<Ocorrencia[]> => {
        // Competencia e TEXT no formato AAAA-MM, que ordena lexicograficamente
        // igual a cronologicamente. `between` inclui as duas pontas, como a
        // implementacao Dexie.
        const r = await pool.query<LinhaOcorrencia>(
          'select * from ocorrencias where competencia between $1 and $2',
          [de, ate],
        )
        return r.rows.map(paraOcorrencia)
      },

      obterPorChave: async (
        geradorTipo: TipoGerador,
        geradorId: string,
        competencia: Competencia,
      ): Promise<Ocorrencia | null> => {
        const r = await pool.query<LinhaOcorrencia>(
          `select * from ocorrencias
           where gerador_tipo = $1 and gerador_id = $2 and competencia = $3`,
          [geradorTipo, geradorId, competencia],
        )
        const linha = r.rows[0]
        return linha === undefined ? null : paraOcorrencia(linha)
      },

      porGerador: async (
        geradorTipo: TipoGerador,
        geradorId: string,
      ): Promise<Ocorrencia[]> => {
        const r = await pool.query<LinhaOcorrencia>(
          'select * from ocorrencias where gerador_tipo = $1 and gerador_id = $2',
          [geradorTipo, geradorId],
        )
        return r.rows.map(paraOcorrencia)
      },
    },

    ancoras: {
      listar: async (): Promise<AncoraSaldo[]> => {
        const r = await pool.query<LinhaAncora>('select * from ancoras')
        return r.rows.map(paraAncora)
      },

      /**
       * RN-50: declarar o saldo de uma data que ja tem ancora SUBSTITUI.
       *
       * O indice unico em `data` faz o `on conflict (data)` resolver isso numa
       * unica instrucao -- a implementacao Dexie precisava de transacao e de um
       * laco apagando as da mesma data.
       */
      salvar: async (a: AncoraSaldo, hoje: DataISO): Promise<void> => {
        validarAncora(a, hoje)
        await pool.query(
          `insert into ancoras (id, data, saldo_centavos)
           values ($1,$2,$3)
           on conflict (data) do update set
             id = excluded.id, saldo_centavos = excluded.saldo_centavos`,
          [a.id, a.data, a.saldoCentavos],
        )
      },

      remover: async (id: string): Promise<void> => {
        await pool.query('delete from ancoras where id = $1', [id])
      },

      /** RN-49: a de maior data que nao ultrapassa a data pedida. */
      vigenteEm: async (data: DataISO): Promise<AncoraSaldo | null> => {
        const r = await pool.query<LinhaAncora>(
          'select * from ancoras where data <= $1 order by data desc limit 1',
          [data],
        )
        const linha = r.rows[0]
        return linha === undefined ? null : paraAncora(linha)
      },
    },

    configuracoes: {
      obter: async (chave: string): Promise<string | null> => {
        const r = await pool.query<{ valor: string }>(
          'select valor from configuracoes where chave = $1',
          [chave],
        )
        return r.rows[0]?.valor ?? null
      },

      definir: async (chave: string, valor: string): Promise<void> => {
        await pool.query(
          `insert into configuracoes (chave, valor) values ($1,$2)
           on conflict (chave) do update set valor = excluded.valor`,
          [chave, valor],
        )
      },

      ultimaExportacao: async (): Promise<DataISO | null> => {
        const r = await pool.query<{ valor: string }>(
          `select valor from configuracoes where chave = 'ultimaExportacao'`,
        )
        return r.rows[0]?.valor ?? null
      },

      registrarExportacao: async (data: DataISO): Promise<void> => {
        await pool.query(
          `insert into configuracoes (chave, valor) values ('ultimaExportacao', $1)
           on conflict (chave) do update set valor = excluded.valor`,
          [data],
        )
      },
    },
  }
}
```

- [ ] **Step 4: Implementar `mcp/dados/auditoria.ts`**

```ts
/**
 * Consulta a `criado_em`, que os repositorios nao expoem.
 *
 * Existe para a janela de `desfazer`: os tipos do dominio nao carregam o
 * instante de criacao, e nao devem carregar -- e metadado de persistencia, nao
 * de negocio.
 */

import type { Pool } from 'pg'

/** Lista fechada: o nome da tabela nao pode vir de fora sem isto. */
const TABELAS = ['regras', 'parcelamentos', 'ocorrencias', 'ancoras'] as const

export type TabelaAuditavel = (typeof TABELAS)[number]

export function criarAuditoria(pool: Pool): {
  criadoEm: (tabela: TabelaAuditavel, id: string) => Promise<Date | null>
} {
  return {
    criadoEm: async (tabela: TabelaAuditavel, id: string): Promise<Date | null> => {
      // O nome da tabela e interpolado, nao parametrizado -- o Postgres nao
      // aceita parametro em posicao de identificador. A lista fechada acima e
      // o que torna isso seguro: um valor fora dela nao chega aqui.
      if (!TABELAS.includes(tabela)) {
        throw new Error('tabela nao auditavel')
      }

      const r = await pool.query<{ criado_em: Date }>(
        `select criado_em from ${tabela} where id = $1`,
        [id],
      )
      return r.rows[0]?.criado_em ?? null
    },
  }
}
```

- [ ] **Step 5: Rodar e confirmar que as duas implementações passam**

```bash
npm test -- mcp/dados/contrato.test.ts
```

Esperado: 17 casos × 2 implementações = 34 PASS.

Se algum caso passar em Dexie e falhar em Postgres, **não relaxe a asserção** — a divergência é o defeito que a suíte existe para achar.

- [ ] **Step 6: Verificar lint e tipos**

```bash
npm run lint && npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add mcp/dados/
git commit -m "Repositorios Postgres com suite de contrato"
```

---

## Task 3: Montagem da aplicação e a consulta do mês

**Files:**
- Create: `mcp/app-pg.ts`, `mcp/app-pg.test.ts`
- Modify: `mcp/formatacao.ts` (expor `chave` em `ItemFormatado`), `mcp/tools/situacao-do-mes.ts` (receber serviços em vez de `AppEmMemoria`)

**Interfaces:**
- Consumes: `criarRepositoriosPg`, `criarAuditoria`, `criarPool`, `aplicarMigracoes`
- Produces:
  - `interface AppPg { readonly repos: Repositorios; readonly projecao: ProjectionService; readonly pagamento: PaymentService; readonly auditoria: ReturnType<typeof criarAuditoria> }`
  - `function criarAppPg(pool: Pool): AppPg`
  - `situacaoDoMes(app: AppPg, args)` — assinatura alterada

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/app-pg.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from './dados/conexao.js'
import { aplicarMigracoes } from './dados/migracoes.js'
import { criarAppPg, type AppPg } from './app-pg.js'
import { situacaoDoMes } from './tools/situacao-do-mes.js'

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
  for (const t of ['regras', 'parcelamentos', 'ocorrencias', 'ancoras', 'configuracoes']) {
    await pool.query(`delete from ${t}`)
  }
})

describe('situacaoDoMes sobre Postgres', () => {
  it('projeta a partir de uma regra gravada', async () => {
    await app.repos.regras.salvar({
      id: 'r-aluguel',
      tipo: 'saida',
      nome: 'Aluguel',
      valorCentavos: 180000,
      valorEhEstimativa: false,
      diaDoMes: 10,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-03',
      vigenteAte: null,
    })

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-05' })

    expect(r.faltaPagar.map((i) => i.nome)).toContain('Aluguel')
    expect(r.totalFaltaPagar.valorCentavos).toBe(180000)
  })

  it('marca saldoRelativo sem ancora e emite o aviso', async () => {
    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-05' })

    expect(r.saldoRelativo).toBe(true)
    expect(r.avisoSaldoRelativo).not.toBeNull()
  })

  it('deixa de ser relativo quando ha ancora', async () => {
    await app.repos.ancoras.salvar(
      { id: 'a-1', data: '2026-03-01', saldoCentavos: 120000 },
      '2026-03-05',
    )

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-05' })

    expect(r.saldoRelativo).toBe(false)
    expect(r.avisoSaldoRelativo).toBeNull()
  })

  it('expoe a chave de cada item, para a escrita poder referenciar', async () => {
    await app.repos.regras.salvar({
      id: 'r-luz',
      tipo: 'saida',
      nome: 'Luz',
      valorCentavos: 22000,
      valorEhEstimativa: true,
      diaDoMes: 15,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-03',
      vigenteAte: null,
    })

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-05' })
    const luz = r.faltaPagar.find((i) => i.nome === 'Luz')

    // Sem a chave, `marcar_pago` nao teria como referenciar uma ocorrencia que
    // ainda nao existe no banco.
    expect(luz?.chave).toBeTypeOf('string')
    expect(luz?.chave.length).toBeGreaterThan(0)
  })

  it('nao expoe idReal, que e detalhe de persistencia', async () => {
    await app.repos.ocorrencias.salvar({
      id: 'o-1',
      geradorTipo: 'avulso',
      geradorId: null,
      competencia: '2026-03',
      tipo: 'saida',
      nome: 'Pneu',
      valorPrevistoCentavos: 85000,
      dataVencimento: '2026-03-12',
      dataPagamento: null,
      valorPagoCentavos: null,
      ignorado: false,
      observacao: null,
    })

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-05' })
    const pneu = r.faltaPagar.find((i) => i.nome === 'Pneu')

    expect(pneu).toBeDefined()
    expect(pneu).not.toHaveProperty('idReal')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/app-pg.test.ts
```

Esperado: FAIL, `./app-pg.js` não encontrado.

- [ ] **Step 3: Implementar `mcp/app-pg.ts`**

```ts
/**
 * A aplicacao sobre Postgres.
 *
 * `criarProjectionService` e `criarPaymentService` recebem apenas
 * `Repositorios`, entao funcionam sem alteracao. `criarRuleService` NAO e
 * usado: ele recebe o `BancoFinanceiro` do Dexie por causa da transacao em
 * `editarRegra`, e editar regra nao esta no escopo deste projeto.
 */

import type { Pool } from 'pg'
import type { Repositorios } from '../src/data/repositories.js'
import {
  criarProjectionService,
  type ProjectionService,
} from '../src/services/projection-service.js'
import { criarPaymentService, type PaymentService } from '../src/services/payment-service.js'
import { criarRepositoriosPg } from './dados/repositorios-pg.js'
import { criarAuditoria } from './dados/auditoria.js'

export interface AppPg {
  readonly repos: Repositorios
  readonly projecao: ProjectionService
  readonly pagamento: PaymentService
  readonly auditoria: ReturnType<typeof criarAuditoria>
}

export function criarAppPg(pool: Pool): AppPg {
  const repos = criarRepositoriosPg(pool)

  return {
    repos,
    projecao: criarProjectionService(repos),
    pagamento: criarPaymentService(repos),
    auditoria: criarAuditoria(pool),
  }
}
```

- [ ] **Step 4: Expor a chave em `mcp/formatacao.ts`**

Em `ItemFormatado`, acrescente o campo antes de `nome`:

```ts
export interface ItemFormatado {
  /**
   * Chave de sobreposicao. Identifica a ocorrencia entre uma consulta e a
   * escrita seguinte.
   *
   * A maior parte das ocorrencias NAO existe no banco -- contas de regra sao
   * virtuais ate alguem interagir. Sem a chave, `marcar_pago` nao teria como
   * referenciar o aluguel de setembro, que nao e uma linha, e sim o resultado
   * de expandir uma regra.
   *
   * `idReal` continua fora: e detalhe de persistencia e nao referencia nada
   * que o assistente precise.
   */
  readonly chave: string
  readonly nome: string
  // ... o resto como esta
}
```

E em `item()`, acrescente `chave: o.chave,` como primeiro campo do objeto devolvido. Não remova nada.

- [ ] **Step 5: Adaptar `mcp/tools/situacao-do-mes.ts`**

Troque o tipo do primeiro parâmetro de `AppEmMemoria` para `AppPg`, importando de `../app-pg.js`. O corpo não muda: ele só usa `app.projecao.projetarMes`, que existe nos dois.

O arquivo antigo `mcp/app-em-memoria.ts` continua existindo e é usado por `mcp/server.ts`, que não é tocado. Se o typecheck acusar que os testes antigos de `situacao-do-mes` passam um `AppEmMemoria`, ajuste-os para montar um `AppPg` — ou, se ficar custoso, reporte antes de reescrever testes em massa.

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
npm test -- mcp/app-pg.test.ts
```

Esperado: 5 testes PASS.

- [ ] **Step 7: Rodar toda a suíte de `mcp/`**

```bash
npx vitest run mcp && npm run lint && npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add mcp/
git commit -m "Monta a aplicacao sobre Postgres e porta a consulta do mes"
```

---

## Task 4: Recibos e a janela de desfazer

**Files:**
- Create: `mcp/recibo.ts`, `mcp/recibo.test.ts`

**Interfaces:**
- Consumes: `dinheiro` de `mcp/formatacao.js`; `formatarBRL` de `src/domain/money.js`
- Produces:
  - `type TipoDeEscrita = 'recorrente' | 'avulso' | 'pagamento' | 'saldo'`
  - `interface Recibo { readonly tipo: TipoDeEscrita; readonly id: string; readonly resumo: string; readonly avisos: readonly string[] }`
  - `function montarRecibo(tipo: TipoDeEscrita, id: string, resumo: string, avisos?: readonly string[]): Recibo`
  - `const JANELA_DE_DESFAZER_HORAS = 24`
  - `function dentroDaJanela(criadoEm: Date, agora: Date): boolean`

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/recibo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dentroDaJanela, JANELA_DE_DESFAZER_HORAS, montarRecibo } from './recibo.js'

describe('montarRecibo', () => {
  it('carrega tipo, id e resumo', () => {
    const r = montarRecibo('recorrente', 'r-1', 'Aluguel, R$ 1.800,00, todo dia 10')

    expect(r.tipo).toBe('recorrente')
    expect(r.id).toBe('r-1')
    expect(r.resumo).toContain('Aluguel')
    expect(r.avisos).toEqual([])
  })

  it('carrega avisos quando existem', () => {
    const r = montarRecibo('recorrente', 'r-1', 'x', ['ocorrencias permanecem'])

    expect(r.avisos).toEqual(['ocorrencias permanecem'])
  })
})

describe('dentroDaJanela', () => {
  const agora = new Date('2026-08-29T12:00:00.000Z')

  it('aceita o que foi criado ha uma hora', () => {
    expect(dentroDaJanela(new Date('2026-08-29T11:00:00.000Z'), agora)).toBe(true)
  })

  it('aceita o limite exato', () => {
    expect(dentroDaJanela(new Date('2026-08-28T12:00:00.000Z'), agora)).toBe(true)
  })

  it('recusa o que passou da janela', () => {
    // Desfazer algo de tres meses atras nao e desfazer, e edicao.
    expect(dentroDaJanela(new Date('2026-05-29T12:00:00.000Z'), agora)).toBe(false)
  })

  it('recusa um segundo alem do limite', () => {
    expect(dentroDaJanela(new Date('2026-08-28T11:59:59.000Z'), agora)).toBe(false)
  })

  it('a janela e de 24 horas', () => {
    expect(JANELA_DE_DESFAZER_HORAS).toBe(24)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/recibo.test.ts
```

Esperado: FAIL, `./recibo.js` não encontrado.

- [ ] **Step 3: Implementar `mcp/recibo.ts`**

```ts
/**
 * O recibo de uma escrita.
 *
 * Toda ferramenta de escrita devolve o que ficou gravado, com identificador e
 * um resumo pronto para o assistente repetir. Esta e a alternativa deliberada
 * a confirmar antes de gravar: o risco real nao e o usuario nao perceber que
 * gravou, e o modelo interpretar errado data, valor ou natureza -- e mostrar o
 * registro final e o que expoe isso.
 */

export type TipoDeEscrita = 'recorrente' | 'avulso' | 'pagamento' | 'saldo'

export interface Recibo {
  readonly tipo: TipoDeEscrita
  readonly id: string
  readonly resumo: string
  readonly avisos: readonly string[]
}

export function montarRecibo(
  tipo: TipoDeEscrita,
  id: string,
  resumo: string,
  avisos: readonly string[] = [],
): Recibo {
  return { tipo, id, resumo, avisos }
}

export const JANELA_DE_DESFAZER_HORAS = 24

const MS_POR_HORA = 60 * 60 * 1000

/**
 * Desfazer alcanca so o passado recente.
 *
 * Desfazer algo de tres meses atras nao e desfazer, e edicao -- e edicao de
 * registro antigo deve ser explicita, nunca efeito colateral de uma ferramenta
 * chamada "desfazer". Sem o limite, `desfazer` seria `apagar_qualquer_coisa`, e
 * um identificador trocado apagaria historia.
 */
export function dentroDaJanela(criadoEm: Date, agora: Date): boolean {
  const decorrido = agora.getTime() - criadoEm.getTime()
  return decorrido >= 0 && decorrido <= JANELA_DE_DESFAZER_HORAS * MS_POR_HORA
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npm test -- mcp/recibo.test.ts
```

Esperado: 7 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/recibo.ts mcp/recibo.test.ts
git commit -m "Recibo de escrita e janela de desfazer"
```

---

## Task 5: `cadastrar_recorrente` e `declarar_saldo`

**Files:**
- Create: `mcp/tools/escrita/cadastrar-recorrente.ts`, `mcp/tools/escrita/declarar-saldo.ts`, `mcp/tools/escrita/escritas-simples.test.ts`

**Interfaces:**
- Consumes: `AppPg` de `mcp/app-pg.js`; `montarRecibo`, `Recibo` de `mcp/recibo.js`; `deEntradaUsuario`, `formatarBRL` de `src/domain/money.js`; `novoId` de `src/data/ids.js`
- Produces:
  - `async function cadastrarRecorrente(app: AppPg, args: { tipo: 'entrada' | 'saida'; nome: string; valor: string; diaDoMes: number; vigenteDe: string; ajusteFimDeSemana?: 'nenhum' | 'antecipa' | 'posterga'; valorEhEstimativa?: boolean }): Promise<Recibo>`
  - `async function declararSaldo(app: AppPg, args: { valor: string; data?: string; hoje: string }): Promise<Recibo>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/escrita/escritas-simples.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { cadastrarRecorrente } from './cadastrar-recorrente.js'
import { declararSaldo } from './declarar-saldo.js'

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
  for (const t of ['regras', 'ancoras', 'ocorrencias']) {
    await pool.query(`delete from ${t}`)
  }
})

describe('cadastrarRecorrente', () => {
  it('grava a regra e devolve recibo com o valor formatado', async () => {
    const r = await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    expect(r.tipo).toBe('recorrente')
    expect(r.resumo).toContain('Aluguel')
    expect(r.resumo).toMatch(/R\$\s?1\.800,00/u)
    expect(r.resumo).toContain('10')

    const gravada = await app.repos.regras.obter(r.id)
    expect(gravada?.valorCentavos).toBe(180000)
  })

  it('aceita as formas que a pessoa fala', async () => {
    for (const [texto, esperado] of [
      ['80', 8000],
      ['80,00', 8000],
      ['1.234,56', 123456],
      ['1234.56', 123456],
    ] as const) {
      const r = await cadastrarRecorrente(app, {
        tipo: 'saida',
        nome: `Teste ${texto}`,
        valor: texto,
        diaDoMes: 5,
        vigenteDe: '2026-09',
      })
      const gravada = await app.repos.regras.obter(r.id)
      expect(gravada?.valorCentavos).toBe(esperado)
    }
  })

  it('recusa valor que nao representa dinheiro, sem gravar', async () => {
    await expect(
      cadastrarRecorrente(app, {
        tipo: 'saida',
        nome: 'Bobagem',
        valor: 'oitenta reais',
        diaDoMes: 5,
        vigenteDe: '2026-09',
      }),
    ).rejects.toThrow(/valor/i)

    expect(await app.repos.regras.listar()).toHaveLength(0)
  })

  it('recusa dia do mes invalido, sem gravar', async () => {
    await expect(
      cadastrarRecorrente(app, {
        tipo: 'saida',
        nome: 'Dia 40',
        valor: '10,00',
        diaDoMes: 40,
        vigenteDe: '2026-09',
      }),
    ).rejects.toThrow()

    expect(await app.repos.regras.listar()).toHaveLength(0)
  })

  it('usa ajuste padrao por tipo quando nao informado', async () => {
    const entrada = await cadastrarRecorrente(app, {
      tipo: 'entrada',
      nome: 'Salario',
      valor: '5000,00',
      diaDoMes: 5,
      vigenteDe: '2026-09',
    })

    const gravada = await app.repos.regras.obter(entrada.id)
    // Entrada antecipa quando cai em fim de semana; saida nao ajusta.
    expect(gravada?.ajusteFimDeSemana).toBe('antecipa')
  })
})

describe('declararSaldo', () => {
  it('grava a ancora e devolve recibo explicito', async () => {
    const r = await declararSaldo(app, { valor: '1200,00', hoje: '2026-09-05' })

    expect(r.tipo).toBe('saldo')
    expect(r.resumo).toMatch(/R\$\s?1\.200,00/u)
    expect(r.resumo).toContain('2026-09-05')

    const vigente = await app.repos.ancoras.vigenteEm('2026-09-05')
    expect(vigente?.saldoCentavos).toBe(120000)
  })

  it('usa hoje quando a data nao vem', async () => {
    await declararSaldo(app, { valor: '100,00', hoje: '2026-09-05' })

    const todas = await app.repos.ancoras.listar()
    expect(todas).toHaveLength(1)
    expect(todas[0]?.data).toBe('2026-09-05')
  })

  it('declarar de novo na mesma data substitui (RN-50)', async () => {
    await declararSaldo(app, { valor: '100,00', hoje: '2026-09-05' })
    await declararSaldo(app, { valor: '250,00', hoje: '2026-09-05' })

    const todas = await app.repos.ancoras.listar()
    expect(todas).toHaveLength(1)
    expect(todas[0]?.saldoCentavos).toBe(25000)
  })

  it('recusa data futura, sem gravar', async () => {
    await expect(
      declararSaldo(app, { valor: '100,00', data: '2027-01-01', hoje: '2026-09-05' }),
    ).rejects.toThrow()

    expect(await app.repos.ancoras.listar()).toHaveLength(0)
  })

  it('aceita saldo negativo', async () => {
    // Estar no vermelho e um estado valido, e declarar isso precisa funcionar.
    const r = await declararSaldo(app, { valor: '-300,00', hoje: '2026-09-05' })

    const todas = await app.repos.ancoras.listar()
    expect(todas[0]?.saldoCentavos).toBe(-30000)
    expect(r.resumo).toContain('300,00')
  })
})
```

**Nota sobre o repositório de âncoras:** ele não tem `obter(id)` — a interface expõe `listar`, `salvar`, `remover` e `vigenteEm`. Verifique por `listar()` quando precisar confirmar o que foi gravado.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/tools/escrita/escritas-simples.test.ts
```

Esperado: FAIL, módulos não encontrados.

- [ ] **Step 3: Implementar `mcp/tools/escrita/cadastrar-recorrente.ts`**

```ts
/**
 * Cadastra um lancamento recorrente: salario, aluguel, luz.
 *
 * Nao usa `criarRuleService`: ele recebe o `BancoFinanceiro` do Dexie por causa
 * da transacao em `editarRegra`, e criar nao precisa de transacao.
 */

import { ajustePadrao } from '../../../src/domain/calendar.js'
import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import type { Regra } from '../../../src/domain/types.js'
import { novoId } from '../../../src/data/ids.js'
import type { AppPg } from '../../app-pg.js'
import { montarRecibo, type Recibo } from '../../recibo.js'

export interface ArgsCadastrarRecorrente {
  readonly tipo: 'entrada' | 'saida'
  readonly nome: string
  readonly valor: string
  readonly diaDoMes: number
  readonly vigenteDe: string
  readonly ajusteFimDeSemana?: 'nenhum' | 'antecipa' | 'posterga'
  readonly valorEhEstimativa?: boolean
}

export async function cadastrarRecorrente(
  app: AppPg,
  args: ArgsCadastrarRecorrente,
): Promise<Recibo> {
  // O valor chega como a pessoa fala. `deEntradaUsuario` ja trata "80",
  // "80,00", "1.234,56" e "1234.56"; pedir centavos ao modelo abriria a porta
  // para errar por uma ordem de grandeza, em silencio.
  const centavos = deEntradaUsuario(args.valor)
  if (centavos === null) {
    throw new Error(
      `Nao entendi o valor "${args.valor}". Use algo como 1800, 1800,00 ou 1.800,00.`,
    )
  }

  const regra: Regra = {
    id: novoId(),
    tipo: args.tipo,
    nome: args.nome,
    valorCentavos: centavos,
    valorEhEstimativa: args.valorEhEstimativa ?? false,
    diaDoMes: args.diaDoMes,
    ajusteFimDeSemana: args.ajusteFimDeSemana ?? ajustePadrao(args.tipo),
    vigenteDe: args.vigenteDe,
    vigenteAte: null,
  }

  // `salvar` chama `validarRegra`, que rejeita dia 40 e centavo fracionado.
  await app.repos.regras.salvar(regra)

  const sentido = args.tipo === 'entrada' ? 'entra' : 'sai'

  return montarRecibo(
    'recorrente',
    regra.id,
    `${regra.nome}, ${formatarBRL(centavos)}, ${sentido} todo dia ${String(regra.diaDoMes)}, ` +
      `a partir de ${regra.vigenteDe}`,
  )
}
```

- [ ] **Step 4: Implementar `mcp/tools/escrita/declarar-saldo.ts`**

```ts
/**
 * Declara o saldo real de uma data -- a ancora da projecao.
 *
 * Esta e a escrita mais consequente das quatro. Errar um lancamento afeta um
 * item; errar a ancora desloca a curva inteira e todos os numeros derivados
 * dela. Por isso o recibo e o mais explicito de todos.
 */

import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import { novoId } from '../../../src/data/ids.js'
import type { AppPg } from '../../app-pg.js'
import { montarRecibo, type Recibo } from '../../recibo.js'

export interface ArgsDeclararSaldo {
  readonly valor: string
  readonly data?: string
  readonly hoje: string
}

export async function declararSaldo(app: AppPg, args: ArgsDeclararSaldo): Promise<Recibo> {
  const centavos = deEntradaUsuario(args.valor)
  if (centavos === null) {
    throw new Error(
      `Nao entendi o valor "${args.valor}". Use algo como 1200, 1200,00 ou -300,00.`,
    )
  }

  const data = args.data ?? args.hoje
  const id = novoId()

  // `salvar` chama `validarAncora`, que rejeita data futura. O segundo
  // argumento e a data corrente -- diferente das outras entidades.
  await app.repos.ancoras.salvar({ id, data, saldoCentavos: centavos }, args.hoje)

  return montarRecibo(
    'saldo',
    id,
    `Saldo de ${data} declarado como ${formatarBRL(centavos)}. ` +
      'A partir daqui os valores projetados deixam de ser relativos.',
  )
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npm test -- mcp/tools/escrita/escritas-simples.test.ts
```

Esperado: 10 testes PASS, depois de você ter removido a linha defeituosa apontada no Step 1.

- [ ] **Step 6: Commit**

```bash
git add mcp/tools/escrita/
git commit -m "Ferramentas de cadastrar recorrente e declarar saldo"
```

---

## Task 6: `lancar_avulso` e `marcar_pago`

**Files:**
- Create: `mcp/tools/escrita/lancar-avulso.ts`, `mcp/tools/escrita/marcar-pago.ts`, `mcp/tools/escrita/escritas-ocorrencia.test.ts`

**Interfaces:**
- Consumes: `AppPg`; `montarRecibo`, `Recibo`; `deEntradaUsuario`, `formatarBRL`; `novoId`; `competenciaDe` de `src/domain/calendar.js`
- Produces:
  - `async function lancarAvulso(app: AppPg, args: { tipo: 'entrada' | 'saida'; nome: string; valor: string; data?: string; hoje: string; observacao?: string }): Promise<Recibo>`
  - `async function marcarPago(app: AppPg, args: { chave: string; valor?: string; data?: string; hoje: string }): Promise<Recibo>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/escrita/escritas-ocorrencia.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { situacaoDoMes } from '../situacao-do-mes.js'
import { lancarAvulso } from './lancar-avulso.js'
import { marcarPago } from './marcar-pago.js'

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
  for (const t of ['regras', 'ancoras', 'ocorrencias']) {
    await pool.query(`delete from ${t}`)
  }
})

async function cadastrarAluguel(): Promise<void> {
  await app.repos.regras.salvar({
    id: 'r-aluguel',
    tipo: 'saida',
    nome: 'Aluguel',
    valorCentavos: 180000,
    valorEhEstimativa: false,
    diaDoMes: 10,
    ajusteFimDeSemana: 'nenhum',
    vigenteDe: '2026-09',
    vigenteAte: null,
  })
}

describe('lancarAvulso', () => {
  it('grava e devolve recibo', async () => {
    const r = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Mercado',
      valor: '80',
      hoje: '2026-09-15',
    })

    expect(r.tipo).toBe('avulso')
    expect(r.resumo).toContain('Mercado')
    expect(r.resumo).toMatch(/R\$\s?80,00/u)

    const gravada = await app.repos.ocorrencias.obter(r.id)
    expect(gravada?.valorPrevistoCentavos).toBe(8000)
    expect(gravada?.geradorTipo).toBe('avulso')
    expect(gravada?.geradorId).toBeNull()
  })

  it('usa hoje como data quando nao vem, e deriva a competencia', async () => {
    const r = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Padaria',
      valor: '12,50',
      hoje: '2026-09-15',
    })

    const gravada = await app.repos.ocorrencias.obter(r.id)
    expect(gravada?.dataVencimento).toBe('2026-09-15')
    expect(gravada?.competencia).toBe('2026-09')
  })

  it('deriva a competencia da data informada, nao de hoje', async () => {
    const r = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Retroativo',
      valor: '30',
      data: '2026-07-20',
      hoje: '2026-09-15',
    })

    const gravada = await app.repos.ocorrencias.obter(r.id)
    expect(gravada?.competencia).toBe('2026-07')
  })

  it('recusa valor invalido sem gravar', async () => {
    await expect(
      lancarAvulso(app, { tipo: 'saida', nome: 'x', valor: 'muito', hoje: '2026-09-15' }),
    ).rejects.toThrow(/valor/i)

    expect(await app.repos.ocorrencias.listar()).toHaveLength(0)
  })

  it('aparece na situacao do mes depois de lancado', async () => {
    await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Pneu',
      valor: '850',
      hoje: '2026-09-15',
    })

    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })

    expect(s.faltaPagar.map((i) => i.nome)).toContain('Pneu')
  })
})

describe('marcarPago', () => {
  it('paga uma conta que ainda nao existe no banco', async () => {
    // A conta gerada por regra e virtual ate alguem interagir. Este e o caso
    // central da ferramenta.
    await cadastrarAluguel()

    const antes = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    const aluguel = antes.faltaPagar.find((i) => i.nome === 'Aluguel')
    expect(aluguel).toBeDefined()
    expect(await app.repos.ocorrencias.listar()).toHaveLength(0)

    const r = await marcarPago(app, { chave: aluguel!.chave, hoje: '2026-09-15' })

    expect(r.tipo).toBe('pagamento')
    expect(r.resumo).toContain('Aluguel')

    const materializadas = await app.repos.ocorrencias.listar()
    expect(materializadas).toHaveLength(1)
    expect(materializadas[0]?.dataPagamento).toBe('2026-09-15')
  })

  it('sai de faltaPagar depois de pago', async () => {
    await cadastrarAluguel()
    const antes = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    await marcarPago(app, {
      chave: antes.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave,
      hoje: '2026-09-15',
    })

    const depois = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })

    expect(depois.faltaPagar.map((i) => i.nome)).not.toContain('Aluguel')
  })

  it('e idempotente: pagar duas vezes nao cria dois lancamentos (RN-51)', async () => {
    await cadastrarAluguel()
    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    const chave = s.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave

    await marcarPago(app, { chave, hoje: '2026-09-15' })
    await marcarPago(app, { chave, hoje: '2026-09-15' })

    expect(await app.repos.ocorrencias.listar()).toHaveLength(1)
  })

  it('aceita valor diferente do previsto', async () => {
    await cadastrarAluguel()
    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    const chave = s.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave

    await marcarPago(app, { chave, valor: '1755,50', hoje: '2026-09-15' })

    const [o] = await app.repos.ocorrencias.listar()
    expect(o?.valorPagoCentavos).toBe(175550)
    expect(o?.valorPrevistoCentavos).toBe(180000)
  })

  it('recusa chave que nao corresponde a nenhuma ocorrencia', async () => {
    await cadastrarAluguel()

    await expect(
      marcarPago(app, { chave: 'chave|inventada|2026-09', hoje: '2026-09-15' }),
    ).rejects.toThrow(/chave/i)

    expect(await app.repos.ocorrencias.listar()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/tools/escrita/escritas-ocorrencia.test.ts
```

Esperado: FAIL, módulos não encontrados.

- [ ] **Step 3: Implementar `mcp/tools/escrita/lancar-avulso.ts`**

```ts
/**
 * Lanca um gasto ou uma entrada pontual.
 *
 * A competencia vem da data do lancamento, nao de hoje: um gasto retroativo
 * pertence ao mes em que aconteceu.
 */

import { competenciaDe } from '../../../src/domain/calendar.js'
import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import type { Ocorrencia } from '../../../src/domain/types.js'
import { novoId } from '../../../src/data/ids.js'
import type { AppPg } from '../../app-pg.js'
import { montarRecibo, type Recibo } from '../../recibo.js'

export interface ArgsLancarAvulso {
  readonly tipo: 'entrada' | 'saida'
  readonly nome: string
  readonly valor: string
  readonly data?: string
  readonly hoje: string
  readonly observacao?: string
}

export async function lancarAvulso(app: AppPg, args: ArgsLancarAvulso): Promise<Recibo> {
  const centavos = deEntradaUsuario(args.valor)
  if (centavos === null) {
    throw new Error(`Nao entendi o valor "${args.valor}". Use algo como 80, 80,00 ou 1.234,56.`)
  }

  const data = args.data ?? args.hoje

  const ocorrencia: Ocorrencia = {
    id: novoId(),
    geradorTipo: 'avulso',
    geradorId: null,
    competencia: competenciaDe(data),
    tipo: args.tipo,
    nome: args.nome,
    valorPrevistoCentavos: centavos,
    dataVencimento: data,
    dataPagamento: null,
    valorPagoCentavos: null,
    ignorado: false,
    observacao: args.observacao ?? null,
  }

  await app.repos.ocorrencias.salvar(ocorrencia)

  const sentido = args.tipo === 'entrada' ? 'Entrada' : 'Gasto'

  return montarRecibo(
    'avulso',
    ocorrencia.id,
    `${sentido} avulso: ${ocorrencia.nome}, ${formatarBRL(centavos)}, em ${data}`,
  )
}
```

- [ ] **Step 4: Implementar `mcp/tools/escrita/marcar-pago.ts`**

```ts
/**
 * Registra o pagamento de uma conta.
 *
 * A maior parte das contas NAO existe no banco: as geradas por regra sao
 * virtuais ate alguem interagir. Por isso a ferramenta nao recebe um
 * identificador de registro, e sim a CHAVE DE SOBREPOSICAO, que a consulta
 * devolve em cada item.
 *
 * O caminho e: projetar o mes, localizar a ocorrencia resolvida daquela chave,
 * e entregar ao PaymentService -- que busca o registro existente ou materializa
 * um novo (RN-51), tornando a operacao idempotente.
 */

import { competenciaDe } from '../../../src/domain/calendar.js'
import { deEntradaUsuario, formatarBRL } from '../../../src/domain/money.js'
import type { AppPg } from '../../app-pg.js'
import { montarRecibo, type Recibo } from '../../recibo.js'

export interface ArgsMarcarPago {
  readonly chave: string
  readonly valor?: string
  readonly data?: string
  readonly hoje: string
}

export async function marcarPago(app: AppPg, args: ArgsMarcarPago): Promise<Recibo> {
  const data = args.data ?? args.hoje
  const mes = await app.projecao.projetarMes(competenciaDe(data), args.hoje)

  const alvo = [...mes.faltaPagar, ...mes.aindaEntra, ...mes.jaResolvido].find(
    (o) => o.chave === args.chave,
  )

  if (alvo === undefined) {
    throw new Error(
      `Nao encontrei nenhuma ocorrencia com a chave informada em ${competenciaDe(data)}. ` +
        'Consulte a situacao do mes e use a chave que vier na resposta.',
    )
  }

  const valorPago =
    args.valor === undefined ? alvo.valorPrevistoCentavos : deEntradaUsuario(args.valor)

  if (valorPago === null) {
    throw new Error(`Nao entendi o valor "${String(args.valor)}".`)
  }

  await app.pagamento.registrarPagamento(alvo, data, valorPago)

  const verbo = alvo.tipo === 'entrada' ? 'Recebimento' : 'Pagamento'

  return montarRecibo(
    'pagamento',
    alvo.chave,
    `${verbo} registrado: ${alvo.nome}, ${formatarBRL(valorPago)}, em ${data}`,
  )
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npm test -- mcp/tools/escrita/escritas-ocorrencia.test.ts
```

Esperado: 10 testes PASS.

- [ ] **Step 6: Commit**

```bash
git add mcp/tools/escrita/
git commit -m "Ferramentas de lancar avulso e marcar pago"
```

---

## Task 7: `desfazer` e `exportar`

**Files:**
- Create: `mcp/tools/desfazer.ts`, `mcp/tools/exportar.ts`, `mcp/tools/desfazer.test.ts`, `mcp/tools/exportar.test.ts`

**Interfaces:**
- Consumes: `AppPg`; `dentroDaJanela`, `TipoDeEscrita` de `mcp/recibo.js`; `DocumentoBackup` de `src/data/backup-serializer.js`; `VERSAO_SCHEMA` de `src/data/db.js`
- Produces:
  - `async function desfazer(app: AppPg, args: { tipo: TipoDeEscrita; id: string; agora: Date; hoje: string }): Promise<{ desfeito: true; descricao: string }>`
  - `async function exportar(app: AppPg, args: { hoje: string }): Promise<DocumentoBackup>`

- [ ] **Step 1: Escrever os testes que falham**

Crie `mcp/tools/desfazer.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../dados/conexao.js'
import { aplicarMigracoes } from '../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../app-pg.js'
import { situacaoDoMes } from './situacao-do-mes.js'
import { cadastrarRecorrente } from './escrita/cadastrar-recorrente.js'
import { lancarAvulso } from './escrita/lancar-avulso.js'
import { marcarPago } from './escrita/marcar-pago.js'
import { declararSaldo } from './escrita/declarar-saldo.js'
import { desfazer } from './desfazer.js'

let container: StartedPostgreSqlContainer
let pool: Pool
let app: AppPg

const AGORA = new Date('2026-09-15T12:00:00.000Z')

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
  for (const t of ['regras', 'ancoras', 'ocorrencias']) {
    await pool.query(`delete from ${t}`)
  }
})

describe('desfazer', () => {
  it('remove um lancamento avulso', async () => {
    const r = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Erro',
      valor: '50',
      hoje: '2026-09-15',
    })

    await desfazer(app, { tipo: 'avulso', id: r.id, agora: AGORA, hoje: '2026-09-15' })

    expect(await app.repos.ocorrencias.obter(r.id)).toBeNull()
  })

  it('remove uma regra e avisa que ocorrencias permanecem (RN-46)', async () => {
    const r = await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Engano',
      valor: '100',
      diaDoMes: 5,
      vigenteDe: '2026-09',
    })

    const resultado = await desfazer(app, {
      tipo: 'recorrente',
      id: r.id,
      agora: AGORA,
      hoje: '2026-09-15',
    })

    expect(await app.repos.regras.obter(r.id)).toBeNull()
    expect(resultado.descricao).toMatch(/materializad/i)
  })

  it('desfazer pagamento NAO apaga a conta nem o registro (RN-53)', async () => {
    await app.repos.regras.salvar({
      id: 'r-aluguel',
      tipo: 'saida',
      nome: 'Aluguel',
      valorCentavos: 180000,
      valorEhEstimativa: false,
      diaDoMes: 10,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-09',
      vigenteAte: null,
    })
    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    const chave = s.faltaPagar.find((i) => i.nome === 'Aluguel')!.chave
    await marcarPago(app, { chave, hoje: '2026-09-15' })

    await desfazer(app, { tipo: 'pagamento', id: chave, agora: AGORA, hoje: '2026-09-15' })

    // O registro materializado permanece -- pode carregar valor ajustado ou
    // vencimento adiado. So o pagamento e limpo.
    const materializadas = await app.repos.ocorrencias.listar()
    expect(materializadas).toHaveLength(1)
    expect(materializadas[0]?.dataPagamento).toBeNull()
    expect(materializadas[0]?.valorPagoCentavos).toBeNull()

    const depois = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-15' })
    expect(depois.faltaPagar.map((i) => i.nome)).toContain('Aluguel')
  })

  it('remove uma ancora', async () => {
    const r = await declararSaldo(app, { valor: '100', hoje: '2026-09-15' })

    await desfazer(app, { tipo: 'saldo', id: r.id, agora: AGORA, hoje: '2026-09-15' })

    expect(await app.repos.ancoras.listar()).toHaveLength(0)
  })

  it('recusa fora da janela de 24 horas', async () => {
    const r = await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Antigo',
      valor: '10',
      hoje: '2026-09-15',
    })

    const muitoDepois = new Date('2026-12-01T12:00:00.000Z')

    await expect(
      desfazer(app, { tipo: 'avulso', id: r.id, agora: muitoDepois, hoje: '2026-12-01' }),
    ).rejects.toThrow(/24 horas|janela/i)

    // E nao apagou nada.
    expect(await app.repos.ocorrencias.obter(r.id)).not.toBeNull()
  })

  it('recusa id inexistente', async () => {
    await expect(
      desfazer(app, { tipo: 'avulso', id: 'nao-existe', agora: AGORA, hoje: '2026-09-15' }),
    ).rejects.toThrow()
  })
})
```

Crie `mcp/tools/exportar.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../dados/conexao.js'
import { aplicarMigracoes } from '../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../app-pg.js'
import { VERSAO_SCHEMA } from '../../src/data/db.js'
import { migrarDocumento } from '../../src/data/backup-serializer.js'
import { exportar } from './exportar.js'

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
  for (const t of ['regras', 'parcelamentos', 'ocorrencias', 'ancoras', 'configuracoes']) {
    await pool.query(`delete from ${t}`)
  }
})

describe('exportar', () => {
  it('devolve o formato DocumentoBackup, com a versao corrente', async () => {
    const doc = await exportar(app, { hoje: '2026-09-15' })

    expect(doc.versaoSchema).toBe(VERSAO_SCHEMA)
    expect(doc.exportadoEm).toBe('2026-09-15')
    expect(doc.regras).toEqual([])
    expect(doc.parcelamentos).toEqual([])
    expect(doc.ocorrencias).toEqual([])
    expect(doc.ancoras).toEqual([])
  })

  it('inclui o que foi gravado', async () => {
    await app.repos.regras.salvar({
      id: 'r-1',
      tipo: 'entrada',
      nome: 'Salario',
      valorCentavos: 500000,
      valorEhEstimativa: false,
      diaDoMes: 5,
      ajusteFimDeSemana: 'antecipa',
      vigenteDe: '2026-09',
      vigenteAte: null,
    })
    await app.repos.ancoras.salvar(
      { id: 'a-1', data: '2026-09-01', saldoCentavos: 120000 },
      '2026-09-15',
    )

    const doc = await exportar(app, { hoje: '2026-09-15' })

    expect(doc.regras).toHaveLength(1)
    expect(doc.regras[0]?.valorCentavos).toBe(500000)
    expect(doc.ancoras[0]?.saldoCentavos).toBe(120000)
  })

  it('o documento atravessa migrarDocumento sem mudar', async () => {
    // Prova que o formato exportado e o que o resto do sistema reconhece: se
    // divergir, a migracao mexeria nele.
    await app.repos.regras.salvar({
      id: 'r-1',
      tipo: 'saida',
      nome: 'Aluguel',
      valorCentavos: 180000,
      valorEhEstimativa: false,
      diaDoMes: 10,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: '2026-09',
      vigenteAte: null,
    })

    const doc = await exportar(app, { hoje: '2026-09-15' })

    expect(migrarDocumento(doc)).toEqual(doc)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
npm test -- mcp/tools/desfazer.test.ts mcp/tools/exportar.test.ts
```

Esperado: FAIL, módulos não encontrados.

- [ ] **Step 3: Implementar `mcp/tools/desfazer.ts`**

```ts
/**
 * Desfaz uma escrita recente.
 *
 * Alcanca apenas as ultimas 24 horas. Desfazer algo de tres meses atras nao e
 * desfazer, e edicao -- e edicao de registro antigo deve ser explicita, nunca
 * efeito colateral de uma ferramenta chamada "desfazer".
 *
 * O significado difere por tipo, e a diferenca importa:
 * - recorrente: remove a regra, mas NAO as ocorrencias ja materializadas (RN-46)
 * - avulso: remove a ocorrencia
 * - pagamento: NAO apaga a conta nem o registro; limpa apenas o pagamento (RN-53)
 * - saldo: remove a ancora
 */

import { competenciaDe } from '../../src/domain/calendar.js'
import type { AppPg } from '../app-pg.js'
import { dentroDaJanela, type TipoDeEscrita } from '../recibo.js'
import type { TabelaAuditavel } from '../dados/auditoria.js'

export interface ArgsDesfazer {
  readonly tipo: TipoDeEscrita
  readonly id: string
  readonly agora: Date
  readonly hoje: string
}

export interface ResultadoDesfazer {
  readonly desfeito: true
  readonly descricao: string
}

const TABELA_POR_TIPO: Record<Exclude<TipoDeEscrita, 'pagamento'>, TabelaAuditavel> = {
  recorrente: 'regras',
  avulso: 'ocorrencias',
  saldo: 'ancoras',
}

async function exigirDentroDaJanela(
  app: AppPg,
  tabela: TabelaAuditavel,
  id: string,
  agora: Date,
): Promise<void> {
  const criadoEm = await app.auditoria.criadoEm(tabela, id)

  if (criadoEm === null) {
    throw new Error('Nao encontrei esse registro. Confira o identificador do recibo.')
  }

  if (!dentroDaJanela(criadoEm, agora)) {
    throw new Error(
      'Esse registro tem mais de 24 horas e esta fora da janela de desfazer. ' +
        'Para alterar algo antigo, use a ferramenta de edicao correspondente.',
    )
  }
}

export async function desfazer(app: AppPg, args: ArgsDesfazer): Promise<ResultadoDesfazer> {
  if (args.tipo === 'pagamento') {
    // O identificador aqui e a CHAVE, nao um id de linha: o pagamento pode ter
    // materializado o registro agora mesmo.
    const mes = await app.projecao.projetarMes(competenciaDe(args.hoje), args.hoje)
    const alvo = [...mes.faltaPagar, ...mes.aindaEntra, ...mes.jaResolvido].find(
      (o) => o.chave === args.id,
    )

    if (alvo === undefined) {
      throw new Error('Nao encontrei essa ocorrencia no mes corrente.')
    }

    if (alvo.idReal !== null) {
      await exigirDentroDaJanela(app, 'ocorrencias', alvo.idReal, args.agora)
    }

    await app.pagamento.desfazerPagamento(alvo)

    return {
      desfeito: true,
      descricao:
        `Pagamento de ${alvo.nome} desfeito. A conta voltou a pendente; ` +
        'o registro foi mantido, com eventuais ajustes de valor ou vencimento.',
    }
  }

  const tabela = TABELA_POR_TIPO[args.tipo]
  await exigirDentroDaJanela(app, tabela, args.id, args.agora)

  if (args.tipo === 'recorrente') {
    await app.repos.regras.remover(args.id)
    return {
      desfeito: true,
      descricao:
        'Recorrencia removida. As ocorrencias ja materializadas dela permanecem ' +
        'no historico e continuam aparecendo nos meses em que existem.',
    }
  }

  if (args.tipo === 'avulso') {
    await app.repos.ocorrencias.remover(args.id)
    return { desfeito: true, descricao: 'Lancamento avulso removido.' }
  }

  await app.repos.ancoras.remover(args.id)
  return {
    desfeito: true,
    descricao:
      'Saldo declarado removido. Sem outra ancora anterior, os valores projetados ' +
      'voltam a ser relativos.',
  }
}
```

- [ ] **Step 4: Implementar `mcp/tools/exportar.ts`**

```ts
/**
 * Exporta o estado completo no formato que o resto do sistema ja conhece.
 *
 * O banco no Railway e o unico lugar onde estes dados existem. Esta ferramenta
 * e o que permite tirar uma copia sem depender da plataforma.
 */

import { VERSAO_SCHEMA } from '../../src/data/db.js'
import type { DocumentoBackup } from '../../src/data/backup-serializer.js'
import type { AppPg } from '../app-pg.js'

export async function exportar(app: AppPg, args: { hoje: string }): Promise<DocumentoBackup> {
  const [regras, parcelamentos, ocorrencias, ancoras] = await Promise.all([
    app.repos.regras.listar(),
    app.repos.parcelamentos.listar(),
    app.repos.ocorrencias.listar(),
    app.repos.ancoras.listar(),
  ])

  return {
    versaoSchema: VERSAO_SCHEMA,
    exportadoEm: args.hoje,
    regras,
    parcelamentos,
    ocorrencias,
    ancoras,
    // As configuracoes do app antigo (ultima exportacao) nao tem sentido aqui:
    // nada as le, e exporta-las carregaria estado da plataforma para dentro do
    // documento.
    configuracoes: [],
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passam**

```bash
npm test -- mcp/tools/desfazer.test.ts mcp/tools/exportar.test.ts
```

Esperado: 9 testes PASS.

- [ ] **Step 6: Commit**

```bash
git add mcp/tools/
git commit -m "Ferramentas de desfazer e exportar"
```

---

## Task 8: Registro no servidor e verificação

**Files:**
- Modify: `mcp/servidor-http.ts` (registrar as sete ferramentas, montar o pool)
- Modify: `mcp/README-remoto.md`

**Interfaces:**
- Consumes: tudo das Tasks 1–7

- [ ] **Step 1: Montar o pool e aplicar migrações no boot**

Em `mcp/servidor-http.ts`, dentro de `iniciar()`, antes de `listen`:

```ts
const pool = criarPool(lerUrlDoBanco(process.env))
await aplicarMigracoes(pool)
const app = criarAppPg(pool)
```

`iniciar()` passa a ser `async`. Ajuste `mcp/main-http.ts` para `await iniciar()`.

O pool fica em escopo de módulo, não dentro de `criarServidorMcp()` — este roda por requisição, e um pool criado ali abriria uma conexão por chamada.

Se as migrações falharem, o processo **não sobe**. Um servidor no ar sobre um esquema incompleto responderia errado em silêncio, que é pior do que não responder. Use `descreverErro` ao registrar a falha: a `DATABASE_URL` não pode aparecer no log do Railway.

- [ ] **Step 2: Registrar as sete ferramentas**

Cada uma segue o padrão que já existe para `ping`. As descrições precisam dizer ao assistente **o que a ferramenta faz e qual erro evitar**. Use estas, verbatim:

| Ferramenta | `description` |
|---|---|
| `situacao_do_mes` | `Quanto sobra no mes, o que falta pagar e entrar, e em que dia o saldo chega ao minimo. Quando saldoRelativo for verdadeiro, NAO afirme um saldo absoluto: leia avisoSaldoRelativo. Cada item traz uma chave, que e o que voce usa para registrar pagamento.` |
| `cadastrar_recorrente` | `Cadastra um lancamento que se repete todo mes: salario, aluguel, conta de luz. O valor vai como a pessoa fala ("1800", "1800,00", "1.800,00"), nunca em centavos.` |
| `lancar_avulso` | `Registra um gasto ou entrada pontual, que nao se repete. Sem data, usa hoje. O valor vai como a pessoa fala, nunca em centavos.` |
| `marcar_pago` | `Registra que uma conta foi paga ou um valor foi recebido. Use a chave que veio em situacao_do_mes; consulte antes se nao tiver. Repetir a mesma chamada nao cria lancamento duplicado.` |
| `declarar_saldo` | `Informa o saldo real da conta numa data. E o que faz os valores projetados deixarem de ser relativos. Errar aqui desloca a curva inteira: confira o recibo.` |
| `desfazer` | `Reverte uma escrita das ultimas 24 horas, usando o tipo e o id do recibo. Desfazer um pagamento nao apaga a conta, so o registro de que foi paga.` |
| `exportar` | `Devolve todos os dados em JSON, no formato de backup. Use quando a pessoa quiser uma copia dos proprios dados.` |

Toda ferramenta que aceita data recebe `hoje` opcional, preenchido por `hojeDoSistema()` quando ausente — o mesmo padrão que já existe.

- [ ] **Step 3: Verificar tipos, lint e a suíte**

```bash
npm run lint && npm run typecheck && npx vitest run mcp
```

- [ ] **Step 4: Subir localmente contra um Postgres em container**

```bash
docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=local -e POSTGRES_DB=financas --name pg-local postgres:16-alpine
```

Depois, em PowerShell:

```powershell
$env:FINANCE_MCP_SEGREDO = "teste-local"; $env:DATABASE_URL = "postgres://postgres:local@localhost:5433/financas"; npm run mcp:http
```

Confirme que sobe, que `GET /` devolve `{"vivo":true}`, e encerre. Depois:

```bash
docker stop pg-local
```

Confirme também que **sem** `DATABASE_URL` o processo não sobe.

- [ ] **Step 5: Atualizar `mcp/README-remoto.md`**

Acrescente `DATABASE_URL` à tabela de variáveis, marcada como obrigatória, com a nota de que no Railway ela é uma referência a `${{ Postgres.DATABASE_URL }}` e que seu valor contém a senha do banco — por isso nunca aparece em log. Substitua a linha "A única ferramenta é `ping`" pela lista das sete, e atualize a seção de estado para dizer que o Projeto 1 está implementado.

- [ ] **Step 6: Commit**

```bash
git add mcp/
git commit -m "Registra as sete ferramentas sobre o Postgres"
```

---

## Verificação final

- [ ] `npm run lint`, `npm run typecheck` e `npx vitest run mcp` passam
- [ ] Nenhum arquivo em `src/` modificado: `git diff main --stat -- src/` (esperado: vazio)
- [ ] `mcp/server.ts` não foi tocado
- [ ] A suíte de contrato passa nas **duas** implementações
- [ ] Sem `DATABASE_URL`, o processo não sobe
- [ ] Nenhum log carrega a `DATABASE_URL`: `git grep -n "console\.\(log\|error\)" -- mcp/ | grep -v test` e confirmar que nenhum registra objeto de erro cru

## Pendências operacionais herdadas do Projeto 0

Não são tarefas deste plano, mas precisam acontecer antes de o servidor guardar dado real:

1. **Trocar o segredo `1234`** por um valor forte, no Railway e no connector.
2. **Autorizar o webhook do GitHub App** no painel do Railway, para que `git push` volte a redeployar.
