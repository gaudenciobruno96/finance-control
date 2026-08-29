# Servidor MCP remoto

Servidor MCP hospedado, alcançado pela infraestrutura da Anthropic quando você
pergunta algo ao Claude — inclusive do celular, com seu computador desligado.

Estado atual: **spike**. A única ferramenta é `ping`. As ferramentas financeiras
chegam no Projeto 1.

Desenho: `docs/superpowers/specs/2026-08-28-mcp-remoto-spike-design.md`

## Variáveis de ambiente

| Variável | Conteúdo | Obrigatória |
|---|---|---|
| `FINANCE_MCP_SEGREDO` | Segredo do header `Authorization: Bearer <segredo>` | Sim — sem ela o processo não sobe |
| `FINANCE_MCP_HOST_PERMITIDO` | Hostname público do serviço, sem protocolo | Não, mas recomendada |
| `PORT` | Porta de escuta. O Railway define sozinho | Não (padrão 8080) — quando definida, precisa ser um inteiro positivo; qualquer outro valor impede o processo de subir |

**O servidor recusa subir sem `FINANCE_MCP_SEGREDO`**, de propósito: subir sem
segredo publicaria um endpoint aberto na internet com finanças pessoais atrás.
Não existe modo de desenvolvimento que dispense essa verificação.

Definir `FINANCE_MCP_HOST_PERMITIDO` é seguro: o hostname que o Railway usa
para o próprio healthcheck (`healthcheck.railway.app`) é incluído
automaticamente ao lado do domínio configurado, então a variável não derruba
o healthcheck do serviço.

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
npm run mcp:http
```

bash / POSIX:

```bash
FINANCE_MCP_SEGREDO=qualquer-coisa npm run mcp:http
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
