# Parcelamento e as consultas restantes

Completa o servidor MCP: a porta de entrada para compras parceladas e as três
ferramentas de consulta que faltavam, portadas do backup do GitHub para o
Postgres.

Este documento cobre o **Projeto 2** de uma sequência de quatro.

Data: 2026-08-30

---

## Onde estamos

O **Projeto 0** provou o caminho: um servidor MCP no Railway respondeu do
celular do usuário com o computador desligado. O **Projeto 1** trocou a
persistência para Postgres e entregou oito ferramentas, todas no ar:
`ping`, `situacao_do_mes`, `cadastrar_recorrente`, `lancar_avulso`,
`marcar_pago`, `declarar_saldo`, `desfazer` e `exportar`.

O domínio em `src/domain/` — 309 testes — atravessou a troca de banco sem uma
linha alterada, porque `Repositorios` é satisfeito estruturalmente.

## O quanto já existe

Este projeto é menor do que o nome sugere, e vale registrar por quê.

**Parcelamento já está no caminho da projeção.** A tabela `parcelamentos`
existe desde a primeira migração, o repositório existe com casos na suíte de
contrato, e `expandirParcelamentos` já roda dentro de `resolverIntervalo`. O
que falta é a porta de entrada.

**Duas das três consultas usam exatamente uma coisa cada.** `oQueVence` chama
`app.projecao.projetarMes`; `historicoDeGastos` chama
`app.projecao.resolverIntervalo`. O mesmo estreitamento estrutural que resolveu
`situacaoDoMes` no Projeto 1 — trocar `AppEmMemoria` por
`{ readonly projecao: ProjectionService }` — resolve as duas. Os testes
existentes, que montam `AppEmMemoria`, continuam passando sem alteração.

**`simularCenario` não muda em nada.** Ela recebe um `DocumentoBackup` e monta
dois bancos descartáveis com `criarAppDoBackup` — um com o cenário, outro sem.
`exportar(app)` já devolve exatamente esse documento. A adaptação vive no
servidor: exportar do Postgres e repassar.

Essa escolha preserva a propriedade que tornava a ferramenta segura: ela
escreve apenas em bancos que morrem no fim da chamada, e nunca alcança o
Postgres. A alternativa — simular dentro de uma transação revertida — escreveria
no banco real mesmo revertendo, e tornaria duas simulações concorrentes um
problema a resolver em vez de um caso impossível.

## Escopo

| Peça | Natureza |
|---|---|
| Estreitar o parâmetro de `oQueVence` e `historicoDeGastos` | Uma linha cada |
| Adaptar `simular_cenario` no servidor | Exportar do Postgres e repassar |
| `cadastrar_parcelamento` | Ferramenta nova, análoga a `cadastrar_recorrente` |
| `desfazer` com tipo `parcelamento` | Quinto valor em `TipoDeEscrita` |
| Registrar as quatro no servidor | Schemas e descrições |

## `cadastrar_parcelamento` recebe o valor da parcela, não o total

O domínio guarda `valorParcelaCentavos`. Pedir o total obrigaria alguém a
dividir, e divisão de dinheiro raramente é exata: 2.500 em 7x dá
357,142857… O modelo arredondaria, a soma não fecharia com o total informado, e
nada indicaria o problema.

Na prática a loja cobra seis parcelas de 357,14 e uma de 357,16 — o que o
domínio não modela de qualquer forma, já que `Parcelamento` tem um único
`valorParcelaCentavos`. A descrição da ferramenta instrui a usar **o valor da
parcela como aparece na fatura**.

É a mesma decisão do valor entrar como texto em vez de centavos: tirar
aritmética silenciosa das mãos do modelo.

O recibo mostra a parcela, a quantidade e o total resultante, para o usuário
conferir contra o que a loja informou.

Argumentos: `nome`, `valorParcela` (texto, como a pessoa fala),
`quantidadeParcelas` (inteiro) e `primeiroVencimento` (`AAAA-MM-DD`). Nenhum
campo de total — ele é derivado no recibo, nunca recebido.

`simular_cenario` recebe os mesmos argumentos de hoje — `lancamentos`, `ate` e
`hoje` opcional — e o servidor chama `exportar` antes de repassar. A assinatura
da ferramenta não muda; muda apenas quem monta o documento que ela consome.

## Desfazer um parcelamento não cascateia

`removerParcelamento` no domínio remove apenas o parcelamento; parcelas já
materializadas permanecem — o mesmo comportamento da regra recorrente (RN-46).

O resultado precisa dizer isso explicitamente, como já diz para a regra. Sem o
aviso, a pessoa conclui que apagou a compra inteira e continua vendo parcelas na
projeção, sem entender por quê.

`TipoDeEscrita` passa de quatro para cinco valores, com `'parcelamento'`
mapeado à tabela `parcelamentos` na auditoria da janela de 24 horas.

## Doze ferramentas, e o risco que isso cria

O servidor passa de oito para doze. Quanto mais ferramentas, mais o assistente
precisa escolher certo — e três delas respondem perguntas parecidas sobre
períodos.

As descrições precisam separar **qual pergunta cada uma responde**, não o que
cada uma faz:

| Ferramenta | A pergunta |
|---|---|
| `situacao_do_mes` | "Como estou este mês?" — o quadro completo de um mês |
| `o_que_vence` | "O que preciso pagar nos próximos dias?" — janela curta, cruza meses |
| `historico_de_gastos` | "Quanto gastei com isso?" — o passado já pago |
| `simular_cenario` | "Se eu assumir isso, atravesso?" — o futuro hipotético |

Uma escolha errada aqui é falha silenciosa: o assistente responde com confiança
a partir da ferramenta errada, e nada no resultado indica o engano.

## Testes

Cada consulta portada ganha um teste sobre Postgres provando que enxerga dados
gravados pelas ferramentas de escrita — não apenas que compila. O porte é de
uma linha; o risco é que ninguém verifique que a linha certa foi trocada.

`simular_cenario` ganha o teste que a troca de fonte torna necessário: gravar no
Postgres, simular um cenário, e provar que **o banco não mudou**. A garantia de
que a simulação não alcança os dados reais existia por construção quando a fonte
era um arquivo; agora que a fonte é o banco de produção, ela precisa ser
verificada.

`cadastrar_parcelamento` cobre: gravar e ler, recusar valor inválido sem gravar,
recusar quantidade de parcelas inválida sem gravar, e aparecer na projeção como
parcelas nos meses seguintes.

`desfazer` de parcelamento cobre: remover o parcelamento, **manter as
ocorrências já materializadas**, e avisar disso no resultado.

## Fora de escopo

A remoção do PWA, que é o Projeto 3.

Os achados que a revisão final do Projeto 1 parqueou continuam parqueados:
ordenar `porGerador`, o back-fill de `atualizado_em`, e separar o registro de
ferramentas de `servidor-http.ts`. O último ficará mais tentador com doze
ferramentas no arquivo, mas continua fora deste projeto.

## Um obstáculo já identificado para o Projeto 3

Registrado aqui porque este projeto o torna mais agudo: `Repositorios` é
declarado como `ReturnType<typeof criarRegraRepository>`, derivado da
implementação Dexie. Apagar `src/data/repositories.ts` apagaria o tipo que a
implementação Postgres afirma satisfazer, e a suíte de contrato perderia sua
segunda implementação no mesmo instante.

O Projeto 3 não é uma exclusão: é uma inversão — declarar `Repositorios` como
interface explícita em módulo próprio — e essa precisa ser sua primeira tarefa.
