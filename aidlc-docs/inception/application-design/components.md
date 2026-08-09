# Componentes

**Estágio**: INCEPTION — Application Design
**Data**: 2026-08-08

---

## Princípio Organizador

Quatro camadas, com dependência estritamente unidirecional. Nenhuma camada conhece a que está acima dela.

```
+-------------------------------------------------+
|  src/ui/          Interface (Unidade 3)          |
+-------------------------------------------------+
                     |
                     v
+-------------------------------------------------+
|  src/services/    Orquestracao (Unidade 2)       |
+-------------------------------------------------+
          |                          |
          v                          v
+---------------------+   +-----------------------+
|  src/data/          |   |  src/domain/          |
|  Persistencia       |   |  Dominio puro         |
|  (Unidade 2)        |   |  (Unidade 1)          |
+---------------------+   +-----------------------+
          |                          ^
          +--------------------------+
             data conhece os tipos
             de domain, nada mais
```

**A regra que sustenta tudo**: `src/domain/` não importa nada de `src/data/`, `src/services/` ou `src/ui/`. Nem Dexie, nem React, nem relógio do sistema. Essa restrição é verificável por inspeção dos imports e é o que torna o motor testável por propriedades.

---

## Unidade 1 — Domínio (`src/domain/`)

Funções puras. Recebem dados, devolvem dados.

### DOM-01 · `types`
**Propósito**: definições de tipo do domínio, sem comportamento.
**Responsabilidades**: `Regra`, `Parcelamento`, `Cartao`, `Ocorrencia`, `AncoraSaldo`, `OcorrenciaResolvida`, `Competencia`, `DataISO`, `Centavos`, enumerações de tipo e de ajuste de fim de semana.

### DOM-02 · `money`
**Propósito**: aritmética monetária em centavos inteiros.
**Responsabilidades**: somar, subtrair, multiplicar por quantidade inteira, formatar em BRL, converter de e para a entrada do usuário. Rejeita qualquer valor não inteiro.
**Cobre**: RNF-08.

### DOM-03 · `calendar`
**Propósito**: aritmética de calendário local sobre strings `AAAA-MM-DD`.
**Responsabilidades**: comparar datas, avançar e retroceder dias e meses, obter o último dia de um mês, identificar dia da semana, truncar dia inexistente no fim do mês, aplicar ajuste de fim de semana, converter entre data e competência. Nenhuma operação passa por `Date` em UTC.
**Cobre**: RNF-09, RNF-10, RNF-11.

### DOM-04 · `ruleExpander`
**Propósito**: expandir regras recorrentes em ocorrências virtuais.
**Responsabilidades**: dado um conjunto de regras e um intervalo de competências, produzir uma ocorrência virtual por competência vigente, com competência estável e vencimento ajustado.
**Cobre**: RF-02, RF-05, RF-06.

### DOM-05 · `installmentExpander`
**Propósito**: expandir parcelamentos em ocorrências virtuais.
**Responsabilidades**: produzir uma ocorrência por parcela dentro do intervalo, numerada e limitada à quantidade contratada. Parcelas vinculadas a cartão são marcadas como componentes de fatura e **não** viram saída independente.
**Cobre**: RF-08, RF-10.

### DOM-06 · `cardInvoiceExpander`
**Propósito**: produzir a ocorrência de fatura de cada cartão por competência.
**Responsabilidades**: calcular o valor estimado como soma das parcelas do cartão na competência mais o gasto mensal típico; determinar o vencimento a partir dos dias de fechamento e de vencimento.
**Cobre**: RF-09, RF-11.

### DOM-07 · `occurrenceResolver`
**Propósito**: combinar ocorrências virtuais com as reais.
**Responsabilidades**: indexar as reais pela chave `(geradorTipo, geradorId, competencia)`; descartar a virtual quando houver par; incluir as avulsas; ordenar o resultado; marcar cada item como previsto, confirmado ou ignorado.
**Cobre**: RF-16, RF-17, RF-18.

### DOM-08 · `balanceProjector`
**Propósito**: calcular a curva de saldo dia a dia.
**Responsabilidades**: partir da âncora; posicionar item pago pela data e valor efetivos; empurrar item vencido e não pago para o dia da âncora; ignorar item já pago anterior à âncora; identificar o dia de saldo mínimo.
**Cobre**: RF-23, RF-27.

### DOM-09 · `monthSummarizer`
**Propósito**: consolidar os números do mês.
**Responsabilidades**: totalizar a receber, a pagar, balanço previsto, saldo projetado ao fim do mês, quanto já foi pago e quanto falta.
**Cobre**: RF-22.

### DOM-10 · `futureCommitments`
**Propósito**: sumarizar os 12 meses seguintes.
**Responsabilidades**: por competência, total a pagar e parcela do total originada de parcelamentos.
**Cobre**: RF-26.

### DOM-11 · `ruleVersioning`
**Propósito**: aplicar a semântica de vigência na edição de regras.
**Responsabilidades**: dada uma regra e uma alteração, produzir a regra encerrada e a nova regra vigente (aplicação a partir do mês corrente), ou a regra alterada em lugar (aplicação desde sempre). Seleciona a regra vigente para uma competência.
**Cobre**: RF-19, RF-20, RF-21.

---

## Unidade 2 — Persistência (`src/data/`) e Orquestração (`src/services/`)

### DAT-01 · `db`
**Propósito**: schema Dexie e migrações.
**Responsabilidades**: declarar as tabelas e índices; declarar cada versão do schema e sua migração; expor a instância única do banco.
**Cobre**: RNF-05.

### DAT-02 · `ruleRepository`, `installmentRepository`, `cardRepository`, `occurrenceRepository`, `anchorRepository`, `settingsRepository`
**Propósito**: acesso a dados por entidade.
**Responsabilidades**: operações de leitura, escrita e remoção; consultas por competência e por intervalo; invariantes de escrita (parcelamento não pode referenciar cartão inexistente, âncora não pode ter data futura).
**Cobre**: RNF-07, tratamento de inconsistência da seção 7.4 dos requisitos.

### DAT-03 · `backupSerializer`
**Propósito**: converter o estado completo em documento de backup e vice-versa.
**Responsabilidades**: serializar todas as tabelas com a versão do schema; desserializar em estruturas de domínio.
**Cobre**: RF-28.

### DAT-04 · `backupValidator`
**Propósito**: validar arquivo de importação **antes** de qualquer escrita.
**Responsabilidades**: verificar formato, versão de schema conhecida, integridade referencial e tipos; produzir um resumo do conteúdo para confirmação ou um erro descritivo. Nenhuma desserialização confiante de entrada não confiável.
**Cobre**: RF-29, RNF-24, SECURITY-05, SECURITY-13.

### DAT-05 · `storagePersistence`
**Propósito**: solicitar armazenamento persistente ao sistema.
**Responsabilidades**: chamar a API quando disponível; reportar o resultado sem que o app dependa dele.
**Cobre**: RNF-06.

### SVC-01 · `projectionService`
**Propósito**: orquestrar a projeção de um mês.
**Responsabilidades**: carregar regras, parcelamentos, cartões, ocorrências e âncora dos repositórios; invocar os expansores, o resolvedor, o projetor e o sumarizador; devolver o mês pronto para exibição.

### SVC-02 · `paymentService`
**Propósito**: materializar ocorrências.
**Responsabilidades**: converter uma ocorrência virtual em real ao registrar pagamento, ajustar valor, adiar vencimento ou ignorar. Idempotente: registrar o mesmo pagamento duas vezes não duplica.
**Cobre**: RF-13 a RF-18.

### SVC-03 · `ruleService`
**Propósito**: criar, editar e remover regras, parcelamentos e cartões.
**Responsabilidades**: aplicar a semântica de vigência do DOM-11 e persistir o resultado como transação.
**Cobre**: RF-01, RF-05 a RF-09, RF-19 a RF-21.

### SVC-04 · `backupService`
**Propósito**: orquestrar exportação e importação.
**Responsabilidades**: gerar o arquivo e acionar o compartilhamento do iOS; validar antes de importar; substituir integralmente o estado em transação única; registrar a data da última exportação.
**Cobre**: RF-28 a RF-31, RNF-25.

---

## Unidade 3 — Interface (`src/ui/`)

### UI-01 · `AppShell`
**Propósito**: casca da aplicação.
**Responsabilidades**: roteador, barra de navegação inferior, respeito à safe area, tema seguindo o iOS, fronteira de erro global.
**Cobre**: RNF-15, RNF-16, RNF-19, RNF-25, RNF-26.

### UI-02 · `MonthScreen`
**Propósito**: tela inicial.
**Responsabilidades**: navegação entre meses; compõe resumo, curva e listas.
**Cobre**: RF-22 a RF-25.

### UI-03 · `MonthSummary`
**Propósito**: os quatro números do topo.

### UI-04 · `BalanceCurve`
**Propósito**: curva de saldo em SVG próprio.
**Responsabilidades**: polilinha do saldo diário, destaque do ponto mínimo, alternativa textual acessível.
**Cobre**: RF-23, RNF-18.

### UI-05 · `OccurrenceList`
**Propósito**: lista agrupada em atrasado, a vencer e pago.
**Cobre**: RF-24.

### UI-06 · `PaymentSheet`
**Propósito**: folha de registro de pagamento.
**Responsabilidades**: data preenchida com hoje e valor com o previsto, ambos editáveis; confirmação em dois toques no caso comum; ações de adiar e ignorar.
**Cobre**: RF-13 a RF-18, RNF-17.

### UI-07 · `RegistrationsScreen` com `RuleForm`, `InstallmentForm` e `CardForm`
**Propósito**: cadastros.
**Responsabilidades**: formulários das três entidades; ao editar valor de regra, apresentar a escolha entre aplicar a partir deste mês ou desde sempre.
**Cobre**: RF-01, RF-03, RF-05 a RF-10, RF-19 a RF-21.

### UI-08 · `FutureScreen`
**Propósito**: lista dos 12 meses seguintes.
**Cobre**: RF-26.

### UI-09 · `SettingsScreen` com `AnchorForm` e `BackupPanel`
**Propósito**: âncora de saldo e backup.
**Responsabilidades**: declarar o saldo atual; exportar; importar com exibição do resumo de validação antes de confirmar.
**Cobre**: RF-27 a RF-30.

### UI-10 · `BackupReminder`
**Propósito**: aviso discreto após 14 dias sem exportação.
**Cobre**: RF-31.

### UI-11 · `useMonthProjection`, `useFutureCommitments`
**Propósito**: ligação reativa entre banco e telas.
**Responsabilidades**: assinar as tabelas relevantes via `useLiveQuery` e reexecutar a projeção quando o dado mudar.

---

## Resumo

| Camada | Componentes | Unidade | Conhece |
|---|---|---|---|
| `src/domain/` | DOM-01 a DOM-11 | 1 | nada |
| `src/data/` | DAT-01 a DAT-05 | 2 | tipos de domínio |
| `src/services/` | SVC-01 a SVC-04 | 2 | domínio e dados |
| `src/ui/` | UI-01 a UI-11 | 3 | serviços e tipos de domínio |
