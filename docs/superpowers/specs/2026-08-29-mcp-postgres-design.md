# MCP com Postgres — escrita por conversa

Troca a camada de persistência do IndexedDB para Postgres e dá ao servidor MCP
remoto as ferramentas de escrita que fazem dele um app utilizável — cadastrar,
lançar, pagar, declarar saldo — mais a consulta do mês.

Este documento cobre o **Projeto 1** de uma sequência de quatro.

Data: 2026-08-29

---

## Onde estamos

O **Projeto 0** está concluído e verificado: um servidor MCP remoto no Railway,
autenticado por header fixo comparado em tempo constante, respondeu a um `ping`
pedido do celular do usuário com o computador dele desligado. O connector vive
na conta do usuário e vale para celular, navegador e sessões de terminal ao
mesmo tempo.

O que existe hoje em `mcp/`:

| Arquivo | Papel |
|---|---|
| `auth.ts` | Conferência do header; SHA-256 antes do `timingSafeEqual`, não vaza valor nem comprimento |
| `servidor-http.ts` | Express, Streamable HTTP stateless, middleware de erro |
| `main-http.ts` | Ponto de entrada |
| `server.ts` | Servidor stdio antigo, lê backup do GitHub — morre no Projeto 3 |
| `tools/` | Quatro ferramentas de consulta sobre o app em memória |

## A descoberta que dimensiona este projeto

`criarProjectionService(repos)` depende de `Repositorios`, que é um conjunto de
cinco objetos com métodos definidos. **TypeScript é estrutural:** objetos com a
mesma forma, construídos sobre Postgres, satisfazem o tipo. Serviços e domínio
funcionam sem alteração.

```
mcp/tools/  ->  services/  ->  Repositorios  ->  [Dexie]     morre no Projeto 3
                    |               |
              não mudam         [Postgres]   <- só isto é novo
                    |
              src/domain/ (309 testes, intacto)
```

As invariantes de `src/data/invariants.ts` — `validarRegra`,
`validarParcelamento`, `validarOcorrencia`, `validarAncora` — são funções puras
e continuam sendo chamadas na escrita. São elas que impedem um `diaDoMes` 40 ou
um centavo fracionado de entrar, e não precisam saber que o banco mudou.

O que a camada nova precisa entregar, além do CRUD: `listarPorIntervalo` (a
consulta principal da projeção), `obterPorChave` (base da idempotência do
pagamento, RN-51), `porGerador` (insumo da estimativa, DOM-12) e `vigenteEm`
(a âncora de maior data que não ultrapassa a data pedida, RN-49).

## Esquema

Cinco tabelas espelhando os tipos do domínio: `regras`, `parcelamentos`,
`ocorrencias`, `ancoras`, `configuracoes`.

### Duas decisões de tipo SQL

**Dinheiro é `BIGINT`, nunca `NUMERIC`, `DECIMAL` ou `FLOAT`.** O domínio opera
em centavos como inteiro (RN-01). `NUMERIC` volta do driver como string ou como
float e reintroduz a classe de erro que a representação em centavos existe para
eliminar.

**Datas e competências são `TEXT`, nunca `DATE`.** O driver `pg` converte `DATE`
em `Date` do JavaScript aplicando fuso — exatamente o defeito que fez o projeto
tratar datas como texto desde o começo (RN-04). Um salário do dia 10 voltaria
como dia 9 às 21h. `TEXT` com `AAAA-MM-DD` e `AAAA-MM` mantém o que o domínio já
sabe manipular.

### Índices, e o que o banco passa a garantir

| Índice | Serve a | Ganho |
|---|---|---|
| `ocorrencias(competencia)` | `listarPorIntervalo` | Consulta principal da projeção |
| `ocorrencias(gerador_tipo, gerador_id, competencia)` UNIQUE | `obterPorChave` | A não-duplicação deixa de ser convenção do código e vira invariante do banco |
| `ocorrencias(gerador_tipo, gerador_id)` | `porGerador` | Histórico do gerador |
| `ancoras(data)` UNIQUE | `vigenteEm` | Elimina RN-50 na origem |

O `UNIQUE` em `ancoras(data)` merece nota. O comentário em
`src/data/repositories.ts` registra que a versão original mantinha duas âncoras
na mesma data e escolhia "a mais recente" por índice, o que desempatava por
UUID — corrigir um saldo digitado errado funcionava em cerca de metade das
vezes, sem nada indicar o problema. Com a restrição no banco, o salvar vira
`UPSERT` e o defeito não pode voltar.

Toda tabela ganha `criado_em TIMESTAMPTZ NOT NULL DEFAULT now()`, necessário
para a janela de `desfazer` e útil como trilha.

### Migrations

Arquivos SQL numerados, tabela de controle de versão, aplicados no boot sob
advisory lock do Postgres. O lock custa duas linhas e evita que dois processos
apliquem a mesma migration.

### Sem multi-usuário, explicitamente

Não há coluna de dono nem tabela de usuários. O segredo do header é toda a
autenticação e o banco tem um dono só. Compartilhar com outra pessoa seria
redesenho, não uma coluna a mais.

## As sete ferramentas

### Escrita

`cadastrar_recorrente` — salário, aluguel, luz. Cria uma `Regra`.
`lancar_avulso` — gasto ou entrada pontual. Cria uma `Ocorrencia` avulsa. Sem
data informada, usa a data corrente, que chega como parâmetro (RN-04).
`marcar_pago` — registra pagamento sobre uma ocorrência.
`declarar_saldo` — cria ou substitui a `AncoraSaldo` de uma data.

#### Como `marcar_pago` identifica a ocorrência

Este ponto é o menos óbvio do projeto, porque **a maior parte das ocorrências
não existe no banco.** As contas geradas por regra são virtuais até alguém
interagir com elas: o aluguel de setembro não é uma linha, é o resultado de
expandir uma regra sobre um intervalo.

`criarPaymentService(repos)` já resolve isso e não precisa ser reescrito.
`registrarPagamento` recebe uma `OcorrenciaResolvida`, busca o registro pela
chave de sobreposição e, se não existir, materializa um novo (RN-51). Tocar duas
vezes atualiza o mesmo registro em vez de criar dois lançamentos.

O que falta é a ponte: a ferramenta MCP não pode receber uma
`OcorrenciaResolvida` do modelo. Ela recebe a **chave de sobreposição** — texto
opaco, já presente na estrutura resolvida —, projeta o mês, localiza a ocorrência
correspondente e a entrega ao serviço.

Isso exige uma mudança em `mcp/formatacao.ts`: hoje `item()` remove `chave` e
`idReal` de propósito, para não vazar campos internos. A `chave` passa a ser
exposta, porque é o identificador que torna uma ocorrência referenciável entre
uma consulta e a escrita seguinte. `idReal` continua fora — é detalhe de
persistência e não referencia nada que o modelo precise.

Na prática, o assistente consulta o mês, recebe as pendências com suas chaves, e
usa a chave ao registrar o pagamento. Uma chave que não corresponde a nenhuma
ocorrência do intervalo faz a ferramenta recusar, em vez de materializar algo que
ninguém pediu.

### Utilidade

`desfazer` — reverte uma escrita recente.
`exportar` — devolve o estado completo no formato `DocumentoBackup`.

### Consulta

`situacao_do_mes` — portada do que já existe, agora sobre os repositórios
Postgres.

### O valor entra como texto, não como centavos

Se a ferramenta pedisse um inteiro em centavos, o modelo precisaria multiplicar
por 100, e errar isso por uma ordem de grandeza é silencioso e caro.
`deEntradaUsuario`, em `src/domain/money.ts`, já existe, já é testado, e aceita
`"80"`, `"80,00"`, `"1.234,56"` e `"1234.56"`. Entrada que não representa valor
faz a ferramenta recusar com mensagem clara, em vez de gravar lixo.

### Toda escrita devolve um recibo

Tipo, identificador e um resumo pronto para o assistente repetir —
`"Aluguel, R$ 1.800,00, todo dia 10, a partir de setembro/2026"`. O usuário
confere o que ficou gravado, não uma intenção que ainda vai ser executada.

Esta é a alternativa deliberada a confirmar antes de gravar. Confirmação prévia
custa duas interações em todo lançamento e tende a virar um "sim" automático,
que protege menos do que ver o resultado. O risco real não é o usuário não
perceber que gravou: é o modelo interpretar errado data, valor ou natureza — e
mostrar o registro final é o que expõe isso.

`declarar_saldo` recebe o recibo mais explícito de todos: errar um lançamento
afeta um item, errar a âncora desloca a curva inteira e todos os números
derivados dela.

### `desfazer` alcança apenas as últimas 24 horas

Desfazer algo de três meses atrás não é desfazer, é edição — e edição de
registro antigo deve ser explícita, nunca efeito colateral de uma ferramenta
chamada "desfazer". Sem o limite, `desfazer` seria `apagar_qualquer_coisa`, e um
identificador trocado apagaria história.

O significado difere por tipo, e isso é implementação, não detalhe:

A ferramenta recebe o par `{ tipo, id }` devolvido pelo recibo da escrita — o
mesmo par, sem tradução. O significado difere por tipo, e isso é implementação,
não detalhe:

| Desfazer | Efeito |
|---|---|
| Recorrente | Remove a regra. **Ocorrências já materializadas permanecem** (RN-46) — o recibo precisa dizer isso |
| Avulso | Remove a ocorrência |
| Pagamento | **Não apaga a conta, e não apaga o registro.** Delega a `desfazerPagamento`, que limpa `dataPagamento` e `valorPagoCentavos` mantendo o registro materializado (RN-53), porque ele pode carregar valor ajustado ou vencimento adiado |
| Saldo | Remove a âncora |

O caso do pagamento é o que mais erra numa primeira implementação, e erra de
duas formas: apagar a ocorrência inteira faz a conta sumir do mês, e apagar o
registro materializado descarta ajustes de valor ou de vencimento que o usuário
tenha feito antes de pagar. `criarPaymentService` já trata as duas — a ferramenta
delega em vez de reimplementar.

## Segurança

Tudo do Projeto 0 continua valendo: header obrigatório, 401 de corpo vazio,
nenhum segredo em log ou mensagem de erro.

**Uma classe nova: a `DATABASE_URL` contém a senha do banco.** Um erro do driver
`pg` pode carregá-la. A regra que já existe — nada derivado do corpo vai para
log — estende-se a ela: registra-se a classe do erro e o código do Postgres,
nunca a mensagem crua nem o objeto de erro. É a mesma família do `err.body` que
quase escapou no Projeto 0, e foi encontrado só na terceira rodada de revisão.

**O segredo `1234` precisa sair antes da primeira linha de dado real.** No
Projeto 0 não custava nada, porque não havia dado atrás dele.

## Testes

O domínio tem 309 testes e não é retestado. A superfície nova é a camada de
dados e as ferramentas.

**Postgres real em container, não simulado.** Existe biblioteca que finge ser
Postgres em memória e seria mais rápida, mas diverge do Postgres real
justamente em SQL — que é do que esta camada é feita. Com `testcontainers` o
container sobe uma vez por arquivo e os testes rodam contra o banco de verdade,
com os índices e as restrições reais, provando inclusive que a chave de
sobreposição duplicada é rejeitada pelo banco. Docker 29.6.2 está disponível na
máquina de desenvolvimento.

**Suíte de contrato entre implementações.** Os repositórios Dexie existem e são
testados. Os mesmos casos rodam contra as duas implementações: se `vigenteEm` ou
`listarPorIntervalo` divergirem, o teste acusa. É o que pega a diferença sutil,
a que só apareceria numa projeção errada meses depois. Os casos ficam em `mcp/`,
sem tocar em `src/`.

Cobertura adicional por ferramenta: recibo correto, entrada de valor inválida
recusada, `desfazer` respeitando a janela de 24 horas e a semântica por tipo,
`marcar_pago` idempotente por chave de sobreposição.

## Infraestrutura, já provisionada

| Item | Estado |
|---|---|
| Serviço `Postgres` no projeto `finance-mcp` | Criado |
| `DATABASE_URL` no serviço `mcp-remoto` | Referência `${{ Postgres.DATABASE_URL }}` |

A variável é referência, não cópia: o Railway a resolve no deploy, a senha nunca
transita fora dele, e rotacionar a credencial do banco não exige atualizar nada.

Duas pendências herdadas do Projeto 0, que entram como primeira tarefa do plano:

1. **Deploy contínuo não funciona.** O webhook do GitHub App não está
   autorizado; `git push` não redeploya. Os deploys acontecem apenas por chamada
   de reconexão via API.
2. **O segredo em produção é `1234`.**

## Fora de escopo

Parcelamento, as ferramentas de consulta restantes (`o_que_vence`,
`historico_de_gastos`, `simular_cenario`) e a remoção do PWA. Pertencem aos
Projetos 2 e 3.

**Confirmação prévia em duas chamadas** também sai de escopo, e não por
adiamento: foi substituída pelo recibo com desfazer, decisão registrada acima.
O Projeto 2 não precisa reintroduzi-la.
