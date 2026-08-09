# Infrastructure Design — Unidade 3 (`interface`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

---

## Nota de Aplicabilidade

As categorias deste estágio — compute, mensageria, rede, observabilidade, multi-tenancy — pressupõem um sistema implantado em nuvem. **Este projeto é um site estático.** Não há servidor, banco gerenciado, fila, balanceador ou métrica a coletar.

| Categoria | Situação | Motivo |
|---|---|---|
| **Deployment Environment** | **Aplicável** | GitHub Pages |
| **Compute** | **N/A** | Não há computação no servidor. Todo processamento roda no iPhone do usuário |
| **Storage** | **N/A** | IndexedDB no dispositivo. Nenhum armazenamento gerenciado |
| **Messaging** | **N/A** | Processo único, sem trabalho assíncrono entre componentes |
| **Networking** | **Parcialmente aplicável** | Só o que a hospedagem estática oferece: HTTPS e domínio. Sem VPC, balanceador ou gateway |
| **Monitoring** | **N/A** | Nada a monitorar do lado do servidor. Telemetria no cliente é proibida por RNF-04 |
| **Shared Infrastructure** | **N/A** | Um usuário, um dispositivo. Não há isolamento de recursos a projetar |

Registrar o que não se aplica evita que uma revisão futura conclua que a infraestrutura foi esquecida.

---

## Decisões

| # | Decisão | Escolha |
|---|---|---|
| 1 | Repositório | **Público** — Pages gratuito |
| 2 | Tipo de site | **Repositório de projeto** — `usuario.github.io/finance-control` |
| 3 | Roteamento | **Hash router** — `/#/cadastros` |
| 4 | Publicação | **GitHub Actions** no push para `main` |

### Decisão 1 — Repositório público

GitHub Pages a partir de repositório privado exige plano pago. Em conta gratuita, a opção de publicar simplesmente não aparece.

**O código fica visível; os dados não.** O repositório contém apenas a aplicação — nenhum valor, nenhuma conta, nenhum lançamento. Os dados financeiros vivem exclusivamente no IndexedDB do iPhone e nunca são enviados a lugar algum (RNF-04). O arquivo de backup é gerado no dispositivo e vai para onde o usuário escolher, pela folha de compartilhamento do iOS.

### Decisão 2 — Repositório de projeto

Consome um repositório comum em vez do único site de usuário do GitHub.

**Consequência que precisa de atenção**: o app é servido de `/finance-control/`, não da raiz. Três lugares precisam refletir isso, e errar qualquer um quebra o app de forma silenciosa:

| Onde | Valor |
|---|---|
| `vite.config.ts` | `base: '/finance-control/'` |
| Manifesto | `start_url` e `scope` com o caminho base |
| Service worker | Escopo de pré-cache derivado do mesmo base |

O modo mais comum de falhar aqui é o service worker registrar na raiz, não encontrar os ativos e o app abrir em branco depois de instalado — sem erro visível.

### Decisão 3 — Hash router

URLs no formato `/#/cadastros`.

**Por quê**: hospedagem estática não reescreve rotas. Sem hash, abrir `/cadastros` diretamente devolveria 404, e a solução usual — copiar `index.html` como `404.html` — é um truque que depende do provedor e adiciona um passo frágil ao build.

O custo é a URL menos elegante, irrelevante num app instalado em tela cheia onde a barra de endereço nem aparece.

**O que se preserva**: o gesto de deslizar para voltar do iOS continua funcionando, porque o histórico do navegador é alimentado normalmente. Era a razão de termos escolhido `react-router` em vez de estado de aba.

### Decisão 4 — GitHub Actions

Um workflow executa `npm ci`, `npm run verify` e publica.

**Isto resolve uma limitação registrada anteriormente.** No NFR Requirements da Unidade 1 aceitamos `npm audit` manual, com a ressalva de que uma vulnerabilidade divulgada após a última publicação passaria despercebida. Com o `verify` no pipeline, nenhuma publicação acontece sem lint, tipos, 294 testes e varredura de vulnerabilidades — a verificação deixa de depender de lembrança.

---

## Segurança na Infraestrutura (SECURITY-04)

Tratamento completo da regra, incluindo o que **não** é alcançável.

| Cabeçalho | Situação |
|---|---|
| `Content-Security-Policy` | **Atendido por `<meta http-equiv>`** — política restritiva sem `unsafe-inline`, viabilizada pela escolha de CSS Modules |
| `X-Content-Type-Options: nosniff` | **Já aplicado pelo GitHub Pages** por padrão |
| `Strict-Transport-Security` | **Não alcançável** — ver abaixo |
| `X-Frame-Options` | **Não alcançável por meta**; ver mitigação |
| `Referrer-Policy` | **Atendido por `<meta name="referrer">`** |

### Limitações documentadas

O GitHub Pages **não permite cabeçalhos HTTP customizados**. Duas diretivas não funcionam na forma de meta tag:

**`Strict-Transport-Security`.** Mitigação parcial real: o domínio `github.io` está na lista de pré-carregamento de HSTS dos navegadores, o que significa que o Safari já se recusa a acessá-lo por HTTP antes mesmo da primeira requisição. O efeito prático da diretiva está presente, ainda que não por cabeçalho nosso.

**`X-Frame-Options` e `frame-ancestors`.** Não aplicáveis por meta. Mitigação: o app não tem sessão, não tem autenticação e não executa ação privilegiada a partir de um clique — não existe superfície de *clickjacking*. Um invasor que embutisse a página em um iframe veria uma aplicação vazia, porque os dados vivem no IndexedDB da origem real, inacessível ao iframe.

**Achado de conformidade**: SECURITY-04 fica **parcialmente atendido**, com as duas exceções documentadas acima e suas mitigações. Não é achado bloqueante: a limitação é da plataforma escolhida, o risco residual é analisado e desprezível para uma aplicação sem autenticação e sem dados no servidor.

Se um dia o HSTS próprio se tornar necessário, a saída é trocar a hospedagem por uma que permita cabeçalhos — Cloudflare Pages ou Netlify. Registrado como caminho conhecido, não como pendência.

---

## Ausência de Observabilidade

Não há monitoramento, log centralizado nem alertas. Isso não é lacuna:

- do lado do servidor não há o que observar — arquivos estáticos servidos por CDN;
- do lado do cliente, qualquer telemetria violaria RNF-04, que determina que nenhum dado do usuário trafega pela rede.

O diagnóstico de problemas se dá pelo console do navegador, em uso local. É a consequência coerente de um app cuja premissa é que nada sai do aparelho.
