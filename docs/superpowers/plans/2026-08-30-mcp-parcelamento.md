# Parcelamento e Consultas Restantes — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar o servidor MCP com a porta de entrada para compras parceladas e as três ferramentas de consulta que faltavam, portadas para o Postgres.

**Architecture:** Duas consultas passam a receber um tipo estreitado que tanto `AppEmMemoria` quanto `AppPg` satisfazem estruturalmente. `simular_cenario` não muda: o servidor exporta o estado do Postgres e repassa o mesmo `DocumentoBackup` que ela já consome. Parcelamento ganha ferramenta de cadastro e um quinto caso no `desfazer`.

**Tech Stack:** TypeScript, Node 20+, `pg`, `@modelcontextprotocol/sdk` 1.30.0, Express 5, `testcontainers`, Vitest, Railway.

## Global Constraints

- **Nenhum arquivo dentro de `src/` pode ser modificado.** `src/` morre no Projeto 3, não aqui.
- **`mcp/server.ts`, o servidor stdio antigo, não é tocado.** Ele lê o backup do GitHub e também morre no Projeto 3.
- Dinheiro é inteiro em **centavos** internamente; o valor chega do assistente como **texto** e passa por `deEntradaUsuario`. Nunca peça centavos ao modelo.
- Datas são texto `AAAA-MM-DD`; competências são texto `AAAA-MM`. Nunca `new Date(...)` para data de domínio.
- A data corrente entra como `hoje`, preenchida por `hojeDoSistema()` no servidor — que formata em `America/Sao_Paulo`, **não** no fuso do processo.
- **A `DATABASE_URL` contém a senha do banco.** Nenhum log ou mensagem de erro carrega a mensagem crua de um erro do `pg` nem o objeto de erro.
- Erros pensados para o assistente ler usam `ErroDeUsuario` (`mcp/tools/erro-do-usuario.ts`); só assim `executarFerramenta` os repassa verbatim em vez de sanitizar.
- Imports internos levam a extensão `.js`.
- **Asserção de moeda nunca usa espaço ASCII literal** — `Intl` em pt-BR emite U+202F. Use `toMatch(/^R\$\s?1\.234,56$/u)`.
- Branch: `mcp-parcelamento`. Spec: `docs/superpowers/specs/2026-08-30-mcp-parcelamento-design.md`.

---

## Fatos verificados no código, não presuma outra coisa

**`oQueVence(app, { dias?, hoje })`** usa apenas `app.projecao.projetarMes`.
**`historicoDeGastos(app, { meses?, nome?, hoje })`** usa apenas `app.projecao.resolverIntervalo`.
Ambas declaram `app: AppEmMemoria` hoje. `situacaoDoMes` já foi estreitada para `{ readonly projecao: ProjectionService }` no Projeto 1 — siga o mesmo padrão.

**`simularCenario(doc: DocumentoBackup, { lancamentos, ate, hoje })`** monta dois apps com `criarAppDoBackup` e não recebe `AppPg`. **Não a altere.**

**`validarParcelamento`** rejeita: centavo fracionado, `valorParcelaCentavos <= 0`, `quantidadeParcelas` não inteiro ou menor que 1, e `primeiroVencimento` fora de `AAAA-MM-DD`.

**`TipoDeEscrita`** em `mcp/recibo.ts` é `'recorrente' | 'avulso' | 'pagamento' | 'saldo'`.
**`TABELA_POR_TIPO`** em `mcp/tools/desfazer.ts` é `Record<Exclude<TipoDeEscrita, 'pagamento'>, TabelaAuditavel>` — acrescentar um valor ao tipo faz o TypeScript **exigir** a nova chave, o que é a rede de segurança desta mudança.
**`TabelaAuditavel`** já inclui `'parcelamentos'`.

**`executarFerramenta(corpo)`** em `mcp/servidor-http.ts` envolve toda ferramenta: repassa `ErroDeUsuario` e `ErroDeDominio` verbatim, sanitiza o resto.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `mcp/tools/o-que-vence.ts` | Estreitar o parâmetro |
| `mcp/tools/historico-de-gastos.ts` | Estreitar o parâmetro |
| `mcp/consultas-pg.test.ts` | Provar que as três consultas enxergam o Postgres |
| `mcp/recibo.ts` | Quinto valor em `TipoDeEscrita` |
| `mcp/tools/escrita/cadastrar-parcelamento.ts` | Ferramenta nova |
| `mcp/tools/escrita/cadastrar-parcelamento.test.ts` | Testes dela |
| `mcp/tools/desfazer.ts` | Ramo de parcelamento |
| `mcp/servidor-http.ts` | Registro das quatro ferramentas |
| `mcp/README-remoto.md` | Tabela de ferramentas |

---

## Task 1: Portar `o_que_vence` e `historico_de_gastos`

**Files:**
- Modify: `mcp/tools/o-que-vence.ts`, `mcp/tools/historico-de-gastos.ts`
- Create: `mcp/consultas-pg.test.ts`

**Interfaces:**
- Consumes: `criarAppPg(pool)` de `mcp/app-pg.js`; `criarPool`, `aplicarMigracoes`; `cadastrarRecorrente`, `lancarAvulso` de `mcp/tools/escrita/`
- Produces: `oQueVence(app: { readonly projecao: ProjectionService }, args)` e `historicoDeGastos(app: { readonly projecao: ProjectionService }, args)` — mesmas args, tipo do primeiro parâmetro estreitado

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/consultas-pg.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from './dados/conexao.js'
import { aplicarMigracoes } from './dados/migracoes.js'
import { criarAppPg, type AppPg } from './app-pg.js'
import { cadastrarRecorrente } from './tools/escrita/cadastrar-recorrente.js'
import { lancarAvulso } from './tools/escrita/lancar-avulso.js'
import { marcarPago } from './tools/escrita/marcar-pago.js'
import { situacaoDoMes } from './tools/situacao-do-mes.js'
import { oQueVence } from './tools/o-que-vence.js'
import { historicoDeGastos } from './tools/historico-de-gastos.js'

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

describe('oQueVence sobre Postgres', () => {
  it('enxerga uma conta cadastrada pela ferramenta de escrita', async () => {
    // O porte e de uma linha; o risco e ninguem verificar que a linha certa
    // foi trocada. Este teste passa pela escrita real, nao por fixture.
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    const r = await oQueVence(app, { dias: 15, hoje: '2026-09-05' })

    expect(r.aPagar.map((i) => i.nome)).toContain('Aluguel')
  })

  it('nao lista o que vence depois da janela', async () => {
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    const r = await oQueVence(app, { dias: 1, hoje: '2026-09-05' })

    expect(r.aPagar.map((i) => i.nome)).not.toContain('Aluguel')
  })

  it('separa entrada a confirmar de saida atrasada (RN-90)', async () => {
    await cadastrarRecorrente(app, {
      tipo: 'entrada',
      nome: 'Salario',
      valor: '5000,00',
      diaDoMes: 5,
      vigenteDe: '2026-09',
    })
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    const r = await oQueVence(app, { dias: 7, hoje: '2026-09-20' })

    expect(r.atrasado.every((i) => i.tipo === 'saida')).toBe(true)
    expect(r.aConfirmar.map((i) => i.nome)).toContain('Salario')
  })
})

describe('historicoDeGastos sobre Postgres', () => {
  it('conta o que foi pago pela ferramenta de escrita', async () => {
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Luz',
      valor: '220,00',
      diaDoMes: 15,
      vigenteDe: '2026-08',
      valorEhEstimativa: true,
    })

    const agosto = await situacaoDoMes(app, { competencia: '2026-08', hoje: '2026-09-20' })
    const luz = agosto.faltaPagar.find((i) => i.nome === 'Luz')
    expect(luz).toBeDefined()
    await marcarPago(app, { chave: luz!.chave, valor: '245,90', data: '2026-08-14', hoje: '2026-09-20' })

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-09-20' })
    const serie = r.itens.find((i) => i.nome === 'Luz')

    // O valor PAGO prevalece sobre o previsto.
    expect(serie?.total.valorCentavos).toBe(24590)
  })

  it('ignora o que ainda nao foi pago', async () => {
    await cadastrarRecorrente(app, {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-09-20' })

    expect(r.itens.map((i) => i.nome)).not.toContain('Aluguel')
  })

  it('ignora entradas: salario nao e gasto', async () => {
    await lancarAvulso(app, {
      tipo: 'entrada',
      nome: 'Freela',
      valor: '900,00',
      data: '2026-09-03',
      hoje: '2026-09-20',
    })
    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-20' })
    const freela = s.aindaEntra.find((i) => i.nome === 'Freela')
    expect(freela).toBeDefined()
    await marcarPago(app, { chave: freela!.chave, hoje: '2026-09-20' })

    const r = await historicoDeGastos(app, { meses: 6, hoje: '2026-09-20' })

    expect(r.itens.map((i) => i.nome)).not.toContain('Freela')
  })

  it('filtra por nome sem diferenciar maiuscula', async () => {
    await lancarAvulso(app, {
      tipo: 'saida',
      nome: 'Mercado',
      valor: '80,00',
      data: '2026-09-02',
      hoje: '2026-09-20',
    })
    const s = await situacaoDoMes(app, { competencia: '2026-09', hoje: '2026-09-20' })
    await marcarPago(app, {
      chave: s.faltaPagar.find((i) => i.nome === 'Mercado')!.chave,
      hoje: '2026-09-20',
    })

    const r = await historicoDeGastos(app, { meses: 6, nome: 'mercado', hoje: '2026-09-20' })

    expect(r.itens).toHaveLength(1)
    expect(r.itens[0]?.nome).toBe('Mercado')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/consultas-pg.test.ts
```

Esperado: FAIL na compilação — `AppPg` não é atribuível a `AppEmMemoria`, porque `AppEmMemoria` tem `db` e `encerrar` que `AppPg` não tem. Essa é exatamente a incompatibilidade que o estreitamento resolve.

- [ ] **Step 3: Estreitar `mcp/tools/o-que-vence.ts`**

Troque o import de `AppEmMemoria` por:

```ts
import type { ProjectionService } from '../../src/services/projection-service.js'
```

e o parâmetro por:

```ts
export async function oQueVence(
  // Estreitado ao que a funcao realmente usa: `AppEmMemoria` e `AppPg`
  // satisfazem isto estruturalmente, entao a ferramenta serve as duas fontes
  // sem saber qual esta por tras.
  app: { readonly projecao: ProjectionService },
  args: { dias?: number; hoje: string },
): Promise<OQueVence> {
```

Nada mais muda: o corpo já usa apenas `app.projecao`.

- [ ] **Step 4: Estreitar `mcp/tools/historico-de-gastos.ts`**

Mesma troca de import, e:

```ts
export async function historicoDeGastos(
  // Estreitado ao que a funcao realmente usa, como em o-que-vence.ts.
  app: { readonly projecao: ProjectionService },
  args: { meses?: number; nome?: string; hoje: string },
): Promise<HistoricoDeGastos> {
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npm test -- mcp/consultas-pg.test.ts
```

Esperado: 7 testes PASS.

- [ ] **Step 6: Confirmar que os testes antigos seguem passando**

```bash
npx vitest run mcp
```

Os testes existentes de `o-que-vence` e `historico-de-gastos` montam `AppEmMemoria` e devem continuar verdes sem alteração — é isso que prova que o estreitamento não quebrou a outra fonte. Se algum falhar, **não o reescreva**: reporte, porque significa que o estreitamento removeu algo que a função usava.

- [ ] **Step 7: Verificar lint e tipos**

```bash
npm run lint && npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add mcp/tools/o-que-vence.ts mcp/tools/historico-de-gastos.ts mcp/consultas-pg.test.ts
git commit -m "Porta as consultas de vencimentos e historico para o Postgres"
```

---

## Task 2: `cadastrar_parcelamento` e desfazer de parcelamento

**Files:**
- Modify: `mcp/recibo.ts`, `mcp/tools/desfazer.ts`
- Create: `mcp/tools/escrita/cadastrar-parcelamento.ts`, `mcp/tools/escrita/cadastrar-parcelamento.test.ts`

**Interfaces:**
- Consumes: `AppPg`; `montarRecibo`, `Recibo`, `TipoDeEscrita`; `deEntradaUsuario`, `formatarBRL`, `multiplicarPorInteiro` de `src/domain/money.js`; `novoId` de `src/data/ids.js`; `ErroDeUsuario`
- Produces:
  - `TipoDeEscrita` passa a incluir `'parcelamento'`
  - `async function cadastrarParcelamento(app: AppPg, args: { nome: string; valorParcela: string; quantidadeParcelas: number; primeiroVencimento: string }): Promise<Recibo>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `mcp/tools/escrita/cadastrar-parcelamento.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Pool } from 'pg'
import { criarPool } from '../../dados/conexao.js'
import { aplicarMigracoes } from '../../dados/migracoes.js'
import { criarAppPg, type AppPg } from '../../app-pg.js'
import { situacaoDoMes } from '../situacao-do-mes.js'
import { desfazer } from '../desfazer.js'
import { cadastrarParcelamento } from './cadastrar-parcelamento.js'

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
  for (const t of ['regras', 'parcelamentos', 'ocorrencias', 'ancoras']) {
    await pool.query(`delete from ${t}`)
  }
})

/** Momento de referencia para a janela de desfazer, sempre logo apos a escrita. */
function logoDepois(): Date {
  return new Date(Date.now() + 60_000)
}

describe('cadastrarParcelamento', () => {
  it('grava e devolve recibo com parcela, quantidade e total', async () => {
    const r = await cadastrarParcelamento(app, {
      nome: 'Geladeira',
      valorParcela: '300,00',
      quantidadeParcelas: 10,
      primeiroVencimento: '2026-10-20',
    })

    expect(r.tipo).toBe('parcelamento')
    expect(r.resumo).toContain('Geladeira')
    expect(r.resumo).toMatch(/R\$\s?300,00/u)
    expect(r.resumo).toContain('10')
    // O total e derivado, para o usuario conferir contra a fatura.
    expect(r.resumo).toMatch(/R\$\s?3\.000,00/u)

    const gravado = await app.repos.parcelamentos.obter(r.id)
    expect(gravado?.valorParcelaCentavos).toBe(30000)
    expect(gravado?.quantidadeParcelas).toBe(10)
  })

  it('recusa valor invalido, sem gravar', async () => {
    await expect(
      cadastrarParcelamento(app, {
        nome: 'Bobagem',
        valorParcela: 'trezentos reais',
        quantidadeParcelas: 10,
        primeiroVencimento: '2026-10-20',
      }),
    ).rejects.toThrow(/valor/i)

    expect(await app.repos.parcelamentos.listar()).toHaveLength(0)
  })

  it('recusa quantidade de parcelas invalida, sem gravar', async () => {
    await expect(
      cadastrarParcelamento(app, {
        nome: 'Zero parcelas',
        valorParcela: '300,00',
        quantidadeParcelas: 0,
        primeiroVencimento: '2026-10-20',
      }),
    ).rejects.toThrow()

    expect(await app.repos.parcelamentos.listar()).toHaveLength(0)
  })

  it('aparece na projecao como parcela nos meses seguintes', async () => {
    await cadastrarParcelamento(app, {
      nome: 'Geladeira',
      valorParcela: '300,00',
      quantidadeParcelas: 3,
      primeiroVencimento: '2026-10-20',
    })

    const outubro = await situacaoDoMes(app, { competencia: '2026-10', hoje: '2026-10-01' })
    const dezembro = await situacaoDoMes(app, { competencia: '2026-12', hoje: '2026-10-01' })
    const janeiro = await situacaoDoMes(app, { competencia: '2027-01', hoje: '2026-10-01' })

    expect(outubro.faltaPagar.map((i) => i.nome)).toContain('Geladeira')
    expect(dezembro.faltaPagar.map((i) => i.nome)).toContain('Geladeira')
    // Tres parcelas: outubro, novembro, dezembro. Janeiro ja nao tem.
    expect(janeiro.faltaPagar.map((i) => i.nome)).not.toContain('Geladeira')
  })
})

describe('desfazer de parcelamento', () => {
  it('remove o parcelamento', async () => {
    const r = await cadastrarParcelamento(app, {
      nome: 'Engano',
      valorParcela: '100,00',
      quantidadeParcelas: 5,
      primeiroVencimento: '2026-10-20',
    })

    await desfazer(app, {
      tipo: 'parcelamento',
      id: r.id,
      agora: logoDepois(),
      hoje: '2026-10-01',
    })

    expect(await app.repos.parcelamentos.obter(r.id)).toBeNull()
  })

  it('avisa que parcelas ja materializadas permanecem', async () => {
    const r = await cadastrarParcelamento(app, {
      nome: 'Geladeira',
      valorParcela: '300,00',
      quantidadeParcelas: 3,
      primeiroVencimento: '2026-10-20',
    })

    const resultado = await desfazer(app, {
      tipo: 'parcelamento',
      id: r.id,
      agora: logoDepois(),
      hoje: '2026-10-01',
    })

    // Sem este aviso a pessoa conclui que apagou a compra inteira e continua
    // vendo parcelas na projecao, sem entender por que.
    expect(resultado.descricao).toMatch(/materializad/i)
  })

  it('recusa fora da janela de 24 horas, sem apagar', async () => {
    const r = await cadastrarParcelamento(app, {
      nome: 'Antigo',
      valorParcela: '100,00',
      quantidadeParcelas: 2,
      primeiroVencimento: '2026-10-20',
    })

    const muitoDepois = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await expect(
      desfazer(app, { tipo: 'parcelamento', id: r.id, agora: muitoDepois, hoje: '2026-10-01' }),
    ).rejects.toThrow(/24 horas|janela/i)

    expect(await app.repos.parcelamentos.obter(r.id)).not.toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/tools/escrita/cadastrar-parcelamento.test.ts
```

Esperado: FAIL, módulo `./cadastrar-parcelamento.js` não encontrado.

- [ ] **Step 3: Acrescentar `'parcelamento'` a `TipoDeEscrita`**

Em `mcp/recibo.ts`:

```ts
export type TipoDeEscrita =
  | 'recorrente'
  | 'avulso'
  | 'pagamento'
  | 'saldo'
  | 'parcelamento'
```

Isso vai quebrar o typecheck em `mcp/tools/desfazer.ts`, e é de propósito: `TABELA_POR_TIPO` é um `Record<Exclude<TipoDeEscrita, 'pagamento'>, TabelaAuditavel>`, então o compilador exige a chave nova. É a rede que impede acrescentar um tipo de escrita e esquecer de ensinar o `desfazer` a revertê-lo.

- [ ] **Step 4: Implementar `mcp/tools/escrita/cadastrar-parcelamento.ts`**

```ts
/**
 * Cadastra uma compra parcelada.
 *
 * Recebe o valor da PARCELA, nunca o total. O dominio guarda
 * `valorParcelaCentavos`, e pedir o total obrigaria alguem a dividir --
 * divisao de dinheiro raramente e exata (2.500 em 7x da 357,142857...), o
 * modelo arredondaria, e a soma nao fecharia com o total informado sem que
 * nada indicasse o problema.
 *
 * O total aparece no recibo, derivado, para o usuario conferir contra a
 * fatura.
 */

import { deEntradaUsuario, formatarBRL, multiplicarPorInteiro } from '../../../src/domain/money.js'
import type { Parcelamento } from '../../../src/domain/types.js'
import { novoId } from '../../../src/data/ids.js'
import type { AppPg } from '../../app-pg.js'
import { montarRecibo, type Recibo } from '../../recibo.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'

export interface ArgsCadastrarParcelamento {
  readonly nome: string
  readonly valorParcela: string
  readonly quantidadeParcelas: number
  readonly primeiroVencimento: string
}

export async function cadastrarParcelamento(
  app: AppPg,
  args: ArgsCadastrarParcelamento,
): Promise<Recibo> {
  const centavos = deEntradaUsuario(args.valorParcela)
  if (centavos === null) {
    throw new ErroDeUsuario(
      `Nao entendi o valor da parcela "${args.valorParcela}". ` +
        'Use algo como 300, 300,00 ou 1.234,56 -- e informe o valor da PARCELA, nao o total.',
    )
  }

  const parcelamento: Parcelamento = {
    id: novoId(),
    nome: args.nome,
    valorParcelaCentavos: centavos,
    quantidadeParcelas: args.quantidadeParcelas,
    primeiroVencimento: args.primeiroVencimento,
  }

  // `salvar` chama `validarParcelamento`, que rejeita parcela nao positiva,
  // centavo fracionado, quantidade menor que 1 e data fora de AAAA-MM-DD.
  await app.repos.parcelamentos.salvar(parcelamento)

  const total = multiplicarPorInteiro(centavos, args.quantidadeParcelas)

  return montarRecibo(
    'parcelamento',
    parcelamento.id,
    `${parcelamento.nome}: ${String(args.quantidadeParcelas)}x de ${formatarBRL(centavos)}, ` +
      `total ${formatarBRL(total)}, primeira em ${args.primeiroVencimento}`,
  )
}
```

- [ ] **Step 5: Acrescentar o ramo de parcelamento em `mcp/tools/desfazer.ts`**

Na constante:

```ts
const TABELA_POR_TIPO: Record<Exclude<TipoDeEscrita, 'pagamento'>, TabelaAuditavel> = {
  recorrente: 'regras',
  avulso: 'ocorrencias',
  saldo: 'ancoras',
  parcelamento: 'parcelamentos',
}
```

E, junto dos outros ramos, antes do caso de saldo:

```ts
  if (args.tipo === 'parcelamento') {
    await app.repos.parcelamentos.remover(args.id)
    return {
      desfeito: true,
      descricao:
        'Compra parcelada removida. As parcelas ja materializadas permanecem no ' +
        'historico e continuam aparecendo nos meses em que existem -- a remocao ' +
        'nao cascateia, do mesmo jeito que a de uma recorrencia.',
    }
  }
```

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
npm test -- mcp/tools/escrita/cadastrar-parcelamento.test.ts
```

Esperado: 7 testes PASS.

Se o teste "aparece na projecao" falhar contando meses diferentes do esperado, confira `expandirParcelamentos` em `src/domain/installment-expander.ts` antes de ajustar o teste — a contagem de parcelas é regra de domínio, não escolha deste plano.

- [ ] **Step 7: Verificar a suíte inteira, lint e tipos**

```bash
npx vitest run mcp && npm run lint && npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add mcp/recibo.ts mcp/tools/desfazer.ts mcp/tools/escrita/cadastrar-parcelamento.ts mcp/tools/escrita/cadastrar-parcelamento.test.ts
git commit -m "Cadastro de compra parcelada e seu desfazer"
```

---

## Task 3: Registrar as quatro ferramentas no servidor

**Files:**
- Modify: `mcp/servidor-http.ts`, `mcp/README-remoto.md`
- Modify: `mcp/servidor-http.test.ts` (round-trips das novas)

**Interfaces:**
- Consumes: `oQueVence`, `historicoDeGastos`, `simularCenario`, `cadastrarParcelamento`, `exportar`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `mcp/servidor-http.test.ts`, seguindo o padrão dos round-trips que já existem para as outras ferramentas:

```ts
  it('o_que_vence responde pelo protocolo', async () => {
    const base = await subir()
    await chamarFerramenta(base, 'cadastrar_recorrente', {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    const r = await chamarFerramenta(base, 'o_que_vence', { dias: 30, hoje: '2026-09-05' })

    expect(r).toContain('Aluguel')
  })

  it('historico_de_gastos responde pelo protocolo', async () => {
    const base = await subir()

    const r = await chamarFerramenta(base, 'historico_de_gastos', { meses: 3, hoje: '2026-09-05' })

    expect(r).toContain('totalGeral')
  })

  it('cadastrar_parcelamento responde pelo protocolo e grava', async () => {
    const base = await subir()

    const r = await chamarFerramenta(base, 'cadastrar_parcelamento', {
      nome: 'Geladeira',
      valorParcela: '300,00',
      quantidadeParcelas: 10,
      primeiroVencimento: '2026-10-20',
    })

    expect(r).toContain('Geladeira')

    const gravados = await pool.query('select * from parcelamentos')
    expect(gravados.rowCount).toBe(1)
  })

  it('simular_cenario responde pelo protocolo e NAO altera o banco', async () => {
    const base = await subir()
    await chamarFerramenta(base, 'cadastrar_recorrente', {
      tipo: 'saida',
      nome: 'Aluguel',
      valor: '1800,00',
      diaDoMes: 10,
      vigenteDe: '2026-09',
    })

    const antes = await pool.query('select * from regras order by id')

    const r = await chamarFerramenta(base, 'simular_cenario', {
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

    expect(r).toContain('comCenario')

    // A garantia central da ferramenta: ela escreve so em bancos que morrem no
    // fim da chamada. Quando a fonte era um arquivo isso valia por construcao;
    // agora que a fonte e o banco de producao, precisa ser verificado.
    const depois = await pool.query('select * from regras order by id')
    expect(depois.rows).toEqual(antes.rows)
    expect((await pool.query('select * from parcelamentos')).rowCount).toBe(0)
  })
```

Se os helpers `subir()` e `chamarFerramenta()` tiverem outra assinatura no arquivo, use a que existe — não crie helpers novos.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- mcp/servidor-http.test.ts
```

Esperado: FAIL — as ferramentas não estão registradas, então o servidor devolve erro de ferramenta desconhecida.

- [ ] **Step 3: Registrar as quatro ferramentas**

Em `mcp/servidor-http.ts`, seguindo o padrão das já registradas: cada uma envolvida em `executarFerramenta`, com `hoje` opcional preenchido por `hojeDoSistema()`.

`simular_cenario` é a única com um passo a mais — o servidor exporta antes de repassar:

```ts
    executarFerramenta(async () => {
      // `simularCenario` consome um DocumentoBackup e monta dois bancos
      // descartaveis. `exportar` ja produz exatamente esse documento, entao a
      // ferramenta nao muda: so muda quem a alimenta. E ela segue sem alcancar
      // o Postgres, que e o que a torna segura.
      const doc = await exportar(app, { hoje: hoje ?? hojeDoSistema() })
      return simularCenario(doc, { lancamentos, ate, hoje: hoje ?? hojeDoSistema() })
    }),
```

Use estas `description` verbatim. Elas separam **qual pergunta cada ferramenta responde**, porque quatro delas falam de períodos e uma escolha errada é falha silenciosa — o assistente responde com confiança a partir da ferramenta errada:

| Ferramenta | `description` |
|---|---|
| `o_que_vence` | `Responde "o que preciso pagar nos proximos dias?". Janela curta a partir de hoje, que pode cruzar a virada do mes, mais tudo que ja esta atrasado. Para o quadro completo de um mes use situacao_do_mes.` |
| `historico_de_gastos` | `Responde "quanto eu gastei com isso?". Olha o PASSADO ja pago, agregado por nome, nos ultimos meses. Nao mostra previsao nem conta em aberto -- para isso use situacao_do_mes ou o_que_vence.` |
| `simular_cenario` | `Responde "se eu assumir esse gasto, atravesso os proximos meses?". Projeta lancamentos hipoteticos e compara mes a mes com e sem eles. Nada e gravado. Valores dos lancamentos vao em centavos inteiros aqui, diferente das ferramentas de cadastro.` |
| `cadastrar_parcelamento` | `Cadastra uma compra parcelada. O valor e o da PARCELA como aparece na fatura, nunca o total -- o total e devolvido no recibo para voce conferir.` |

Confira o schema de `simular_cenario` contra `LancamentoHipotetico` em `mcp/tools/simular-cenario.ts` antes de escrevê-lo: ele já existe no servidor stdio (`mcp/server.ts`) e pode ser usado como referência, mas **não importe de lá** — `mcp/server.ts` abre um transporte stdio ao ser importado.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npm test -- mcp/servidor-http.test.ts
```

Esperado: os quatro testes novos PASS, junto dos que já existiam.

- [ ] **Step 5: Verificar a suíte inteira, lint e tipos**

```bash
npx vitest run mcp && npm run lint && npm run typecheck
```

- [ ] **Step 6: Subir localmente contra um Postgres em container**

```bash
docker run --rm -d -p 5435:5432 -e POSTGRES_PASSWORD=local -e POSTGRES_DB=financas --name pg-p2 postgres:16-alpine
```

Em PowerShell:

```powershell
$env:FINANCE_MCP_SEGREDO = "teste-local"; $env:DATABASE_URL = "postgres://postgres:local@localhost:5435/financas"; npm run mcp:http
```

Confirme que sobe e que `GET /` devolve `{"vivo":true}`. Encerre, e depois:

```bash
docker stop pg-p2
```

- [ ] **Step 7: Atualizar `mcp/README-remoto.md`**

A tabela de ferramentas passa de 8 para 12 linhas. Acrescente `o_que_vence`, `historico_de_gastos`, `simular_cenario` e `cadastrar_parcelamento`, cada uma com a pergunta que responde — o mesmo texto das descrições, resumido. Atualize a linha de estado para dizer que o Projeto 2 está implementado.

- [ ] **Step 8: Commit**

```bash
git add mcp/servidor-http.ts mcp/servidor-http.test.ts mcp/README-remoto.md
git commit -m "Registra parcelamento e as tres consultas restantes"
```

---

## Verificação final

- [ ] `npm run lint`, `npm run typecheck` e `npx vitest run mcp` passam
- [ ] Nenhum arquivo em `src/` modificado: `git diff main --stat -- src/` (esperado: vazio)
- [ ] `mcp/server.ts` não foi tocado
- [ ] Os testes antigos de `o-que-vence` e `historico-de-gastos`, que montam `AppEmMemoria`, passam sem alteração
- [ ] `simular_cenario` não altera o banco: provado pelo teste de round-trip
- [ ] O servidor expõe doze ferramentas

## Pendências operacionais, ainda abertas

Não são tarefas deste plano:

1. **O segredo em produção é `1234`**, e agora há um banco com dados atrás dele.
2. **O webhook do GitHub não está autorizado**, então `git push` não redeploya.
3. Achados parqueados na revisão do Projeto 1: ordenar `porGerador`, o back-fill de `atualizado_em`, e separar o registro de ferramentas de `servidor-http.ts` — que com doze ferramentas fica mais tentador.
