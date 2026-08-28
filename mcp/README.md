# MCP de consulta financeira

Servidor MCP somente-leitura sobre o orçamento. Permite perguntar em linguagem
natural o que o app responde em tela, mais o que ele não responde: comparação
entre meses e simulação de cenário.

Desenho e justificativas: `docs/superpowers/specs/2026-08-28-mcp-consulta-financeira-design.md`

## Como funciona

O servidor baixa o backup JSON do repositório privado do GitHub, escreve num
banco Dexie volátil sobre `fake-indexeddb` e monta os mesmos serviços do PWA.
Nenhuma regra de cálculo é reimplementada: um valor devolvido aqui vem do mesmo
`projetarCurva` que desenha a tela.

O banco morre com o processo e não existe função que escreva no GitHub. Ser
somente-leitura é estrutural, não uma promessa.

## Configuração

| Variável | Conteúdo |
|---|---|
| `FINANCE_GITHUB_TOKEN` | Token fine-grained, escopo `Contents: Read`, restrito ao repositório do backup |
| `FINANCE_GITHUB_REPO` | `usuario/repositorio` |
| `FINANCE_BACKUP_PATH` | Caminho do arquivo dentro do repositório |

**Gere um token separado do que o app usa.** O do app tem permissão de escrita;
se o token do MCP vazar, o histórico continua intacto.

## Registro

```bash
claude mcp add financas \
  --env FINANCE_GITHUB_TOKEN=... \
  --env FINANCE_GITHUB_REPO=usuario/repo \
  --env FINANCE_BACKUP_PATH=caminho/backup.json \
  -- npx tsx /caminho/absoluto/mcp/server.ts
```

## Ferramentas

| Ferramenta | Responde |
|---|---|
| `situacao_do_mes` | Quanto sobra, o que falta pagar e entrar, em que dia o saldo chega ao mínimo |
| `o_que_vence` | O que vence numa janela de dias, e o que já está atrasado |
| `historico_de_gastos` | Quanto foi pago por nome nos últimos meses, com série mensal |
| `simular_cenario` | O efeito de gastos hipotéticos, mês a mês, com e sem eles |

Todo valor sai em dois campos: `valorCentavos` (inteiro) e `valor` (`"R$ 1.234,56"`).

## Limitações

**Só leitura.** Lançar gasto e marcar conta como paga continua sendo no app.
Escrever exigiria resolver a sincronização entre dois donos do mesmo estado, e o
PWA é dono do IndexedDB que este servidor não alcança.

**Os dados são os do último backup.** Se o app não sincronizou desde a última
mudança, o servidor lê o estado anterior.

**Sem âncora de saldo, os valores são relativos.** A forma da curva e o dia de
aperto continuam corretos, mas o nível está deslocado. `situacao_do_mes` sinaliza
isso em `saldoRelativo` e `avisoSaldoRelativo`.
