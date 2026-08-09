# Application Design — Documento Consolidado

**Estágio**: INCEPTION — Application Design
**Data**: 2026-08-08
**Projeto**: Controle Orçamentário Pessoal

Este documento consolida os artefatos detalhados:

- [`components.md`](components.md) — componentes e responsabilidades
- [`component-methods.md`](component-methods.md) — assinaturas e tipos
- [`services.md`](services.md) — orquestração
- [`component-dependency.md`](component-dependency.md) — dependências e fluxo de dados

---

## 1. Decisões de Design

| # | Decisão | Escolha | Justificativa |
|---|---|---|---|
| 1 | Organização de diretórios | Por camada: `domain`, `data`, `services`, `ui` | Espelha as unidades de trabalho; a fronteira fica verificável por inspeção dos imports |
| 2 | Reatividade banco → interface | `dexie-react-hooks` com `useLiveQuery` | Elimina a camada de estado global e a classe de bug "escrevi mas a tela não atualizou" |
| 3 | Navegação | `react-router` | O gesto de deslizar para voltar do iOS funciona; sem ele, o gesto fecha o PWA |
| 4 | Estilo | CSS Modules | Compilado no build, compatível com CSP estrita sem `unsafe-inline` (SECURITY-04) |
| 5 | Gráfico da curva | SVG próprio | Cerca de cinquenta linhas; sem dependência nova, controle total de tema e acessibilidade (SECURITY-10) |
| 6 | Camada de orquestração | `src/services/`, atribuída à Unidade 2 | As três camadas puras não acomodam orquestração; sem ela, o domínio conheceria o banco ou a UI reimplementaria a sequência |

A decisão 6 não estava nas perguntas: emergiu ao detalhar o desenho e foi registrada explicitamente por alterar a estrutura acordada na decisão 1.

---

## 2. Arquitetura

```
+---------------------------------------------------------+
|  src/ui/                              Unidade 3          |
|  AppShell, 5 telas, componentes, hooks reativos          |
+---------------------------------------------------------+
                          |
                          v
+---------------------------------------------------------+
|  src/services/                        Unidade 2          |
|  projection, payment, rule, backup                       |
+---------------------------------------------------------+
              |                            |
              v                            v
+---------------------------+  +---------------------------+
|  src/data/    Unidade 2   |  |  src/domain/  Unidade 1   |
|  db, repositorios,        |  |  money, calendar,         |
|  serializacao e validacao |  |  expansores, resolvedor,  |
|  de backup                |  |  projetor, sumarizadores  |
+---------------------------+  +---------------------------+
              |                            ^
              +----------------------------+
                data usa apenas os tipos
```

**A restrição central**: `src/domain/` não importa Dexie, React, nem lê o relógio. Toda entrada chega por parâmetro, inclusive a data corrente. É isso que permite testar "conta vencida ontem" sem manipular o relógio global e que viabiliza o teste por propriedades sobre datas geradas arbitrariamente.

---

## 3. Componentes por Unidade

### Unidade 1 — Domínio (11 componentes)

`types`, `money`, `calendar`, `ruleExpander`, `installmentExpander`, `cardInvoiceExpander`, `occurrenceResolver`, `balanceProjector`, `monthSummarizer`, `futureCommitments`, `ruleVersioning`.

Todos puros. Detalhamento em `components.md`, seção Unidade 1.

### Unidade 2 — Persistência e Orquestração (9 componentes)

Dados: `db`, seis repositórios, `backupSerializer`, `backupValidator`, `storagePersistence`.
Serviços: `projectionService`, `paymentService`, `ruleService`, `backupService`.

### Unidade 3 — Interface (11 componentes)

`AppShell`, `MonthScreen`, `MonthSummary`, `BalanceCurve`, `OccurrenceList`, `PaymentSheet`, `RegistrationsScreen` com três formulários, `FutureScreen`, `SettingsScreen` com âncora e backup, `BackupReminder`, hooks reativos.

---

## 4. Rastreabilidade de Requisitos

| Grupo | Requisitos | Componentes responsáveis |
|---|---|---|
| Entradas | RF-01 a RF-04 | DOM-04, SVC-03, SVC-02, UI-07 |
| Saídas | RF-05 a RF-12 | DOM-04, DOM-05, DOM-06, SVC-03, UI-07 |
| Pagamento | RF-13 a RF-18 | DOM-07, SVC-02, UI-06 |
| Vigência | RF-19 a RF-21 | DOM-11, SVC-03, UI-07 |
| Visualização | RF-22 a RF-27 | DOM-08, DOM-09, DOM-10, SVC-01, UI-02 a UI-05, UI-08 |
| Backup | RF-28 a RF-31 | DAT-03, DAT-04, SVC-04, UI-09, UI-10 |
| Corretude | RNF-08 a RNF-11 | DOM-02, DOM-03 |
| Persistência | RNF-05 a RNF-07 | DAT-01, DAT-02, DAT-05 |
| Segurança | RNF-21 a RNF-26 | DAT-04, SVC-04, UI-01, configuração de build |
| Testabilidade | RNF-27 a RNF-31 | Toda a Unidade 1, mais DAT-04 |

Nenhum requisito ficou sem componente responsável.

---

## 5. Conformidade com Extensões

### Segurança

| Regra | Situação neste estágio | Onde é tratada |
|---|---|---|
| SECURITY-04 | Encaminhada | Decisão 4 (CSS Modules) remove a necessidade de `style-src 'unsafe-inline'`. A entrega dos cabeçalhos pertence ao Infrastructure Design da Unidade 3 |
| SECURITY-05 | **Atendida no design** | DAT-04 valida entrada não confiável antes de qualquer uso |
| SECURITY-09 | Encaminhada | Mensagem genérica ao usuário via fronteira de erro em UI-01 |
| SECURITY-10 | **Atendida no design** | Decisão 5 evita dependência de biblioteca de gráficos; travamento de versões pertence ao Code Generation |
| SECURITY-11 | **Atendida no design** | Lógica sensível concentrada em módulos dedicados: validação em DAT-04, integridade transacional em SVC-03 e SVC-04. Sem *rate limiting* por não haver endpoint público |
| SECURITY-13 | **Atendida no design** | Validação antes de desserialização em DAT-04; ausência de recurso externo por CDN |
| SECURITY-15 | **Atendida no design** | Tratamento explícito de I/O nos serviços, *fail closed*, fronteira de erro global em UI-01 |
| Demais regras | N/A | Conforme `requirements.md`, seção 7.1 |

**Achados bloqueantes**: nenhum.

### Testes por Propriedades

PBT-01 exige a identificação formal de propriedades no **Functional Design**, não neste estágio. O que este design entrega é a precondição para que ela seja possível: onze componentes de domínio puros e um validador de backup também puro — doze superfícies sobre as quais gerar propriedades. Os componentes com estado (repositórios e o banco) ficam confinados à Unidade 2 e serão avaliados quanto a PBT-06 no Functional Design daquela unidade.

**Achados bloqueantes**: nenhum.

---

## 6. Pontos de Atenção Registrados

| Ponto | Encaminhamento |
|---|---|
| `useLiveQuery` acopla a interface ao Dexie, quebrando a regra "ui não conhece data" | Concessão consciente. Contida nos três hooks de UI-11; nenhuma tela usa `useLiveQuery` diretamente, então trocar a estratégia tocaria três arquivos |
| `react-router` em hospedagem estática não reescreve rotas | Roteamento por hash ou fallback de 404 — a definir no Infrastructure Design da Unidade 3 |
| `projectionService` precisa carregar um intervalo maior que a competência pedida | Registrado em `services.md`. Sem isso, conta vencida em mês anterior e não paga não apareceria na projeção do mês corrente |
| CSP não pode ser entregue por cabeçalho no GitHub Pages | Infrastructure Design da Unidade 3 |
