# Plano de Application Design

**Estágio**: INCEPTION — Application Design
**Data**: 2026-08-08
**Status**: ✅ CONCLUÍDO — artefatos gerados, aguardando aprovação do usuário

> **Nota de procedimento**: as perguntas foram apresentadas pelo menu interativo, conforme preferência do usuário. As cinco respostas coincidiram com as recomendações registradas neste arquivo.

---

## Escopo do Estágio

Identificar os componentes funcionais e suas responsabilidades, definir as interfaces entre eles e estabelecer as dependências e os padrões de comunicação. **A lógica de negócio detalhada não pertence a este estágio** — ela será definida no Functional Design de cada unidade, na fase de Construction.

---

## Passos de Execução

### Preparação
- [x] Ler `aidlc-docs/inception/requirements/requirements.md`
- [x] Ler o documento de design aprovado em `docs/superpowers/specs/`
- [x] Identificar as capacidades de negócio e as áreas funcionais
- [x] Determinar o escopo e a complexidade do design
- [x] Gerar as perguntas de design contextuais (seção abaixo)
- [x] Coletar as respostas do usuário
- [x] Analisar as respostas em busca de ambiguidades e contradições
- [x] Formular perguntas de acompanhamento, se necessário — nenhuma necessária

### Artefatos obrigatórios
- [x] Gerar `components.md` com definições e responsabilidades de alto nível
- [x] Gerar `component-methods.md` com assinaturas de métodos e tipos de entrada e saída
- [x] Gerar `services.md` com definições de serviço e padrões de orquestração
- [x] Gerar `component-dependency.md` com matriz de dependências, padrões de comunicação e fluxo de dados
- [x] Gerar `application-design.md` consolidando os artefatos acima
- [x] Validar completude e consistência do design — 31 componentes, todos os 62 requisitos com responsável atribuído

### Conformidade
- [x] Avaliar as regras de SEGURANÇA aplicáveis a este estágio — 5 atendidas no design, 2 encaminhadas, nenhum achado bloqueante
- [x] Avaliar as regras de PBT aplicáveis a este estágio — PBT-01 pertence ao Functional Design; a precondição (12 superfícies puras) está estabelecida
- [x] Registrar o resumo de conformidade na mensagem de conclusão

### Decisão emergente registrada
- [x] Camada `src/services/` criada para orquestração, atribuída à Unidade 2 — não constava das perguntas, emergiu no detalhamento e altera a estrutura acordada na Question 1, por isso foi registrada explicitamente

---

## Perguntas de Design

As cinco perguntas abaixo alteram materialmente a arquitetura. Perguntas cuja resposta é convencional foram deliberadamente omitidas.

### Question 1 — Organização de Diretórios
Como o código-fonte deve ser organizado?

A) Por camada — `src/domain/`, `src/data/`, `src/ui/`. Espelha exatamente as três unidades de trabalho do plano de execução, tornando a fronteira entre elas visível no sistema de arquivos e fácil de verificar

B) Por funcionalidade — `src/features/mes/`, `src/features/cadastros/`, `src/features/backup/`, cada uma contendo seu próprio domínio, dados e interface

C) Híbrido — `src/domain/` e `src/data/` compartilhados, com `src/features/` apenas para a camada de interface

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 2 — Reatividade entre Banco e Interface
Como a interface deve reagir a mudanças nos dados?

A) `dexie-react-hooks` com `useLiveQuery` — as telas se inscrevem em consultas ao IndexedDB e recalculam sozinhas quando o dado muda, sem camada de estado global

B) Biblioteca de estado global (Zustand ou similar) espelhando o banco, com sincronização manual após cada escrita

C) React Context com recarga manual após cada operação de escrita

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 3 — Navegação
Como a navegação entre as cinco telas deve funcionar?

A) `react-router` com rotas reais e histórico do navegador — o gesto de voltar do iOS e o botão físico de retorno funcionam naturalmente, e cada tela tem URL própria

B) Estado local de aba, sem roteador — menos uma dependência, porém o gesto de voltar do iOS fecha o app em vez de voltar de tela

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 4 — Estratégia de Estilo
Qual abordagem de estilização adotar? **Esta escolha tem consequência direta em segurança**: bibliotecas de CSS-in-JS injetam tags `<style>` em tempo de execução, o que exige `style-src 'unsafe-inline'` na Content Security Policy e enfraquece a conformidade com SECURITY-04.

A) CSS Modules — CSS puro, escopo por arquivo, compilado em build. Compatível com CSP estrita, sem dependência adicional além do que o Vite já traz

B) Tailwind CSS — utilitários compilados em build, também compatível com CSP estrita, ao custo de uma dependência e de uma etapa a mais no build

C) CSS-in-JS (styled-components, Emotion) — exige afrouxar a CSP com `unsafe-inline`, o que precisaria ser documentado como exceção justificada

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 5 — Gráfico da Curva Diária
Como renderizar a curva de saldo dia a dia?

A) SVG próprio — a curva é uma polilinha com marcação do ponto mínimo, algo em torno de cinquenta linhas de código. Sem dependência nova, controle total sobre acessibilidade e tema, menor superfície de cadeia de suprimentos (SECURITY-10)

B) Biblioteca de gráficos (Recharts, visx) — mais recursos prontos, ao custo de peso no bundle e de uma dependência relevante para manter

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Análise de Contradições e Ambiguidades

**Resultado**: nenhuma contradição ou ambiguidade detectada.

| Verificação | Resultado |
|---|---|
| Organização por camada (Q1) vs. decomposição em 3 unidades | Coerente — o layout de diretórios espelha as unidades, tornando a fronteira verificável |
| `useLiveQuery` (Q2) vs. motor de projeção puro (RNF-27) | Coerente — a reatividade vive na camada de interface; o motor continua recebendo dados e devolvendo dados |
| CSS Modules (Q4) vs. SECURITY-04 | Coerente — estilos compilados em build dispensam `style-src 'unsafe-inline'` |
| SVG próprio (Q5) vs. SECURITY-10 e acessibilidade básica (RNF-18) | Coerente — menos dependências e controle direto sobre contraste e rótulos |
| `react-router` (Q3) vs. publicação em GitHub Pages | Requer atenção, não é contradição — hospedagem estática não reescreve rotas; será usado roteamento por hash ou fallback de 404, a ser definido no Infrastructure Design da Unidade 3 |
