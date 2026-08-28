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
| `PORT` | Porta de escuta. O Railway define sozinho | Não (padrão 8080) |

**O servidor recusa subir sem `FINANCE_MCP_SEGREDO`**, de propósito: subir sem
segredo publicaria um endpoint aberto na internet com finanças pessoais atrás.
Não existe modo de desenvolvimento que dispense essa verificação.

## Endpoints

| Rota | Autenticação | Para quê |
|---|---|---|
| `GET /` | Nenhuma | Healthcheck do Railway. Devolve apenas um sinal de vida |
| `POST /mcp` | `Authorization: Bearer <segredo>` | O protocolo MCP |

Requisição sem o segredo recebe `401` com corpo vazio. Nada na resposta
distingue "header ausente" de "segredo errado".

## Rodar localmente

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

Criar o serviço, definir as variáveis de ambiente, gerar o domínio público e
conectar o connector no claude.ai são passos manuais, feitos fora deste
repositório — não fazem parte do que este README automatiza.
