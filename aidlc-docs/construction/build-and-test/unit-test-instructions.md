# Execução dos Testes Unitários

**Fase**: CONSTRUCTION — Build and Test
**Data**: 2026-08-09

---

## Executar

```bash
npm test              # uma execução
npm run test:watch    # contínuo, durante o desenvolvimento
npx vitest run --coverage
```

---

## Resultado Esperado

```
Test Files  31 passed (31)
     Tests  309 passed (309)
```

**309 testes, 0 falhas.**

---

## Duas Naturezas de Teste

| Sufixo | Natureza | Papel |
|---|---|---|
| `*.test.ts` | Por exemplo | Fixa comportamento concreto com valor esperado explícito |
| `*.prop.test.ts` | Por propriedade | Verifica invariante sobre centenas de entradas geradas |

Os testes por propriedade usam **semente aleatória** a cada execução. Quando um falha, a semente aparece na saída:

```
Property failed after 3 tests
{ seed: -577930398, path: "2:1:0", endOnFailure: true }
Counterexample: [...]
```

Para reproduzir exatamente, passe a semente:

```ts
fc.assert(fc.property(...), { seed: -577930398 })
```

Semente aleatória é deliberado: uma semente fixa deixa de encontrar defeitos após a primeira execução verde.

---

## Cobertura

| Camada | Linhas | Comentário |
|---|---|---|
| `domain` | **99,05%** | É onde a corretude importa e onde os defeitos custam caro |
| `services` | 93,90% | Orquestração, coberta pelos testes de serviço e pelo stateful |
| `data` | 85,34% | Repositórios e backup |
| `ui/components` | 90,27% | `MoneyInput` e `BalanceCurve` têm teste por propriedade |
| `ui/hooks` | 62,50% | |
| `ui/screens` | 45,45% | |
| **Total** | **84,02%** | |

**A distribuição é intencional, não descuido.** A estratégia definida no documento de design previa concentrar o esforço no motor puro e manter poucos testes de interface, restritos aos fluxos semanais. A cobertura resultante reflete exatamente isso: quase total onde o erro é caro e silencioso, seletiva onde o erro é visível na tela.

Aumentar a cobertura de `ui/screens` renderia pouco: são caminhos de renderização cujo defeito aparece imediatamente ao abrir o app.

---

## Se um Teste Falhar

1. Leia a saída — o Vitest mostra o valor esperado e o recebido.
2. Se for teste por propriedade, **anote a semente** antes de mudar qualquer coisa.
3. Reproduza com a semente fixa.
4. Decida o que está errado: o código ou a propriedade.

O terceiro passo importa. Durante a construção deste projeto, **três falhas de teste por propriedade eram do enunciado, não do código** — e uma delas revelou que uma propriedade documentada contradizia o comportamento implementado.

## Teste Stateful

`src/services/stateful.prop.test.ts` gera sequências aleatórias de até 14 comandos e verifica 6 invariantes após cada passo.

É o mais lento da suíte, e o mais valioso: encontra defeitos de **ordem de operação**, que nenhum teste por exemplo alcança porque ninguém escreve à mão a sequência "criar, pagar, editar com vigência, remover, importar backup".
