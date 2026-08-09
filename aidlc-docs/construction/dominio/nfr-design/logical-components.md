# Componentes Lógicos — Unidade 1 (`dominio`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

---

## Nota de Aplicabilidade

Este artefato normalmente cataloga componentes de infraestrutura: filas, caches, disjuntores, balanceadores, agentes de mensagem. **A Unidade 1 não tem nenhum.** É código puro executando no mesmo processo que o chama.

O que existe são componentes lógicos **de suporte transversal** — elementos que não implementam regra de negócio, mas sustentam os padrões definidos em `nfr-design-patterns.md`. Estes sim são catalogados abaixo.

---

## Componentes de Suporte

### SUP-01 · `errors`

**Propósito**: a hierarquia de erro de domínio do padrão PAD-01.

**Conteúdo**: a classe `ErroDeDominio`, a enumeração de códigos de invariante e as funções auxiliares de lançamento.

**Consumido por**: todos os módulos de domínio, ao validar entrada na fronteira (PAD-04).

**Regra de conteúdo**: nenhum valor de dado do usuário entra na mensagem (NFR-S05).

---

### SUP-02 · `guards`

**Propósito**: as verificações de invariante reutilizáveis do padrão PAD-04.

**Conteúdo**: predicados e asserções — valor é centavos válidos, texto é data válida, texto é competência válida, número está na faixa de dia do mês, intervalo não está invertido.

**Consumido por**: as funções públicas de cada módulo.

**Por que centralizado**: a mesma verificação de "isto é uma data válida" aparece em `calendar`, nos três expansores e no projetor. Duplicá-la produziria divergência silenciosa entre validações que deveriam ser idênticas.

---

### SUP-03 · `readonly-types`

**Propósito**: os apelidos de tipo somente-leitura do padrão PAD-02.

**Conteúdo**: variantes `readonly` das estruturas devolvidas — lista de ocorrências resolvidas, curva de saldo, resumo do mês.

**Consumido por**: as assinaturas públicas de todos os módulos.

---

## Componentes de Suporte a Teste

Não pertencem a `src/domain/`, mas são componentes lógicos que a estratégia não funcional da unidade exige.

### SUP-04 · `test-support/generators`

**Propósito**: os geradores de domínio exigidos por PBT-07.

**Localização**: `src/test-support/` — fora da unidade, compartilhado entre as três.

**Conteúdo**: um gerador por tipo do domínio, cada um produzindo valores que satisfazem as invariantes **por construção**. Um gerador de `Regra` nunca emite `diaDoMes` igual a 0 ou 40; um gerador de `Centavos` nunca emite fração.

**Por que por construção e não por filtro**: gerar valores arbitrários e descartar os inválidos desperdiça execuções e enviesa a distribuição para longe das bordas — justamente onde os defeitos moram.

### SUP-05 · `test-support/coherent-state`

**Propósito**: gerador de estado inteiro e coerente.

**Conteúdo**: produz um conjunto de regras, parcelamentos, cartões, ocorrências e âncora mutuamente consistentes — parcelamentos referenciam cartões que existem, ocorrências referenciam geradores que existem, competências caem dentro de vigências plausíveis.

**Por que é necessário**: as propriedades de projeção (PROP-P01 a PROP-P07) não podem ser verificadas com entidades avulsas. Testar que "o saldo final é igual à âncora mais todos os movimentos" exige um estado que faça sentido como um todo. Sem este gerador, as sete propriedades mais valiosas da unidade seriam inverificáveis.

---

## Diagrama de Suporte

```
        +---------------------------------------+
        |         Modulos de dominio            |
        |  money, calendar, expansores,         |
        |  resolvedor, projetor, sumarizadores  |
        +---------------------------------------+
              |            |            |
              v            v            v
         +--------+   +--------+   +-----------------+
         | SUP-01 |   | SUP-02 |   | SUP-03          |
         | errors |   | guards |   | readonly-types  |
         +--------+   +--------+   +-----------------+
                           |
                           v
                       +--------+
                       | SUP-01 |
                       +--------+

        Fora da unidade, em src/test-support/:
        +--------------------+   +--------------------+
        | SUP-04 generators  |-->| SUP-05 coherent    |
        +--------------------+   +--------------------+
                    ^                      ^
                    |                      |
              testes .prop.test.ts das 3 unidades
```

---

## Componentes de Infraestrutura — Nenhum

| Categoria | Presente | Motivo |
|---|---|---|
| Cache | Não | Rejeitado por PAD-05 |
| Fila | Não | Não há trabalho assíncrono |
| Disjuntor | Não | Não há dependência externa |
| Pool de conexões | Não | Não há conexão |
| Agente de mensagem | Não | Processo único |
| Balanceador | Não | Não há serviço |
| Repositório de segredos | Não | Não há segredo |

A ausência é registrada deliberadamente. Um revisor futuro que procure a camada de infraestrutura desta unidade encontrará aqui a explicação de por que ela não existe, em vez de concluir que foi esquecida.

---

## Dependências Externas — Nenhuma

A Unidade 1 tem **zero dependências de produção**. Os componentes de suporte SUP-01 a SUP-03 são código próprio; SUP-04 e SUP-05 dependem apenas de fast-check, que é dependência de desenvolvimento.

Aritmética de centavos e de calendário poderiam vir de biblioteca. Foram deliberadamente escritas como código próprio porque é exatamente ali que as regras deste negócio vivem — o truncamento de dia inexistente, o ajuste de fim de semana e a estabilidade da competência não são comportamento genérico de biblioteca, são decisões deste domínio.
