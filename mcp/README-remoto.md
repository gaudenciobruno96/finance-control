# Servidor MCP remoto

Servidor MCP hospedado, alcançado pela infraestrutura da Anthropic quando você
pergunta algo ao Claude — inclusive do celular, com seu computador desligado.

Estado atual: **Projetos 1 e 2 implementados**. As dezesseis ferramentas
financeiras rodam sobre Postgres.

Desenho: `docs/superpowers/specs/2026-08-28-mcp-remoto-spike-design.md`

## Variáveis de ambiente

| Variável | Conteúdo | Obrigatória |
|---|---|---|
| `FINANCE_MCP_SEGREDO` | Segredo do header `Authorization: Bearer <segredo>` | Sim — sem ela o processo não sobe |
| `DATABASE_URL` | String de conexão do Postgres | Sim — sem ela o processo não sobe. No Railway é uma referência a `${{ Postgres.DATABASE_URL }}`; o valor contém a senha do banco, por isso nunca aparece em log |
| `FINANCE_MCP_HOST_PERMITIDO` | Hostname público do serviço, sem protocolo | Não, mas recomendada |
| `PORT` | Porta de escuta. O Railway define sozinho | Não (padrão 8080) — quando definida, precisa ser um inteiro positivo; qualquer outro valor impede o processo de subir |

**O servidor recusa subir sem `FINANCE_MCP_SEGREDO`**, de propósito: subir sem
segredo publicaria um endpoint aberto na internet com finanças pessoais atrás.
Não existe modo de desenvolvimento que dispense essa verificação.

**O servidor também recusa subir sem `DATABASE_URL`, e recusa subir se as
migrações de esquema falharem.** Um servidor no ar sobre um banco ausente ou
um esquema incompleto responderia errado em silêncio, que é pior do que não
responder. O pool de conexões e as migrações são montados uma única vez no
boot (`iniciar()`), não a cada requisição.

Definir `FINANCE_MCP_HOST_PERMITIDO` é seguro: o hostname que o Railway usa
para o próprio healthcheck (`healthcheck.railway.app`) é incluído
automaticamente ao lado do domínio configurado, então a variável não derruba
o healthcheck do serviço.

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `ping` | Verifica se o servidor está no ar |
| `situacao_do_mes` | Quanto sobra no mês, o que falta pagar e entrar, e o dia de saldo mínimo |
| `o_que_vence` | "O que preciso pagar nos próximos dias?" — janela curta a partir de hoje, mais o que já está atrasado |
| `historico_de_gastos` | "Quanto eu gastei com isso?" — o passado já pago, agregado por nome, nos últimos meses |
| `cadastrar_recorrente` | Cadastra um lançamento que se repete todo mês (salário, aluguel, conta de luz) |
| `lancar_avulso` | Registra um gasto ou entrada pontual, que não se repete |
| `marcar_pago` | Registra que uma conta foi paga ou um valor foi recebido |
| `ajustar_conta` | Corrige o valor ou o vencimento de uma conta ainda não paga |
| `ignorar_conta` | Tira uma conta da projeção deste mês, ou traz de volta |
| `registrar_parte` | Registra que parte do valor já entrou, reduzindo o que falta |
| `declarar_saldo` | Informa o saldo real da conta numa data — a âncora da projeção |
| `cadastrar_parcelamento` | Cadastra uma compra parcelada — o valor é o da parcela, nunca o total |
| `declarar_saldo_estrangeiro` | Quanto há em uma moeda estrangeira (não entra na projeção) |
| `patrimonio` | Quanto há no total, reais mais moedas estrangeiras convertidas |
| `simular_cenario` | "Se eu assumir esse gasto, atravesso os próximos meses?" — projeta lançamentos hipotéticos sem gravar nada |
| `desfazer` | Remove uma escrita de qualquer data (recorrente, avulso, pagamento, saldo, parcelamento) |
| `exportar` | Devolve todos os dados em JSON, no formato de backup |

## Endpoints

| Rota | Autenticação | Para quê |
|---|---|---|
| `GET /` | Nenhuma | Healthcheck do Railway. Não expõe dado algum, apenas um sinal de vida |
| `POST /mcp` | `Authorization: Bearer <segredo>` | O protocolo MCP |

Requisição sem o segredo recebe `401` com corpo vazio. Nada na resposta
distingue "header ausente" de "segredo errado".

## Rodar localmente

PowerShell (o shell padrão neste ambiente):

```powershell
$env:FINANCE_MCP_SEGREDO = "qualquer-coisa"
$env:DATABASE_URL = "postgres://postgres:local@localhost:5433/financas"
npm run mcp:http
```

bash / POSIX:

```bash
FINANCE_MCP_SEGREDO=qualquer-coisa DATABASE_URL=postgres://postgres:local@localhost:5433/financas npm run mcp:http
```

Para testar contra um Postgres descartável em container:

```bash
docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=local -e POSTGRES_DB=financas --name pg-local postgres:16-alpine
```

## Trocar o segredo

Gere um novo, atualize a variável no Railway, e atualize o connector no Claude.
Os dois precisam mudar juntos — enquanto divergirem, o connector recebe 401.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Deploy

Este repositório inclui `railway.json` na raiz, com o comando de start
(`npm run mcp:http`), o healthcheck (`GET /`) e uma política de reinício
limitada a 3 tentativas — sem isso, um serviço subindo sem o segredo entraria
em reinício infinito, transformando um erro de configuração numa conta de
consumo do Railway.

`build.buildCommand` é definido explicitamente como um comando sem efeito
(um `echo`). Sem isso, o Nixpacks detecta o script `build` do `package.json`
(`tsc --noEmit && vite build`) e o roda em todo deploy — construindo o PWA
inteiro, que este servidor nunca carrega e que o Projeto 3 apaga. Um erro de
tipo no frontend não deveria derrubar o deploy de um servidor que não usa o
frontend. O servidor roda direto do TypeScript via `tsx`
(`npm run mcp:http`), sem etapa de build própria.

`healthcheckTimeout` está em 120 segundos (o padrão do Railway é 300) — mais
folga que os 30 segundos originais, que eram justos demais para uma partida a
frio do Nixpacks.

Criar o serviço, definir as variáveis de ambiente, gerar o domínio público e
conectar o connector no claude.ai são passos manuais, feitos fora deste
repositório — não fazem parte do que este README automatiza.
