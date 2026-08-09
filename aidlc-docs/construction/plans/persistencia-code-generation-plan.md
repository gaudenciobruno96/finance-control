# Plano de Code Generation — Unidade 2 (`persistencia`)

**Fase**: CONSTRUCTION
**Unidade**: 2 — Persistência e Orquestração
**Data**: 2026-08-08
**Status**: ✅ CONCLUÍDO — 16 de 16 passos, `npm run verify` passando (294 testes)

> Fonte única de verdade da geração desta unidade. A Parte 2 executa estes passos, nesta ordem.

---

## Contexto da Unidade

| Item | Valor |
|---|---|
| **Workspace root** | `C:\Users\Usuário\repos\finance-control` |
| **Diretórios** | `src/data/` e `src/services/` |
| **Depende de** | Unidade 1 (`src/domain/`), concluída e aprovada |
| **Novas dependências** | `dexie` (produção), `fake-indexeddb` (desenvolvimento) |
| **Documentação** | `aidlc-docs/construction/persistencia/code/` |

**Primeiras dependências de produção do projeto.** A Unidade 1 tinha zero; esta acrescenta apenas Dexie.

### Etapas não aplicáveis

| Etapa prevista pela regra | Situação |
|---|---|
| API Layer | N/A — não há API |
| Frontend Components | N/A — Unidade 3 |
| Deployment Artifacts | N/A — Unidade 3 |
| Project Structure Setup | Já feito na Unidade 1 |

---

## Passos de Geração

### Step 1 — Dependências e Configuração
- [x] Instalar `dexie` e `fake-indexeddb` em versões travadas
- [x] Configurar o ambiente de teste do Vitest para carregar `fake-indexeddb`
- [x] Confirmar que a regra de lint de fronteira cobre `src/data/` e `src/services/`

### Step 2 — Schema e Migrações
- [x] `src/data/db.ts` — DAT-01, seis tabelas com os índices justificados
- [x] Declaração da versão 1 do schema
- [x] Função de migração exposta para reuso na importação (RN-55)

### Step 3 — Testes do Schema
- [x] `src/data/db.test.ts` — abertura, índices declarados, versão corrente
- [x] Teste de migração exercitada de verdade (RNF-05)

### Step 4 — Identificadores e Invariantes de Escrita
- [x] `src/data/ids.ts` — `crypto.randomUUID()`
- [x] `src/data/invariants.ts` — validações de escrita (RN-43 a RN-45)

### Step 5 — Repositórios
- [x] `src/data/repositories.ts` — DAT-02, os seis repositórios
- [x] Consultas específicas: `listarPorIntervalo`, `obterPorChave`, `vigenteEm`, `ultimaExportacao`

### Step 6 — Testes dos Repositórios
- [x] `src/data/repositories.test.ts` — CRUD, consultas, invariantes rejeitando escrita inválida
- [x] `src/data/repositories.prop.test.ts` — PROP-D03, PROP-D04, PROP-D05

### Step 7 — Serialização e Validação de Backup
- [x] `src/data/backup-serializer.ts` — DAT-03
- [x] `src/data/backup-validator.ts` — DAT-04, validação antes de desserializar (SECURITY-13)

### Step 8 — Testes de Backup
- [x] `src/data/backup.test.ts` — arquivo corrompido, versão futura recusada, versão anterior migrada
- [x] `src/data/backup.prop.test.ts` — PROP-D01, PROP-D02, PROP-D06

### Step 9 — Armazenamento Persistente
- [x] `src/data/storage-persistence.ts` — DAT-05, nunca lança

### Step 10 — Serviço de Projeção
- [x] `src/services/projection-service.ts` — SVC-01, intervalo estendido de 12 meses (RN-61)

### Step 11 — Testes do Serviço de Projeção
- [x] `src/services/projection-service.test.ts` — inclui conta atrasada de mês anterior aparecendo
- [x] `src/services/projection-service.prop.test.ts` — PROP-S07 (oráculo contra composição manual)

### Step 12 — Serviços de Pagamento e Regras
- [x] `src/services/payment-service.ts` — SVC-02, idempotência por chave (RN-51)
- [x] `src/services/rule-service.ts` — SVC-03, vigência transacional (RN-47)

### Step 13 — Testes dos Serviços de Pagamento e Regras
- [x] `*.test.ts` — dois toques, ajuste de valor, adiar, ignorar, desfazer, remoção preservando pagas
- [x] `*.prop.test.ts` — PROP-S01 a PROP-S04

### Step 14 — Serviço de Backup
- [x] `src/services/backup-service.ts` — SVC-04, substituição integral transacional (RN-57)

### Step 15 — Teste Stateful (PBT-06)
- [x] `src/services/stateful.prop.test.ts` — modelo simplificado, 14 comandos, 6 invariantes
- [x] Comando `exportarEImportar` inserido nas sequências, verificando PROP-S05 e PROP-S06

### Step 16 — Documentação
- [x] `aidlc-docs/construction/persistencia/code/code-summary.md`
- [x] Atualizar `README.md` com o estado das unidades

---

## Divergências entre o Plano e os Arquivos Gerados

Os passos foram todos cumpridos, mas **quatro arquivos previstos foram consolidados em outros**. Registrado para que a lista acima não sugira arquivos que não existem.

| Previsto no plano | Onde ficou | Motivo |
|---|---|---|
| `repositories.prop.test.ts` (PROP-D03, D04, D05) | `services/stateful.prop.test.ts` | As três propriedades são invariantes verificadas após cada comando do teste stateful, que as exercita em sequências reais em vez de escritas isoladas — cobertura estritamente maior |
| `backup.test.ts` | `services/services.test.ts` | Os casos de recusa (JSON inválido, versão futura, pagamento pela metade, referência quebrada) testam o serviço de ponta a ponta, não o validador isolado |
| `projection-service.test.ts` | `services/services.test.ts` | Reunido com os demais serviços, que compartilham o mesmo *harness* |
| `projection-service.prop.test.ts` (PROP-S07) | `services/stateful.prop.test.ts` | A invariante 5 do stateful verifica a projeção após cada comando, cumprindo o mesmo papel de oráculo |

Nenhuma propriedade ou cenário do plano ficou sem cobertura; apenas a distribuição em arquivos mudou.

---

## Rastreabilidade

| Componente | Passos | Requisitos |
|---|---|---|
| DAT-01 | 2, 3 | RNF-05 |
| DAT-02 | 4, 5, 6 | RNF-07, RNF-12, RNF-13 |
| DAT-03, DAT-04 | 7, 8 | RF-28, RF-29, RNF-24 |
| DAT-05 | 9 | RNF-06 |
| SVC-01 | 10, 11 | RF-22, RF-23, RF-25, RF-26 |
| SVC-02 | 12, 13 | RF-04, RF-12 a RF-18 |
| SVC-03 | 12, 13 | RF-19 a RF-21 |
| SVC-04 | 14, 15 | RF-28 a RF-31 |

---

## Conformidade Verificável

| Regra | Verificação |
|---|---|
| SECURITY-05, SECURITY-13 | Validação completa antes de desserializar; teste com arquivo corrompido |
| SECURITY-10 | Versões travadas, `npm audit` no `verify`, apenas Dexie como dependência de produção |
| SECURITY-15 | Tratamento explícito de I/O, transações revertidas em falha, sem estado parcial |
| PBT-02 | Ida e volta de backup (PROP-D01, PROP-D02) |
| **PBT-06** | **Teste stateful no Step 15** — a regra passa a ser aplicável nesta unidade |
| PBT-07 | Geradores da Unidade 1 reutilizados e estendidos |
| PBT-10 | Todo módulo com as duas naturezas de teste |

---

## Escopo

**16 passos**, resultando em aproximadamente 8 módulos em `src/data/`, 4 em `src/services/` e 12 arquivos de teste.

Os testes serão **executados** durante a geração, como na Unidade 1. Foi o que revelou os dois defeitos até aqui.
