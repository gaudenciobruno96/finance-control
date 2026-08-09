# Componentes Lógicos — Unidade 3 (`interface`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

---

## Componentes de Infraestrutura

Diferente das unidades anteriores, aqui existem alguns — mas todos rodam no dispositivo do usuário. Nenhum é serviço de nuvem.

### INF-01 · Service Worker

**Gerado por** `vite-plugin-pwa`, em modo `injectManifest` ou `generateSW` com pré-cache completo.

| Responsabilidade | Detalhe |
|---|---|
| Pré-cache | Todos os ativos do build, no install (PAD-08) |
| Navegação | Devolve `index.html` do cache para qualquer rota |
| Ciclo de atualização | Detecta versão nova e aguarda confirmação (PAD-09) |
| Limpeza | Remove caches de versões anteriores no activate |

### INF-02 · Manifesto do PWA

| Campo | Valor |
|---|---|
| `name` | Controle Orçamentário |
| `short_name` | Orçamento |
| `display` | `standalone` — sem barra do navegador |
| `orientation` | `portrait` |
| `theme_color` / `background_color` | Um par por esquema de cor |
| `start_url` | Raiz, com o caminho base do GitHub Pages |
| `icons` | 192, 512 e 512 maskable |

`display: standalone` é o que faz o app abrir em tela cheia ao ser tocado na tela de início. Sem ele, abriria como aba do Safari, com barra de endereço ocupando espaço.

### INF-03 · Registro de Atualização

Módulo que observa o estado do service worker e expõe `{ temAtualizacao, aplicar() }` para a faixa de atualização.

### INF-04 · Ícones e Telas de Abertura

Ícones nos três formatos do manifesto. O ícone *maskable* existe para o iOS não desenhar uma moldura branca em volta.

---

## Componentes de Suporte

### SUP-06 · `MoneyInput`

Máscara progressiva. Único ponto do app que converte digitação em centavos.

Centralizado porque a lógica de máscara é sutil — posição do cursor, apagar, colar — e replicá-la em cada formulário produziria divergência entre campos que deveriam se comportar igual.

### SUP-07 · `ConfirmSheet`

Confirmação de ação destrutiva, com texto declarado por quem a invoca (RN-74).

### SUP-08 · `ErrorBanner` e o contexto de erro

Faixa de erro no topo, alimentada por um contexto que qualquer componente pode acionar. Mantém a tela utilizável (RN-81).

### SUP-09 · `useAgora`

Fornece a data corrente às telas, em um único ponto.

Existe para preservar PAD-03: o domínio nunca lê o relógio, e a camada de serviço o recebe por parâmetro. Se cada tela chamasse o relógio por conta própria, duas leituras na mesma interação poderiam cair em dias diferentes à meia-noite — e o motor determinístico deixaria de ser determinístico na prática.

---

## Diagrama

```
        +-------------------------------------------+
        |  Telas (MonthScreen, Registrations, ...)  |
        +-------------------------------------------+
              |            |              |
              v            v              v
        +----------+  +----------+  +--------------+
        | SUP-06   |  | SUP-07   |  | SUP-08       |
        | Money    |  | Confirm  |  | ErrorBanner  |
        +----------+  +----------+  +--------------+
              |
              v
        +-------------------------------------------+
        |  UI-11 hooks (useLiveQuery)  +  SUP-09    |
        +-------------------------------------------+
                            |
                            v
                  Servicos da Unidade 2

        Infraestrutura, no dispositivo:
        +----------+  +----------+  +----------+
        | INF-01   |  | INF-02   |  | INF-03   |
        | Service  |  | Manifest |  | Update   |
        | Worker   |  |          |  |          |
        +----------+  +----------+  +----------+
```

---

## Dependências Adicionadas

| Dependência | Escopo | Motivo |
|---|---|---|
| `react`, `react-dom` | produção | Interface |
| `react-router` | produção | Navegação com histórico e gesto de voltar do iOS |
| `dexie-react-hooks` | produção | `useLiveQuery`, contido em três hooks |
| `vite-plugin-pwa` | desenvolvimento | Manifesto e service worker |
| `@testing-library/react`, `@testing-library/user-event` | desenvolvimento | Testes de fluxo |
| `jsdom` | desenvolvimento | Ambiente de teste da interface |

Nenhuma biblioteca de gráficos, de máscara de entrada, de componentes ou de estado global. Cada uma dessas ausências é uma decisão registrada — SVG próprio, máscara própria, CSS Modules e `useLiveQuery` no lugar de estado global.

---

## Componentes Ausentes

| Categoria | Motivo |
|---|---|
| Cliente HTTP | Não há requisição de rede em tempo de uso |
| Estado global | `useLiveQuery` o dispensa |
| Biblioteca de gráficos | SVG próprio (decisão 5 do Application Design) |
| Biblioteca de formulários | Cinco formulários simples com validação na confirmação |
| Internacionalização | Um idioma, uma moeda |
| Analytics ou telemetria | Nenhum dado sai do aparelho (RNF-04) |

A última linha é a mais importante das seis: a ausência de telemetria não é economia de esforço, é requisito.
