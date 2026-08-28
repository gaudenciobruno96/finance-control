# MCP remoto — spike de viabilidade

Servidor MCP hospedado no Railway, conectado à conta Claude do usuário como
custom connector, acessível do celular sem nenhum computador ligado.

Este documento cobre o **Projeto 0** de uma sequência de quatro. Ele prova o
caminho e não entrega funcionalidade financeira.

Data: 2026-08-28

---

## A virada

O `finance-control` nasceu como PWA offline: os dados vivem no IndexedDB do
navegador e nunca saem do aparelho. Em cima dele foi construído um servidor MCP
somente-leitura que lê o backup do repositório privado do GitHub e reusa o
domínio e os serviços do app — está em `main`, com 63 testes.

O usuário decidiu mudar o destino do produto: **o Claude no celular passa a ser
a interface, e o app deixa de existir.** Não haverá tela, PWA nem IndexedDB. Um
Postgres no Railway vira a fonte da verdade, e o servidor MCP vira a única porta
de entrada e saída — o que implica que ele passa a escrever, não apenas a ler.

O usuário não tem dados a preservar: começa do zero. Não há migração.

### O que sobrevive

`src/domain/` inteiro. As 309 provas de matemática financeira não dependem de
tela nem de IndexedDB: centavos como inteiro, aritmética de calendário própria,
projeção de curva, expansão de parcelamento, versionamento de regra, RN-90. É o
ativo real do projeto e atravessa a virada intacto.

As quatro ferramentas de consulta também sobrevivem em forma; muda de onde leem.

`src/ui/` e `src/data/` (a camada Dexie) serão removidos no Projeto 3.

### O que o usuário aceita perder

Registrado porque foi decidido conscientemente, não por omissão:

- **Lançar por conversa erra em silêncio.** Um erro de digitação numa tela se vê;
  um erro de interpretação numa conversa entra no banco parecendo correto. O
  Projeto 2 mitiga com confirmação antes de gravar.
- **A visão de conjunto.** A tela do mês mostra a curva inteira de uma vez;
  conversando, vê-se o que se perguntou.
- **O acesso offline.** Sem internet ou sem Claude, os dados ficam inalcançáveis.

## Decomposição

| # | Entrega | Razão da ordem |
|---|---|---|
| **0** | Este spike: MCP remoto com uma ferramenta trivial, autenticado, testado do celular | Única incerteza real restante, e a mais barata de resolver |
| 1 | Postgres, camada de dados, cadastro de regras e a consulta do mês | Precisa incluir escrita: sem ela não há dado para ler |
| 2 | Vencimentos, histórico, simulação, e confirmação antes de gravar | Portar o que já existe, sobre a nova fonte |
| 3 | Remoção de `src/ui/` e `src/data/` | Por último: apagar antes de o substituto funcionar é apostar |

## Por que um spike primeiro

Todo o valor da mudança depende de uma coisa que ainda não foi verificada neste
projeto: que um servidor próprio, hospedado, apareça como connector na conta do
usuário e responda a perguntas feitas do celular.

Se esse caminho tiver um obstáculo — na autenticação, no transporte, no
comportamento do cliente — descobri-lo agora custa uma tarde. Descobri-lo depois
de modelar o banco e portar as ferramentas custa o projeto inteiro.

## O que se sabe do contrato de custom connectors

Levantado da documentação da Anthropic e do Model Context Protocol:

- Um custom connector é um servidor MCP remoto exposto por **Streamable HTTP**,
  numa URL HTTPS pública e estável.
- O Claude conecta **a partir da infraestrutura da Anthropic**, não do aparelho
  do usuário. É isso que faz funcionar com o computador desligado.
- Os modos de autenticação aceitos incluem `oauth_dcr`, `oauth_cimd`,
  `oauth_anthropic_creds`, `custom_connection`, `static_headers` e `none`.

**`static_headers` é o que torna este projeto barato.** Sem ele seria necessário
implementar um servidor de autorização OAuth 2.1 com PKCE S256 e Dynamic Client
Registration apenas para uso pessoal. Com ele, um header fixo com um segredo
forte basta.

Fontes:
- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers
- https://modelcontextprotocol.io/docs/develop/connect-remote-servers

## Escopo deste spike

Provar quatro coisas, e nada além:

1. O servidor sobe no Railway numa URL HTTPS estável.
2. Ele aparece como connector na conta Claude do usuário.
3. Uma pergunta feita **do celular** executa código do servidor.
4. Quem não tem o segredo é recusado.

## Arquitetura

```
Claude (celular)  --HTTPS-->  Railway  -->  mcp/servidor-http.ts
                                                  |
                                            middleware de auth
                                                  |
                                              tool: ping
```

O código vive dentro do `finance-control`, em `mcp/`, ao lado do servidor stdio
existente. **Não é código descartável:** é a fundação de transporte que o
Projeto 1 herda. O servidor stdio permanece intacto e é removido no Projeto 3,
junto com a fonte do GitHub que ele lê.

### Peças

| Arquivo | Responsabilidade |
|---|---|
| `mcp/servidor-http.ts` | Express e `StreamableHTTPServerTransport` do SDK, já instalado |
| `mcp/auth.ts` | Middleware que compara o header `Authorization` com o segredo |
| `mcp/auth.test.ts` | Testes do middleware |
| `mcp/servidor-http.test.ts` | Teste da ferramenta `ping` |

### A ferramenta

Uma só: **`ping`**. Devolve a string `pong`, o horário do servidor em ISO 8601
com fuso, e a versão lida de `package.json`.

O horário não é decoração: ele prova que o servidor executou código naquele
instante, e não devolveu uma resposta em cache em algum ponto do caminho. Este é
o único lugar de todo o projeto onde ler o relógio é o objetivo, e não um
descuido — nas ferramentas financeiras a data corrente entra sempre como
parâmetro (RN-04).

### Autenticação

Header `Authorization` no formato `Bearer <segredo>`, comparado contra a variável
de ambiente `FINANCE_MCP_SEGREDO` usando `timingSafeEqual`. Comparação ingênua
com `===` vaza o segredo caractere a caractere por diferença de tempo; a versão
correta custa três linhas.

O prefixo `Bearer ` é obrigatório e verificado: aceitar o segredo cru além da
forma com prefixo criaria dois caminhos de autenticação, e o segundo escaparia
de qualquer revisão futura por não estar documentado em lugar nenhum.

Requisição recusada responde **401 com corpo vazio**. Nenhuma mensagem distingue
"header ausente" de "segredo errado" — a distinção só serve a quem está
adivinhando.

`GET /` responde 200 sem autenticação, exclusivamente para o healthcheck do
Railway. Não expõe dado algum.

### Falhar no boot, ao contrário do servidor stdio

O servidor stdio existente sobe mesmo sem configuração e só falha na primeira
chamada de ferramenta — porque um erro de boot se perde no log do cliente MCP e
aparece apenas como "servidor indisponível", levando ao diagnóstico errado.

**Aqui a decisão é a oposta, e deliberadamente:** sem `FINANCE_MCP_SEGREDO`
definido, o processo não sobe. Subir sem segredo significaria publicar um
endpoint aberto na internet. Falhar ruidosamente é a única opção segura, e o log
do Railway é visível de qualquer forma.

Não existe modo de desenvolvimento que afrouxe essa verificação. Um caminho que
dispensa o segredo é um caminho que alguém vai acabar usando em produção.

## Testes

| Alvo | Verificação |
|---|---|
| `auth` | Recusa sem header; recusa com header errado; recusa com header vazio; aceita o correto |
| `auth` | Segredo ausente no ambiente faz o servidor falhar ao subir |
| `ping` | Responde `pong` com horário e versão |

Nada além disso. É um spike; a suíte cresce quando houver o que testar.

## Critério de sucesso

O usuário adiciona a URL do Railway em Configurações → Connectors no claude.ai,
informa o segredo, e obtém resposta ao pedir um ping **pelo celular, com o
computador desligado**.

Um teste que passa não é o critério: o critério é a resposta chegar no celular.

## Fora de escopo

Postgres, esquema de dados, ferramentas financeiras, escrita, confirmação antes
de gravar, remoção do PWA, OAuth. Tudo isso pertence aos Projetos 1 a 3 e só
começa depois de este caminho estar provado.
