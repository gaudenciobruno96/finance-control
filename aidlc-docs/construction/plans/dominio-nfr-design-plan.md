# Plano de NFR Design — Unidade 1 (`dominio`)

**Fase**: CONSTRUCTION
**Unidade**: 1 — Núcleo de Domínio
**Data**: 2026-08-08
**Status**: ✅ CONCLUÍDO — artefatos gerados, aguardando aprovação do usuário

---

## Escopo e Nota de Aplicabilidade

Este estágio incorpora os requisitos não funcionais ao design por meio de padrões e componentes lógicos.

**Nota honesta sobre a aplicabilidade**: as categorias previstas pela regra — tolerância a falhas, mecanismos de escala, componentes de infraestrutura como filas, caches e disjuntores — pressupõem um sistema distribuído com I/O. A Unidade 1 é composta de funções puras, sem rede, sem disco, sem concorrência e sem estado. A maior parte das categorias é genuinamente inaplicável, e cada uma está justificada abaixo em vez de preenchida com conteúdo artificial.

Restam **dois** padrões que são decisões reais nesta unidade, submetidos como perguntas.

---

## Passos de Execução

- [x] Ler os requisitos não funcionais da unidade
- [x] Avaliar todas as categorias de pergunta exigidas pela regra
- [x] Gerar as perguntas aplicáveis
- [x] Coletar as respostas do usuário
- [x] Analisar as respostas em busca de ambiguidades — nenhuma
- [x] Gerar `nfr-design-patterns.md` — 7 padrões, mais 8 padrões usuais registrados como N/A com motivo
- [x] Gerar `logical-components.md` — 5 componentes de suporte; ausência de infraestrutura registrada deliberadamente
- [x] Validar completude

---

## Avaliação das Categorias

| Categoria | Situação | Justificativa |
|---|---|---|
| **Resilience Patterns** | **N/A** | Não há chamada remota, tempo limite, tentativa de repetição ou falha transitória. Uma função pura ou devolve o resultado, ou lança por entrada inválida. Repetir a chamada com a mesma entrada produziria o mesmo erro — retry é logicamente inútil aqui. A extensão de resiliência foi desabilitada pelo usuário |
| **Scalability Patterns** | **N/A** | Usuário único, volume fixado em RNF-12. Não há mecanismo de escala, limite de carga ou projeção de crescimento a modelar |
| **Performance Patterns** | **Parcialmente aplicável** | Uma decisão real: memoização da projeção. Tratada abaixo sem pergunta, por ter resposta clara |
| **Security Patterns** | **N/A nesta unidade** | As regras aplicáveis (SECURITY-04, -09, -10, -13, -15) endereçam CSP, cabeçalhos, dependências, validação de entrada não confiável e tratamento de I/O. Nenhuma incide sobre código puro sem entrada externa. SECURITY-10 é atendida no nível do projeto por NFR-S01 a NFR-S04 |
| **Logical Components** | **Perguntada** | Não há fila, cache ou disjuntor. Há duas decisões de padrão interno: representação de erro de invariante e estratégia de imutabilidade |

### Decisão de desempenho tomada sem consulta

**Memoização da projeção: não implementar.**

Com `useLiveQuery`, qualquer escrita dispara nova projeção. Memoizar o resultado exigiria uma chave de invalidação derivada de todo o estado relevante — regras, parcelamentos, cartões, ocorrências e âncora. Uma chave incompleta produziria saldo desatualizado exibido como atual, que é precisamente o defeito mais grave possível neste app.

No volume-alvo, a projeção de um mês percorre dezenas de itens. O custo é irrelevante e o risco da otimização é alto. Registrado como decisão consciente de **não** otimizar.

---

## Perguntas

### Question 1 — Representação de Erro de Invariante
Como o domínio deve sinalizar violação de invariante? Isso define o que as Unidades 2 e 3 precisam capturar.

A) Classe de erro própria, com código de invariante — as camadas superiores distinguem um defeito de domínio de qualquer outro erro e podem apresentar mensagem específica. Custa definir a hierarquia

B) `Error` padrão com mensagem descritiva — mais simples; as camadas superiores tratam tudo como erro genérico

C) Classe própria por família de invariante, como erro monetário, erro de calendário, erro de vigência — granularidade maior, mais tipos a manter

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 2 — Estratégia de Imutabilidade
As estruturas devolvidas pelo domínio devem ser protegidas contra alteração acidental pelas camadas superiores?

A) Apenas `readonly` do TypeScript — proteção em tempo de compilação, custo zero em execução. Um `as any` deliberado ou código não tipado contornaria, mas nada no projeto faria isso

B) `readonly` mais congelamento em execução nas estruturas devolvidas — proteção real, ao custo de percorrer e congelar cada resultado. Torna impossível a camada de interface alterar uma ocorrência resolvida por engano

C) Sem proteção, apenas convenção — menor cerimônia, nenhuma garantia

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Análise de Contradições e Ambiguidades

**Resultado**: nenhuma contradição ou ambiguidade. Nenhuma pergunta de acompanhamento necessária.

| Verificação | Resultado |
|---|---|
| Classe de erro própria (Q1) vs. NFR-C03 | Coerente — o código da invariante identifica o que foi violado sem carregar o dado que a violou |
| Classe de erro própria (Q1) vs. SECURITY-15 e RNF-26 | Coerente — a fronteira de erro da Unidade 3 distingue defeito de domínio de erro de I/O, e ainda assim apresenta mensagem genérica ao usuário |
| `readonly` apenas (Q2) vs. pureza do domínio | Coerente — a pureza garante que o domínio não altera sua entrada; `readonly` sinaliza às camadas acima que não devem alterar a saída |
| `readonly` apenas (Q2) vs. desempenho (NFR-D01) | Coerente e favorável — congelar a curva diária inteira a cada reprojeção teria custo em execução sem benefício correspondente num projeto de autor único |
