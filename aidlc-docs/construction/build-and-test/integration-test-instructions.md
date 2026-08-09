# Testes de Integração

**Fase**: CONSTRUCTION — Build and Test
**Data**: 2026-08-09

---

## Nota sobre a Forma

Este projeto **não tem serviços a subir**: nenhum contêiner, banco externo, fila ou endpoint. A integração que existe é entre as três unidades, dentro do mesmo processo.

Por isso os testes de integração são **executados junto com os unitários**, pelo mesmo comando, sobre IndexedDB em memória. Não há ambiente a preparar nem limpar.

```bash
npm test
```

Nenhum passo de `docker-compose up`, nenhuma variável de endpoint, nenhum cleanup.

---

## Cenários Cobertos

### U1 → U2: domínio consumido pela orquestração

**Onde**: `src/services/services.test.ts`

| Cenário | Verifica |
|---|---|
| Projetar mês com salários e contas cadastrados | Os três expansores, o resolvedor, o projetor e o sumarizador compõem corretamente |
| Conta atrasada de mês anterior aparece na tela de hoje | O intervalo estendido de 12 meses (RN-61) funciona de ponta a ponta |
| Fatura de cartão com parcela vinculada | A parcela entra na fatura e **não** conta separadamente — a barreira contra dupla contagem atravessa as duas unidades |
| Reajuste com vigência | Julho mantém o valor antigo, agosto recebe o novo |
| Remover regra com pagamento registrado | O pagamento sobrevive (RN-42, RN-46) |

### U2 interna: persistência e orquestração

**Onde**: `src/services/stateful.prop.test.ts`

Sequências aleatórias de 14 comandos com 6 invariantes verificadas a cada passo, incluindo `exportarEImportar` **dentro** da sequência — o ciclo de backup é verificado em qualquer ponto da vida do banco, não num cenário arrumado.

### U1+U2 → U3: interface sobre o sistema real

**Onde**: `src/ui/screens/flows.test.tsx`

Montam a tela real sobre um banco real em memória, **sem simular nenhum serviço**.

| Cenário | Verifica |
|---|---|
| Marcar como pago em dois toques | A escrita ocorre e a tela se atualiza sozinha, sem recarga manual |
| Reabrir item pago | A tela reconhece o pagamento existente e oferece atualizar |
| Corrigir valor da conta de luz | Ajusta o previsto sem marcar como pago |
| Redefinir âncora de saldo | Persiste e o aviso de saldo relativo desaparece |
| Criar recorrência | O padrão de ajuste de fim de semana por tipo é aplicado (RN-09) |
| Reajuste pela interface | Versiona corretamente, preservando o passado |

---

## Isolamento entre Testes

Cada teste cria seu próprio banco, com nome único, e o apaga ao final.

**Atenção ao desmontar antes de apagar.** Durante a construção, dois testes passavam isolados e falhavam em conjunto: o banco era apagado antes de o testing-library desmontar os componentes, e o `useLiveQuery` do teste anterior continuava observando um banco em exclusão, interferindo no seguinte.

A ordem correta, já aplicada em `flows.test.tsx`:

```ts
afterEach(async () => {
  cleanup()        // desmonta os componentes primeiro
  db.close()
  await db.delete()
})
```

Se um teste de interface novo apresentar o sintoma "passa sozinho, falha em conjunto", verifique isto antes de suspeitar do código de produção.
