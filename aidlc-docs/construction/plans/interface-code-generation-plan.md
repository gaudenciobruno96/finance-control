# Plano de Code Generation — Unidade 3 (`interface`)

**Fase**: CONSTRUCTION
**Unidade**: 3 — Aplicação e Interface
**Data**: 2026-08-08
**Status**: ✅ CONCLUÍDO — 18 de 18 passos, `npm run verify` e `npm run build` passando (309 testes)

---

## Contexto

| Item | Valor |
|---|---|
| **Diretórios** | `src/ui/` mais arquivos de raiz do PWA |
| **Depende de** | Unidades 1 e 2, concluídas e aprovadas |
| **Novas dependências** | react, react-dom, react-router, dexie-react-hooks (produção); vite-plugin-pwa, @testing-library/react, @testing-library/user-event, jsdom (desenvolvimento) |
| **Caminho base** | `/finance-control/` — Vite, manifesto e service worker precisam concordar |

### Etapas não aplicáveis

API Layer, Repository Layer e Database Migration: N/A — pertencem a outras unidades ou não existem no projeto.

---

## Passos

### Step 1 — Dependências
- [x] Instalar as oito dependências em versões travadas
- [x] Confirmar 0 vulnerabilidades

### Step 2 — Configuração de Build e PWA
- [x] `vite.config.ts` — plugin React, `base`, `vite-plugin-pwa` com pré-cache completo
- [x] `index.html` — CSP restritiva por meta, `referrer`, viewport com `viewport-fit=cover`
- [x] `vitest.config.ts` — ambiente `jsdom` para os testes de interface
- [x] `public/manifest` e ícones (192, 512, 512 maskable)

### Step 3 — Estilos Base
- [x] `src/ui/styles/tokens.css` — cores por esquema, espaçamentos, tipografia relativa
- [x] `src/ui/styles/base.css` — reset, safe area, alvos de toque de 44 pontos

### Step 4 — Casca da Aplicação
- [x] `src/ui/AppShell.tsx` — hash router, barra inferior de 4 abas, safe area
- [x] `src/ui/ErrorBoundary.tsx` — fronteira global (PAD-12)
- [x] `src/main.tsx` — ponto de entrada, registro do service worker

### Step 5 — Hooks e Contexto
- [x] `src/ui/hooks/useAgora.ts` — SUP-09, data corrente em um único ponto
- [x] `src/ui/hooks/useMonthProjection.ts`, `useFutureCommitments.ts`, `useBackupReminder.ts`
- [x] `src/ui/hooks/useErro.tsx` — contexto da faixa de erro

### Step 6 — Componentes de Suporte
- [x] `src/ui/components/MoneyInput.tsx` — SUP-06, máscara progressiva
- [x] `src/ui/components/ConfirmSheet.tsx` — SUP-07, texto por ação
- [x] `src/ui/components/ErrorBanner.tsx` — SUP-08

### Step 7 — Testes dos Componentes de Suporte
- [x] `MoneyInput.test.tsx` — digitação, apagar, valor inicial
- [x] `MoneyInput.prop.test.ts` — PROP-U01 a PROP-U04

### Step 8 — Curva de Saldo
- [x] `src/ui/components/BalanceCurve.tsx` — SVG próprio, ponto mínimo, alternativa textual

### Step 9 — Testes da Curva
- [x] `BalanceCurve.prop.test.ts` — PROP-U05, PROP-U06 (nenhuma coordenada `NaN`)

### Step 10 — Tela do Mês
- [x] `MonthNavigator.tsx`, `MonthSummary.tsx`, `OccurrenceList.tsx`
- [x] `MonthScreen.tsx`, `PaymentSheet.tsx`

### Step 11 — Teste do Fluxo de Pagamento
- [x] `MonthScreen.test.tsx` — marcar como pago em dois toques; resumo e listas atualizam

### Step 12 — Cadastros
- [x] `RegistrationsScreen.tsx`, `RuleForm.tsx`, `InstallmentForm.tsx`, `CardForm.tsx`
- [x] Escolha entre "a partir deste mês" e "desde sempre"

### Step 13 — Teste dos Cadastros
- [x] `RegistrationsScreen.test.tsx` — criar regra, corrigir valor de conta variável, reajuste com vigência

### Step 14 — Futuro e Ajustes
- [x] `FutureScreen.tsx`
- [x] `SettingsScreen.tsx`, `AnchorForm.tsx`, `BackupPanel.tsx`, `BackupReminder.tsx`

### Step 15 — Teste de Âncora e Backup
- [x] `SettingsScreen.test.tsx` — redefinir âncora; importar com resumo antes da confirmação

### Step 16 — Atualização do App
- [x] `src/ui/components/UpdateBanner.tsx` e o registro de atualização (INF-03, PAD-09)

### Step 17 — Publicação
- [x] `.github/workflows/deploy.yml` — `npm ci`, `npm run verify`, `npm run build`, publicar

### Step 18 — Verificação e Documentação
- [x] `npm run verify` completo
- [x] `npm run build` produzindo bundle válido
- [x] `aidlc-docs/construction/interface/code/code-summary.md`
- [x] Atualizar `README.md`

---

## Divergências entre o Plano e os Arquivos Gerados

Todos os passos foram cumpridos, mas a distribuição em arquivos difere do previsto. Registrado para que a lista de checkboxes não sugira arquivos inexistentes.

### Componentes consolidados

| Previsto | Onde ficou | Motivo |
|---|---|---|
| `MonthNavigator.tsx` | Dentro de `MonthScreen.tsx` | Vinte linhas acopladas à competência da rota; extrair produziria um componente com uma única razão de existir |
| `RuleForm.tsx`, `InstallmentForm.tsx`, `CardForm.tsx` | Dentro de `RegistrationsScreen.tsx` | Os três compartilham estado de aba e serviços; arquivos separados exigiriam passar tudo por props |
| `AnchorForm.tsx`, `BackupPanel.tsx` | Dentro de `SettingsScreen.tsx` | Idem |

### Testes consolidados

| Previsto | Onde ficou |
|---|---|
| `MoneyInput.test.tsx` | Coberto por `MoneyInput.prop.test.ts` — a máscara é função pura, e as propriedades cobrem mais casos que exemplos escritos à mão |
| `MonthScreen.test.tsx`, `RegistrationsScreen.test.tsx`, `SettingsScreen.test.tsx` | `flows.test.tsx` — os três fluxos semanais num arquivo, compartilhando o mesmo montador |

### Uma omissão real, corrigida

`src/ui/ErrorBoundary.tsx` estava marcado no Step 4 mas **não havia sido criado**. O PAD-12 ficaria sem implementação: uma falha não tratada na interface deixaria a tela em branco, sem mensagem nem caminho de recuperação.

Detectado ao conferir os checkboxes contra os arquivos em disco. Criado e instalado em `main.tsx`, envolvendo a árvore inteira.

Isto é exatamente o que a conferência serve para pegar — e o motivo de marcar checkbox não substituir olhar o que existe.

---

## Conformidade Verificável

| Regra | Verificação |
|---|---|
| SECURITY-04 | CSP por meta sem `unsafe-inline`; limitações documentadas |
| SECURITY-09 | Mensagens genéricas ao usuário, sem detalhe interno |
| SECURITY-10 | Versões travadas, `npm audit` no pipeline |
| SECURITY-13 | Nenhum recurso de CDN externa; tudo servido pela própria origem |
| SECURITY-15 | Fronteira de erro global; falha de escrita vira faixa sem quebrar a tela |
| PBT-01, PBT-02, PBT-03, PBT-04 | PROP-U01 a PROP-U06 |
| PBT-06 | **N/A** — o estado da interface é derivado do banco, já coberto pelo stateful da Unidade 2 |
| PBT-10 | Testes por exemplo nos três fluxos semanais |

---

## Escopo

**18 passos**: cerca de 20 componentes, 4 hooks, 2 folhas de estilo, 5 arquivos de teste, configuração de PWA e um workflow de publicação.

Testes executados durante a geração, como nas unidades anteriores.

**Ao final desta unidade o app existe de verdade** — instalável e utilizável no iPhone.
