# Patrimônio em mais de uma moeda

Registra saldos em moeda estrangeira e responde "quanto eu tenho no total",
sem deixar esse dinheiro contaminar a projeção do mês.

Este documento cobre um projeto autônomo, fora da sequência de quatro. Não
depende do Projeto 3 nem o bloqueia.

Data: 2026-08-30

---

## O problema

Um dos salários do usuário é pago em dólares. O dinheiro cai numa conta em
dólar e ele decide quando converter para reais — a cotação da conversão não é
a do dia em que recebeu.

Hoje o app não tem onde guardar isso. `Centavos` é um inteiro em uma moeda
implícita, `formatarBRL` fixa `pt-BR`/`BRL`, e a âncora de saldo é um número
só.

A pergunta que ele quer responder é **"quanto eu tenho no total, somando
tudo?"** — não "preciso converter para pagar as contas". A segunda é um
problema maior e fica fora deste projeto.

## O que já existe, e por que não serve

`Regra.valorEhEstimativa` existe e parece o encaixe óbvio para um valor que
varia. Não é: o campo é gravado e **nunca lido** por nenhuma lógica de domínio
ou serviço — era uma etiqueta da tela do PWA. `mediaDosUltimosPagos` (DOM-12)
existe e também não é chamada por nenhuma ferramenta.

Mais decisivo: nenhum dos dois resolve o problema real, porque o dólar não é
uma receita mensal de valor incerto. É uma reserva em outra moeda, que só vira
capacidade de pagar contas quando convertida.

## A decisão central: fora da projeção

O saldo em moeda estrangeira **não entra** em `situacao_do_mes`, `o_que_vence`
nem `simular_cenario`. Nenhuma delas passa a saber que ele existe.

Se entrasse na âncora, o app diria que o mês fecha tranquilo enquanto o
dinheiro está em outra moeda e ainda não foi convertido — uma resposta
confiante e errada sobre exatamente a pergunta que o app existe para
responder. O mesmo raciocínio que mantém a âncora separada da projeção
mantém o dólar separado da âncora.

A consequência aceita: converter dólares para reais não é registrado
automaticamente. Quando o usuário converte, ele declara o novo saldo em dólar
e lança a entrada em reais — duas escritas, ambas explícitas.

## Modelo

Uma tabela nova, acrescentada ao fim de `MIGRACOES` em
`mcp/dados/migracoes.ts`:

```sql
create table if not exists saldos_estrangeiros (
  moeda text primary key,
  valor_centavos bigint not null,
  data text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
)
```

`moeda` como chave primária: um saldo por moeda, declarar de novo sobrescreve.
Mais moedas depois não custam nada.

`valor_centavos` é a menor unidade da moeda — cents, no caso do dólar. Mesma
representação inteira do resto do sistema (RN-01). `data` é `text` (RN-04).

**O repositório fica fora de `Repositorios`.** Esse tipo é derivado da
implementação Dexie; acrescentar um campo obrigaria a implementar o mesmo
repositório em Dexie e alteraria a suíte de contrato. Em vez disso, `AppPg`
ganha um campo próprio, irmão de `repos`:

```ts
export interface AppPg {
  readonly repos: Repositorios
  readonly saldosEstrangeiros: SaldosEstrangeirosRepo
  readonly projecao: ProjectionService
  readonly pagamento: PaymentService
  readonly auditoria: Auditoria
}
```

O domínio em `src/` não é tocado. Nenhum dos 309 testes muda.

## Aritmética da conversão

Multiplicar centavos por uma cotação decimal reintroduz ponto flutuante — a
coisa que este projeto evita em todo lugar onde há dinheiro.

A cotação entra como **texto** (`"5,4321"`), pelo mesmo motivo que os valores
entram como texto: tirar aritmética das mãos do modelo. Um módulo novo,
`mcp/cambio.ts`, converte e multiplica:

```ts
/** "5,4321" | "5.4321" | "5,4" | "5" -> 54321 | 54321 | 54000 | 50000 */
export function paraDezMilesimos(texto: string): number | null

/** arredonda para o centavo mais proximo */
export function converter(valorCentavos: number, cotacaoEmDezMilesimos: number): number

/** Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }) */
export function formatarMoeda(centavos: number, moeda: string): string
```

`converter` faz `Math.round((valorCentavos * cotacao) / 10_000)` — multiplicação
e divisão inteiras, arredondamento explícito no fim. Cinco mil dólares dão um
produto na casa de 10^10, muito abaixo de `Number.MAX_SAFE_INTEGER`.

**Casos que `paraDezMilesimos` recusa** (devolvendo `null`): texto vazio, não
numérico, zero, negativo, e **mais de quatro casas decimais**. A última é
deliberada: truncar em silêncio descartaria precisão que o usuário informou de
propósito. Quatro casas é o formato usual de cotação.

`formatarMoeda` fica em `mcp/cambio.ts` e não em `src/domain/money.ts`: `src/`
permanece congelado, e `formatarBRL` continua sendo a função do domínio.

## `declarar_saldo_estrangeiro`

Análoga a `declarar_saldo`. Argumentos: `moeda` (texto), `valor` (texto, como a
pessoa fala) e `data` opcional (`AAAA-MM-DD`, padrão hoje).

`moeda` é normalizada para maiúsculas e precisa ter exatamente três letras
(formato ISO 4217). Não há lista fechada de moedas válidas — validar o formato
basta para recusar lixo, e uma lista seria manutenção sem ganho.

`valor` passa por `deEntradaUsuario`, o mesmo parser das outras escritas.
Diferente de `declarar_saldo`, valores negativos são recusados: uma reserva em
moeda estrangeira negativa não tem significado.

Grava com `insert ... on conflict (moeda) do update`, sobrescrevendo
`valor_centavos`, `data` e `atualizado_em`. `criado_em` permanece o da
primeira declaração daquela moeda.

O recibo mostra a moeda, o valor formatado nela e a data.

**Esta escrita não entra no `desfazer`.** `TipoDeEscrita` não ganha um sexto
valor. A gravação é um upsert sem histórico: não há estado anterior para onde
voltar, e um `desfazer` que apagasse a linha destruiria o saldo em vez de
restaurá-lo. Corrigir um erro aqui é declarar de novo — a operação já é
idempotente. O recibo diz isso.

## `patrimonio`

Argumento: `cotacoes`, um objeto de moeda para cotação em texto
(`{ "USD": "5,4321" }`), mais `hoje` opcional.

O saldo em reais **vem da projeção, não da âncora crua**. A âncora é o que foi
declarado numa data; desde então houve pagamentos e recebimentos. A ferramenta
chama `projetarMes(competenciaDe(hoje), hoje)` e usa `saldoNaReferenciaCentavos`
— o mesmo número que `situacao_do_mes` mostra, calculado pelo mesmo projetor.

Se não houver âncora, `saldoRelativo` é `true` e o resultado carrega
`AVISO_SALDO_RELATIVO`, como em `situacao_do_mes`: sem base, o total tem forma,
não nível.

**Uma moeda com saldo gravado e sem cotação nos argumentos é erro de usuário**,
não uma linha omitida. Um total que descarta uma moeda em silêncio é um número
errado com cara de certo. A mensagem nomeia as moedas que faltam.

Cotações informadas para moedas sem saldo são ignoradas sem erro.

O resultado:

```ts
export interface Patrimonio {
  readonly emReais: Dinheiro
  readonly dataDaReferencia: string | null
  readonly emMoedaEstrangeira: readonly {
    readonly moeda: string
    readonly valor: string          // formatado na moeda de origem
    readonly cotacao: string        // como veio, para conferencia
    readonly equivalenteEmReais: Dinheiro
  }[]
  readonly total: Dinheiro
  readonly saldoRelativo: boolean
  readonly avisoSaldoRelativo: string | null
  readonly avisoConversao: string | null
}
```

`avisoConversao` é texto fixo, presente sempre que houver moeda estrangeira e
`null` quando não houver. Diz que o valor em moeda estrangeira **não está
disponível para pagar contas até ser convertido**, e que o equivalente em reais
é uma estimativa pela cotação informada. Sem ele, o assistente soma tudo e
responde "você tem R$ X" sobre dinheiro que ainda precisa passar por uma
conversão a uma cotação que ainda não aconteceu.

## Descrições das ferramentas

O servidor passa de doze para catorze. A separação que importa:

| Ferramenta | A pergunta |
|---|---|
| `situacao_do_mes` | "Como estou este mês?" — só reais, só o fluxo do mês |
| `patrimonio` | "Quanto eu tenho no total?" — reais mais moedas, convertido |

A descrição de `patrimonio` instrui o assistente a **buscar a cotação do dia**
antes de chamar, e a mostrar ao usuário qual cotação usou. Se não conseguir
uma cotação, perguntar — nunca estimar de memória.

A cotação vir do assistente e não do servidor é deliberado: nenhuma dependência
externa nova num serviço que hoje só fala com o próprio banco, nada para
manter, e a cotação usada aparece no resultado para conferência.

## Testes

`mcp/cambio.test.ts`, sem banco: `paraDezMilesimos` nos formatos aceitos e em
cada recusa (vazio, não numérico, zero, negativo, cinco casas decimais);
`converter` com um caso de arredondamento para cima e um para baixo; um caso
provando que o produto de um valor grande continua exato.

Sobre Postgres:

- `declarar_saldo_estrangeiro` grava e lê; declarar duas vezes a mesma moeda
  deixa **uma** linha, com o segundo valor; recusa moeda mal formada e valor
  negativo **sem gravar**.
- `patrimonio` sem moeda estrangeira devolve o mesmo saldo que
  `situacao_do_mes`, e `emMoedaEstrangeira` vazio.
- `patrimonio` com saldo em dólar soma corretamente e mostra a cotação usada.
- `patrimonio` com saldo em dólar e sem cotação **falha** nomeando a moeda.
- `patrimonio` sem âncora traz `saldoRelativo: true` e o aviso.
- Uma escrita em `saldos_estrangeiros` **não altera** o resultado de
  `situacao_do_mes` — a garantia de isolamento que sustenta a decisão central,
  verificada em vez de assumida.

## Fora de escopo

"Preciso converter esse mês para pagar as contas?" — exige o dólar entrar no
fluxo de caixa como reserva conversível, com regra de quando considerá-lo
disponível. É um projeto maior e se constrói em cima deste.

Histórico de cotações, registro de operações de câmbio, e cálculo de ganho ou
perda cambial.

A remoção do PWA, que continua sendo o Projeto 3, com a inversão de
`Repositorios` como primeira tarefa.
