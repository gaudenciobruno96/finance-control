# A âncora de saldo passa a ter instante

Um pagamento feito no mesmo dia da âncora, mas registrado **depois** dela,
deve descontar do saldo. Hoje não desconta, e o app mostra um número maior
que o do extrato.

Data: 2026-09-01

---

## O problema, como apareceu

O usuário declarou saldo de R$ 6.567,97 em 01/09. Mais tarde no mesmo dia
pagou R$ 111,00 de sushi. O saldo exibido continuou R$ 6.567,97 — o extrato
dizia R$ 6.456,97.

A causa é a RN-32, em `src/domain/balance-projector.ts`:

```ts
if (temAncora && o.dataPagamento !== null &&
    comparar(o.dataPagamento, dataDaAncora) <= 0) {
  continue
}
```

Ela pula qualquer pagamento cuja data seja **menor ou igual** à da âncora,
porque o saldo declarado é uma leitura do extrato e o que já saiu já está
descontado nele. Descontar de novo daria um saldo menor que o digitado.

A regra está certa para quem confere o extrato à noite e declara o saldo com
tudo já pago. Ela erra para o uso oposto — declarar de manhã e gastar durante
o dia — porque compara **datas**, e dentro do mesmo dia não há como distinguir
os dois casos.

O erro é silencioso e cresce ao longo do dia: cada pagamento posterior à
declaração aumenta a diferença entre o app e o banco, sem nenhum sinal.

## A decisão

**A âncora deixa de ser "o saldo de um dia" e passa a ser "o saldo num
instante".** É o que ela sempre foi na cabeça de quem a declara: a pessoa olha
o extrato e diz quanto tem *agora*.

Com isso a comparação deixa de ser ambígua: tudo que aconteceu antes daquele
instante já está no valor declarado; tudo depois desconta.

## Modelo

Dois campos novos, ambos aceitando nulo:

```ts
export interface AncoraSaldo {
  readonly id: string
  readonly data: DataISO
  readonly saldoCentavos: Centavos
  /** Instante ISO 8601 em UTC. Nulo em ancoras anteriores a esta mudanca. */
  readonly declaradaEm: string | null
}

export interface Ocorrencia {
  // ... campos existentes
  /** Instante ISO 8601 em UTC em que o pagamento foi registrado. */
  readonly pagamentoRegistradoEm: string | null
}
```

`data` permanece: ela indexa a âncora (índice único), seleciona a vigente
(RN-49) e é o que o usuário vê. O instante é informação adicional, não
substituta.

### Por que dois campos, e não só o da âncora

Ordenar exige os dois lados. Sem o instante do pagamento, saber quando a
âncora foi declarada não diz se o pagamento veio antes ou depois.

### Por que um campo dedicado, e não o `atualizado_em` que já existe

`atualizado_em` avança a cada escrita na linha, não só no pagamento. Corrigir
o valor de uma conta paga semana passada moveria seu instante para hoje e
poderia inverter a ordem contra uma âncora recente. O campo dedicado só se
move quando o pagamento é registrado.

### Por que isto não viola a RN-04

A RN-04 proíbe colunas `date` porque o driver `pg` aplicaria fuso a uma data
de calendário e deslocaria o dia. Aqui o dado **é** um instante absoluto, e
precisa de fuso para ser ordenado corretamente entre um container em UTC e um
usuário em BRT. Vão como `timestamptz` no banco e string ISO em UTC no
domínio — comparáveis por ordem lexicográfica, sem `Date` no meio.

## A regra revisada

Um pagamento é considerado já refletido no saldo declarado — e portanto
ignorado pelo projetor — quando:

1. `dataPagamento` é **anterior** à data da âncora; **ou**
2. `dataPagamento` é **igual** à data da âncora **e**:
   - ambos os instantes existem e `pagamentoRegistradoEm <= declaradaEm`; **ou**
   - algum dos dois instantes é nulo.

O caso 2 com instantes nulos preserva exatamente o comportamento de hoje.

### O que acontece com os dados que já existem

Nada. Registros gravados antes desta mudança têm os dois campos nulos e caem
no fallback do caso 2 — nenhum saldo histórico se desloca sozinho, e nenhuma
conferência já feita é invalidada. A regra nova vale a partir das escritas
seguintes.

Foi decisão explícita do usuário: back-fill assumindo "pago depois" corrigiria
o caso dele automaticamente, mas passaria a descontar duas vezes para quem
declarou o saldo depois de pagar.

## Onde cada peça muda

| Arquivo | Mudança |
|---|---|
| `src/domain/types.ts` | os dois campos novos |
| `src/domain/balance-projector.ts` | a condição da RN-32 |
| `src/data/invariants.ts` | validar formato do instante, quando presente |
| `mcp/dados/migracoes.ts` | migração nova ao fim do array |
| `mcp/dados/repositorios-pg.ts` | ler e gravar as duas colunas |
| `mcp/tools/escrita/declarar-saldo.ts` | gravar o instante da declaração |
| `mcp/tools/escrita/marcar-pago.ts` | gravar o instante do pagamento |

**`src/` deixa de estar congelado.** Ele atravessou os três projetos do MCP
sem uma linha alterada, e esta é a primeira mudança que o alcança — porque a
regra defeituosa vive no domínio, e é lá que ela precisa ser corrigida.

**A implementação Dexie compartilha os tipos.** `Repositorios` é derivado dela
e a suíte de contrato roda os mesmos casos contra as duas implementações. O
plano precisa confirmar, antes de qualquer outra tarefa, se o Dexie persiste
campos novos sem intervenção (ele grava o objeto inteiro) ou se exige
alteração — e a suíte de contrato deve cobrir os dois campos nas duas
implementações.

## Quem preenche os instantes

`declarar_saldo` e `marcar_pago` gravam o instante corrente. Nenhuma das duas
ferramentas muda de assinatura: o instante é do servidor, não do usuário, pelo
mesmo motivo que `hoje` tem padrão — pedir ao modelo que informe o horário
seria pedir que ele invente um.

O instante vem de `new Date().toISOString()`, sempre em UTC. Diferente de
`hojeDoSistema()`, que converte para o fuso do usuário porque uma data de
calendário depende de onde a pessoa está, o instante é absoluto e não deve
ser convertido.

## Testes

No domínio, sobre `projetarCurva`, com âncora e pagamento no mesmo dia:

- pagamento registrado **antes** da âncora não desconta;
- pagamento registrado **depois** da âncora desconta;
- os dois instantes nulos preservam o comportamento atual (não desconta);
- só um dos instantes presente também preserva o atual;
- pagamento de data anterior à âncora continua não descontando, com ou sem
  instantes — o caso 1 não depende deles.

Sobre Postgres:

- `declarar_saldo` grava `declarada_em`; `marcar_pago` grava
  `pagamento_registrado_em`;
- declarar saldo e em seguida pagar deixa o saldo **menor** — o cenário do
  usuário, ponta a ponta;
- pagar e em seguida declarar saldo **não** desconta de novo — o caso oposto,
  que a RN-32 sempre protegeu e que esta mudança não pode quebrar.

O segundo é o mais importante: ele é a regressão que a correção arrisca.

## Fora de escopo

Back-fill de instantes em registros existentes.

Expor o instante nas consultas. O usuário não pediu para ver a hora da
declaração, e mostrá-la não ajuda a responder nenhuma das perguntas que o app
existe para responder.

A remoção do PWA, que continua sendo o Projeto 3.
