# Categorias de gasto

Uma categoria por lançamento, escolhida de uma lista fixa, e um relatório que
responde "quanto foi para cada setor".

Data: 2026-09-07

---

## O problema

Hoje o `historico_de_gastos` agrupa por **nome**, e o usuário tem catorze
saídas soltas. "Quanto gastei com comida esse mês?" não tem resposta: exigiria
somar `Mercado`, `Jaguar Sushi` e `San Juan` de cabeça, sabendo de antemão
quais nomes pertencem a quê.

## A lista é fixa

Categoria de texto livre fragmenta em silêncio: `Mercado`, `mercado` e
`Supermercado` viram três setores, cada um com parte do dinheiro, e a soma por
setor deixa de fechar. Ninguém percebe até desconfiar de um número.

Quinze valores, derivados dos lançamentos reais do usuário e não de um modelo
genérico:

| valor | cobre |
|---|---|
| `moradia` | aluguel, luz, internet |
| `mercado` | compra de supermercado |
| `alimentacao_fora` | restaurante, delivery |
| `transporte` | combustível, aplicativo, manutenção |
| `vestuario` | roupa, calçado |
| `saude` | consulta, remédio, plano |
| `pet` | ração, veterinário |
| `servicos` | contador, assinaturas, serviços contratados |
| `dividas` | empréstimo, financiamento |
| `familia` | repasses e gastos de terceiros |
| `investimento` | aporte, terreno |
| `compras` | varejo em geral |
| `cartao` | fatura de cartão |
| `lazer` | passeio, viagem, entretenimento |
| `outros` | o que não couber |

Os valores são sem acentuação, como o resto do código; o rótulo exibido pode
ter. Acrescentar uma categoria é uma linha e um deploy — mas depois que houver
histórico, mudar a lista significa recategorizar o passado, então vale
acertá-la antes.

## Modelo

O campo entra em **`Regra`, `Parcelamento` e `Ocorrencia`**:

```ts
export type Categoria =
  | 'moradia' | 'mercado' | 'alimentacao_fora' | 'transporte' | 'vestuario'
  | 'saude' | 'pet' | 'servicos' | 'dividas' | 'familia' | 'investimento'
  | 'compras' | 'cartao' | 'lazer' | 'outros'
```

Todos aceitam **nulo**. Os lançamentos que já existem começam sem categoria, e
nulo significa "não categorizado" — não um erro, não um valor faltando.

### A ocorrência herda do gerador

Uma conta gerada pela regra "Aluguel" nasce com a categoria da regra.
`expandirRegras` e `expandirParcelamentos` já copiam nome, valor e vencimento
para a ocorrência virtual; a categoria vai junto.

Isso é o que torna a feature barata de usar: categorizar o aluguel é **uma**
operação, não doze por ano. Só o lançamento avulso carrega a sua própria
categoria, porque não tem gerador de quem herdar.

A ocorrência materializada guarda a categoria que herdou, congelada como já
congela nome e valor (RN-52). Recategorizar a regra não reescreve o passado —
o que é correto: o histórico registra como o gasto era classificado quando
aconteceu.

## Ferramentas

### Três ganham um parâmetro opcional

`cadastrar_recorrente`, `lancar_avulso` e `cadastrar_parcelamento` recebem
`categoria?`. A descrição instrui o assistente a **sugerir** a partir do nome
e confirmar com o usuário, em vez de decidir calado — "Jaguar Sushi" é
`alimentacao_fora` com alta confiança, "Container" não é óbvio para ninguém.

Omitir é permitido e grava nulo. Forçar a escolha em toda escrita transformaria
cada lançamento numa pergunta a mais.

### `definir_categoria(tipo, id, categoria)` — nova

`tipo` é `'recorrente' | 'parcelamento' | 'avulso'`, o mesmo vocabulário que
`desfazer` já usa. `id` vem do recibo ou do `exportar`.

É como as sete recorrências e sete parcelamentos existentes ganham categoria
sem serem apagados e recriados. Sem ela o relatório só ficaria útil depois de
meses de lançamentos novos.

Também é como se corrige uma classificação errada — passar a categoria nova
sobrescreve.

**O alcance de cada tipo não é o mesmo.** Categorizar uma recorrência ou um
parcelamento muda o *molde*: vale do próximo pagamento em diante. Os meses já
pagos continuam exatamente onde estavam, porque uma ocorrência materializada
congelou a categoria que tinha — RN-52, a mesma regra que congela nome e valor.
Um mês já pago de uma regra recém-categorizada continua somando em
`sem_categoria`.

O que alcança o passado é `tipo: 'avulso'`, que resolve **qualquer** ocorrência
pelo id — tenha ela vindo de avulso, de regra ou de parcelamento. Uma conta já
paga se recategoriza assim, uma por chamada, com o id que `exportar` mostra. O
nome do tipo vem do vocabulário de `desfazer`; o alcance é maior do que ele
sugere, e por isso a descrição da ferramenta e a mensagem de erro dizem isso em
voz alta.

O retroativo, portanto, é resolvido em dois movimentos: categorizar o molde
para que o futuro nasça certo, e corrigir mês a mês o passado que importar.
Recategorizar meses em lote não existe, e foi aceito assim: o histórico é curto
e cada correção é uma chamada.

### `historico_de_gastos` ganha `agruparPor: 'nome' | 'categoria'`

Uma ferramenta nova para a mesma pergunta ("quanto gastei com isso?") obrigaria
o assistente a escolher entre duas consultas quase idênticas — e uma escolha
errada aqui é silenciosa, porque as duas respondem com confiança. O eixo de
agrupamento é um parâmetro, não uma ferramenta.

O padrão é `'nome'`, o comportamento atual, para não mudar o que já funciona.

## Duas decisões

### O relatório conta apenas saídas já pagas

É como `historico_de_gastos` já funciona, e a razão está no próprio arquivo:
incluir o que ainda não foi pago transforma previsão em histórico, e somar
salário com conta de luz produz um total que não significa nada.

A consequência aceita: o mês corrente aparece incompleto até os pagamentos
serem marcados. É o preço de o número ser verdadeiro.

### "Sem categoria" é uma linha do relatório, não uma omissão

Lançamentos com categoria nula somam numa linha própria, visível. Não são
distribuídos nas outras nem escondidos.

Um relatório que soma 60% do dinheiro e o apresenta como se fosse o todo é pior
que um que admite a lacuna — e no primeiro mês, antes do retroativo estar
completo, essa lacuna vai ser grande.

## A limitação que o usuário aceitou

A fatura de cartão é um agregado de compras de vários setores, e recebe a
categoria `cartao`. O relatório mostra quanto vai para cartão, não o que tem
dentro.

No caso concreto isso é significativo: `Fatura Nubank` (R$ 5.212) e
`Fatura Sicredi` (R$ 3.594) somam a maior parte do gasto variável do usuário.
Modelar fatura de verdade — uma fatura que agrega compras categorizadas — é um
projeto próprio, e foi deliberadamente adiado.

Quem quiser a visão real de um mês pode lançar as compras separadamente em vez
da fatura; o modelo permite, custa mais lançamentos.

## Testes

No domínio:

- a ocorrência virtual de uma regra herda a categoria da regra;
- a de um parcelamento herda a do parcelamento;
- regra sem categoria gera ocorrência com categoria nula;
- a ocorrência materializada preserva a categoria que tinha quando foi
  materializada, mesmo se a regra for recategorizada depois.

Sobre Postgres:

- as três ferramentas de escrita gravam a categoria; omitir grava nulo;
- `definir_categoria` altera cada um dos três tipos, e uma segunda chamada
  sobrescreve;
- `definir_categoria` recusa um id inexistente **sem gravar**;
- `historico_de_gastos` com `agruparPor: 'categoria'` soma corretamente vários
  lançamentos do mesmo setor;
- lançamentos sem categoria aparecem numa linha própria e entram no total
  geral — a garantia de que nada some do relatório;
- `agruparPor: 'nome'` continua devolvendo exatamente o que devolvia antes.

O último é o que protege contra uma regressão silenciosa na única ferramenta
com agregação própria.

## Fora de escopo

Modelar fatura de cartão como agregado de compras.

Categoria em entradas. A pergunta é "quanto gastei com cada setor"; classificar
salário não a responde, e o relatório já ignora entradas por construção.

Categoria diferente por mês numa mesma recorrência. O aluguel é moradia todo
mês; se um caso real aparecer, `lancar_avulso` cobre a exceção.

Orçamento por categoria ("gastar no máximo X com mercado"). É a evolução
natural deste projeto, e depende dele existir primeiro.
