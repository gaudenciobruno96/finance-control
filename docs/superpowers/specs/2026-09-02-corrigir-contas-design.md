# Corrigir contas que já existem

Três ferramentas para ajustar uma ocorrência sem apagá-la e recriá-la:
mudar valor ou vencimento, pular o mês, e registrar que só parte entrou.

Data: 2026-09-02

---

## O problema

Hoje o MCP só sabe criar e remover. Não há como corrigir nada.

Na sessão que originou esta spec o usuário tentou três coisas e nas três a
única saída foi apagar e recriar:

- mudar o valor de uma conta;
- mudar o dia de vencimento;
- tirar o mercado de um mês, mantendo a recorrência.

O terceiro caso é o mais claro. Uma conta de mercado de R$ 1.500 venceu sem
ser paga, virou "atrasada", e a regra que puxa vencidos para o presente
(RN-33) derrubou o saldo do dia em R$ 1.500. A resposta certa era pular
aquele mês. Sem ferramenta, a saída foi remover a recorrência inteira — o
mercado sumiu de todos os meses futuros, e a projeção ficou otimista.

## O que já existe

`src/services/payment-service.ts` tem cinco operações prontas e testadas que
o MCP nunca expôs:

| operação | o que faz |
|---|---|
| `ajustarValorPrevisto(o, valor)` | troca `valorPrevistoCentavos` |
| `adiarVencimento(o, data)` | troca `dataVencimento` |
| `ignorarNoMes(o)` | `ignorado: true`, e **limpa o pagamento** |
| `reativarNoMes(o)` | `ignorado: false` |
| `registrarParteAntecipada(o, parte)` | reduz o previsto pela parte, anota na observação |

Todas passam por `aplicar`, que busca a ocorrência pela chave e materializa
se ela ainda for virtual (RN-51, RN-52). Todas recebem uma
`OcorrenciaResolvida` — obtida da projeção pela chave de sobreposição,
exatamente como `marcar_pago` já faz.

Nenhuma depende do Dexie. Este projeto é ligar fios, não escrever regra nova.

## O que fica de fora, e por quê

**Editar a regra recorrente.** `editarRegra` existe, mas usa
`db.transaction` do Dexie e precisaria ser portada para Postgres. Além
disso carrega o conceito de escopo de vigência (`editarAPartirDe` versus
`editarDesdeSempre`, RN-13/RN-14): mudar o valor do aluguel a partir deste
mês não é a mesma coisa que reescrever os meses passados, que registram o
que de fato foi pago. Isso é um projeto próprio, com sua própria decisão de
produto sobre como o assistente escolhe o escopo.

Para a maioria dos casos do dia a dia, adiar o vencimento **daquele mês**
resolve sem tocar na regra.

## As três ferramentas

Cinco operações viram três ferramentas. O agrupamento é por **pergunta que o
usuário faz**, não por método do serviço: o servidor já tem catorze
ferramentas, e cada nome novo é mais uma chance de o assistente escolher
errado.

### `ajustar_conta(chave, valor?, vencimento?)`

*"Essa conta é outro valor"* e *"vou pagar mais tarde"* são a mesma pergunta:
corrigir os dados de uma conta que ainda não foi paga.

Ambos os campos são opcionais; pelo menos um é obrigatório. Chamar sem
nenhum é erro de usuário, não uma operação vazia bem-sucedida.

`valor` entra como texto e passa por `deEntradaUsuario`, como em toda
escrita de valor.

### `ignorar_conta(chave, ignorar)`

*"Esse mês não tem"* e *"voltou"*. Um booleano, não duas ferramentas —
`ignorarNoMes` e `reativarNoMes` são o mesmo botão em duas posições, e
separá-las obrigaria o assistente a distinguir duas ferramentas quase
homônimas.

### `registrar_parte(chave, valor)`

*"Veio só parte."* Reduz o que ainda falta e anota quanto já entrou, sem
tocar na regra — os próximos meses seguem no valor cheio.

O domínio já valida que a parte é positiva e menor que o previsto;
recebimento integral é um pagamento confirmado e vai por `marcar_pago`.

Sobre uma conta **já paga**, é recusado — pelo mesmo motivo de
`ajustar_conta`: reduzir o previsto de algo já pago não muda o valor
efetivo.

`registrarParteAntecipada` **sobrescreve** `observacao` com o texto do
adiantamento. Se a ocorrência já tinha observação, ela se perde. O recibo
avisa quando isso acontece, em vez de a pessoa descobrir depois.

## Três decisões

### Conta já paga recusa `ajustar_conta`

Ajustar o valor *previsto* de uma conta paga não muda nada visível: o valor
pago prevalece (RN-31). Quem pagou R$ 111 quando eram R$ 115 quer corrigir o
valor **pago**, e para isso `marcar_pago` já serve — é idempotente por
construção (RN-51), então chamá-lo de novo com o valor certo atualiza o mesmo
registro.

A recusa nomeia essa saída. Aceitar em silêncio uma operação que não muda
número nenhum seria pior que recusar.

Ajustar o **vencimento** de uma conta paga também é recusado, pelo mesmo
motivo: a data que importa numa conta paga é `dataPagamento`, e mover o
vencimento não a alcança.

### Ignorar uma conta paga apaga o pagamento

`ignorarNoMes` limpa `dataPagamento` e `valorPagoCentavos` junto com o flag.
É coerente — "esse mês não teve" — mas destrói um registro que a pessoa pode
não querer perder.

A operação continua permitida: às vezes é exatamente o que se quer, e
recusá-la deixaria sem saída quem marcou pago por engano. Mas o recibo diz,
em texto, que o pagamento registrado foi apagado, com o valor que havia lá.

### Nenhuma das três entra no `desfazer`

Reverter um ajuste exigiria guardar o valor anterior, e não guardamos. Em
vez disso **o recibo mostra o valor antigo e o novo**, e desfazer é chamar de
novo com o antigo — que a pessoa acabou de ler.

`TipoDeEscrita` não ganha valores novos, como já foi decidido para
`declarar_saldo_estrangeiro`. Cada uma devolve seu próprio tipo de recibo.

Para `ignorar_conta` a reversão é trivial e a própria ferramenta a oferece:
inverter o booleano.

## O recibo

As três devolvem antes e depois, porque é o que substitui o `desfazer`:

```ts
export interface ReciboDeAjuste {
  readonly chave: string
  readonly nome: string
  readonly antes: string
  readonly depois: string
  readonly resumo: string
  readonly avisos: readonly string[]
}
```

`antes` e `depois` são textos já formatados — `"R$ 1.500,00"`,
`"2026-09-01"`, `"ativa"` — porque quem lê é uma pessoa, e o valor em
centavos não acrescenta nada aqui.

## Testes

Sobre Postgres, com as ferramentas reais:

- `ajustar_conta` muda o valor, e a projeção reflete;
- `ajustar_conta` muda o vencimento, e o item se move de dia na curva;
- `ajustar_conta` sem nenhum campo é recusado **sem gravar**;
- `ajustar_conta` sobre conta paga é recusado **sem gravar**, e a mensagem
  nomeia `marcar_pago`;
- `ignorar_conta(true)` tira o item da projeção; `ignorar_conta(false)`
  devolve;
- ignorar uma conta **paga** limpa o pagamento e o recibo avisa, com o valor
  que foi apagado;
- `registrar_parte` reduz o previsto e o mês seguinte continua no valor
  cheio — a garantia de que a regra não foi tocada;
- `registrar_parte` com valor maior ou igual ao previsto é recusado;
- cada uma materializa uma ocorrência virtual (RN-52), e chamá-la duas vezes
  não cria duas linhas (RN-51).

O caso do mercado, ponta a ponta: uma recorrente vencida e não paga derruba
o saldo; `ignorar_conta` naquele mês devolve o saldo; o mês seguinte segue
prevendo a conta.

## Fora de escopo

Histórico de alterações. O recibo mostra o anterior no momento da mudança;
guardar a trilha é outro projeto.

Ajustar o valor **pago** por caminho próprio — `marcar_pago` já faz.

A remoção do PWA, que continua sendo o Projeto 3.
