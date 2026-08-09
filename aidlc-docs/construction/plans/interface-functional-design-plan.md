# Plano de Functional Design — Unidade 3 (`interface`)

**Fase**: CONSTRUCTION
**Unidade**: 3 — Aplicação e Interface (`src/ui/` + raiz do PWA)
**Data**: 2026-08-08
**Status**: ✅ CONCLUÍDO — aguardando aprovação do usuário

---

## Escopo

Detalhar a hierarquia de componentes, os fluxos de interação, as regras de validação de formulário e os pontos de integração com os serviços da Unidade 2.

**Novidade**: é a única unidade com interface, portanto o artefato `frontend-components.md` é obrigatório aqui.

---

## Passos de Execução

- [x] Ler os artefatos das Unidades 1 e 2
- [x] Avaliar todas as categorias de pergunta
- [x] Gerar as perguntas contextuais
- [x] Coletar as respostas do usuário
- [x] Analisar as respostas em busca de ambiguidades
- [x] Gerar `frontend-components.md` — hierarquia, props e estado, fluxos, validações
- [x] Gerar `business-rules.md` — regras de apresentação e validação
- [x] **PBT-01**: identificar as propriedades testáveis desta unidade
- [x] Validar completude

> `domain-entities.md` e `business-logic-model.md` **não** serão gerados nesta unidade: ela não introduz entidade nem lógica de negócio. Toda decisão vive nas Unidades 1 e 2. Gerar os arquivos vazios só produziria ruído.

---

## Avaliação das Categorias

| Categoria | Situação |
|---|---|
| **Frontend Components** | Perguntada — Questions 1 a 5 |
| **Business Logic Modeling** | **N/A** — a unidade não contém lógica de negócio |
| **Domain Model** | **N/A** — nenhuma entidade nova |
| **Business Rules** | Perguntada — Questions 1 e 4 tratam de validação |
| **Data Flow** | Coberto por `component-dependency.md`, que já traz os três fluxos |
| **Integration Points** | Coberto — os serviços da Unidade 2 são a única integração |
| **Error Handling** | Perguntada — Question 5 |
| **Business Scenarios** | Perguntada — Questions 2 e 3 |

---

## Perguntas

### Question 1 — Entrada de Valores Monetários
Como deve funcionar o campo de dinheiro no iPhone?

A) Máscara progressiva — você digita apenas dígitos e o campo formata da direita para a esquerda: digitar `1`, `8`, `0`, `0`, `0` mostra `R$ 180,00`. Nunca aceita valor inválido, e o teclado numérico simples basta

B) Digitação livre com validação ao sair — você escreve `180,00` ou `180.00` e o app interpreta ao confirmar. Mais flexível, mas exige teclado com vírgula e permite estados intermediários inválidos

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 2 — Navegação Entre Meses
Como mudar de mês na tela inicial?

A) Setas mais toque no nome do mês para escolher — setas para o mês anterior e o seguinte, e tocar no título abre um seletor para saltar

B) Apenas setas — mais simples; saltar seis meses exige seis toques

C) Deslizar horizontalmente mais setas — gesto natural, mas conflita com o gesto de voltar do iOS na borda esquerda

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 3 — Acesso ao Lançamento Avulso
Você indicou que entradas avulsas são raras. Onde fica a ação?

A) Botão flutuante na tela do mês — sempre visível, um toque. Ocupa espaço permanente por algo raro

B) Dentro do menu de cadastros — some da tela principal, exige dois ou três toques

C) Botão discreto no fim da lista do mês — visível ao rolar até o fim, sem competir com o conteúdo

X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

### Question 4 — Confirmação de Ações Destrutivas
Remover uma regra e importar um backup são irreversíveis. Como confirmar?

A) Folha de confirmação própria, explicando a consequência — "Remover o aluguel? Os pagamentos já registrados serão mantidos." Controle total sobre o texto

B) Diálogo nativo do navegador (`confirm`) — nenhuma tela a construir, mas o texto é genérico e a aparência destoa do app

C) Desfazer em vez de confirmar — a ação acontece na hora e uma faixa oferece desfazer por alguns segundos

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 5 — Falha ao Gravar
Se uma escrita falhar (cota de armazenamento, banco indisponível), o que o usuário vê?

A) Faixa de erro no topo, com o que falhou e sugestão de ação — "Não foi possível salvar. Seu armazenamento pode estar cheio; exporte um backup e libere espaço." A tela permanece utilizável

B) Tela de erro dedicada, bloqueando o uso até a recuperação

C) Mensagem discreta e temporária, que some sozinha

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Análise de Contradições e Ambiguidades

**Resultado**: nenhuma contradição. Duas consequências registradas.

| Verificação | Resultado |
|---|---|
| Máscara progressiva (Q1) vs. `deEntradaUsuario` da Unidade 1 | Coerente, com consequência — ver abaixo |
| Setas mais seletor (Q2) vs. `react-router` e o gesto de voltar do iOS | Coerente — descartar o deslize horizontal preserva o gesto de borda, que foi a razão de adotar o roteador |
| Botão no fim da lista (Q3) vs. RF-03 | Coerente — a frequência da ação corresponde à sua proeminência |
| Folha própria (Q4) vs. proibição de diálogos nativos | Coerente e preferível — `confirm()` bloqueia a página inteira no iOS |
| Faixa com sugestão (Q5) vs. RNF-26 e SECURITY-09 | Coerente — a mensagem orienta a ação sem expor detalhe interno |

### Consequência 1 — a máscara torna `deEntradaUsuario` quase desnecessária

Com máscara progressiva, o campo acumula **dígitos** e o valor em centavos é obtido diretamente da sequência digitada. A função `deEntradaUsuario` da Unidade 1, que interpreta `1.234,56`, deixa de ser o caminho principal.

Ela **não** será removida: continua sendo o caminho de entrada para valores colados da área de transferência, e é a inversa que sustenta a propriedade de ida e volta PROP-M04. Fica como caminho secundário, e isso é registrado para que uma revisão futura não a considere código morto.

### Consequência 2 — a folha de confirmação precisa de texto por ação

A opção A foi escolhida justamente porque o texto importa. Isso implica que **cada** ação destrutiva declara sua própria mensagem, e não uma genérica:

| Ação | Mensagem |
|---|---|
| Remover regra | "Os pagamentos já registrados serão mantidos no histórico." |
| Remover parcelamento | "As parcelas já pagas serão mantidas." |
| Remover cartão | "As faturas já pagas serão mantidas. Parcelamentos vinculados precisam ser ajustados." |
| Importar backup | "Todos os dados atuais serão substituídos. Esta ação não pode ser desfeita." |

A mensagem da importação é a única que anuncia perda de dado — porque é a única que realmente perde.
