# Plano de Functional Design — Unidade 1 (`dominio`)

**Fase**: CONSTRUCTION
**Unidade**: 1 — Núcleo de Domínio (`src/domain/`)
**Data**: 2026-08-08
**Status**: ✅ CONCLUÍDO — artefatos gerados, aguardando aprovação do usuário

---

## Escopo

Detalhar a lógica de negócio da Unidade 1: modelos de domínio, regras, validações e algoritmos. **Agnóstico de tecnologia** — nada de banco, framework ou infraestrutura.

---

## Passos de Execução

- [x] Ler a definição da unidade em `unit-of-work.md`
- [x] Ler os requisitos atribuídos em `unit-of-work-story-map.md`
- [x] Avaliar todas as categorias de pergunta exigidas pela regra
- [x] Gerar as perguntas contextuais
- [x] Coletar as respostas do usuário
- [x] Analisar as respostas em busca de ambiguidades
- [x] Formular perguntas de acompanhamento, se necessário — nenhuma; duas consequências resolvidas no próprio documento
- [x] Gerar `domain-entities.md` — 5 entidades, 1 estrutura derivada, invariantes
- [x] Gerar `business-rules.md` — 41 regras numeradas, com rastreabilidade a requisitos
- [x] Gerar `business-logic-model.md` — 8 algoritmos em pseudocódigo
- [x] **PBT-01**: incluir a seção "Propriedades Testáveis" nos artefatos, com categoria por propriedade — 39 propriedades identificadas em 7 grupos, mais 8 testes por exemplo obrigatórios (PBT-10)
- [x] Validar completude e consistência — nenhum requisito da unidade sem regra correspondente

---

## Avaliação das Categorias de Pergunta

| Categoria | Situação |
|---|---|
| **Business Logic Modeling** | Perguntada — Questions 2 e 5 |
| **Domain Model** | Coberto por `component-methods.md`; sem ambiguidade remanescente |
| **Business Rules** | Perguntada — Questions 1, 3, 4 |
| **Data Flow** | Coberto por `services.md`; a Unidade 1 não persiste |
| **Integration Points** | **N/A** — a unidade não tem integração externa; é código puro |
| **Error Handling** | Coberto: funções puras rejeitam entrada inválida lançando; sem I/O a tratar |
| **Business Scenarios** | Perguntada — Questions 2 e 5 tratam de casos de borda |
| **Frontend Components** | **N/A** — a Unidade 1 não contém interface |

---

## Perguntas

### Question 1 — Padrão de Ajuste de Fim de Semana
Quando você cadastra uma regra, qual deve ser o padrão sugerido para o caso de a data cair em sábado ou domingo?

A) Por tipo de movimento — entrada padrão `antecipa`, saída padrão `posterga`. Reflete o comportamento usual: salário costuma ser antecipado pelo empregador, boleto costuma aceitar pagamento no próximo dia útil

B) Sempre `nenhum` — o app não presume nada e você escolhe caso a caso

C) Sempre `posterga`, para entradas e saídas

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 2 — Janela de Busca de Atrasados
Contas vencidas e não pagas são empurradas para o dia da âncora e afundam o saldo de hoje. Até quanto tempo para trás o motor deve procurá-las?

A) 12 meses — cobre praticamente qualquer esquecimento real, com custo de consulta desprezível no volume-alvo

B) 3 meses — janela curta; algo esquecido há mais tempo desaparece silenciosamente da projeção

C) Sem limite — busca desde o primeiro registro. Nada some, mas uma conta antiga que você nunca vai pagar afunda o saldo para sempre até ser marcada como ignorada

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 3 — Estimativa de Contas de Valor Variável
Para regras marcadas como estimativa (luz, água), o valor previsto deve ser recalculado automaticamente?

A) Não — o previsto é o valor que você cadastrou, e só muda quando você o altera. Comportamento previsível, sem surpresa

B) Sim — usar a média dos últimos três meses efetivamente pagos, quando houver ao menos três. Estimativa mais realista, ao custo de o número mudar sozinho entre uma abertura e outra

C) Sim, mas apenas sugerir — a média aparece como sugestão no formulário; o valor só muda se você aceitar

X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

### Question 4 — Ausência de Âncora de Saldo
O que a curva de saldo deve fazer enquanto você ainda não informou seu saldo atual?

A) Partir de zero e sinalizar claramente que o saldo é relativo, não absoluto — a forma da curva e o dia de menor saldo continuam corretos; só o nível está deslocado

B) Não exibir a curva e pedir que você informe o saldo primeiro

C) Partir de zero silenciosamente, sem aviso

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 5 — Fatura de Cartão de Valor Zero
Um cartão cadastrado sem parcelas no mês e com gasto típico zero produziria uma fatura de R$ 0,00. Ela deve aparecer?

A) Não — faturas de valor zero são suprimidas da lista, para não poluir o mês com linhas irrelevantes

B) Sim — todo cartão cadastrado sempre gera uma linha de fatura, mesmo zerada, para lembrar que ele existe

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Análise de Contradições e Ambiguidades

**Resultado**: nenhuma contradição. Uma consequência estrutural detectada e resolvida abaixo.

| Verificação | Resultado |
|---|---|
| Padrão por tipo (Q1) vs. campo `ajusteFimDeSemana` já existente | Coerente — o padrão é apenas o valor inicial sugerido no cadastro; o campo permanece editável por regra |
| Janela de 12 meses (Q2) vs. volume-alvo (RNF-12) | Coerente — até 50 lançamentos por mês resulta em no máximo algumas centenas de registros na janela, irrelevante para IndexedDB |
| Janela de 12 meses (Q2) vs. navegação livre ao passado (RF-25) | Coerente e distinto — a janela limita a busca por **atrasados a empurrar para hoje**, não a navegação. Meses anteriores a 12 continuam visitáveis e exibem seus próprios itens normalmente |
| Sugerir média (Q3) vs. fronteira entre Unidade 1 e Unidade 3 | **Consequência estrutural**, resolvida abaixo |
| Zero com aviso (Q4) vs. curva correta | Coerente — sem âncora, a forma da curva e o dia de saldo mínimo permanecem corretos; apenas o nível fica deslocado, e o aviso comunica isso |
| Suprimir fatura zero (Q5) vs. confirmar fatura real (RF-12) | Coerente, com ressalva registrada abaixo |

### Consequência estrutural — Question 3

"Sugerir a média no formulário" reparte responsabilidade entre duas unidades. O **cálculo** da média é regra de negócio e pertence à Unidade 1; a **sugestão** no campo é comportamento de interface e pertence à Unidade 3.

Resolução: acrescentar à Unidade 1 a função pura `mediaDosUltimosPagos`, que recebe as ocorrências históricas de uma regra e a quantidade de meses, e devolve a média dos valores efetivamente pagos, ou nulo quando não houver amostras suficientes. A Unidade 3 apenas a invoca e apresenta.

Isso adiciona um componente ao escopo da Unidade 1, registrado como **DOM-12**.

### Ressalva — Question 5

A supressão de fatura zerada esconde o cartão do mês. Se o usuário quiser informar o valor real de uma fatura que o app estimou como zero, não haverá linha para tocar. Resolução: a supressão vale apenas para a **listagem**; o cadastro de cartões continua oferecendo a ação de informar a fatura de qualquer competência. Registrado como regra RN-24.
