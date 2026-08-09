# Controle Orçamentário Pessoal

PWA offline para acompanhar fluxo de caixa pessoal com múltiplos salários em datas diferentes, contas fixas e variáveis, boletos, parcelamentos e fatura de cartão.

A pergunta que o app responde:

> Considerando tudo que ainda entra e tudo que ainda sai, eu atravesso o mês sem ficar no vermelho — e em qual dia o aperto acontece?

**Os dados nunca saem do seu aparelho.** Não há servidor, conta, login ou sincronização.

---

## Estado atual

Em construção pelo workflow AI-DLC. **As três unidades estão concluídas**; falta a fase de Build and Test.

| Unidade | Conteúdo | Situação |
|---|---|---|
| 1 — Domínio | `src/domain/` — toda a lógica de negócio, funções puras | ✅ Concluída |
| 2 — Persistência | `src/data/`, `src/services/` — IndexedDB, backup, orquestração | ✅ Concluída |
| 3 — Interface | `src/ui/` — as cinco telas e a casca do PWA | ✅ Concluída |

O app já roda: `npm run dev` para desenvolver, `npm run build` para gerar os arquivos de publicação.

---

## Requisitos

- Node.js 20 ou superior
- npm

## Instalação

```bash
npm install
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm test` | Executa a suíte de testes uma vez |
| `npm run test:watch` | Executa os testes em modo contínuo |
| `npm run lint` | Verifica estilo e a regra de fronteira entre camadas |
| `npm run typecheck` | Verifica tipos sem emitir arquivos |
| `npm run dev` | Sobe o app em desenvolvimento |
| `npm run build` | Gera os arquivos de publicação em `dist/` |
| `npm run audit` | Varredura de vulnerabilidades nas dependências |
| **`npm run verify`** | **Encadeia lint, tipos, testes e varredura** |

**Rode `npm run verify` antes de publicar.** A varredura de vulnerabilidades depende dessa execução: não há monitoramento contínuo configurado.

---

## Arquitetura

Quatro camadas, com dependência estritamente unidirecional:

```
src/ui/  ->  src/services/  ->  src/data/  ->  src/domain/
```

**`src/domain/` não importa nada.** Sem Dexie, sem React, e sem leitura do relógio do sistema — a data corrente entra sempre como parâmetro.

Isso não é preferência estética. É o que permite testar "conta vencida ontem" sem manipular o relógio global, e é o que torna viável o teste por propriedades sobre datas geradas aleatoriamente.

A regra é imposta por lint, não por convenção. Um import de `src/ui/` dentro de `src/domain/` falha a verificação.

### Duas decisões de representação que atravessam todo o código

**Dinheiro é inteiro em centavos.** `0.1 + 0.2` em ponto flutuante resulta em `0.30000000000000004`. Acumulado ao longo de meses de projeção, isso produz centavos fantasma num app cuja função é dizer se o dinheiro dá.

**Datas são texto `AAAA-MM-DD` com aritmética de calendário própria.** `new Date('2026-08-10')` é interpretado como meia-noite UTC e, no horário de Brasília, resulta em 9 de agosto às 21h — um salário do dia 10 apareceria no dia 9.

---

## Testes

309 testes nas três unidades, de duas naturezas:

| Sufixo | Natureza |
|---|---|
| `*.test.ts` | Por exemplo — cenário concreto com valor esperado explícito |
| `*.prop.test.ts` | Por propriedade — invariante verificada sobre centenas de entradas geradas |

Os testes por propriedade usam [fast-check](https://fast-check.dev) com **semente aleatória** a cada execução. Quando uma propriedade falha, a semente aparece na saída e a falha é reproduzível. Uma semente fixa deixaria de encontrar defeitos após a primeira execução verde.

Os geradores de domínio ficam em `src/test-support/` e produzem entidades que satisfazem suas invariantes por construção — um gerador de regra nunca emite dia 40, um gerador de centavos nunca emite fração.

---

## Documentação do processo

O projeto é conduzido pelo workflow AI-DLC. Toda decisão, pergunta e aprovação está registrada:

| Onde | O quê |
|---|---|
| `docs/superpowers/specs/` | Documento de design original |
| `aidlc-docs/inception/` | Requisitos, design de aplicação, unidades de trabalho |
| `aidlc-docs/construction/` | Design funcional, requisitos não funcionais, planos de geração |
| `aidlc-docs/audit.md` | Trilha completa de decisões, com entrada literal do usuário |
| `aidlc-docs/aidlc-state.md` | Estado atual do workflow |
