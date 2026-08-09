# Plano de Functional Design — Unidade 2 (`persistencia`)

**Fase**: CONSTRUCTION
**Unidade**: 2 — Persistência e Orquestração (`src/data/`, `src/services/`)
**Data**: 2026-08-08
**Status**: ✅ CONCLUÍDO — aguardando aprovação do usuário

---

## Escopo

Detalhar o comportamento da camada de persistência e da camada de orquestração: schema e migrações, invariantes de escrita, ciclo de backup e os fluxos dos quatro serviços.

**Novidade em relação à Unidade 1**: esta unidade tem **estado**. A regra PBT-06, marcada N/A na Unidade 1, passa a ser aplicável e precisa ser avaliada.

---

## Passos de Execução

- [x] Ler os artefatos de Application Design e o Functional Design da Unidade 1
- [x] Avaliar todas as categorias de pergunta exigidas pela regra
- [x] Gerar as perguntas contextuais
- [x] Coletar as respostas do usuário
- [x] Analisar as respostas em busca de ambiguidades — 1 defeito encontrado em código já aprovado, corrigido
- [x] Gerar `domain-entities.md` (schema persistido e índices)
- [x] Gerar `business-rules.md` — 23 regras, RN-43 a RN-65
- [x] Gerar `business-logic-model.md` — 5 fluxos detalhados
- [x] **PBT-01**: 13 propriedades identificadas (PROP-D01 a D06, PROP-S01 a S07)
- [x] **PBT-06**: APLICÁVEL nesta unidade — modelo, 14 comandos e 6 invariantes especificados
- [x] Validar completude

---

## Avaliação das Categorias

| Categoria | Situação |
|---|---|
| **Business Logic Modeling** | Perguntada — Questions 1 e 5 |
| **Domain Model** | Perguntada — Question 3 |
| **Business Rules** | Perguntada — Questions 2 e 5 |
| **Data Flow** | Coberto por `services.md`; os quatro fluxos já estão especificados |
| **Integration Points** | **N/A** — não há sistema externo. O IndexedDB é armazenamento local, não integração |
| **Error Handling** | Perguntada — Question 5 trata do caso mais delicado |
| **Business Scenarios** | Perguntada — Questions 1 e 5 |
| **Frontend Components** | **N/A** — a unidade não tem interface |

---

## Perguntas

### Question 1 — Importação de Backup de Versão Anterior
O arquivo de backup carrega a versão do schema. O que fazer quando ela é **mais antiga** que a do app?

A) Migrar durante a importação — o mesmo caminho de migração usado ao abrir o banco é aplicado ao conteúdo importado. Backups antigos continuam utilizáveis indefinidamente

B) Recusar e orientar — mensagem explicando que o backup é de uma versão anterior. Mais simples, mas transforma um backup antigo em arquivo inútil

C) Aceitar apenas a versão corrente — recusa tanto anteriores quanto posteriores

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 2 — Geração de Identificadores
Como gerar os identificadores das entidades? Importa porque a importação de backup traz identificadores de outra origem.

A) `crypto.randomUUID()` — identificadores universalmente únicos, disponível no Safari do iOS 16. Colisão entre backup e dados existentes é praticamente impossível

B) Contador sequencial persistido — identificadores curtos e legíveis, ao custo de precisar reconciliar o contador na importação

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 3 — Histórico de Âncoras de Saldo
A âncora vigente é a mais recente que não ultrapassa hoje. Isso implica guardar mais de uma. Quantas manter?

A) Todas — cada vez que você declara seu saldo, um novo registro é criado. Permite reconstruir a projeção de qualquer mês passado com a âncora que valia à época

B) Apenas a última — cada declaração substitui a anterior. Mais simples, mas meses passados perdem a referência de saldo que tinham

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 4 — Escopo do Teste Stateful (PBT-06)
A regra PBT-06 exige avaliar teste stateful para componentes com estado. Ele gera sequências aleatórias de operações e verifica invariantes após cada passo, comparando contra um modelo simplificado.

A) Repositórios e serviços — cobertura completa: sequências aleatórias de criar, editar, pagar, ignorar e importar, verificando que o estado observável nunca viola invariante. É onde defeitos de ordem de operação aparecem

B) Apenas repositórios — sequências de escrita e leitura direta, sem orquestração

C) Apenas o ciclo de backup — sequências de operações seguidas de exportar e importar, verificando que o estado sobrevive

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 5 — Remoção de Regra com Ocorrências Materializadas
Você tem um aluguel cadastrado, já marcou como pago o de julho e o de agosto, e agora remove a regra. O que acontece com esses dois pagamentos registrados?

A) Preservar — as ocorrências materializadas continuam existindo e aparecendo no histórico. A regra some, mas o que você já pagou permanece registrado. Consequência: elas viram registros sem regra de origem

B) Remover tudo — a regra e todas as suas ocorrências desaparecem. Histórico limpo, mas meses já fechados mudam retroativamente

C) Preservar apenas as pagas — remove as previstas ainda não pagas e mantém as pagas

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Análise de Contradições e Ambiguidades

**Resultado**: nenhuma contradição entre as respostas. **Uma delas, porém, revelou um defeito real em código já aprovado da Unidade 1.**

| Verificação | Resultado |
|---|---|
| Migrar backup antigo (Q1) vs. schema versionado (RNF-05) | Coerente — o caminho de migração já precisa existir para abrir o banco; reutilizá-lo na importação não acrescenta mecanismo novo |
| `crypto.randomUUID()` (Q2) vs. alvo iOS 16 (NFR-P01) | Coerente — disponível em contexto seguro, e o app é servido por HTTPS |
| Guardar todas as âncoras (Q3) vs. volume-alvo (RNF-12) | Coerente — algumas dezenas de registros por ano, irrelevante |
| Guardar todas as âncoras (Q3) vs. `vigenteEm` do repositório | Coerente — a consulta "mais recente até a data" já estava especificada, e só faz sentido com histórico |
| Stateful completo (Q4) vs. PBT-06 | Coerente e mais forte que o mínimo exigido pela regra |
| Preservar ocorrências órfãs (Q5) vs. resolução da Unidade 1 | **DEFEITO ENCONTRADO** — ver abaixo |

### Defeito encontrado em código já aprovado

A resposta A da Question 5 determina que, ao remover uma regra, as ocorrências já materializadas continuam existindo. Elas passam a ser **órfãs**: têm `geradorId` apontando para uma regra que não existe mais.

O `resolver` da Unidade 1, já aprovado e com testes passando, **não as exibiria**. Seu algoritmo é:

1. indexa as ocorrências reais não avulsas por chave;
2. percorre as **virtuais**, substituindo pela real quando há par;
3. acrescenta as avulsas.

Uma ocorrência real não avulsa **sem virtual correspondente nunca é alcançada** — o passo 2 só olha para virtuais, e o passo 3 só para avulsas. O aluguel de julho que você pagou desapareceria do histórico no instante em que a regra fosse removida.

O defeito não se limita ao caso da Question 5. Ele ocorre sempre que uma ocorrência real perde sua virtual:

- regra removida (Question 5);
- regra editada "desde sempre" com vigência encurtada, deixando de cobrir uma competência já materializada;
- parcelamento ou cartão removido com parcelas ou faturas já pagas.

**Correção**: o resolvedor passa a incluir também as ocorrências reais não avulsas cujas chaves não foram consumidas por nenhuma virtual, marcando-as como órfãs. Elas são dado registrado pelo usuário; nada justifica descartá-las silenciosamente.

Isso exige alterar `src/domain/occurrence-resolver.ts`, código da **Unidade 1**, já aprovada. A alteração e seus testes foram executados antes de prosseguir com o design desta unidade.
