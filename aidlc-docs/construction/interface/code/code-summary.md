# Resumo de Código — Unidade 3 (`interface`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-09
**Situação**: 18 de 18 passos concluídos

---

## Verificação

```
npm run verify
  lint       OK
  typecheck  OK
  test       31 arquivos, 309 testes, todos passando
  audit      0 vulnerabilidades

npm run build
  137 módulos, bundle de 382 KB (121 KB comprimido)
  service worker com 12 entradas de pré-cache (405 KB)
```

Progressão: Unidade 1 entregou 234 testes, a Unidade 2 chegou a 294, esta fecha em **309**.

---

## Arquivos Criados

**Configuração**: `vite.config.ts` (base, PWA, alvo iOS 16), `index.html` (CSP restritiva), `vitest.config.ts`, `.github/workflows/deploy.yml`, ícones do manifesto

**`src/ui/`**: `AppShell`, 5 telas (`MonthScreen`, `RegistrationsScreen`, `FutureScreen`, `SettingsScreen`, `AvulsoScreen`), 8 componentes (`MoneyInput`, `BalanceCurve`, `MonthSummary`, `OccurrenceList`, `PaymentSheet`, `ConfirmSheet`, `ErrorBanner`, `BackupReminder`, `UpdateBanner`), 4 hooks, 2 folhas de estilo, 9 módulos CSS

**`src/main.tsx`**: ponto de entrada com hash router

**Testes**: `MoneyInput.prop.test.ts`, `BalanceCurve.prop.test.ts`, `flows.test.tsx`

---

## Três Problemas Encontrados na Geração

### 1. O jsdom custava 56 segundos a toda a suíte

Configurar `environment: 'jsdom'` globalmente fez os testes das Unidades 1 e 2 — que não tocam em DOM — montarem um ambiente de navegador inteiro. A suíte passou de menos de 1 segundo para mais de um minuto.

Resolvido mantendo `node` como padrão e declarando `// @vitest-environment jsdom` apenas nos arquivos de interface. Voltou a 265 ms.

### 2. Testes que passavam isolados e falhavam em conjunto

Dois testes de fluxo falhavam com "zero ocorrências gravadas", mas passavam quando executados sozinhos.

A causa: o `afterEach` do arquivo fechava e apagava o banco **antes** de o cleanup automático do testing-library desmontar os componentes. O `useLiveQuery` do teste anterior continuava observando um banco em processo de exclusão e interferia no seguinte.

Resolvido chamando `cleanup()` explicitamente antes de fechar o banco.

O sintoma — "funciona isolado, falha em conjunto" — quase levou a suspeitar do código de produção. Era a ordem de desmontagem.

### 3. `waitFor` com callback assíncrono esgotando

`waitFor(async () => { const x = await repo.listar(); expect(x)... })` falhava de forma intermitente. Substituído por: aguardar um sinal da própria interface (a folha fechar) e então consultar o banco diretamente.

A folha fechar **é** o sinal de que a escrita concluiu — sincronizar pela interface é mais fiel ao que o usuário observa do que reconsultar o banco em laço.

---

## Um Teste Que Reescrevi por Estar Duplicando

O teste "registrar duas vezes não cria dois lançamentos" verificava, pela interface, a idempotência que o teste do `paymentService` já cobre — e ainda era frágil, dependendo de clicar durante uma reprojeção.

Reescrito para verificar o que **só a interface pode verificar**: reabrir um item pago oferece *Atualizar pagamento* em vez de *Confirmar pagamento*. A idempotência ficou onde mora, na camada de serviço.

---

## Verificação do Caminho Base

O erro mais provável desta unidade era divergência entre Vite, manifesto e service worker. Conferido no artefato construído:

| Onde | Valor |
|---|---|
| `index.html` | `/finance-control/assets/…` |
| `manifest.webmanifest` | `start_url` e `scope` = `/finance-control/` |
| Service worker | 12 entradas pré-cacheadas sob o mesmo base |

Os três concordam. **Isso não substitui o teste no aparelho**: a falha típica — funcionar no Safari e abrir em branco pelo ícone — só aparece após a instalação real, e está no checklist manual do Build and Test.

---

## Conformidade

| Regra | Situação |
|---|---|
| SECURITY-04 | **Parcialmente conforme, documentado** — CSP restritiva por meta, sem `unsafe-inline`, com `connect-src 'none'`. HSTS e `frame-ancestors` não alcançáveis no GitHub Pages; mitigações em `infrastructure-design.md` |
| SECURITY-09 | **Conforme** — mensagens genéricas, sem rastreamento de pilha nem detalhe interno |
| SECURITY-10 | **Conforme** — versões travadas; `verify` no pipeline antes de publicar |
| SECURITY-13 | **Conforme** — nenhum recurso de CDN externa; tudo da própria origem |
| SECURITY-15 | **Conforme** — falha de escrita vira faixa sem quebrar a tela; a fronteira de erro é o último recurso |
| PBT-01 a PBT-04 | **Conforme** — PROP-U01 a PROP-U06 |
| PBT-06 | **N/A** — o estado da interface é derivado do banco; coberto pelo stateful da Unidade 2 |
| PBT-10 | **Conforme** — os três fluxos semanais com teste por exemplo |

**Nenhum achado bloqueante.**

---

## O Que Ainda Não Foi Verificado

Nada disto é verificável sem um iPhone, e tudo está no checklist do Build and Test:

- instalação pela tela de início e abertura em tela cheia;
- funcionamento offline após a instalação;
- respeito à safe area no aparelho com notch;
- teclado numérico nos campos monetários;
- exportação de backup pela folha de compartilhamento do iOS;
- o app abrir corretamente pelo ícone, e não só pelo Safari.
