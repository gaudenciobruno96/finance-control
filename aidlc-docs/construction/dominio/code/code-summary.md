# Resumo de Código — Unidade 1 (`dominio`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08
**Situação**: 16 de 16 passos concluídos

---

## Verificação Executada

```
npm run verify
  lint       eslint .                    OK
  typecheck  tsc --noEmit                OK
  test       vitest run                  23 arquivos, 230 testes, todos passando
  audit      npm audit --audit-level=high  0 vulnerabilidades
```

Os testes foram **executados**, não apenas gerados. O AI-DLC prevê a execução na fase Build and Test; rodá-los durante a geração antecipou a descoberta de um defeito real (ver abaixo).

---

## Arquivos Criados

### Configuração (raiz do workspace)

| Arquivo | Conteúdo |
|---|---|
| `package.json` | Scripts e dependências; script `verify` encadeando as quatro verificações |
| `package-lock.json` | Travamento de versões (SECURITY-10, NFR-S01) |
| `tsconfig.json` | `strict` e `noUncheckedIndexedAccess` (NFR-M01) |
| `vite.config.ts` | Alvo `safari16` (NFR-P02) |
| `vitest.config.ts` | Inclusão dos dois tipos de arquivo de teste |
| `eslint.config.js` | **Regra de fronteira de import** (NFR-M02) |
| `.gitignore` | |
| `README.md` | Instalação, comandos, arquitetura, testes |

### Domínio (`src/domain/`)

| Arquivo | Componente | Regras implementadas |
|---|---|---|
| `types.ts` | DOM-01 | Tipos `readonly` (PAD-02) |
| `errors.ts` | SUP-01 | PAD-01, NFR-S05 |
| `guards.ts` | SUP-02 | PAD-04 |
| `money.ts` | DOM-02 | RN-01 a RN-03 |
| `calendar.ts` | DOM-03 | RN-04 a RN-10 |
| `occurrence-key.ts` | — | Extraído; ver "Desvios" |
| `rule-expander.ts` | DOM-04 | RN-11, RN-12 |
| `installment-expander.ts` | DOM-05 | RN-16 a RN-18 |
| `card-invoice-expander.ts` | DOM-06 | RN-19, RN-21, RN-23 |
| `occurrence-resolver.ts` | DOM-07 | RN-25 a RN-28, PAD-06 |
| `balance-projector.ts` | DOM-08 | RN-29 a RN-36 |
| `month-summarizer.ts` | DOM-09 | RF-22 |
| `future-commitments.ts` | DOM-10 | RF-26 |
| `rule-versioning.ts` | DOM-11 | RN-13 a RN-15 |
| `estimation.ts` | DOM-12 | RN-37 a RN-39 |

### Suporte a teste (`src/test-support/`)

| Arquivo | Componente |
|---|---|
| `generators.ts` | SUP-04 — geradores de domínio (PBT-07) |
| `coherent-state.ts` | SUP-05 — gerador de estado coerente |

### Testes

11 arquivos `*.test.ts` (por exemplo) e 9 arquivos `*.prop.test.ts` (por propriedade), somando 230 testes.

---

## Defeito Encontrado Durante a Geração

**Projeção de mês futuro descartava movimentos intermediários.**

Ao projetar setembro com âncora de saldo em 1º de agosto, os movimentos de agosto não compunham o saldo de partida de setembro. Uma conta de agosto com vencimento no dia 20, não paga, simplesmente sumia — e setembro aparecia mais folgado do que seria.

A causa era um ramo de decisão incompleto: movimentos anteriores ao início da curva eram classificados apenas como "já pagos antes da âncora" (ignorar) ou "atrasados" (empurrar para hoje). Faltava a terceira situação: **posteriores à âncora mas anteriores ao mês exibido**, que precisam compor o saldo inicial.

Corrigido com um acumulador `antesDoMes` somado ao saldo de partida. Dois testes por exemplo foram acrescentados para cobrir o caso.

O defeito apareceu porque um teste mal escrito falhou e a investigação revelou que o erro estava no código, não no teste.

---

## Duas Decisões Tomadas na Implementação

Ambas eram lacunas do design, não desvios dele.

**1. Onde a curva começa.** Quando a âncora cai dentro do mês exibido — o caso comum, "hoje eu tenho X" no mês corrente —, a curva não começa no dia 1. Você não sabe qual era seu saldo no dia 1 se só declarou o saldo hoje. Desenhar os dias anteriores seria inventar número.

**2. O que entra na curva de um mês.** Não é "ocorrências da competência", é "ocorrências cuja data efetiva cai dentro do mês". Uma ocorrência de competência maio postergada para 1º de junho afeta o dinheiro de junho, não o de maio. O resumo do mês, por outro lado, continua agrupando por competência — o usuário pensa em "as contas de agosto" ainda que uma tenha sido paga em setembro.

---

## Desvios do Design

| Desvio | Motivo |
|---|---|
| `occurrence-key.ts` criado como módulo próprio | `chaveDe` estava listada em DOM-07, mas os três expansores precisam dela. Mantê-la no resolvedor criaria dependência de expansor para resolvedor, invertendo o sentido do pipeline |
| Testes executados durante a geração | O AI-DLC os executa em Build and Test. Antecipar revelou o defeito de projeção três estágios antes |

---

## Conformidade

### Segurança

| Regra | Situação |
|---|---|
| SECURITY-10 | **Conforme** — `package-lock.json` versionado, `npm audit` no `verify`, zero dependências de produção, zero vulnerabilidades |
| SECURITY-15 | **Conforme** — funções públicas validam e lançam `ErroDeDominio`; nenhuma devolve resultado parcial; a unidade não faz I/O |
| SECURITY-03 (por princípio) | **Conforme** — mensagens de erro nomeiam a invariante violada, nunca o valor. Verificado por teste |
| Demais | N/A conforme `requirements.md`, seção 7.1 |

### Testes por propriedades

| Regra | Situação |
|---|---|
| PBT-01 | **Conforme** — 39 propriedades identificadas no Functional Design, todas implementadas |
| PBT-02 | **Conforme** — ida e volta em `somarDias`, `somarMeses`, `construirData` e formatação monetária |
| PBT-03 | **Conforme** — invariantes de expansão, projeção e vigência |
| PBT-04 | **Conforme** — idempotência de `aplicarAjuste` e de `resolver` |
| PBT-05 | **Conforme** — oráculo de soma direta na projeção; oráculo independente (`Date` em UTC) no dia base das parcelas |
| PBT-06 | **N/A** — a unidade não tem componente com estado. Será avaliada na Unidade 2 |
| PBT-07 | **Conforme** — geradores em `src/test-support/`, invariantes por construção, verificados por PROP-E01 |
| PBT-08 | **Conforme** — semente aleatória com registro na falha; shrinking nativo não desabilitado |
| PBT-09 | **Conforme** — fast-check, decidido em NFR Requirements |
| PBT-10 | **Conforme** — todo módulo tem as duas naturezas de teste; os 8 cenários críticos têm teste por exemplo |

**Nenhum achado bloqueante.**

---

## Critério de Conclusão da Unidade

Definido em `unit-of-work.md`: *"Todos os testes passando e a regra de lint falhando propositalmente ao ser testada com um import proibido."*

| Critério | Resultado |
|---|---|
| Todos os testes passando | ✅ 230 de 230 |
| Regra de fronteira verificada ativamente | ✅ Ver abaixo |

A verificação do Step 15 criou um arquivo temporário em `src/domain/` importando `dexie` e `../ui/`. O lint acusou **dois erros**, um por import, com a mensagem apontando a documentação de dependências. O arquivo foi removido e o lint voltou ao verde.

A regra está em vigor, não apenas no papel.
