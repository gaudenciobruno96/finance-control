# Plano de Code Generation — Unidade 1 (`dominio`)

**Fase**: CONSTRUCTION
**Unidade**: 1 — Núcleo de Domínio
**Data**: 2026-08-08
**Status**: ✅ CONCLUÍDO — 16 de 16 passos executados, `npm run verify` passando

> **Este documento é a fonte única de verdade da geração de código desta unidade.** A Parte 2 executa exatamente estes passos, nesta ordem, sem desvio.

---

## Contexto da Unidade

| Item | Valor |
|---|---|
| **Workspace root** | `C:\Users\Usuário\repos\finance-control` |
| **Tipo de projeto** | Greenfield, pacote único |
| **Diretório da unidade** | `src/domain/` |
| **Suporte a teste** | `src/test-support/` (compartilhado entre unidades) |
| **Dependências de outras unidades** | Nenhuma |
| **Dependências de produção** | Nenhuma |
| **Documentação gerada** | `aidlc-docs/construction/dominio/code/` (somente markdown) |

**Regra de localização**: código de aplicação vai para a raiz do workspace. **Nunca** em `aidlc-docs/`.

### Etapas não aplicáveis a esta unidade

| Etapa prevista pela regra | Situação |
|---|---|
| API Layer Generation e Testing | N/A — não há API neste projeto |
| Repository Layer Generation e Testing | N/A — pertence à Unidade 2 |
| Frontend Components | N/A — pertence à Unidade 3 |
| Database Migration Scripts | N/A — pertence à Unidade 2 |
| Deployment Artifacts | N/A — pertence à Unidade 3 |

---

## Passos de Geração

### Step 1 — Estrutura e Configuração do Projeto
- [x] `package.json` com scripts de desenvolvimento, build, teste, lint e verificação
- [x] `tsconfig.json` com `strict` e `noUncheckedIndexedAccess` (NFR-M01)
- [x] `vite.config.ts` com alvo compatível com iOS 16 (NFR-P02)
- [x] `vitest.config.ts`
- [x] `eslint.config.js` com a regra de fronteira de import (NFR-M02)
- [x] `.gitignore`
- [x] Estrutura de diretórios `src/domain/`, `src/test-support/`
- [x] Instalar dependências e gerar `package-lock.json` (NFR-S01)
- [x] Script `verify` encadeando lint, `npm audit` e testes (NFR-S02)

### Step 2 — Fundação: tipos, erros, guardas
- [x] `src/domain/types.ts` — DOM-01, com variantes `readonly` (SUP-03, PAD-02)
- [x] `src/domain/errors.ts` — SUP-01, `ErroDeDominio` e os 10 códigos (PAD-01)
- [x] `src/domain/guards.ts` — SUP-02, predicados e asserções (PAD-04)

### Step 3 — Testes da Fundação
- [x] `src/domain/errors.test.ts` — erro carrega código e componente; mensagem não contém valor de dado (NFR-S05)
- [x] `src/domain/guards.test.ts` — aceita válidos, rejeita inválidos
- [x] `src/domain/guards.prop.test.ts` — PROP-E01

### Step 4 — Aritmética Monetária
- [x] `src/domain/money.ts` — DOM-02, RN-01 a RN-03

### Step 5 — Testes de Aritmética Monetária
- [x] `src/domain/money.test.ts` — exemplos concretos, incluindo o caso `0.1 + 0.2`
- [x] `src/domain/money.prop.test.ts` — PROP-M01 a PROP-M05

### Step 6 — Aritmética de Calendário
- [x] `src/domain/calendar.ts` — DOM-03, RN-04 a RN-08, RN-10

### Step 7 — Testes de Aritmética de Calendário
- [x] `src/domain/calendar.test.ts` — dia 31 em fevereiro bissexto e não bissexto; sábado com `antecipa`; domingo com `posterga`; ausência de deslocamento por fuso
- [x] `src/domain/calendar.prop.test.ts` — PROP-C01 a PROP-C07

### Step 8 — Geradores de Teste por Propriedade
- [x] `src/test-support/generators.ts` — SUP-04, um gerador por tipo, invariantes por construção (PBT-07)
- [x] `src/test-support/coherent-state.ts` — SUP-05, estado inteiro e coerente

### Step 9 — Expansores
- [x] `src/domain/rule-expander.ts` — DOM-04, RN-11, RN-12
- [x] `src/domain/installment-expander.ts` — DOM-05, RN-16 a RN-18
- [x] `src/domain/card-invoice-expander.ts` — DOM-06, RN-19, RN-21, RN-23

### Step 10 — Testes dos Expansores
- [x] `*.test.ts` dos três — inclui a regra de dia 31 com `posterga` mantendo a competência, e o parcelamento iniciado em 31 de janeiro verificado até a quarta parcela
- [x] `*.prop.test.ts` dos três — PROP-X01 a PROP-X08

### Step 11 — Resolução e Projeção
- [x] `src/domain/occurrence-resolver.ts` — DOM-07, RN-25 a RN-28, PAD-06
- [x] `src/domain/balance-projector.ts` — DOM-08, RN-29 a RN-36

### Step 12 — Testes de Resolução e Projeção
- [x] `occurrence-resolver.test.ts` e `.prop.test.ts` — PROP-R01 a PROP-R05
- [x] `balance-projector.test.ts` e `.prop.test.ts` — PROP-P01 a PROP-P07; inclui conta vencida há dois meses aparecendo no dia da âncora, e conta vencida há treze meses não aparecendo

### Step 13 — Sumarizadores, Versionamento e Estimativa
- [x] `src/domain/month-summarizer.ts` — DOM-09
- [x] `src/domain/future-commitments.ts` — DOM-10
- [x] `src/domain/rule-versioning.ts` — DOM-11, RN-13 a RN-15
- [x] `src/domain/estimation.ts` — DOM-12, RN-37 a RN-39

### Step 14 — Testes de Sumarizadores, Versionamento e Estimativa
- [x] `*.test.ts` dos quatro — inclui aluguel reajustado a partir de agosto com julho intacto
- [x] `rule-versioning.prop.test.ts` — PROP-V01 a PROP-V04
- [x] `estimation.prop.test.ts` — PROP-A01 a PROP-A03

### Step 15 — Verificação da Regra de Fronteira
- [x] Escrever um import proibido temporário em `src/domain/` e confirmar que o lint falha
- [x] Remover o import e confirmar que o lint passa
- [x] Registrar o resultado da verificação

> Este passo é o critério de conclusão da unidade definido em `unit-of-work.md`. Uma regra de lint que ninguém verificou é uma regra que existe apenas no papel.

### Step 16 — Documentação
- [x] `README.md` na raiz — como instalar, rodar, testar e verificar
- [x] `aidlc-docs/construction/dominio/code/code-summary.md` — resumo dos arquivos criados e cobertura de propriedades

---

## Rastreabilidade

| Componente | Passos | Requisitos |
|---|---|---|
| DOM-01, SUP-01 a SUP-03 | 2, 3 | RNF-27, NFR-C01, NFR-M01 |
| DOM-02 | 4, 5 | RNF-08 |
| DOM-03 | 6, 7 | RNF-09, RNF-10, RNF-11 |
| SUP-04, SUP-05 | 8 | RNF-29 |
| DOM-04, DOM-05, DOM-06 | 9, 10 | RF-02, RF-05, RF-06, RF-08, RF-10, RF-11 |
| DOM-07 | 11, 12 | RF-16, RF-17, RF-18 |
| DOM-08 | 11, 12 | RF-23, RF-27 |
| DOM-09, DOM-10 | 13, 14 | RF-22, RF-26 |
| DOM-11 | 13, 14 | RF-19, RF-20, RF-21 |
| DOM-12 | 13, 14 | RF-06 |
| Configuração e lint | 1, 15 | RNF-23, RNF-27, NFR-M02, NFR-S01 a NFR-S04 |

---

## Conformidade Verificável na Geração

| Regra | Como será verificada |
|---|---|
| SECURITY-10 | `package-lock.json` presente, `npm audit` no script `verify`, nenhuma dependência não utilizada |
| SECURITY-15 | Funções públicas validam entrada e lançam `ErroDeDominio`; nenhuma devolve resultado parcial |
| PBT-02, PBT-03, PBT-04, PBT-05 | Propriedades de ida e volta, invariante, idempotência e oráculo presentes conforme a lista de 39 |
| PBT-06 | **N/A** — a unidade não tem componente com estado; será avaliada na Unidade 2 |
| PBT-07 | Geradores de domínio no Step 8, com invariantes por construção |
| PBT-08 | Semente aleatória com registro na falha, shrinking habilitado |
| PBT-10 | Todo módulo tem `.test.ts` e `.prop.test.ts`; os 8 cenários críticos têm teste por exemplo |

---

## Escopo

**16 passos**, resultando em aproximadamente 14 módulos de domínio e suporte, 2 módulos de suporte a teste, 24 arquivos de teste e 7 arquivos de configuração.

Os testes são **gerados** nesta fase, mas **executados** na fase Build and Test, conforme o critério de conclusão do AI-DLC.
