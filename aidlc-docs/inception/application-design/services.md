# Serviços e Orquestração

**Estágio**: INCEPTION — Application Design
**Data**: 2026-08-08

---

## Por que existe uma camada de serviço

As três camadas escolhidas — domínio, dados e interface — não acomodam a orquestração. Alguém precisa carregar os dados, chamar o motor e devolver o resultado pronto. Se esse alguém for o domínio, ele passa a conhecer o banco e deixa de ser puro. Se for a interface, cada tela reimplementa a sequência e a lógica se espalha.

`src/services/` resolve isso. Pertence à **Unidade 2**, que já é a única camada que conhece domínio e persistência simultaneamente.

**Regra**: serviços não contêm regra de negócio. Eles carregam, delegam e persistem. Toda decisão de negócio vive no domínio.

---

## SVC-01 · `projectionService`

**Responsabilidade**: montar a visão de um mês.

### Fluxo de `projetarMes`

```
1. Carrega regras, parcelamentos, cartoes             (DAT-02)
2. Carrega ocorrencias reais do intervalo             (DAT-02)
3. Carrega a ancora vigente na data corrente          (DAT-02)
4. Expande regras em ocorrencias virtuais             (DOM-04)
5. Expande parcelamentos                              (DOM-05)
6. Expande faturas de cartao                          (DOM-06)
7. Resolve virtuais contra reais                      (DOM-07)
8. Projeta a curva diaria                             (DOM-08)
9. Sumariza os numeros do mes                         (DOM-09)
10. Agrupa em atrasado, a vencer e pago
```

Os passos 4 a 10 são inteiramente puros: recebem os dados carregados e devolvem o resultado. Isso significa que a projeção inteira pode ser testada sem banco algum, alimentando os passos 4 a 10 com dados construídos à mão.

**Detalhe que evita erro**: o intervalo carregado no passo 2 é maior que a competência pedida. Uma conta vencida em julho e ainda não paga precisa aparecer na projeção de agosto (empurrada para o dia da âncora). Carregar só a competência corrente perderia esse item.

---

## SVC-02 · `paymentService`

**Responsabilidade**: transformar ocorrência virtual em real.

### Fluxo de `registrarPagamento`

```
1. Calcula a chave (geradorTipo, geradorId, competencia)   (DOM-07)
2. Busca ocorrencia real existente com essa chave          (DAT-02)
3. Se existe: atualiza data e valor de pagamento
   Se nao existe: materializa a virtual como real e grava
4. Grava em transacao unica                                (DAT-01)
```

O passo 2 é o que garante idempotência: registrar o mesmo pagamento duas vezes atualiza o mesmo registro em vez de criar dois. Essa propriedade será verificada por teste de propriedade (PBT-04).

Os demais métodos — ajustar valor, adiar, ignorar, desfazer — seguem o mesmo padrão de materialização, alterando campos distintos.

---

## SVC-03 · `ruleService`

**Responsabilidade**: ciclo de vida de regras, parcelamentos e cartões.

### Fluxo de `editarRegra` com escopo `apartirDeste`

```
1. Carrega a regra atual                                   (DAT-02)
2. Produz o par (regra encerrada, regra nova)              (DOM-11)
3. Grava as duas em transacao unica                        (DAT-01)
```

A transação única do passo 3 importa: uma falha entre gravar a regra encerrada e a nova deixaria um mês descoberto ou duplicado.

Com escopo `desdeSempre`, o fluxo é uma alteração em lugar — mas as ocorrências já materializadas **não** são tocadas. Quem já foi pago permanece com o valor que foi pago, e é justamente por isso que o histórico sobrevive a um reajuste.

---

## SVC-04 · `backupService`

**Responsabilidade**: exportação e importação.

### Fluxo de exportação

```
1. Serializa o estado completo com a versao do schema      (DAT-03)
2. Produz um Blob JSON
3. Registra a data da exportacao                           (DAT-02)
4. Devolve o Blob para a folha de compartilhamento do iOS  (UI-09)
```

### Fluxo de importação

```
1. Le o arquivo como texto
2. Valida integralmente ANTES de qualquer escrita          (DAT-04)
3. Se invalido: devolve erro descritivo, banco intocado
4. Se valido: devolve o resumo para confirmacao do usuario (UI-09)
5. Somente apos confirmacao explicita:
   5.1 Abre transacao
   5.2 Limpa todas as tabelas
   5.3 Escreve o estado importado
   5.4 Confirma a transacao
```

Os passos 2 e 5 concentram os dois compromissos do design: entrada não confiável é validada antes de ser desserializada com confiança (SECURITY-13, RNF-24), e a substituição é integral e atômica — nunca uma mesclagem, que produziria duplicatas silenciosas.

---

## Padrões Transversais

### Tratamento de erro

Toda operação de I/O tem tratamento explícito. Em caso de falha, o serviço rejeita a operação — nunca prossegue parcialmente. Uma fronteira de erro no `AppShell` captura o que escapar, registra e apresenta mensagem genérica ao usuário, sem expor detalhes internos (RNF-25, RNF-26, SECURITY-15).

### Transações

Toda escrita que envolve mais de um registro roda em transação Dexie. Vale para edição com vigência, importação de backup e materialização de ocorrência.

### Injeção da data corrente

A data corrente é obtida uma única vez, na camada de serviço, e repassada explicitamente ao domínio. Nenhuma função de domínio consulta o relógio.

---

## Diagrama de Orquestração

```
      UI-02 MonthScreen
             |
             | useMonthProjection
             v
     SVC-01 projectionService
        |              |
        |              +----------------------+
        v                                     v
  DAT-02 repositorios              DOM-04 ate DOM-09
  (carrega dados)                  (calcula, puro)
        |                                     |
        v                                     v
   DAT-01 db (Dexie)                   MesProjetado
                                              |
                                              v
                                        UI-02 renderiza
```
