# Testes de Desempenho

**Fase**: CONSTRUCTION — Build and Test
**Data**: 2026-08-09

---

## Aplicabilidade

Os testes de desempenho usuais — carga, estresse, usuários concorrentes, taxa de erro sob pressão — **não se aplicam**. Não há servidor, não há concorrência, não há requisição.

O que existe é uma pergunta legítima e verificável: **a projeção de um mês é imperceptível no volume-alvo?**

| Requisito | Alvo |
|---|---|
| RNF-12 | Até 10 regras e 50 lançamentos por mês |
| RNF-13 | Abertura de mês e recálculo perceptivelmente instantâneos |
| NFR-D01 | Projeção completa em tempo imperceptível |
| NFR-D02 | Nenhum algoritmo pior que linear, exceto a ordenação final |

---

## Medição

Não há ferramenta de carga a instalar. A medição se faz no próprio aparelho:

1. Abra o app no iPhone com dados reais.
2. Navegue entre meses tocando nas setas repetidamente.
3. Marque um pagamento e observe a atualização do resumo e da curva.

**Critério**: nenhuma espera perceptível. Se houver, é sinal de problema real, não de otimização faltante.

Para medir com número, no navegador de desenvolvimento:

```js
console.time('projecao')
await projecao.projetarMes('2026-08', '2026-08-15')
console.timeEnd('projecao')
```

---

## O Que Foi Deliberadamente Não Otimizado

**Memoização da projeção — rejeitada (PAD-05).**

Memoizar exigiria uma chave de invalidação derivada de todo o estado relevante. Uma chave incompleta faria o app exibir saldo desatualizado **como se fosse atual** — o defeito mais grave concebível aqui: não um erro visível, um número plausível e falso.

No volume-alvo o ganho é irrelevante e o risco não é.

**Se a projeção vier a ficar lenta, meça antes de otimizar.** O suspeito provável não é a projeção em si, mas o intervalo de 12 meses carregado a cada abertura — e a solução seria estreitar a consulta, não introduzir cache.

---

## Tamanho do Bundle

O que substitui o teste de desempenho tradicional num app estático:

| Artefato | Tamanho | Comprimido |
|---|---|---|
| JavaScript | 382 KB | 121 KB |
| CSS | 14 KB | 3 KB |
| Total pré-cacheado | 405 KB | — |

**Referência**: 405 KB é baixado uma única vez, na instalação. Depois disso o app não faz requisição alguma.

Se o bundle crescer muito além disso, o suspeito é uma dependência nova — e cada dependência deste projeto foi uma decisão registrada.
