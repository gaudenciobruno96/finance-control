# Dependências entre Componentes

**Estágio**: INCEPTION — Application Design
**Data**: 2026-08-08

---

## Regra de Dependência

Dependência estritamente unidirecional, de cima para baixo:

```
ui  ->  services  ->  data  ->  domain
 |                                ^
 +--------------------------------+
   ui usa apenas os TIPOS de domain
```

**Proibições verificáveis por inspeção de imports:**

| Proibição | Motivo |
|---|---|
| `src/domain/` não importa de `data`, `services`, `ui`, Dexie ou React | Mantém o domínio puro e testável por propriedades |
| `src/data/` não importa de `services` nem de `ui` | Persistência não conhece orquestração |
| `src/services/` não importa de `ui` | Orquestração não conhece apresentação |
| Nenhuma camada lê o relógio do sistema, exceto o ponto de entrada de `services` | Torna todo o cálculo determinístico e testável |

Essa regra será verificada por lint de fronteira de import na fase de Construction.

---

## Matriz de Dependências

Leitura: a linha depende da coluna.

| ↓ depende de → | DOM-01 tipos | DOM-02 money | DOM-03 calendar | DOM-04..11 | DAT-01 db | DAT-02 repos | DAT-03/04 backup | SVC-01..04 |
|---|---|---|---|---|---|---|---|---|
| **DOM-02 money** | ✓ | — | — | — | — | — | — | — |
| **DOM-03 calendar** | ✓ | — | — | — | — | — | — | — |
| **DOM-04 ruleExpander** | ✓ | ✓ | ✓ | — | — | — | — | — |
| **DOM-05 installmentExpander** | ✓ | ✓ | ✓ | — | — | — | — | — |
| **DOM-06 cardInvoiceExpander** | ✓ | ✓ | ✓ | DOM-05 | — | — | — | — |
| **DOM-07 occurrenceResolver** | ✓ | — | ✓ | — | — | — | — | — |
| **DOM-08 balanceProjector** | ✓ | ✓ | ✓ | — | — | — | — | — |
| **DOM-09 monthSummarizer** | ✓ | ✓ | — | — | — | — | — | — |
| **DOM-10 futureCommitments** | ✓ | ✓ | ✓ | — | — | — | — | — |
| **DOM-11 ruleVersioning** | ✓ | — | ✓ | — | — | — | — | — |
| **DAT-01 db** | ✓ | — | — | — | — | — | — | — |
| **DAT-02 repositórios** | ✓ | ✓ | ✓ | — | ✓ | — | — | — |
| **DAT-03 backupSerializer** | ✓ | — | — | — | ✓ | ✓ | — | — |
| **DAT-04 backupValidator** | ✓ | ✓ | ✓ | — | — | — | — | — |
| **DAT-05 storagePersistence** | — | — | — | — | — | — | — | — |
| **SVC-01 projectionService** | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — |
| **SVC-02 paymentService** | ✓ | ✓ | ✓ | DOM-07 | ✓ | ✓ | — | — |
| **SVC-03 ruleService** | ✓ | — | ✓ | DOM-11 | ✓ | ✓ | — | — |
| **SVC-04 backupService** | ✓ | — | ✓ | — | ✓ | ✓ | ✓ | — |
| **UI-01..11** | ✓ | ✓ | ✓ | — | — | — | — | ✓ |

Observações:

- `DOM-06` é o único componente de domínio que depende de outro expansor: a estimativa de fatura precisa das parcelas do cartão.
- `DAT-04 backupValidator` depende de `money` e `calendar` para validar tipos, mas **não** depende do banco — é validação pura sobre entrada não confiável, e por isso pode ser testada por propriedades isoladamente.
- `UI` depende de `services` e dos **tipos** de domínio, além de `money` e `calendar` para formatação e navegação entre meses. Não depende de `data`.

---

## Fluxo de Dados — Abrir o Mês

```
Usuario abre a tela do mes
        |
        v
UI-02 MonthScreen chama useMonthProjection(competencia)
        |
        v
UI-11 hook assina as tabelas via useLiveQuery
        |
        v
SVC-01 projectionService.projetarMes(competencia, hoje)
        |
        +--> DAT-02 carrega regras, parcelamentos, cartoes
        +--> DAT-02 carrega ocorrencias reais do intervalo estendido
        +--> DAT-02 carrega ancora vigente
        |
        v
DOM-04 + DOM-05 + DOM-06 expandem em ocorrencias virtuais
        |
        v
DOM-07 resolve virtuais contra reais
        |
        v
DOM-08 projeta a curva      DOM-09 sumariza o mes
        |                          |
        +-----------+--------------+
                    v
              MesProjetado
                    |
                    v
UI-03 resumo | UI-04 curva | UI-05 listas
```

---

## Fluxo de Dados — Marcar como Pago

```
Usuario toca no item          -> UI-05 OccurrenceList
Usuario confirma na folha     -> UI-06 PaymentSheet
        |
        v
SVC-02 paymentService.registrarPagamento(ocorrencia, data, valor)
        |
        +--> DOM-07 calcula a chave de sobreposicao
        +--> DAT-02 busca real existente com essa chave
        |
        v
   existe? --sim--> atualiza data e valor de pagamento
        |
        nao
        |
        v
   materializa a virtual como real
        |
        v
DAT-01 grava em transacao unica
        |
        v
useLiveQuery detecta a mudanca e reprojeta o mes automaticamente
        |
        v
UI-02 rerenderiza com resumo, curva e listas atualizados
```

O último trecho é o que a escolha de `useLiveQuery` compra: nenhuma tela precisa se lembrar de recarregar depois de escrever.

---

## Fluxo de Dados — Importar Backup

```
Usuario seleciona o arquivo   -> UI-09 BackupPanel
        |
        v
SVC-04 backupService.validarImportacao(arquivo)
        |
        v
DAT-04 backupValidator.validar(bruto)
        |
   invalido? --sim--> erro descritivo; BANCO INTOCADO
        |
        nao
        |
        v
Resumo apresentado ao usuario -> UI-09
        |
        v
Usuario confirma explicitamente
        |
        v
SVC-04 confirmarImportacao(documento)
        |
        v
DAT-01 transacao unica: limpa todas as tabelas, escreve o estado importado
        |
        v
useLiveQuery propaga o novo estado para todas as telas
```

---

## Padrões de Comunicação

| Padrão | Onde | Por quê |
|---|---|---|
| Chamada direta de função | Dentro de `domain` | Funções puras, sem indireção desnecessária |
| Injeção por parâmetro | `services` para `domain` | Mantém o domínio sem dependência de infraestrutura, inclusive do relógio |
| Assinatura reativa | `data` para `ui`, via `useLiveQuery` | Elimina a classe de bug "escrevi mas a tela não atualizou" |
| Transação | Toda escrita multirregistro | Impede estado parcialmente aplicado |

Não há comunicação assíncrona por eventos, fila ou mensageria: o app é de processo único, no dispositivo do usuário.

---

## Acoplamento e Pontos de Atenção

| Ponto | Avaliação |
|---|---|
| `domain` isolado de tudo | Acoplamento mínimo; é a decisão central do design |
| `services` conhece domínio e dados | Acoplamento esperado — é a função da camada |
| `ui` depende de `services` | Aceitável; a alternativa (UI orquestrando) espalharia lógica pelas telas |
| `DOM-06` depende de `DOM-05` | Acoplamento real e justificado dentro do domínio; ambos são puros e testáveis juntos |
| `useLiveQuery` acopla `ui` ao Dexie | **Concessão consciente.** É a única quebra da regra "ui não conhece data". Em troca, elimina a camada de estado global inteira. Fica contida nos hooks de `UI-11`; nenhum componente de tela usa `useLiveQuery` diretamente, de modo que trocar a estratégia de reatividade no futuro tocaria apenas três arquivos |
