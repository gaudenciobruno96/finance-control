# Padrões de Design Não Funcional — Unidade 1 (`dominio`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

---

## Nota de Aplicabilidade

Os padrões usuais deste estágio — disjuntor, repetição com recuo exponencial, anteparo, cache, fila, limitação de taxa — pressupõem I/O e concorrência. A Unidade 1 não tem nenhum dos dois.

Registrar honestamente o que **não** se aplica tem valor: evita que uma revisão futura conclua que os padrões foram esquecidos, e evita implementar mecanismo que não protege contra nada.

| Padrão usual | Situação | Motivo |
|---|---|---|
| Disjuntor | N/A | Não há dependência externa a isolar |
| Repetição com recuo | N/A | Função pura falha deterministicamente; repetir com a mesma entrada reproduz o mesmo erro |
| Tempo limite | N/A | Não há espera; o cálculo é síncrono e limitado |
| Anteparo | N/A | Não há pool de recursos a compartimentar |
| Cache | **Rejeitado conscientemente** | Ver PAD-05 |
| Fila e processamento assíncrono | N/A | Não há trabalho a diferir |
| Limitação de taxa | N/A | Não há chamador externo |
| Compartimentação de falha | N/A | Processo único |

---

## PAD-01 · Erro de Domínio Tipado

**Padrão**: exceção de domínio com código de invariante.

Uma classe de erro própria, distinta dos erros nativos, carregando três informações: o código da invariante violada, o componente que a detectou e uma mensagem descritiva.

```
ErroDeDominio
  codigo:     identificador da invariante, ex. "VALOR_NAO_INTEIRO"
  componente: modulo que detectou, ex. "money"
  mensagem:   descricao do que foi violado
```

**Por que tipado**: permite às camadas superiores distinguir um defeito de domínio de uma falha de I/O. São coisas de natureza diferente — um erro de banco é uma condição operacional que pode ser recuperada ou relatada; um erro de domínio é um defeito de programação, e a fronteira de erro precisa reagir de forma diferente a cada um.

**Restrição de conteúdo (NFR-S05)**: a mensagem descreve **qual** invariante foi violada, jamais o valor que a violou. `"valor monetário deve ser inteiro em centavos"` e não `"valor 1234.56 não é inteiro"`. Dado financeiro não vaza por mensagem de erro.

**Códigos previstos**

| Código | Componente | Invariante |
|---|---|---|
| `VALOR_NAO_INTEIRO` | money | RN-01 |
| `VALOR_NAO_POSITIVO` | money | Invariante de entidade |
| `MULTIPLICADOR_NAO_INTEIRO` | money | RN-03 |
| `DATA_INVALIDA` | calendar | Formato `AAAA-MM-DD` |
| `COMPETENCIA_INVALIDA` | calendar | Formato `AAAA-MM` |
| `DIA_DO_MES_INVALIDO` | calendar | Faixa 1–31 |
| `INTERVALO_INVERTIDO` | calendar | Fim anterior ao início |
| `VIGENCIA_INVERTIDA` | ruleVersioning | RN-12 |
| `QUANTIDADE_PARCELAS_INVALIDA` | installmentExpander | Invariante de entidade |
| `ANCORA_FUTURA` | balanceProjector | Invariante de entidade |

---

## PAD-02 · Imutabilidade por Tipo

**Padrão**: `readonly` em toda estrutura devolvida pelo domínio; nenhum congelamento em execução.

Arrays devolvidos são `readonly`, objetos têm propriedades `readonly`. A proteção é de compilação e tem custo zero em execução.

**Por que não congelar**: congelar exigiria percorrer recursivamente cada resultado, inclusive a curva diária inteira, a cada reprojeção — e há reprojeção a cada escrita, por conta de `useLiveQuery`. O custo é real e o benefício é proteger contra uma alteração acidental que exigiria contornar o próprio sistema de tipos deliberadamente.

**Complemento**: a pureza garante o outro lado. O domínio não altera as estruturas que recebe, apenas produz novas. Isso é verificável por propriedade.

---

## PAD-03 · Injeção da Data Corrente

**Padrão**: a data corrente é parâmetro, nunca leitura de relógio.

Nenhuma função de domínio consulta o relógio do sistema. `hoje` entra como argumento a partir da camada de serviço, que o obtém uma única vez por operação.

**Por que é padrão e não detalhe**: sem essa disciplina, testar "conta vencida ontem" exigiria manipular o relógio global, e o teste por propriedades sobre datas geradas arbitrariamente seria impraticável. É a decisão que torna toda a extensão de PBT viável nesta unidade.

**Efeito colateral desejável**: a projeção é determinística. A mesma entrada produz a mesma saída, sempre — o que também é o que permite a propriedade de idempotência PROP-R01.

---

## PAD-04 · Validação na Fronteira, Confiança no Interior

**Padrão**: funções públicas do domínio validam suas entradas; funções internas confiam.

Cada módulo tem funções públicas, que verificam invariantes e lançam `ErroDeDominio`, e auxiliares internas, que assumem entrada já validada.

**Por que**: validar em toda camada interna produziria verificação redundante em laços que percorrem dezenas de itens por dia da competência. Validar apenas na fronteira mantém a garantia sem o custo.

---

## PAD-05 · Ausência Deliberada de Memoização

**Padrão**: nenhum cache de projeção.

Registrado como decisão explícita, não como omissão.

**Por que rejeitado**: memoizar a projeção exigiria uma chave de invalidação derivada de todo o estado relevante — regras, parcelamentos, cartões, ocorrências e âncora. Uma chave incompleta faria o app exibir um saldo desatualizado como se fosse atual. É o defeito mais grave concebível neste projeto: não um erro visível, mas um número plausível e falso.

No volume-alvo, a projeção percorre dezenas de itens. O custo é irrelevante; o risco da otimização não é.

**Revisão futura**: se a projeção vier a ficar lenta, a medição precede a otimização. NFR-D01 prevê a medição na fase Build and Test.

---

## PAD-06 · Índice em vez de Busca Aninhada

**Padrão**: a resolução de sobreposição constrói um índice por chave antes de percorrer as virtuais.

A alternativa ingênua — para cada virtual, varrer todas as reais — é quadrática. Com centenas de ocorrências acumuladas, degrada de forma perceptível.

O índice também produz dois benefícios que não são de desempenho: torna a operação idempotente (PROP-R01) e independente da ordem das entradas (PROP-R05).

---

## PAD-07 · Composição de Funções em Vez de Objeto com Estado

**Padrão**: o motor é uma sequência de transformações puras, não um objeto que acumula estado entre chamadas.

```
expandir -> resolver -> projetar -> sumarizar
```

Cada etapa recebe o resultado da anterior e devolve uma estrutura nova. Não há inicialização, nem ordem obrigatória de chamadas, nem estado parcial possível entre etapas.

**Consequência para teste**: cada etapa é testável isoladamente com dados construídos à mão, sem montar o pipeline inteiro. É o que permite as 39 propriedades identificadas serem verificadas em unidades pequenas.

---

## Mapeamento para Requisitos

| Padrão | Requisitos atendidos | Regras de extensão |
|---|---|---|
| PAD-01 | NFR-C01, NFR-C03, NFR-S05 | SECURITY-15 |
| PAD-02 | NFR-M01 | — |
| PAD-03 | NFR-M04, RNF-27 | PBT-08 |
| PAD-04 | NFR-C01, NFR-D02 | — |
| PAD-05 | NFR-D01 | — |
| PAD-06 | NFR-D02, NFR-D03 | — |
| PAD-07 | RNF-27, NFR-M03 | PBT-01, PBT-10 |
