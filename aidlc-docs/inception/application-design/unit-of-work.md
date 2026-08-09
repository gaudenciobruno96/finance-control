# Unidades de Trabalho

**Estágio**: INCEPTION — Units Generation (Parte 2)
**Data**: 2026-08-08

---

## Terminologia

O sistema é um **monolito de unidade implantável única** — um PWA estático. As três unidades abaixo são **módulos lógicos** dentro dele, usados como contexto de planejamento e como fronteira de revisão. Nenhuma é implantável de forma independente.

---

## Unidade 1 — Núcleo de Domínio

**Identificador**: `dominio`
**Diretório**: `src/domain/`

### Responsabilidade

Toda a lógica de negócio, expressa como funções puras. Recebe dados, devolve dados. Não conhece banco, interface, rede ou relógio.

### Componentes

DOM-01 `types` · DOM-02 `money` · DOM-03 `calendar` · DOM-04 `ruleExpander` · DOM-05 `installmentExpander` · DOM-06 `cardInvoiceExpander` · DOM-07 `occurrenceResolver` · DOM-08 `balanceProjector` · DOM-09 `monthSummarizer` · DOM-10 `futureCommitments` · DOM-11 `ruleVersioning`

### Entregáveis

- Os onze módulos de domínio
- Testes por exemplo e testes por propriedade para cada um
- Geradores de domínio reutilizáveis para PBT (PBT-07)
- **Configuração do projeto**: `package.json`, TypeScript, Vite, Vitest, arquivo de lock
- **Regra de lint de fronteira de import** — impede que `src/domain/` importe de `data`, `services`, `ui`, Dexie ou React

### Critério de conclusão

Todos os testes passando e a regra de lint falhando propositalmente ao ser testada com um import proibido. Sem essa verificação ativa, a regra existiria no papel sem estar em vigor.

### Por que é a primeira

Não depende de nada. É onde mora o risco real do projeto: aritmética de calendário, aritmética monetária e a regra de sobreposição. Construí-la primeiro significa que o pedaço mais difícil fica pronto e testado antes de qualquer decisão de interface poder pressioná-lo.

---

## Unidade 2 — Persistência e Orquestração

**Identificador**: `persistencia`
**Diretórios**: `src/data/` e `src/services/`

> Esta unidade ocupa **dois** diretórios, consequência direta da decisão 6 do Application Design. `src/services/` foi criada para a orquestração e atribuída a esta unidade por ser a única que já conhece domínio e persistência simultaneamente.

### Responsabilidade

Guardar e recuperar o estado; orquestrar o carregamento de dados e a invocação do domínio; o ciclo completo de backup.

### Componentes

DAT-01 `db` · DAT-02 seis repositórios · DAT-03 `backupSerializer` · DAT-04 `backupValidator` · DAT-05 `storagePersistence` · SVC-01 `projectionService` · SVC-02 `paymentService` · SVC-03 `ruleService` · SVC-04 `backupService`

### Entregáveis

- Schema Dexie com versionamento e ao menos uma migração exercitada em teste
- Os seis repositórios, com invariantes de escrita
- Serialização, validação e importação de backup
- Os quatro serviços de orquestração
- Testes com `fake-indexeddb`
- Teste de ida e volta do backup (PBT-02)

### Critério de conclusão

Todos os testes passando, incluindo a migração de schema e a ida e volta do backup produzindo estado idêntico ao original.

### Dependência

Consome os tipos e as funções da Unidade 1. Não pode começar antes de ela estar concluída.

---

## Unidade 3 — Aplicação e Interface

**Identificador**: `interface`
**Diretório**: `src/ui/`, mais os arquivos de raiz do PWA

### Responsabilidade

As cinco telas, a casca do PWA e a publicação.

### Componentes

UI-01 `AppShell` · UI-02 `MonthScreen` · UI-03 `MonthSummary` · UI-04 `BalanceCurve` · UI-05 `OccurrenceList` · UI-06 `PaymentSheet` · UI-07 `RegistrationsScreen` com três formulários · UI-08 `FutureScreen` · UI-09 `SettingsScreen` · UI-10 `BackupReminder` · UI-11 hooks reativos

### Entregáveis

- Casca do PWA: manifesto, service worker, ícones, safe area, tema seguindo o iOS
- As cinco telas e seus componentes
- Curva de saldo em SVG próprio, com alternativa textual acessível
- Hooks reativos com `useLiveQuery`
- Fronteira de erro global
- Content Security Policy via `<meta http-equiv>`
- Configuração de publicação no GitHub Pages, incluindo `base` do Vite e estratégia de rota compatível com hospedagem estática
- Testes dos fluxos semanais: marcar pago, corrigir valor, redefinir âncora

### Critério de conclusão

Os cinco critérios de sucesso de `requirements.md` verificados, incluindo instalação real na tela de início de um iPhone e funcionamento offline.

### Dependência

Consome as Unidades 1 e 2.

---

## Estratégia de Organização de Código

### Modelo de empacotamento

**Pacote único.** Um `package.json` na raiz do workspace. As unidades são diretórios sob `src/`, não pacotes independentes.

O padrão do AI-DLC para greenfield multiunidade em monolito é `src/{unit-name}/`. É exatamente o que se obtém aqui, com uma ressalva registrada: a Unidade 2 ocupa dois diretórios (`data` e `services`) em vez de um.

### Estrutura de diretórios

```
finance-control/
+-- package.json
+-- package-lock.json
+-- tsconfig.json
+-- vite.config.ts
+-- vitest.config.ts
+-- eslint.config.js          regra de fronteira de import
+-- index.html                CSP via meta http-equiv
+-- public/
|   +-- manifest.webmanifest
|   +-- icons/
+-- src/
|   +-- domain/               Unidade 1
|   +-- data/                 Unidade 2
|   +-- services/             Unidade 2
|   +-- ui/                   Unidade 3
|   +-- test-support/         geradores de dominio compartilhados (PBT-07)
+-- aidlc-docs/               documentacao, nunca codigo
+-- docs/                     documento de design do brainstorming
```

### Localização dos testes

Testes **coabitam com o código**, ao lado do módulo que exercitam. Isso desvia do padrão `tests/{unit-name}/` sugerido pelo AI-DLC, em favor do idioma consolidado do ecossistema TypeScript com Vitest, no qual a coabitação reduz o atrito de manter teste e implementação sincronizados.

Convenção de nomes que atende **PBT-10**, que exige distinção clara entre as duas naturezas de teste:

| Sufixo | Natureza |
|---|---|
| `.test.ts` | Teste por exemplo — cenário concreto com valor esperado explícito |
| `.prop.test.ts` | Teste por propriedade — invariante verificada sobre entradas geradas |

Os geradores de domínio ficam em `src/test-support/`, compartilhados entre unidades, conforme exige PBT-07 quanto à reutilização.

### Regra de fronteira de import

Configurada na Unidade 1 e verificada como entregável:

| De | Não pode importar de |
|---|---|
| `src/domain/` | `data`, `services`, `ui`, `dexie`, `react` |
| `src/data/` | `services`, `ui` |
| `src/services/` | `ui` |

Com pacote único, esta regra é a **única** coisa que impede o domínio de perder a pureza. Não é higiene opcional: é o que sustenta a viabilidade do teste por propriedades.

---

## Estratégia de Construção

**Sequencial estrita.** Uma unidade só começa quando a anterior está completa e com testes passando. Nenhum código provisório é escrito.

```
Unidade 1            Unidade 2                Unidade 3
dominio        ->    persistencia       ->    interface
src/domain/          src/data/                src/ui/
                     src/services/
```

O risco aceito conscientemente: um problema de experiência de uso só apareceria ao final. Mitigado pelo fato de as cinco telas e seus fluxos já terem sido aprovados no documento de design.
