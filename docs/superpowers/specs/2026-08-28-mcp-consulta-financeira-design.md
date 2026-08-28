# MCP de consulta financeira

Servidor MCP que dá a um assistente de IA acesso somente-leitura ao orçamento,
reusando o domínio e os serviços do app sem duplicar uma linha de matemática.

Data: 2026-08-28

---

## Problema

O app responde bem à pergunta que ele foi feito para responder — atravesso o mês
sem ficar no vermelho, e em qual dia o aperto acontece. O que ele não faz é
responder pergunta aberta: quanto a luz subiu desde maio, se cabe parcelar uma
compra em seis vezes, o que vence nesta semana e já está atrasado.

Essas perguntas exigem quem leia os dados e raciocine sobre eles. Um servidor MCP
expõe o orçamento a um assistente sem que o assistente precise entender IndexedDB,
centavos ou aritmética de calendário.

## Por que não usar um MCP pronto

Foram avaliados os projetos públicos existentes:

| Projeto | O que é | Por que não serve |
|---|---|---|
| `etnperlong/firefly-iii-mcp`, `horsfallnathan/firefly-iii-mcp-server` | Wrapper sobre a API REST do Firefly III | Exigem rodar o Firefly III, um app completo em PHP + MySQL |
| Actual Budget MCP | 71 tools sobre o Actual Budget | Pressupõe o Actual como fonte da verdade |
| `Khushi-c-sharma/expense-tracker-mcp-server`, `shivamprasad1001/expense-mcp-server` | Python + FastMCP, storage próprio em JSON | Têm banco próprio. Criariam uma segunda fonte da verdade paralela ao PWA |

O padrão comum a todos é "sou dono dos dados" ou "falo com a API de quem é dono".
Este app não tem API e os dados vivem no IndexedDB do navegador.

Forkar qualquer um deles descartaria quase todo o código útil — o que sobra é
boilerplate do SDK — e ainda importaria um modelo de dados sem parcelamento, sem
âncora de saldo, sem ajuste de fim de semana e sem projeção de curva diária.

## Decisão central

Não reimplementar nada. Montar a aplicação inteira em memória, dentro do processo
do servidor MCP, a partir do backup que o app já envia ao GitHub.

```
Claude  --stdio-->  mcp/server.ts
                        |
                        | 1. baixa o DocumentoBackup JSON
                        v
                    api.github.com  (repositório privado, token só-leitura)
                        |
                        | 2. migrarDocumento() -> escrever(db, doc)
                        v
                    Dexie sobre fake-indexeddb  (banco volátil)
                        |
                        | 3. criarRepositorios(db) -> criarProjectionService(repos)
                        v
                    src/domain/ e src/services/ intactos
```

O passo 2 é o que torna isso barato. `fake-indexeddb` já é dependência de
desenvolvimento — é o que faz os 309 testes rodarem em Node — e
`src/test-support/app-harness.ts` já monta exatamente essa aplicação em memória.
O servidor MCP é o `criarHarness()` existente, alimentado pelo backup em vez de
começar vazio.

O que se ganha:

- Reuso de `src/domain/` **e** `src/services/`. Nenhuma linha de matemática
  duplicada. Um valor devolvido pelo MCP vem do mesmo `projetarCurva` que desenha
  a tela.
- `migrarDocumento()` já trata backup gravado por versão anterior do schema.
- Somente-leitura por construção, não por disciplina: o banco é volátil e não
  existe caminho de código que envie dados de volta ao GitHub.

Nenhum arquivo de `src/` é modificado.

Custos aceitos:

- `dexie` e `fake-indexeddb` passam a ser dependências de execução do servidor.
- Cada chamada paga download do backup e reconstrução do banco. Mitigado por cache
  em memória chaveado pelo SHA do arquivo remoto: SHA igual, banco reaproveitado.
- Exige um segundo token fine-grained, só-leitura. Não reusar o token de escrita do
  app: se o token do MCP vazar, o histórico continua intacto.

## Fonte de dados

O app grava o `DocumentoBackup` num repositório privado do GitHub a cada mudança
(`src/services/sync-service.ts`). O MCP lê esse mesmo arquivo pela API do GitHub.

Escolhido sobre arquivo local exportado porque o backup remoto está sempre atual,
inclusive quando o app foi usado no celular. Um arquivo local só é atual quando
alguém lembra de exportar.

Configuração por variáveis de ambiente, sem segredo versionado:

| Variável | Conteúdo |
|---|---|
| `FINANCE_GITHUB_TOKEN` | Token fine-grained, escopo `Contents: Read`, restrito ao repositório do backup |
| `FINANCE_GITHUB_REPO` | `usuario/repositorio` |
| `FINANCE_BACKUP_PATH` | Caminho do arquivo dentro do repositório |

Registro no cliente MCP via `claude mcp add`, passando essas variáveis.

## Ferramentas

### `situacao_do_mes`

Entrada: `competencia` (`AAAA-MM`, opcional, default mês corrente), `hoje` (opcional).

Devolve o `MesProjetado` enxugado: sobra, saldo na referência, totais de
falta-pagar, ainda-entra e já-resolvido, o dia de saldo mínimo com seu valor, e as
listas de pendências resumidas (nome, data, valor, situação).

Inclui a flag `saldoRelativo`, verdadeira quando não há âncora de saldo. Sem ela o
assistente afirmaria "você tem R$ X" quando o número representa apenas a forma da
curva, não o nível — o erro mais caro que esta ferramenta poderia cometer.

### `o_que_vence`

Entrada: `dias` (opcional, default 7), `hoje` (opcional).

Sai de `faltaPagar` e `aindaEntra` filtrados por data. Marca separadamente o que
está atrasado, respeitando a RN-90: entrada não confirmada não está atrasada, está
a confirmar. Atraso é vocabulário de dívida e vale apenas para saídas.

### `historico_de_gastos`

Entrada: `meses` (opcional, default 6), `nome` (opcional, todos por padrão),
`hoje` (opcional).

Única ferramenta com lógica nova: agrega ocorrências já resolvidas por nome e
competência, devolvendo total, média e a série mensal.
`mediaDosUltimosPagos` em `src/domain/estimation.ts` cobre parte do caminho.

Considera **apenas saídas**. Entradas recebidas ficam fora: misturar salário e
conta de luz numa mesma série produz um total que não significa nada.

### `simular_cenario`

Entrada: `lancamentos` (lista de regras, parcelamentos ou avulsos hipotéticos),
`ate` (competência limite), `hoje` (opcional).

Os lançamentos usam as formas de `Regra`, `Parcelamento` e `Ocorrencia` de
`src/domain/types.ts`, com o `id` gerado pelo servidor. Inventar um formato
próprio exigiria uma tradução que poderia divergir das invariantes já validadas
por `src/data/invariants.ts`.

Grava os lançamentos no banco em memória, reprojeta e devolve a comparação entre a
curva com e sem o cenário, indicando o mês e o dia do aperto em cada caso.

O banco volátil deixa de ser limitação e vira o recurso principal: escrever é
seguro porque nada disso alcança os dados reais.

**Invariante de implementação:** simulação sempre reconstrói um banco descartável
e nunca usa o banco em cache. Caso contrário um cenário contamina a consulta
seguinte.

## Decisões de formato

**Valor em dois campos.** Toda quantia sai como `valorCentavos` (inteiro, para
cálculo) e `valor` (`"R$ 1.234,56"`, para redação). Custa pouco e elimina a classe
de erro mais provável, que é o assistente ler `34000` como trinta e quatro mil
reais.

**`hoje` sempre opcional na entrada.** O domínio não lê o relógio do sistema — a
data corrente é parâmetro em todo lugar, e é isso que permite testar "a conta
venceu anteontem" sem manipular o relógio global. Manter a propriedade na fronteira
do MCP estende a mesma garantia aos testes das ferramentas.

## Estrutura de arquivos

```
mcp/
  server.ts            registro das ferramentas e transporte stdio
  fonte-github.ts      download do backup, cache por SHA
  app-em-memoria.ts    documento JSON -> Dexie/fake-indexeddb -> serviços
  formatacao.ts        centavos -> { valorCentavos, valor }
  tools/
    situacao-do-mes.ts
    o-que-vence.ts
    historico-de-gastos.ts
    simular-cenario.ts
  tsconfig.json        compilação separada; o Vite não enxerga esta pasta
  fixtures/            backups de exemplo para os testes
```

## Segurança

O token é fine-grained, escopo `Contents: Read`, restrito ao repositório do backup.
Três regras que vivem no código, não no README:

1. O servidor não possui função que faça `PUT` ou `POST` no GitHub. A
   impossibilidade é estrutural, não uma promessa de comportamento.
2. Nenhum valor monetário vai para `stderr` ou para log. Um erro registra a
   operação que falhou, nunca o dado que ela manipulava.
3. Token ausente não derruba o servidor no boot. Ele sobe e falha na primeira
   chamada de ferramenta com mensagem explícita — um erro de boot se perde no log
   do cliente MCP e leva a diagnóstico errado.

## Testes

O domínio tem 309 testes e não será retestado. A superfície nova é estreita e é
onde os defeitos vão morar:

| Alvo | Verificação |
|---|---|
| `app-em-memoria` | Um backup fixture reconstrói e os totais batem com o esperado. Um segundo fixture, de schema antigo, prova que `migrarDocumento` está no caminho |
| `formatacao` | Centavos para BRL, cobrindo negativo, zero, milhar e centavo quebrado |
| Cada ferramenta | Entrada conhecida produz saída conhecida. Inclui `saldoRelativo` verdadeiro num fixture sem âncora |
| `simular_cenario` | Simular duas vezes seguidas produz o mesmo resultado — o teste que detecta vazamento de estado entre simulações |

`npm run verify` passa a cobrir `mcp/`.

## Fronteira de camadas

O ESLint impõe `ui -> services -> data -> domain`. Como `mcp/` fica fora de `src/`,
precisa de regra própria: `mcp/` pode importar de `services`, `data` e `domain`;
nenhuma camada de `src/` pode importar de `mcp/`. Sem essa regra a fronteira que
protege o domínio fica com um buraco.

## Fora de escopo

**Escrita.** O MCP não lança gastos nem marca contas como pagas. Lançar continua
sendo no app. Escrever exigiria resolver de verdade a sincronização entre dois
donos do mesmo estado, e o PWA é dono do IndexedDB que o MCP não alcança. A versão
de leitura entrega a maior parte do valor sem abrir esse problema.

**Extração do domínio como pacote npm.** Versionamento e publicação são cerimônia
demais para um app pessoal com um único consumidor além do próprio app.
