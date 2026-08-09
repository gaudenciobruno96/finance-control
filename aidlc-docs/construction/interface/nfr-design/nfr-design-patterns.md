# Padrões de Design Não Funcional — Unidade 3 (`interface`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

> Diferente das Unidades 1 e 2, aqui existe infraestrutura de verdade: service worker, cache e um ciclo de atualização. Os padrões deste estágio voltam a ser aplicáveis.

---

## PAD-08 · Pré-cache Completo no Install

**Padrão**: o service worker coloca **todos** os arquivos do app no cache durante a instalação.

**Por quê**: cache sob demanda faria uma tela nunca visitada não abrir offline. Num app cuja premissa é funcionar sem rede, isso é inaceitável — e o pior caso é justamente o mais provável: você instala em casa, abre a tela do mês, e semanas depois tenta abrir os cadastros sem sinal.

O bundle é pequeno, então o custo de baixar tudo de uma vez é baixo.

**Estratégia por tipo de requisição**

| Requisição | Estratégia |
|---|---|
| Arquivos do app (HTML, JS, CSS, ícones) | Cache primeiro; a rede não é consultada |
| Navegação para qualquer rota | Devolve o `index.html` do cache |
| Qualquer outra origem | Não se aplica: o app não faz requisição externa (RNF-04) |

A última linha não é omissão. O app **não tem** nenhuma requisição de rede em tempo de uso, o que elimina a categoria inteira de padrões de resiliência de rede.

---

## PAD-09 · Atualização Anunciada, Nunca Imposta

**Padrão**: quando uma versão nova é detectada, uma faixa discreta oferece atualizar. A troca só acontece quando o usuário confirma.

**Por quê**: PWA instalado na tela de início raramente é fechado de vez. Sem intervenção, o comportamento padrão do service worker deixaria o usuário semanas numa versão antiga; com atualização automática, a página poderia recarregar no meio do preenchimento de um valor.

Nenhum dos dois extremos serve. Anunciar e deixar decidir resolve os dois.

**Fluxo**

```
1. Service worker novo detectado -> estado "waiting"
2. Faixa: "Nova versao disponivel - Atualizar"
3. Usuario confirma            -> skipWaiting + recarrega
4. Usuario ignora              -> continua na versao atual
```

---

## PAD-10 · Bundle Único

**Padrão**: sem divisão por rota.

Com cinco telas pequenas, dividir renderia poucos kilobytes e adicionaria requisições — que num app offline vêm do cache de qualquer forma. Em troca, a navegação entre telas fica instantânea, sem espera na primeira visita a cada uma.

Registrado como decisão consciente para que uma revisão futura não o interprete como descuido de configuração.

---

## PAD-11 · Content Security Policy por Meta

**Padrão**: CSP entregue por `<meta http-equiv>` no `index.html`.

**Restrição conhecida**: o GitHub Pages não permite cabeçalhos HTTP customizados. A política via meta cobre a maior parte das diretivas, com duas exceções que **não** funcionam nessa forma: `frame-ancestors` e `Strict-Transport-Security`.

Política pretendida:

```
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data:;
connect-src 'none';
object-src 'none';
base-uri 'self';
form-action 'none'
```

`connect-src 'none'` merece destaque: o app **não faz nenhuma requisição de rede**, e declarar isso explicitamente transforma qualquer tentativa acidental de exfiltração em erro de console.

A escolha de CSS Modules no Application Design é o que torna essa política possível sem `unsafe-inline` — CSS-in-JS teria exigido afrouxá-la.

O tratamento completo de SECURITY-04, incluindo o que não é alcançável no GitHub Pages, pertence ao Infrastructure Design.

---

## PAD-12 · Fronteira de Erro com Recuperação

**Padrão**: fronteira de erro no topo da árvore captura o que escapar, registra e apresenta mensagem genérica com opção de recarregar.

A mensagem nunca expõe rastreamento de pilha, nome de tabela ou código técnico (RNF-26, SECURITY-09).

Erros de escrita **não** passam pela fronteira: são capturados no ponto de chamada e viram faixa de erro (RN-80, RN-81), mantendo a tela utilizável. A fronteira é o último recurso, não o caminho normal.

---

## PAD-13 · Reatividade Contida em Três Hooks

**Padrão**: `useLiveQuery` aparece somente em `useMonthProjection`, `useFutureCommitments` e `useBackupReminder`.

É a concessão consciente à regra de camadas, registrada no Application Design. Mantê-la contida em três arquivos é o que permite revertê-la barato se um dia a estratégia de reatividade mudar.

---

## PAD-14 · Tema sem Estado em JavaScript

**Padrão**: `prefers-color-scheme` em CSS puro.

Manter o tema em estado de JavaScript produziria um quadro com o tema errado antes da hidratação — o clarão branco ao abrir o app no escuro.

---

## Padrões Não Aplicáveis

| Padrão usual | Situação |
|---|---|
| Repetição com recuo, disjuntor, tempo limite | N/A — nenhuma requisição de rede em tempo de uso |
| Fila offline de sincronização | N/A — não há servidor com que sincronizar |
| Cache de dados remotos | N/A — todo dado é local |
| Limitação de taxa | N/A — não há endpoint |
| Renderização no servidor | N/A — aplicação estática |

---

## Mapeamento para Requisitos

| Padrão | Requisitos | Regras |
|---|---|---|
| PAD-08 | RNF-01, RNF-02 | — |
| PAD-09 | RNF-01 | — |
| PAD-10 | RNF-13 | — |
| PAD-11 | RNF-21, RNF-22 | SECURITY-04, SECURITY-13 |
| PAD-12 | RNF-25, RNF-26 | SECURITY-09, SECURITY-15 |
| PAD-13 | RNF-27 | — |
| PAD-14 | RNF-15 | — |
