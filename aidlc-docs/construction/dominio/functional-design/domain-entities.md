# Entidades de Domínio — Unidade 1 (`dominio`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

> Design agnóstico de tecnologia. Nenhuma menção a banco, índice ou framework.

---

## Tipos Primitivos do Domínio

| Tipo | Representação | Invariante |
|---|---|---|
| `Centavos` | inteiro | Nunca fracionário. Pode ser negativo apenas em saldo, jamais em valor de lançamento |
| `DataISO` | texto `AAAA-MM-DD` | Sempre uma data de calendário válida. Nunca convertida por fuso |
| `Competencia` | texto `AAAA-MM` | Mês de referência de uma ocorrência |

A escolha de texto para datas não é estética. `new Date('2026-08-10')` é interpretado como meia-noite **UTC** e, no horário de Brasília, resulta em 9 de agosto às 21h — um salário do dia 10 apareceria no dia 9. Representar como texto e operar por aritmética de calendário elimina a classe inteira desse erro.

---

## Entidade: Regra

Recorrência mensal. Cobre tanto entradas quanto saídas.

| Atributo | Tipo | Descrição |
|---|---|---|
| `id` | texto | Identificador |
| `tipo` | `entrada` \| `saida` | |
| `nome` | texto | Rótulo exibido |
| `valorCentavos` | `Centavos` | Valor previsto |
| `valorEhEstimativa` | booleano | Verdadeiro para contas de valor variável |
| `diaDoMes` | inteiro 1–31 | |
| `ajusteFimDeSemana` | `nenhum` \| `antecipa` \| `posterga` | |
| `vigenteDe` | `Competencia` | Primeira competência em que vale |
| `vigenteAte` | `Competencia` \| nulo | Última competência; nulo significa vigente indefinidamente |

**Invariantes**

1. `valorCentavos` é inteiro e maior que zero
2. `diaDoMes` está entre 1 e 31
3. Quando `vigenteAte` não é nulo, é maior ou igual a `vigenteDe`
4. `nome` não é vazio

**Relacionamento**: uma regra origina zero ou muitas ocorrências, uma por competência vigente.

---

## Entidade: Parcelamento

Compra em N vezes ou carnê.

| Atributo | Tipo | Descrição |
|---|---|---|
| `id` | texto | |
| `nome` | texto | |
| `valorParcelaCentavos` | `Centavos` | |
| `quantidadeParcelas` | inteiro | |
| `primeiroVencimento` | `DataISO` | |
| `cartaoId` | texto \| nulo | Cartão em que as parcelas caem; nulo se é boleto próprio |

**Invariantes**

1. `valorParcelaCentavos` é inteiro e maior que zero
2. `quantidadeParcelas` é inteiro e maior ou igual a 1
3. Quando `cartaoId` não é nulo, referencia um cartão existente

**Relacionamento**: origina exatamente `quantidadeParcelas` ocorrências. Quando vinculado a cartão, essas ocorrências **compõem** a fatura em vez de existirem como saída própria.

---

## Entidade: Cartao

| Atributo | Tipo | Descrição |
|---|---|---|
| `id` | texto | |
| `nome` | texto | |
| `diaFechamento` | inteiro 1–31 | |
| `diaVencimento` | inteiro 1–31 | |
| `gastoMensalTipicoCentavos` | `Centavos` | Gasto recorrente não parcelado, informado pelo usuário |

**Invariantes**

1. `diaFechamento` e `diaVencimento` estão entre 1 e 31
2. `gastoMensalTipicoCentavos` é inteiro e maior ou igual a zero

**Relacionamento**: origina uma ocorrência de fatura por competência, cujo valor agrega as parcelas vinculadas a ele.

---

## Entidade: Ocorrencia

O lançamento concreto. Nasce quando o usuário interage com uma ocorrência virtual, ou é criado avulso.

| Atributo | Tipo | Descrição |
|---|---|---|
| `id` | texto | |
| `geradorTipo` | `regra` \| `parcelamento` \| `cartao` \| `avulso` | |
| `geradorId` | texto \| nulo | Nulo quando avulso |
| `competencia` | `Competencia` | |
| `tipo` | `entrada` \| `saida` | |
| `nome` | texto | |
| `valorPrevistoCentavos` | `Centavos` | |
| `dataVencimento` | `DataISO` | |
| `dataPagamento` | `DataISO` \| nulo | |
| `valorPagoCentavos` | `Centavos` \| nulo | |
| `ignorado` | booleano | |
| `observacao` | texto \| nulo | |

**Invariantes**

1. `valorPrevistoCentavos` é inteiro e maior que zero
2. `dataPagamento` e `valorPagoCentavos` são ambos nulos ou ambos preenchidos — nunca um só
3. Quando `ignorado` é verdadeiro, `dataPagamento` é nulo
4. Quando `geradorTipo` é `avulso`, `geradorId` é nulo; nos demais casos, não é nulo
5. `competencia` é o mês da data prevista **antes** do ajuste de fim de semana

A invariante 2 merece destaque: um pagamento sem valor ou um valor sem data é um estado meio-registrado que corromperia a curva. A invariante 5 é o que mantém a chave de sobreposição estável quando uma regra de dia 31 com `posterga` escorrega para o primeiro dia do mês seguinte.

**Chave de sobreposição**: `(geradorTipo, geradorId, competencia)`. Única para ocorrências não avulsas.

---

## Entidade: AncoraSaldo

| Atributo | Tipo | Descrição |
|---|---|---|
| `id` | texto | |
| `data` | `DataISO` | |
| `saldoCentavos` | `Centavos` | Pode ser negativo |

**Invariantes**

1. `data` não é futura em relação à data corrente
2. `saldoCentavos` é inteiro

**Relacionamento**: a âncora vigente é a de maior `data` que não ultrapassa a data corrente.

---

## Estrutura Derivada: OcorrenciaResolvida

Não é persistida. É o resultado da combinação entre ocorrências virtuais e reais.

| Atributo | Tipo | Descrição |
|---|---|---|
| `chave` | texto | Chave de sobreposição |
| `origem` | `virtual` \| `real` | |
| `situacao` | `previsto` \| `pago` \| `ignorado` \| `atrasado` | Derivada |
| `ehComponenteDeFatura` | booleano | Verdadeiro para parcela vinculada a cartão |
| `numeroParcela` | inteiro \| nulo | Preenchido para ocorrências de parcelamento |
| demais campos | | Espelham `Ocorrencia` |

`situacao` é sempre derivada, nunca armazenada — armazená-la criaria a possibilidade de divergir do estado real.

---

## Diagrama de Relacionamentos

```
   Regra 1 ------ 0..N ------> Ocorrencia
                                   ^
   Parcelamento 1 -- 1..N ---------+
        |                          |
        | 0..1                     |
        v                          |
     Cartao 1 ------ 0..N ---------+
                                   
   AncoraSaldo (independente, consumida pela projecao)
```

Uma parcela vinculada a cartão contribui para a fatura **daquele** cartão, e não gera ocorrência de saída própria — é a relação que impede a dupla contagem.

---

## Propriedades Testáveis das Entidades (PBT-01)

| Propriedade | Categoria | Enunciado |
|---|---|---|
| PROP-E01 | Invariante | Toda entidade construída por um gerador válido satisfaz todas as suas invariantes |
| PROP-E02 | Invariante | `valorPrevistoCentavos` de qualquer ocorrência gerada é sempre inteiro e maior que zero |
| PROP-E03 | Invariante | `dataPagamento` e `valorPagoCentavos` são simultaneamente nulos ou simultaneamente preenchidos, em qualquer sequência de operações |
| PROP-E04 | Invariante | A chave de sobreposição de uma ocorrência não avulsa é única dentro de um conjunto gerado |
| PROP-E05 | Ida e volta | Serializar e desserializar qualquer entidade devolve valor igual ao original |

Os geradores necessários — para `Regra`, `Parcelamento`, `Cartao`, `Ocorrencia`, `AncoraSaldo`, `Competencia` e `DataISO` — respeitam essas invariantes por construção, conforme exige PBT-07. Ficam em `src/test-support/` e são compartilhados entre unidades.
