# Controle Orçamentário Pessoal — Documento de Design

**Data:** 2026-08-08
**Status:** Aprovado
**Autor:** brainstorming colaborativo

---

## 1. Problema

Gerir o orçamento pessoal de alguém que recebe **múltiplos salários em datas diferentes do mês** e paga contas fixas, contas de valor variável, boletos avulsos, compras parceladas e fatura de cartão.

A pergunta que o app precisa responder é de **fluxo de caixa**, não de análise de consumo:

> Considerando tudo que ainda entra e tudo que ainda sai, eu atravesso o mês sem ficar no vermelho — e em qual dia o aperto acontece?

Ferramentas genéricas de finanças pessoais respondem "quanto gastei com transporte", que não é o problema aqui.

## 2. Escopo

### Dentro do escopo (v1)

- Salários recorrentes com dia fixo do mês e valor fixo, vários deles em datas diferentes
- Despesas fixas recorrentes (aluguel, assinaturas)
- Despesas recorrentes de valor variável (luz, água), com previsto ajustável
- Boletos avulsos e compras parceladas
- Fatura de cartão de crédito com estimativa e confirmação
- Registro de **data de vencimento** e **data de pagamento efetivo**, separadamente
- Resumo do mês e curva de saldo dia a dia
- Lista simples de compromissos dos próximos 12 meses
- Exportar e importar backup

### Fora do escopo (v1)

| Item | Motivo |
|---|---|
| Categorias e relatórios de gasto | O problema é fluxo de caixa. Categorias só rendem com lançamento compra a compra, descartado abaixo. |
| Lançamento de cartão compra a compra | Exige disciplina diária; o modelo de fatura + parcelamentos entrega a visibilidade necessária com uma fração do esforço. |
| Múltiplas contas bancárias com saldo próprio | Decisão do usuário: caixa único. Remove transferências e reconciliação por instituição. |
| Sincronização entre dispositivos, login, backend | Dados ficam só no iPhone. Sem servidor, sem custo, sem autenticação. |
| Importação de OFX/extrato bancário / open finance | Complexidade desproporcional para uso individual. |
| Calendário de feriados | Manter feriados nacionais e municipais atualizados é um projeto próprio; o erro resultante é de um a dois dias na data prevista, nunca no valor. Ajuste manual quando incomodar. |
| Projeção multi-mês com gráfico | A lista de 12 meses cobre a necessidade que os parcelamentos criam. |
| Notificações push | Não pedido. O aviso de vencimento vive dentro da tela inicial. |

## 3. Decisões estruturais

### 3.1 Plataforma: PWA instalado na tela de início do iOS

O usuário quer um app no iPhone sem passar pela App Store. As alternativas foram avaliadas:

| Opção | Veredito |
|---|---|
| **PWA** | **Escolhida.** Sem Mac, sem conta de desenvolvedor, sem loja, sem expiração. Instala pela opção "Adicionar à Tela de Início", abre em tela cheia e funciona offline. |
| Sideload (Xcode / AltStore) | Rejeitada. Exige Mac; com conta gratuita o app expira a cada 7 dias e precisa ser reinstalado. |
| TestFlight | Rejeitada. Exige conta paga de desenvolvedor e passa por revisão da Apple. |

Os arquivos são estáticos e precisam ser servidos por HTTPS (requisito de PWA), o que é atendido por hospedagem estática gratuita. **Os dados nunca saem do aparelho** — a hospedagem serve apenas o código.

### 3.2 Dados apenas locais, com backup manual

IndexedDB no dispositivo. Sem conta, sem nuvem, sem custo recorrente, funcionamento offline integral.

A contrapartida é explícita e desenhada de frente: dado que vive só no navegador pode ser perdido. Ver §7.

### 3.3 Recorrência: regras + exceções

A decisão arquitetural central. Três abordagens foram consideradas:

- **Materialização antecipada** — gerar N ocorrências concretas ao cadastrar a regra. Consulta trivial, mas exige regeneração periódica e cuidado para não reescrever o que já foi pago. Rejeitada.
- **Materialização preguiçosa** — gerar as ocorrências ao abrir o mês pela primeira vez. Faz o comportamento depender de quais meses foram visitados; editar uma regra afeta uns meses e não outros. Inconsistência invisível em app de dinheiro corrói a confiança. Rejeitada.
- **Regras + exceções** — **escolhida**. O banco guarda apenas as regras; as ocorrências do período são expandidas em tempo de leitura. Ao interagir com uma ocorrência, ela é materializada e sobrepõe a virtual.

O perfil de uso é exatamente o que essa forma modela: regras estáveis (salário dia fixo, aluguel dia fixo) com ajustes pontuais frequentes (a luz veio mais cara, paguei atrasado). Não há passo de manutenção, o banco permanece pequeno e um reajuste é uma edição só.

## 4. Modelo de dados

Princípio: **tudo que aparece na tela do mês é uma ocorrência.** Três geradores produzem ocorrências virtuais; um resolvedor as combina com as ocorrências reais.

**Competência** é o mês `AAAA-MM` ao qual a ocorrência pertence, determinado pela data prevista **antes** do ajuste de fim de semana. Assim, uma regra "dia 31 com `posterga`" cujo vencimento efetivo escorrega para o dia 1º do mês seguinte continua pertencendo à competência original, e sua chave de sobreposição permanece estável.

### 4.1 Geradores

**`Regra`** — recorrência mensal, cobre tanto entradas quanto saídas.

| Campo | Descrição |
|---|---|
| `id` | identificador |
| `tipo` | `entrada` \| `saida` |
| `nome` | rótulo exibido |
| `valorCentavos` | valor previsto |
| `valorEhEstimativa` | `true` para contas de valor variável (luz, água) |
| `diaDoMes` | 1–31 |
| `ajusteFimDeSemana` | `nenhum` \| `antecipa` \| `posterga` |
| `vigenteDe` | competência inicial `AAAA-MM` |
| `vigenteAte` | competência final `AAAA-MM` ou nulo |

**`Parcelamento`** — compra em N vezes ou carnê.

| Campo | Descrição |
|---|---|
| `id`, `nome` | |
| `valorParcelaCentavos` | |
| `quantidadeParcelas` | |
| `primeiroVencimento` | `AAAA-MM-DD` |
| `cartaoId` | cartão em que as parcelas caem, ou nulo se é boleto próprio |

O campo `cartaoId` existe para impedir dupla contagem: parcela de cartão compõe a fatura e **não** gera saída separada.

**`Cartao`**

| Campo | Descrição |
|---|---|
| `id`, `nome` | |
| `diaFechamento`, `diaVencimento` | |
| `gastoMensalTipicoCentavos` | gasto recorrente não parcelado, informado manualmente pelo usuário e usado na estimativa |

O cartão gera **uma ocorrência de fatura por competência**, com vencimento no `diaVencimento` daquela competência. Quando `diaVencimento` é anterior a `diaFechamento`, o vencimento ocorre no mês seguinte ao fechamento. Uma parcela com `cartaoId` preenchido compõe a fatura da competência em que **o vencimento da parcela** cai — ou seja, o usuário cadastra o parcelamento usando as datas de vencimento das faturas, não as datas das compras. Essa simplificação evita ter de modelar a data de cada compra, que foi explicitamente descartada do escopo.

### 4.2 Ocorrência real

Criada quando o usuário interage com uma ocorrência virtual, ou lançada avulsa (sem gerador).

| Campo | Descrição |
|---|---|
| `id` | |
| `geradorTipo` | `regra` \| `parcelamento` \| `cartao` \| `avulso` |
| `geradorId` | nulo quando avulso |
| `competencia` | `AAAA-MM` |
| `tipo`, `nome` | |
| `valorPrevistoCentavos` | |
| `dataVencimento` | `AAAA-MM-DD` |
| `dataPagamento` | `AAAA-MM-DD` ou nulo |
| `valorPagoCentavos` | nulo enquanto não pago |
| `ignorado` | `true` quando o item não acontece neste mês |
| `observacao` | texto livre opcional |

A chave de sobreposição é `(geradorTipo, geradorId, competencia)`.

Dois campos que não são preciosismo:

- **`valorPagoCentavos` separado do previsto** — boleto pago com juros ou com desconto sai diferente do que foi previsto, e a curva de saldo precisa do valor real.
- **`dataPagamento` separada de `dataVencimento`** — requisito explícito do usuário. Permite registrar que a conta de outubro só foi quitada em novembro.

### 4.3 Âncora de saldo

`{ data, saldoCentavos }`. O usuário declara "hoje eu tenho R$ X" e a projeção parte dali. Sem âncora, a curva diária é um número arbitrário que diverge da realidade em poucas semanas. Pode ser redefinida a qualquer momento; a mais recente com data ≤ hoje é a vigente.

### 4.4 Estimativa da fatura de cartão

Enquanto a fatura não foi confirmada:

```
faturaPrevista(mês) = soma das parcelas com cartaoId = X no mês
                    + gastoMensalTipico do cartão X
```

Quando o usuário informa o valor real, ele **substitui integralmente** a estimativa. Nada é somado — a fatura verdadeira já contém as parcelas. Esse é o ponto onde um design ingênuo produziria dupla contagem.

## 5. Motor de projeção

Módulo de **funções puras**: sem banco, sem React, sem relógio implícito. Recebe geradores, ocorrências reais, âncora e um intervalo; devolve a lista resolvida e a curva. É o pedaço onde os bugs custam caro e, por ser puro, é o mais barato de testar.

### 5.1 Expansão

Cada gerador produz suas ocorrências virtuais no intervalo pedido. Duas armadilhas de calendário tratadas explicitamente:

- **Dia inexistente no mês** — regra "dia 31" em fevereiro cai no dia 28 (ou 29 em ano bissexto); regra "dia 31" em abril cai no dia 30. Nunca transborda para o mês seguinte.
- **Fim de semana** — aplica `ajusteFimDeSemana` da regra. Feriados fora do escopo (§2).

### 5.2 Resolução

As ocorrências reais do intervalo são indexadas por `(geradorTipo, geradorId, competencia)`. Toda virtual com par correspondente é descartada em favor da real. O resultado é uma lista única e ordenada, na qual cada item sabe se é previsto ou confirmado.

### 5.3 Curva diária

Parte da âncora e avança dia a dia até o fim do mês.

- Item **pago** entra pela `dataPagamento` e pelo `valorPagoCentavos` — o dinheiro saiu quando saiu, não quando deveria ter saído.
- Item **vencido e não pago** não é ignorado nem deixado no passado: é empurrado para o dia da âncora. A dívida existe e precisa afundar o saldo de hoje.
- Itens anteriores à âncora e já pagos são ignorados — presume-se que já estão refletidos no saldo declarado.

O ponto mínimo da curva é destacado na interface: é ele que responde se o mês é atravessável.

### 5.4 Regras técnicas inegociáveis

- **Dinheiro em centavos como inteiro.** Ponto flutuante acumula centavos fantasma (`0.1 + 0.2 !== 0.3`), o que é inaceitável num app de saldo.
- **Datas como strings `AAAA-MM-DD` com aritmética de calendário local.** `new Date('2026-08-10')` é interpretado como UTC e, no fuso do Brasil, resulta em 9 de agosto às 21h — um salário do dia 10 apareceria no dia 9. Bug clássico e silencioso.

## 6. Interface

Cinco telas, navegação por barra inferior.

**1. Mês (inicial).** Abre no mês corrente. Topo: a receber, a pagar, balanço previsto e saldo projetado no fim do mês. Em seguida a curva diária com o ponto mínimo destacado. Abaixo, as ocorrências agrupadas em *atrasado*, *a vencer* e *pago*.

**2. Pagar.** Tocar num item abre uma folha com data preenchida com hoje e valor preenchido com o previsto. O caso comum — paguei hoje, valor certo — leva **dois toques**. Data e valor são editáveis para pagamento com juros ou fora do dia. Este fluxo precisa ser trivial: se der trabalho, o usuário para de marcar pagamentos e todo o resto do app perde o sentido.

**3. Cadastros.** Regras, parcelamentos e cartões. Ao alterar o valor de uma regra, o app pergunta se vale **a partir deste mês** ou **desde sempre**. Escolher "a partir deste mês" encerra a regra vigente com `vigenteAte` e cria uma nova — é assim que o histórico fica protegido de reajustes.

**4. Futuro.** Uma linha por mês nos próximos 12: total a pagar e quanto disso vem de parcelamentos. Sem gráfico. É o que dá sentido a cadastrar uma compra em 10x.

**5. Ajustes.** Âncora de saldo, exportar e importar backup.

**Requisitos de iPhone.** Teclado numérico nos campos monetários, respeito à *safe area* (notch e barra inferior recortam conteúdo em PWA em tela cheia), alvos de toque generosos e nenhuma interação dependente de *hover*.

## 7. Persistência, backup e falhas

### 7.1 Armazenamento

Dexie sobre IndexedDB, com schema versionado e migrações — uma versão nova do app não pode encontrar dados antigos e quebrar. O acesso fica atrás de uma camada de repositório: o motor de projeção nunca conhece o Dexie. Isso mantém o motor testável sem banco e deixa a porta aberta para sincronização futura, se um dia for desejada.

### 7.2 O risco real do projeto

Dados que vivem só no navegador podem ser perdidos: troca de aparelho, limpeza de dados do Safari, ou recuperação de espaço pelo sistema sob pressão de armazenamento. Web apps adicionados à tela de início escapam da limpeza automática de sete dias do Safari, e o app solicitará armazenamento persistente ao sistema quando a API estiver disponível — mas **nenhuma dessas duas coisas é garantia**, e o design não as trata como tal.

### 7.3 Backup como funcionalidade de primeira classe

- **Exportar** gera um JSON contendo a versão do schema, entregue à folha de compartilhamento do iOS (iCloud Drive, e-mail, o que o usuário preferir).
- **Importar** valida o arquivo **antes de tocar no banco** e mostra um resumo do que será aplicado ("47 lançamentos, 6 regras, período de mar/2026 a ago/2026") para confirmação.
- Importar **substitui** todo o estado, não mescla. Mesclar dois estados financeiros divergentes produz duplicatas silenciosas, e duplicata silenciosa em app de dinheiro é pior do que perder o arquivo.
- Passados 14 dias sem exportação, um aviso discreto aparece na tela inicial.

### 7.4 Falhas previstas

Sem rede, servidor ou login, a lista é curta e inteiramente local:

| Falha | Tratamento |
|---|---|
| Arquivo de import corrompido ou de versão futura | Recusa com mensagem explícita; banco intocado |
| Cota de armazenamento excedida | Aviso ao usuário com sugestão de exportar |
| Parcelamento apontando para cartão removido | Barrado na escrita por invariante de domínio |
| Âncora de saldo com data no futuro | Barrada na escrita |

Inconsistências são impedidas na escrita, não contornadas na leitura.

## 8. Estratégia de testes

O motor puro da §5 existe precisamente para que a parte cara de errar seja barata de testar.

**Motor de projeção** — concentra o esforço. Casos obrigatórios:

- regra "dia 31" em fevereiro e em meses de 30 dias
- salário em sábado com `antecipa`; boleto em domingo com `posterga`
- ocorrência real sobrepondo a virtual, com a virtual ausente do resultado
- conta vencida e não paga posicionada no dia da âncora, não no passado
- item pago entrando pela data e pelo valor efetivamente pagos
- fatura estimada como parcelas + gasto típico, depois substituída pelo valor real sem duplicar
- regra editada com vigência a partir de um mês: passado intacto, futuro atualizado

**Dinheiro e datas** — bateria específica: somas em centavos nunca produzem fração; nenhuma conversão de data desloca um dia por fuso horário.

**Persistência** — repositório testado com `fake-indexeddb`, incluindo uma migração de schema exercitada de verdade. Teste de ida e volta do backup: exportar, importar e obter estado idêntico ao original — é o teste que protege o dado que não tem cópia em lugar nenhum.

**Interface** — poucos testes, restritos aos fluxos semanais: marcar como pago em dois toques, corrigir o valor de uma conta variável, redefinir a âncora de saldo.

**Não automatizado** — comportamento real no iPhone (instalação na tela de início, safe area, teclado numérico, operação offline) fica como checklist manual curto. Automatizar Safari em iOS custa mais do que rende num projeto individual.

## 9. Stack

| Camada | Escolha |
|---|---|
| Linguagem | TypeScript |
| UI | React |
| Build | Vite |
| PWA | `vite-plugin-pwa` (manifest + service worker) |
| Persistência | Dexie sobre IndexedDB |
| Testes | Vitest, Testing Library, `fake-indexeddb` |
| Hospedagem | Estática (HTTPS), gratuita |

Nada exótico: tudo estático, gratuito e com ecossistema amplo de referência.

## 10. Critérios de sucesso

1. Instala no iPhone pela tela de início e abre offline.
2. Cadastrados os salários e as despesas fixas, o mês corrente aparece corretamente **sem nenhum lançamento manual adicional**.
3. Marcar uma conta como paga leva dois toques.
4. A curva diária mostra o dia de menor saldo do mês e ele confere com a realidade.
5. Exportar e reimportar o backup reproduz exatamente o mesmo estado.

## 11. Fora do escopo, mas previsto na estrutura

Sem construir nada agora, o design deixa caminho aberto para: sincronização entre dispositivos (graças à camada de repositório), categorias e relatórios (campo adicional na ocorrência), projeção multi-mês com gráfico (o motor já expande intervalos arbitrários) e notificações de vencimento.
