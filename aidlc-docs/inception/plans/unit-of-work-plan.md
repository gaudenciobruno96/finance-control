# Plano de Decomposição em Unidades de Trabalho

**Estágio**: INCEPTION — Units Generation (Parte 1: Planejamento)
**Data**: 2026-08-08
**Status**: ✅ CONCLUÍDO — Partes 1 e 2 executadas, aguardando aprovação final do usuário

---

## Escopo do Estágio

Formalizar a decomposição do sistema em unidades de trabalho, definir suas fronteiras e dependências, e mapear os requisitos a cada unidade. As três unidades foram esboçadas no plano de execução e são aqui detalhadas e validadas.

---

## Passos de Execução

### Parte 1 — Planejamento
- [x] Carregar requisitos e artefatos de Application Design
- [x] Avaliar todas as categorias de pergunta exigidas pela regra
- [x] Gerar as perguntas contextuais de decomposição
- [x] Coletar as respostas do usuário
- [x] Analisar as respostas em busca de ambiguidades e contradições
- [x] Formular perguntas de acompanhamento, se necessário — nenhuma necessária
- [x] Obter aprovação para prosseguir à geração — "Pode gerar"

### Parte 2 — Geração
- [x] Gerar `unit-of-work.md` com definições, responsabilidades e estratégia de organização de código
- [x] Gerar `unit-of-work-dependency.md` com matriz de dependências
- [x] Gerar `unit-of-work-story-map.md` mapeando requisitos às unidades
- [x] Validar fronteiras e dependências das unidades — grafo acíclico e linear, sem dependência circular
- [x] Assegurar que todo requisito está atribuído a uma unidade — 31 RF e 31 RNF, cobertura completa
- [x] Avaliar conformidade com as extensões habilitadas — nenhum achado bloqueante

---

## Avaliação das Categorias de Pergunta

A regra exige avaliar **todas** as categorias e justificar explicitamente as que forem puladas.

| Categoria | Situação | Justificativa |
|---|---|---|
| **Story Grouping** | **N/A** | O estágio de User Stories foi pulado por decisão do usuário. Não existem histórias a agrupar. O mapeamento será feito de requisitos para unidades, em `unit-of-work-story-map.md` |
| **Dependencies** | **Perguntada** | Question 3 — estratégia de entrega entre unidades sequencialmente dependentes |
| **Team Alignment** | **N/A** | Desenvolvedor único, sem divisão de propriedade, sem coordenação entre times. Perguntar sobre fronteiras de time produziria ruído sem alterar decisão alguma |
| **Technical Considerations** | **Perguntada** | Question 1 — modelo de empacotamento e implantação |
| **Business Domain** | **Perguntada** | Question 2 — granularidade, isto é, se o domínio comporta subdivisão adicional |
| **Code Organization** | **Perguntada** | Question 1 — estrutura de diretórios decorre do modelo de empacotamento |

---

## Perguntas de Decomposição

### Question 1 — Modelo de Empacotamento
Como o projeto deve ser empacotado?

A) Pacote único — um `package.json` na raiz, com as camadas como diretórios em `src/`. A separação entre unidades é imposta por regra de import verificada por lint, e não pela ferramenta de build

B) Monorepo com workspaces — `packages/domain`, `packages/data`, `packages/ui`, cada um com seu próprio `package.json`. A ferramenta de build passa a impedir fisicamente que o domínio importe da interface

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 2 — Granularidade das Unidades
A decomposição em três unidades está adequada?

A) Manter três unidades como planejado — Domínio, Persistência com Orquestração, Interface

B) Dividir a Unidade 3 em duas — casca do PWA com navegação e tema, separada das telas e formulários. A Unidade 3 é a maior das três

C) Fundir as Unidades 1 e 2 em uma só — a camada de dados existe basicamente para servir o domínio

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 3 — Estratégia de Entrega entre Unidades
As unidades são sequencialmente dependentes. Como conduzir a construção?

A) Sequencial estrito — uma unidade só começa quando a anterior está completa e com testes passando. Nenhum código provisório é escrito

B) Sequencial com antecipação da interface — construir uma tela mínima cedo, sobre dados falsos, para validar a experiência antes de as camadas inferiores estarem prontas. Custa escrever e depois descartar código provisório

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Análise de Contradições e Ambiguidades

**Resultado**: nenhuma contradição ou ambiguidade detectada. Nenhuma pergunta de acompanhamento necessária.

| Verificação | Resultado |
|---|---|
| Pacote único (Q1) vs. regra de dependência unidirecional do Application Design | Coerente, com ressalva registrada: sem workspaces, a fronteira entre camadas não é imposta pelo build. Passa a ser **obrigatório** configurar regra de lint de fronteira de import, prevista em `component-dependency.md` e agora elevada a item de entrega da Unidade 1 |
| Três unidades (Q2) vs. as quatro camadas do Application Design | Coerente — `src/data/` e `src/services/` pertencem ambas à Unidade 2, conforme já registrado na decisão 6 |
| Sequencial estrito (Q3) vs. dependência Unidade 1 → 2 → 3 | Coerente — a ordem de dependência é exatamente a ordem de construção; não há espera ociosa a evitar |
| Sequencial estrito (Q3) vs. risco de descobrir problema de UX tarde | Aceito conscientemente — as cinco telas e seus fluxos já foram aprovados no documento de design, o que reduz o risco que a antecipação mitigaria |

### Consequência registrada

A escolha do pacote único transfere a garantia de fronteira do build para o lint. Sem essa configuração, nada impede um import de `src/ui/` dentro de `src/domain/`, e a pureza do domínio — que sustenta toda a estratégia de teste por propriedades — passaria a depender de disciplina manual. Por isso a regra de lint deixa de ser recomendação e vira entregável verificável da Unidade 1.
