# Resumo de Código — Unidade 2 (`persistencia`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08
**Situação**: 16 de 16 passos concluídos

---

## Verificação Executada

```
npm run verify
  lint       eslint .                      OK
  typecheck  tsc --noEmit                  OK
  test       vitest run                    28 arquivos, 294 testes, todos passando
  audit      npm audit --audit-level=high  0 vulnerabilidades
```

A Unidade 1 entregava 234 testes; esta unidade acrescentou **60**, chegando a 294.

---

## Arquivos Criados

### `src/data/` — persistência

| Arquivo | Componente |
|---|---|
| `db.ts` | DAT-01 — schema, seis tabelas, migrações |
| `ids.ts` | `crypto.randomUUID()` |
| `invariants.ts` | Validações de escrita (RN-43 a RN-45) |
| `repositories.ts` | DAT-02 — seis repositórios |
| `backup-serializer.ts` | DAT-03 — serialização e escrita transacional |
| `backup-validator.ts` | DAT-04 — validação de entrada não confiável |
| `storage-persistence.ts` | DAT-05 — armazenamento persistente |

### `src/services/` — orquestração

| Arquivo | Componente |
|---|---|
| `projection-service.ts` | SVC-01 |
| `payment-service.ts` | SVC-02 |
| `rule-service.ts` | SVC-03 |
| `backup-service.ts` | SVC-04 |

### Suporte a teste

| Arquivo | Papel |
|---|---|
| `test-support/indexeddb-setup.ts` | IndexedDB em memória; o código de produção não sabe que está em teste |
| `test-support/app-harness.ts` | Aplicação completa isolada por teste |

### Testes

`db.test.ts`, `repositories.test.ts`, `backup.prop.test.ts`, `services.test.ts`, `stateful.prop.test.ts`

---

## O Teste Stateful Encontrou uma Contradição Real

Na primeira execução, o PBT-06 falhou com uma sequência de um único comando: definir a âncora no dia 2 do mês.

A invariante afirmava que a curva tem 31 pontos em agosto. Mas com âncora no dia 2, a curva tem 30 — porque, por decisão de design registrada na Unidade 1, **a curva começa no dia da âncora quando ela cai dentro do mês exibido**. Desenhar os dias anteriores seria inventar um saldo que o usuário nunca declarou.

Ou seja: a propriedade **PROP-P02**, documentada como *"a curva tem exatamente um ponto por dia da competência"*, contradizia o comportamento implementado e documentado no próprio código.

Por que passou na Unidade 1: o gerador `cenarioDeProjecao` ancora sempre no dia 1, e o caso nunca era alcançado.

**Resolução**: o comportamento está correto; o enunciado estava errado. PROP-P02 foi reescrita como *"a curva é contígua, sem lacuna nem repetição, e termina no último dia da competência"*, e foi acrescentada uma propriedade complementar que exercita explicitamente a âncora no meio do mês.

Este é o tipo de defeito que o teste stateful existe para achar: nenhum teste por exemplo o encontraria, porque ninguém escreve à mão o caso "declarei o saldo no dia 2 e abri o mesmo mês".

---

## Alterações Retroativas na Unidade 1

Duas, ambas motivadas por esta unidade.

**1. Ocorrências órfãs (RN-42).** Detectada no Functional Design, ao decidir que remover uma regra preserva os pagamentos. O resolvedor não exibia ocorrências reais sem virtual correspondente — o aluguel de julho já pago sumiria do histórico. Corrigido, com 4 testes.

**2. Campo `idReal` em `OcorrenciaResolvida`.** Detectada ao implementar o `paymentService`: atualizar uma ocorrência avulsa exigiria extrair o identificador da chave por manipulação de texto. O campo torna o identificador explícito.

---

## Decisões de Implementação

| Decisão | Motivo |
|---|---|
| A chave de sobreposição **não** é armazenada como campo | Guardar a chave concatenada duplicaria dado derivado, que pode divergir da fonte. É indexada pelo composto `[geradorTipo+geradorId+competencia]` |
| Ocorrências avulsas ficam fora desse índice | Têm `geradorId` nulo. Correto: nunca são buscadas por chave (RN-26) |
| `criarBanco(nome)` além de `obterBanco()` | Cada teste precisa de banco isolado; sem isso os testes dependeriam de ordem de execução |

---

## Conformidade

### Segurança

| Regra | Situação |
|---|---|
| SECURITY-05, SECURITY-13 | **Conforme** — validação completa antes de desserializar; testes com arquivo corrompido, JSON inválido, versão futura, pagamento pela metade e referência quebrada; propriedade que submete conteúdo arbitrário ao validador |
| SECURITY-10 | **Conforme** — apenas Dexie como dependência de produção, versões travadas, 0 vulnerabilidades |
| SECURITY-15 | **Conforme** — escrita multirregistro em transação; `storage-persistence` nunca lança; importação recusada não toca o banco, verificado por propriedade |

### Testes por propriedades

| Regra | Situação |
|---|---|
| PBT-02 | **Conforme** — PROP-D01 e PROP-D02, ida e volta do backup |
| PBT-03 | **Conforme** — invariantes verificadas a cada passo do stateful |
| PBT-04 | **Conforme** — PROP-D06 e idempotência do pagamento |
| PBT-05 | **Conforme** — o modelo do stateful funciona como oráculo |
| **PBT-06** | **Conforme** — 14 comandos, 6 invariantes, `exportarEImportar` dentro das sequências |
| PBT-07 | **Conforme** — geradores da Unidade 1 reutilizados e estendidos |
| PBT-08 | **Conforme** — semente aleatória com registro na falha |
| PBT-10 | **Conforme** — as duas naturezas de teste presentes |

**Nenhum achado bloqueante.**
