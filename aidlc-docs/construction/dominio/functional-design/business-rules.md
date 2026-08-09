# Regras de Negócio — Unidade 1 (`dominio`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

---

## Aritmética Monetária

### RN-01 · Dinheiro é inteiro em centavos
Todo valor monetário é inteiro. Qualquer operação que receba valor fracionário rejeita a entrada lançando erro.

**Motivo**: `0.1 + 0.2` em ponto flutuante resulta em `0.30000000000000004`. Acumulado ao longo de meses de projeção, isso produz centavos fantasma num app cuja função é dizer se o dinheiro dá.

### RN-02 · Soma e subtração são exatas
A soma de um conjunto de centavos é a soma inteira, sem arredondamento em nenhuma etapa.

### RN-03 · Multiplicação só por inteiro
Valor de parcela multiplica-se apenas por quantidade inteira. Não existe multiplicação por fração no domínio — não há juros compostos, percentuais nem rateio.

---

## Aritmética de Calendário

### RN-04 · Datas nunca passam por conversão de fuso
Toda operação de data é aritmética de calendário sobre o texto `AAAA-MM-DD`. Conversão para tipo de data nativo com semântica UTC é proibida.

### RN-05 · Dia inexistente trunca no último dia do mês
Uma regra de dia 31 vence em 28 de fevereiro (29 em ano bissexto), 30 de abril, 30 de junho. **Nunca transborda** para o mês seguinte.

### RN-06 · Ajuste de fim de semana é aplicado após a construção da data
A ordem é: construir a data pelo dia da regra, truncar se necessário (RN-05), então aplicar o ajuste.

- `antecipa`: sábado retrocede 1 dia, domingo retrocede 2
- `posterga`: sábado avança 2 dias, domingo avança 1
- `nenhum`: mantém

### RN-07 · O ajuste pode atravessar a fronteira do mês
`posterga` sobre 31 de maio (sábado) resulta em 2 de junho. Isso é permitido e não altera a competência (RN-08).

### RN-08 · A competência é determinada antes do ajuste
A competência de uma ocorrência é o mês da data prevista **antes** de aplicar o ajuste de fim de semana.

**Motivo**: sem essa regra, uma ocorrência de maio que escorrega para junho mudaria de competência, a chave de sobreposição mudaria junto, e um item já marcado como pago reapareceria como pendente no mês seguinte. É um bug silencioso e destrutivo.

### RN-09 · Padrão de ajuste sugerido por tipo de movimento
Ao criar uma regra, o valor inicial sugerido é `antecipa` para entrada e `posterga` para saída. É apenas sugestão: o campo permanece editável por regra.

### RN-10 · Feriados não são considerados
Somente sábados e domingos. O erro resultante é de um a dois dias na data prevista, jamais no valor, e o usuário pode adiar manualmente a ocorrência afetada.

---

## Expansão de Regras

### RN-11 · Uma ocorrência por competência vigente
Uma regra produz exatamente uma ocorrência virtual por competência dentro de sua vigência e do intervalo consultado.

### RN-12 · Vigência é fechada nas duas pontas
A regra vale de `vigenteDe` até `vigenteAte`, ambas inclusive. `vigenteAte` nulo significa vigência indefinida.

### RN-13 · Edição com escopo "a partir deste mês" versiona
Encerra a regra atual com `vigenteAte` igual à competência anterior e cria uma nova a partir da competência escolhida. As duas gravações são atômicas.

**Motivo**: é o que impede um reajuste de aluguel de reescrever o histórico de meses já pagos.

### RN-14 · Edição com escopo "desde sempre" altera em lugar
Altera a regra existente. Ocorrências **já materializadas não são tocadas** — quem já foi pago permanece com o valor pago.

### RN-15 · Não pode haver duas regras da mesma linhagem vigentes na mesma competência
Consequência de RN-13. Verificada como propriedade.

---

## Parcelamentos

### RN-16 · Uma ocorrência por parcela
Um parcelamento de N vezes produz exatamente N ocorrências, numeradas de 1 a N, com vencimentos mensais a partir do primeiro.

### RN-17 · Os vencimentos das parcelas seguem RN-05
Parcela cujo dia não existe no mês trunca no último dia.

### RN-18 · Parcela vinculada a cartão não gera saída própria
Quando `cartaoId` não é nulo, a ocorrência é marcada como componente de fatura e **não** entra na lista de saídas nem na curva de saldo por si só. Ela entra apenas somada na fatura do cartão.

**Motivo**: é a única barreira contra contar o mesmo dinheiro duas vezes — uma na parcela, outra dentro da fatura.

---

## Fatura de Cartão

### RN-19 · Fatura estimada é a soma de parcelas mais gasto típico
```
faturaEstimada(cartao, competencia) =
    soma das parcelas com cartaoId = cartao na competencia
  + gastoMensalTipico do cartao
```

### RN-20 · Fatura confirmada substitui integralmente a estimativa
Quando o usuário informa o valor real, ele **substitui** a estimativa. Nada é somado — a fatura verdadeira já contém as parcelas.

### RN-21 · Vencimento da fatura
A fatura da competência vence no `diaVencimento` daquela competência, truncado por RN-05. Quando `diaVencimento` é anterior a `diaFechamento`, o vencimento ocorre no mês seguinte ao fechamento.

### RN-22 · A data de compra não é modelada
O usuário cadastra parcelamentos usando as datas de **vencimento das faturas**, não as datas das compras. Consequência direta de não haver lançamento compra a compra.

### RN-23 · Fatura de valor zero é suprimida da listagem
Cartão sem parcelas na competência e com gasto típico zero não gera linha na lista do mês.

### RN-24 · A supressão vale apenas para a listagem
O cadastro de cartões continua permitindo informar o valor real da fatura de qualquer competência, inclusive uma que fora estimada como zero. Sem essa ressalva, RN-23 tornaria impossível confirmar uma fatura que o app subestimou.

---

## Resolução de Ocorrências

### RN-25 · Ocorrência real sobrepõe a virtual
Havendo ocorrência real com a mesma chave `(geradorTipo, geradorId, competencia)`, a virtual é descartada.

### RN-26 · Ocorrências avulsas entram sempre
Não têm virtual correspondente e nunca são sobrepostas.

### RN-27 · A resolução é idempotente
Resolver duas vezes o mesmo conjunto produz resultado idêntico.

### RN-42 · Ocorrência real órfã continua aparecendo
Uma ocorrência real cuja virtual não existe mais — porque a regra, o parcelamento ou o cartão que a gerou foi removido, ou porque a vigência da regra foi encurtada — **permanece no resultado da resolução**.

**Motivo**: é dado registrado pelo usuário. O aluguel de julho que ele pagou não pode desaparecer do histórico só porque a regra deixou de existir.

**Origem**: regra acrescentada durante o Functional Design da Unidade 2, ao decidir que remover uma regra preserva as ocorrências já materializadas. A implementação original do resolvedor alcançava apenas as reais com virtual correspondente, e as órfãs sumiam silenciosamente.

### RN-28 · Situação é derivada, nunca armazenada
```
ignorado                                   -> ignorado
dataPagamento preenchida                   -> pago
vencimento anterior a hoje, sem pagamento  -> atrasado
demais casos                               -> previsto
```

---

## Projeção de Saldo

### RN-29 · A projeção parte da âncora vigente
Âncora vigente é a de maior data que não ultrapassa a data corrente.

### RN-30 · Sem âncora, a projeção parte de zero e sinaliza
A curva é calculada partindo de saldo zero, e o resultado carrega uma marcação de que o saldo é **relativo**. A forma da curva e o dia de saldo mínimo permanecem corretos; apenas o nível está deslocado.

### RN-31 · Item pago entra pela data e pelo valor efetivos
Não pela data de vencimento nem pelo valor previsto. O dinheiro saiu quando saiu e no montante em que saiu.

### RN-32 · Item pago anterior à âncora é ignorado
Presume-se já refletido no saldo declarado. Contá-lo de novo seria contagem dupla.

### RN-33 · Item vencido e não pago é empurrado para o dia da âncora
Não é ignorado nem deixado no passado. A dívida existe e precisa afundar o saldo de hoje.

### RN-34 · A busca por atrasados recua 12 meses
Contas não pagas com vencimento anterior a 12 meses não são mais empurradas para hoje.

**Nota**: isso limita apenas a busca por atrasados. A navegação a meses anteriores continua livre e cada mês exibe seus próprios itens normalmente.

### RN-35 · Item ignorado não afeta a curva
Nem como previsto, nem como atrasado.

### RN-36 · O dia de saldo mínimo é o primeiro em caso de empate
Havendo dois dias com o mesmo saldo mínimo, o mais cedo é o destacado — é o momento em que o aperto começa.

---

## Estimativa de Contas Variáveis

### RN-37 · Média dos últimos pagos é apenas sugestão
Para regra com `valorEhEstimativa` verdadeiro, o domínio calcula a média dos valores efetivamente pagos nos últimos três meses. O resultado é **sugestão** — o valor previsto só muda por ação explícita do usuário.

### RN-38 · A média exige amostra suficiente
Havendo menos de três ocorrências pagas no período, a função devolve nulo e nenhuma sugestão é apresentada.

### RN-39 · A média usa o valor pago, não o previsto
O que interessa é o que a conta de luz realmente custou, não o que se esperava que custasse.

---

## Validação e Erros

### RN-40 · Funções de domínio rejeitam entrada inválida lançando
Não devolvem valores de erro nem valores especiais. Entrada inválida é defeito de programação, não fluxo de negócio.

### RN-41 · Não há estado parcial
Uma função de domínio devolve resultado completo ou lança. Nunca devolve resultado parcialmente calculado.

---

## Rastreabilidade

| Regra | Requisito |
|---|---|
| RN-01 a RN-03 | RNF-08 |
| RN-04, RN-07 | RNF-09 |
| RN-05 | RNF-10 |
| RN-08 | RNF-11 |
| RN-06, RN-09, RN-10 | RF-02 |
| RN-11, RN-12 | RF-05, RF-06 |
| RN-13 a RN-15 | RF-19, RF-20, RF-21 |
| RN-16 a RN-18 | RF-08, RF-10 |
| RN-19 a RN-24 | RF-09, RF-11, RF-12 |
| RN-25 a RN-28 | RF-16, RF-17, RF-18, RF-24 |
| RN-29 a RN-36 | RF-22, RF-23, RF-27 |
| RN-37 a RN-39 | RF-06 |
| RN-40, RN-41 | RNF-25 |
