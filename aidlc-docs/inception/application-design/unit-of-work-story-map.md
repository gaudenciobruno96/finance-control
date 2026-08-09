# Mapa de Requisitos por Unidade

**Estágio**: INCEPTION — Units Generation (Parte 2)
**Data**: 2026-08-08

> **Nota**: o estágio de User Stories foi pulado por decisão do usuário, portanto não existem histórias a mapear. Este documento cumpre a mesma função mapeando os **requisitos** de `requirements.md` às unidades de trabalho. Todo requisito precisa ter unidade responsável.

---

## Convenção

Um requisito pode aparecer em mais de uma unidade quando sua satisfação é repartida — por exemplo, RF-13 exige a regra de materialização (U2) e a folha de pagamento (U3). Nesses casos, a coluna **Papel** distingue a contribuição de cada unidade.

---

## Unidade 1 — Núcleo de Domínio

| Requisito | Papel da unidade |
|---|---|
| RF-02 | Ajuste de fim de semana na expansão de regras |
| RF-05, RF-06 | Expansão de despesas fixas e de valor variável |
| RF-08 | Geração das ocorrências de parcelamento |
| RF-10 | Marcação de parcela de cartão como componente de fatura, impedindo saída duplicada |
| RF-11 | Cálculo da estimativa de fatura |
| RF-16, RF-17, RF-18 | Semântica de ignorar, ajustar valor e adiar na resolução |
| RF-19, RF-20, RF-21 | Regras de vigência: encerrar, criar, selecionar vigente |
| RF-22 | Sumarização dos números do mês |
| RF-23 | Cálculo da curva diária e do dia de saldo mínimo |
| RF-26 | Sumarização dos 12 meses seguintes |
| RNF-08 | Aritmética monetária em centavos inteiros |
| RNF-09 | Datas como string com aritmética local |
| RNF-10 | Truncamento de dia inexistente no mês |
| RNF-11 | Estabilidade da competência frente ao ajuste de fim de semana |
| RNF-27 | Funções puras, sem banco, interface ou relógio |
| RNF-29 | Geradores de domínio para PBT |
| RNF-30 | Shrinking e reprodutibilidade por semente |
| RNF-31 | Complementaridade entre teste por exemplo e por propriedade |

**Também entrega**: configuração do projeto, `package.json`, arquivo de lock, TypeScript, Vite, Vitest e a regra de lint de fronteira de import (RNF-23 parcialmente, quanto ao travamento de versões).

---

## Unidade 2 — Persistência e Orquestração

| Requisito | Papel da unidade |
|---|---|
| RF-04 | Persistência da confirmação de recebimento |
| RF-12 | Persistência do valor real da fatura, substituindo a estimativa |
| RF-13, RF-14 | Materialização da ocorrência com data e valor de pagamento |
| RF-15 | Operação de registro idempotente que sustenta os dois toques |
| RF-16, RF-17, RF-18 | Persistência de ignorar, ajustar e adiar |
| RF-19, RF-20 | Aplicação transacional da vigência |
| RF-21 | Remoção de regra preservando o materializado |
| RF-22, RF-23, RF-26 | Orquestração: carregar, expandir, resolver, projetar |
| RF-25 | Consulta por intervalo que viabiliza navegação livre entre meses |
| RF-27 | Persistência e seleção da âncora vigente |
| RF-28 | Serialização do estado com versão de schema |
| RF-29 | Validação antes de qualquer escrita |
| RF-30 | Substituição integral em transação única |
| RF-31 | Registro da data da última exportação |
| RNF-05 | Schema versionado com migrações |
| RNF-06 | Solicitação de armazenamento persistente |
| RNF-07 | Camada de repositório isolando o banco |
| RNF-12, RNF-13 | Índices adequados ao volume-alvo |
| RNF-24 | Validação do backup antes da desserialização |
| RNF-25 | Tratamento explícito de erro de I/O, com fail closed |

---

## Unidade 3 — Aplicação e Interface

| Requisito | Papel da unidade |
|---|---|
| RF-01 | Formulário de cadastro de salários |
| RF-03 | Lançamento de entradas avulsas |
| RF-04 | Confirmação de recebimento na interface |
| RF-05 a RF-09 | Formulários de despesas, boletos, parcelamentos e cartões |
| RF-10 | Marcação de parcelamento vinculado a cartão no formulário |
| RF-12 | Confirmação do valor real da fatura |
| RF-13 a RF-15 | Folha de pagamento em dois toques |
| RF-16 a RF-18 | Ações de ignorar, ajustar e adiar |
| RF-19 | Escolha entre aplicar a partir deste mês ou desde sempre |
| RF-21 | Interface de remoção |
| RF-22 | Exibição do resumo |
| RF-23 | Curva em SVG com destaque do ponto mínimo |
| RF-24 | Agrupamento em atrasado, a vencer e pago |
| RF-25 | Navegação entre meses |
| RF-26 | Tela dos 12 meses |
| RF-27 | Formulário da âncora de saldo |
| RF-28 a RF-30 | Exportar, importar e confirmar o resumo de validação |
| RF-31 | Aviso após 14 dias sem exportar |
| RNF-01 a RNF-04 | PWA instalável, offline, hospedagem HTTPS, nenhum dado em trânsito |
| RNF-14 a RNF-19 | Idioma, tema, safe area, teclado numérico, acessibilidade, ausência de hover |
| RNF-20 | Ausência deliberada de trava de acesso própria |
| RNF-21, RNF-22 | CSP via meta e ausência de recurso externo |
| RNF-26 | Mensagens de erro genéricas |

---

## Verificação de Cobertura

### Requisitos funcionais

| Faixa | Total | Atribuídos |
|---|---|---|
| RF-01 a RF-31 | 31 | 31 |

Nenhum requisito funcional ficou sem unidade responsável.

### Requisitos não funcionais

| Faixa | Total | Atribuídos |
|---|---|---|
| RNF-01 a RNF-31 | 31 | 31 |

Nenhum requisito não funcional ficou sem unidade responsável.

### Distribuição

| Unidade | Requisitos funcionais | Requisitos não funcionais |
|---|---|---|
| U1 Domínio | 13 | 7 |
| U2 Persistência | 18 | 8 |
| U3 Interface | 27 | 14 |

A soma excede os totais porque requisitos repartidos aparecem em mais de uma unidade — o esperado, dado que a satisfação de um requisito de ponta a ponta atravessa camadas.

A U3 concentra mais requisitos por ser onde quase todo requisito acaba se manifestando ao usuário. Isso não a torna a unidade mais difícil: a dificuldade real está concentrada na U1, onde vivem a aritmética de calendário, a aritmética monetária e a regra de sobreposição.

---

## Rastreabilidade dos Critérios de Sucesso

| Critério de sucesso | Unidades envolvidas | Verificável em |
|---|---|---|
| 1. Instala no iPhone e abre offline | U3 | Build and Test |
| 2. Mês correto sem lançamento manual adicional | U1, U2, U3 | Build and Test |
| 3. Marcar como pago em dois toques | U2, U3 | Build and Test |
| 4. Curva mostra o dia de menor saldo e confere | U1, U2, U3 | Build and Test |
| 5. Exportar e reimportar reproduz o mesmo estado | U2 | Testes da U2 e Build and Test |
