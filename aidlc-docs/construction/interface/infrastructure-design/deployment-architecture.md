# Arquitetura de Implantação — Unidade 3 (`interface`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

---

## Topologia

```
    Desenvolvedor
         |
         | git push origin main
         v
    +----------------------------+
    |  GitHub — repositorio      |
    |  publico do projeto        |
    +----------------------------+
         |
         | dispara
         v
    +----------------------------+
    |  GitHub Actions            |
    |   1. npm ci                |
    |   2. npm run verify        |   <- lint, tipos, 294 testes, audit
    |   3. npm run build         |
    |   4. upload do artefato    |
    +----------------------------+
         |
         | falhou? nada e publicado
         v
    +----------------------------+
    |  GitHub Pages (CDN, HTTPS) |
    |  usuario.github.io/        |
    |         finance-control/   |
    +----------------------------+
         |
         | primeira visita pelo Safari
         v
    +----------------------------+
    |  iPhone                    |
    |   - Adicionar a Tela de    |
    |     Inicio                 |
    |   - Service worker         |
    |     pre-cacheia tudo       |
    |   - IndexedDB local        |
    +----------------------------+

    A partir daqui o app funciona sem rede.
    NENHUM dado do usuario retorna ao servidor.
```

A última linha é a propriedade central da arquitetura: o fluxo é unidirecional. Código desce, dado nenhum sobe.

---

## Pipeline

| Etapa | Comando | Falha significa |
|---|---|---|
| Instalar | `npm ci` | Arquivo de lock inconsistente |
| Verificar | `npm run verify` | Lint, tipos, testes ou vulnerabilidade |
| Construir | `npm run build` | Erro de compilação ou de configuração do PWA |
| Publicar | Ação oficial do Pages | Falha de permissão ou configuração |

**A verificação precede a publicação.** Uma vulnerabilidade de severidade alta em dependência interrompe o pipeline, e nada é publicado — que é exatamente o que faltava quando o `npm audit` dependia de execução manual.

---

## Configuração do Caminho Base

Três lugares precisam do mesmo valor. Divergência entre eles quebra o app **silenciosamente**, sem erro visível.

| Onde | Valor |
|---|---|
| `vite.config.ts` | `base: '/finance-control/'` |
| Manifesto | `start_url` e `scope` com o caminho |
| Service worker | Escopo derivado do mesmo base |

**Modo típico de falha**: o service worker registra na raiz do domínio, não encontra os ativos pré-cacheados e o app abre em branco **depois de instalado** — funcionando na primeira visita pelo Safari e falhando quando aberto pelo ícone. É o tipo de defeito que só aparece no aparelho real.

Por isso a verificação em dispositivo entra no checklist manual do Build and Test.

---

## Instalação no iPhone

```
1. Abrir a URL no Safari (precisa ser o Safari; outros navegadores
   no iOS nao oferecem a opcao de instalar)
2. Botao de compartilhar -> "Adicionar a Tela de Inicio"
3. O icone aparece na tela; abrir por ele
4. O app abre em tela cheia, sem barra de endereco
5. Service worker pre-cacheia todos os ativos
6. A partir daqui, funciona offline
```

O passo 1 é a pegadinha mais comum: no iOS, apenas o Safari oferece "Adicionar à Tela de Início". Tentar pelo Chrome ou Firefox no iPhone não apresenta a opção.

---

## Ciclo de Atualização

```
1. Push para main -> pipeline -> Pages atualizado
2. Na proxima abertura, o service worker detecta a versao nova
3. Faixa: "Nova versao disponivel - Atualizar"
4. Usuario confirma -> skipWaiting + recarrega
5. Usuario ignora   -> continua na versao atual
```

Os dados no IndexedDB **não são afetados** por atualização de código. Mudança de schema é tratada pelas migrações do Dexie, independentemente do ciclo de vida do service worker.

---

## Recuperação de Desastre

Não há backup no servidor, porque não há dado no servidor.

| Cenário | Recuperação |
|---|---|
| Publicação quebrada | Reverter o commit; o pipeline republica a versão anterior |
| Perda de dados no iPhone | Importar o último arquivo de backup |
| Troca de aparelho | Instalar no novo e importar o backup |
| Repositório perdido | O código está no seu clone local; os dados nunca dependeram dele |

**O único dado insubstituível é o do usuário, e a única proteção dele é o backup manual.** Nenhuma decisão de infraestrutura muda isso — motivo pelo qual o backup foi tratado como funcionalidade de primeira classe desde o documento de design, e não como um botão escondido nos ajustes.

---

## Custos

| Item | Custo |
|---|---|
| Repositório público | Zero |
| GitHub Pages | Zero |
| GitHub Actions em repositório público | Zero |
| Domínio | Zero, usando `github.io` |
| **Total** | **Zero** |

Coerente com a decisão do brainstorming: sem servidor, sem conta, sem custo recorrente.
