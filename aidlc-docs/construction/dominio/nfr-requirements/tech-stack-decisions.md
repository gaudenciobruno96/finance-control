# Decisões de Tecnologia

**Fase**: CONSTRUCTION — Unidade 1 (`dominio`)
**Data**: 2026-08-08

> Decisões válidas para **todo o projeto**. As Unidades 2 e 3 as herdam.

---

## Quadro Consolidado

| Camada | Escolha | Decidido em |
|---|---|---|
| Linguagem | TypeScript, modo `strict` com `noUncheckedIndexedAccess` | Brainstorming e este estágio |
| Interface | React | Brainstorming |
| Build | Vite | Brainstorming |
| PWA | `vite-plugin-pwa` | Brainstorming |
| Persistência | Dexie sobre IndexedDB | Brainstorming |
| Reatividade | `dexie-react-hooks` | Application Design |
| Navegação | `react-router` | Application Design |
| Estilo | CSS Modules | Application Design |
| Gráfico | SVG próprio, sem biblioteca | Application Design |
| Testes | Vitest | Brainstorming |
| **Teste por propriedades** | **fast-check** | **Este estágio (PBT-09)** |
| Teste de interface | Testing Library | Brainstorming |
| Teste de persistência | `fake-indexeddb` | Brainstorming |
| Gerenciador de pacotes | **npm** | Este estágio |
| Alvo de plataforma | **iOS 16 e superior** | Este estágio |
| Hospedagem | GitHub Pages | Requirements Analysis |

---

## Seleção do Framework de PBT (PBT-09)

**Escolha: fast-check.**

A regra PBT-09 exige que o framework selecionado suporte quatro capacidades. Verificação:

| Exigência da regra | Situação |
|---|---|
| Geradores personalizados para tipos de domínio | Atendida — `fc.record`, `fc.constantFrom` e combinadores permitem construir geradores de `Regra`, `Ocorrencia`, `Cartao` e demais entidades respeitando as invariantes por construção |
| Redução automática do caso falho | Atendida — o *shrinking* é nativo e habilitado por padrão |
| Reprodutibilidade por semente | Atendida — a semente é aceita por configuração e reportada na falha |
| Integração com o executor de testes do projeto | Atendida — integra-se ao Vitest sem adaptador |

A própria regra PBT-09 indica fast-check como o framework para JavaScript e TypeScript. É também a única biblioteca madura de PBT no ecossistema TypeScript com shrinking e semente, o que torna a decisão pouco disputada.

### Configuração

| Parâmetro | Valor | Justificativa |
|---|---|---|
| Semente | Aleatória a cada execução | Explora casos novos continuamente. Uma semente fixa deixa de encontrar defeito após a primeira execução verde |
| Registro da semente | Sempre na saída de falha | Exigido por PBT-08; é o que torna qualquer falha reproduzível |
| Shrinking | Habilitado, sem sobreposição | Exigido por PBT-08 |
| Execuções por propriedade | Padrão da biblioteca | Adequado a funções puras rápidas; ajustável caso alguma propriedade se mostre lenta |

### Distinção entre as duas naturezas de teste (PBT-10)

| Sufixo | Natureza | Papel |
|---|---|---|
| `.test.ts` | Por exemplo | Fixa comportamento concreto com valor esperado explícito. Documentação executável |
| `.prop.test.ts` | Por propriedade | Verifica invariante sobre entradas geradas. Encontra o caso que ninguém pensou em escrever |

Nenhum caminho crítico de negócio terá apenas teste por propriedade. Os oito cenários listados em `business-logic-model.md` são obrigatoriamente cobertos por teste por exemplo.

### Geradores de domínio (PBT-07)

Ficam em `src/test-support/`, compartilhados entre as três unidades. Cada gerador produz entidade que satisfaz suas invariantes por construção — um gerador de `Regra` nunca emite `diaDoMes` igual a 0 ou 40, e nunca emite valor fracionário em centavos.

Geradores previstos: `Centavos`, `DataISO`, `Competencia`, `Regra`, `Parcelamento`, `Cartao`, `Ocorrencia`, `AncoraSaldo`, e um gerador de conjunto coerente que produz regras, parcelamentos, cartões e ocorrências mutuamente consistentes.

Este último é o que viabiliza as propriedades de projeção: testar a curva exige um estado inteiro coerente, não entidades avulsas.

---

## Gerenciador de Pacotes

**Escolha: npm.**

Acompanha o Node, sem ferramenta adicional a instalar. Produz `package-lock.json`, que satisfaz a exigência de travamento de versões de SECURITY-10.

pnpm e yarn oferecem instalação mais rápida e menor uso de disco — vantagem que não se paga num projeto individual com poucas dependências.

---

## Alvo de Plataforma

**Escolha: iOS 16 e superior.**

Cobre iPhone 8 em diante. Permite usar CSS e JavaScript modernos com menos transpilação, resultando em bundle menor.

Implicações verificadas:

| Recurso | Situação no alvo |
|---|---|
| Instalação na tela de início | Suportada bem antes do iOS 16 |
| Service worker e operação offline | Suportados |
| IndexedDB | Suportado |
| CSS Modules | Irrelevante ao alvo — compilado em build |
| `navigator.storage.persist()` | Disponibilidade variável; sempre chamado sob verificação, e o design nunca depende do resultado |
| Folha de compartilhamento do iOS para exportar | Disponível via `navigator.share`; alternativa por download quando ausente |

---

## Modo Estrito do TypeScript

**Escolha: `strict` mais `noUncheckedIndexedAccess`.**

`strict` é convenção consolidada. `noUncheckedIndexedAccess` merece justificativa por ser menos usual e por incomodar: ele obriga a tratar todo acesso indexado como possivelmente indefinido.

O domínio manipula arrays de datas e mapas de movimentos por dia. Sem essa opção, o TypeScript trata `curva[i]` como sempre definido; um índice fora de faixa produz `undefined` em tempo de execução, entra na aritmética monetária e propaga `NaN` por toda a curva de saldo. O compilador teria dado o aval a um saldo inválido.

O incômodo de escrever a verificação é o preço de o compilador impedir essa classe inteira de defeito.

---

## Dependências da Unidade 1

A Unidade 1 é código puro. Suas dependências de produção são **nenhuma**.

| Dependência | Escopo |
|---|---|
| typescript | desenvolvimento |
| vite | desenvolvimento |
| vitest | desenvolvimento |
| fast-check | desenvolvimento |
| eslint e plugin de fronteira de import | desenvolvimento |

Zero dependência de produção nesta unidade não é acidente: é a consequência prática de o domínio ser puro. Nada que a Unidade 1 faz precisa de biblioteca — aritmética de centavos e de calendário são código próprio, deliberadamente, porque é exatamente ali que as regras do negócio vivem.
