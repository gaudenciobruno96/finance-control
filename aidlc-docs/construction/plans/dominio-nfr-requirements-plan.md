# Plano de NFR Requirements — Unidade 1 (`dominio`)

**Fase**: CONSTRUCTION
**Unidade**: 1 — Núcleo de Domínio
**Data**: 2026-08-08
**Status**: ✅ CONCLUÍDO — artefatos gerados, aguardando aprovação do usuário

---

## Escopo

Determinar os requisitos não funcionais da unidade e firmar as escolhas de tecnologia. Este estágio executa **apenas na Unidade 1**; as Unidades 2 e 3 herdam as decisões aqui tomadas, conforme o plano de execução.

---

## Passos de Execução

- [x] Ler os artefatos de Functional Design da unidade
- [x] Avaliar todas as categorias de pergunta exigidas pela regra
- [x] Gerar as perguntas contextuais
- [x] Coletar as respostas do usuário
- [x] Analisar as respostas em busca de ambiguidades — nenhuma; uma consequência de escopo registrada
- [x] Gerar `nfr-requirements.md` — 18 NFRs de unidade, 3 categorias marcadas N/A com justificativa
- [x] Gerar `tech-stack-decisions.md` — quadro consolidado e justificativa por decisão
- [x] **PBT-09**: documentar a seleção do framework de teste por propriedades — fast-check, com verificação das 4 capacidades exigidas pela regra
- [x] **SECURITY-10**: documentar travamento de versões e varredura de vulnerabilidades — NFR-S01 a NFR-S04
- [x] Validar completude

---

## Avaliação das Categorias de Pergunta

| Categoria | Situação |
|---|---|
| **Scalability** | **N/A** — aplicação de usuário único no dispositivo. Volume-alvo fixado em RNF-12: até 10 regras e 50 lançamentos por mês. Não há carga, crescimento nem gatilho de escala |
| **Performance** | Coberto por RNF-13. A unidade é aritmética pura sobre dezenas de itens; nenhum requisito adicional se justifica |
| **Availability** | **N/A** — não há serviço a manter no ar. A extensão de resiliência foi desabilitada pelo usuário |
| **Security** | Perguntada — Question 4 (varredura de vulnerabilidades, SECURITY-10) |
| **Tech Stack** | Perguntada — Questions 1 e 2 |
| **Reliability** | Coberto por RN-40 e RN-41: funções puras rejeitam entrada inválida lançando; não há I/O nesta unidade |
| **Maintainability** | Perguntada — Question 3 (política de execução do PBT) |
| **Usability** | **N/A** — a unidade não tem interface |

---

## Perguntas

### Question 1 — Gerenciador de Pacotes
Qual gerenciador usar? Define o arquivo de lock exigido por SECURITY-10.

A) npm — já vem com o Node, sem instalação adicional, `package-lock.json`

B) pnpm — instalação mais rápida e menor uso de disco, `pnpm-lock.yaml`

C) yarn — `yarn.lock`

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 2 — Versão Mínima do iOS
Qual a versão mínima de iOS a suportar? Define o alvo de compilação e o que pode ser usado sem transpilação.

A) iOS 16 ou superior — libera recursos modernos de CSS e JavaScript, bundle menor. Cobre iPhone 8 e posteriores

B) iOS 15 ou superior — um ano a mais de aparelhos, ao custo de mais transpilação

C) iOS 17 ou superior — o mais moderno possível; só faz sentido se o seu aparelho for recente e o app for só seu

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 3 — Política de Execução do Teste por Propriedades
Como o PBT deve rodar? A regra PBT-08 exige reprodutibilidade por semente.

A) Semente aleatória a cada execução, registrada na saída em caso de falha — encontra casos novos a cada rodada, e a falha é sempre reproduzível pela semente registrada. É o modo que mais acha bug

B) Semente fixa — execução determinística, sempre os mesmos casos. Não encontra nada novo depois da primeira rodada verde

C) Semente aleatória localmente, fixa em integração contínua

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 4 — Varredura de Vulnerabilidades em Dependências
SECURITY-10 exige varredura configurada. Como fazer?

A) `npm audit` como etapa do script de verificação, executado localmente antes de publicar

B) Dependabot do GitHub, que abre pull request automático para dependência vulnerável

C) Ambos — varredura local no script de verificação e Dependabot monitorando o repositório

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Decisões Tomadas sem Consulta

Decisões de convenção clara, registradas para transparência:

| Decisão | Escolha | Motivo |
|---|---|---|
| Modo estrito do TypeScript | `strict` habilitado, mais `noUncheckedIndexedAccess` | O domínio manipula índices de arrays de datas e mapas de movimentos. Sem `noUncheckedIndexedAccess`, um acesso fora de faixa passa como valor definido e vira `undefined` em tempo de execução, dentro de aritmética monetária |
| Framework de teste | Vitest | Já decidido no documento de design aprovado; integra-se nativamente ao Vite |
| Framework de PBT | fast-check | Única biblioteca madura de PBT para TypeScript com shrinking e semente; integra-se ao Vitest. É a recomendação da própria regra PBT-09 para JavaScript e TypeScript |

---

## Análise de Contradições e Ambiguidades

**Resultado**: nenhuma contradição. Uma consequência de escopo registrada.

| Verificação | Resultado |
|---|---|
| npm (Q1) vs. SECURITY-10 | Coerente — `package-lock.json` versionado satisfaz a exigência de travamento de versões |
| iOS 16 (Q2) vs. PWA instalável (RNF-01) | Coerente — instalação na tela de início e service worker são suportados bem antes do iOS 16 |
| iOS 16 (Q2) vs. `navigator.storage.persist()` (RNF-06) | Coerente com ressalva já prevista: o design nunca dependeu do resultado dessa chamada, apenas a tenta quando disponível |
| Semente aleatória (Q3) vs. PBT-08 | Coerente — a regra exige que a semente seja registrada em caso de falha, não que seja fixa. A opção escolhida é a que a própria regra prefere |
| `npm audit` local (Q4) vs. SECURITY-10 | Coerente — a regra aceita varredura em pipeline **ou** documentada nas instruções de build. Consequência registrada abaixo |

### Consequência de escopo — Question 4

`npm audit` no script de verificação satisfaz SECURITY-10, mas depende de execução manual antes de publicar. Não há monitoramento contínuo: uma vulnerabilidade divulgada depois da última publicação passa despercebida até a próxima verificação.

Isso é aceitável para um app sem servidor, sem autenticação e sem dado de terceiro — a superfície de ataque real é mínima. Fica registrado como decisão consciente, e o passo de verificação será documentado nas instruções de build da fase Build and Test, tornando-o parte do procedimento e não uma lembrança.
