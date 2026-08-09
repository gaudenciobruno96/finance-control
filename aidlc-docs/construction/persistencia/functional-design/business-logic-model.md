# Modelo de Lógica — Unidade 2 (`persistencia`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

---

## Fluxo: Projetar um Mês (SVC-01)

```
projetarMes(competencia, agora):

1. intervalo = de (competencia - 12 meses) ate competencia        [RN-61]
2. Carrega em paralelo:
     regras, parcelamentos, cartoes
     ocorrencias reais do intervalo         (indice: competencia)
     ancora vigente em agora                (indice: data)        [RN-49]
3. virtuais = expandirRegras + expandirParcelamentos + expandirFaturas
4. resolvidas = resolver(virtuais, reais, agora)
5. curva = projetarCurva(resolvidas, ancora, competencia, agora)
6. resumo = resumirMes(resolvidas, curva, competencia)
7. Agrupa em atrasado / a vencer / pago
```

Os passos 3 a 7 são puros. A unidade toca o banco apenas no passo 2 — o que significa que o comportamento inteiro da projeção pode ser testado alimentando os passos 3 a 7 com dados construídos à mão, sem banco algum.

O passo 1 é o detalhe fácil de errar: carregar só a competência pedida perderia as contas atrasadas de meses anteriores, e a projeção mostraria um saldo mais folgado do que a realidade.

---

## Fluxo: Registrar Pagamento (SVC-02)

```
registrarPagamento(ocorrenciaResolvida, data, valor):

1. Abre transacao                                                 [RN-47]
2. existente = ocorrencias.obterPorChave(ocorrencia.chave)        [RN-51]
3. Se existe:
     atualiza dataPagamento e valorPagoCentavos
   Senao:
     cria ocorrencia real copiando o estado da virtual            [RN-52]
     com dataPagamento e valorPagoCentavos preenchidos
4. Valida invariantes                                             [RN-43]
5. Confirma transacao
```

O passo 2 é o que torna a operação idempotente: tocar duas vezes no botão de pagar atualiza o mesmo registro em vez de criar dois lançamentos.

O passo 3, no ramo de criação, copia o valor previsto e o vencimento **já resolvidos**. É isso que congela o valor daquele mês: uma edição futura da regra não reescreve o que foi pago.

As demais operações — ajustar valor, adiar vencimento, ignorar, desfazer — seguem o mesmo padrão, alterando campos diferentes.

---

## Fluxo: Editar Regra com Vigência (SVC-03)

```
editarRegra(id, alteracao, escopo, competencia):

1. Abre transacao                                                 [RN-47]
2. regra = regras.obter(id)
3. Se escopo = 'apartirDeste':
     versoes = editarAPartirDe(regra, alteracao, competencia, novoId)
     grava todas as versoes                                       [RN-13]
   Senao:
     grava editarDesdeSempre(regra, alteracao)                    [RN-14]
4. Confirma transacao
```

A transação do passo 1 não é formalidade: uma falha entre gravar a regra encerrada e a nova deixaria um mês sem regra vigente, ou dois meses com duas.

---

## Fluxo: Exportar Backup (SVC-04)

```
exportar():

1. Le todas as tabelas
2. Monta DocumentoBackup com versaoSchema e exportadoEm
3. Serializa em JSON
4. Grava configuracoes.ultimaExportacao = hoje                    [RN-59]
5. Devolve o Blob para a folha de compartilhamento do iOS
```

---

## Fluxo: Importar Backup (SVC-04)

```
validarImportacao(arquivo):

1. Le como texto e faz parse
2. Se parse falha: erro descritivo, BANCO INTOCADO                [RN-54]
3. Le versaoSchema
4. Se versao > versao do app: RECUSA                              [RN-56]
5. Se versao < versao do app: migra o conteudo                    [RN-55]
6. Valida tipos de todos os campos                                [RNF-24]
7. Valida integridade referencial interna
     (parcelamento aponta para cartao presente no proprio arquivo)
8. Devolve resumo para confirmacao                                [RN-58]

confirmarImportacao(documento):

9. SOMENTE apos confirmacao explicita do usuario
10. Abre transacao                                                [RN-47]
11. Limpa TODAS as tabelas
12. Escreve o estado importado                                    [RN-57]
13. Confirma transacao
```

Os passos 2 a 7 acontecem inteiramente **fora** do banco: o documento é dado não confiável até provar o contrário (SECURITY-13). Um arquivo corrompido, truncado ou de outra origem não consegue produzir escrita parcial.

O passo 11 é destrutivo por decisão explícita. Mesclar dois estados financeiros divergentes geraria duplicatas silenciosas — e duplicata silenciosa num app de dinheiro é pior que perder o arquivo, porque nada indica que algo deu errado.

---

## Propriedades Testáveis (PBT-01)

Além das PROP-D01 a PROP-D06 já listadas em `domain-entities.md`:

| ID | Categoria | Propriedade |
|---|---|---|
| PROP-S01 | Idempotência | Registrar o mesmo pagamento duas vezes produz o mesmo estado |
| PROP-S02 | Idempotência | Ignorar duas vezes produz o mesmo estado |
| PROP-S03 | Invariante | Após qualquer edição com vigência, nenhuma competência tem duas regras da mesma linhagem vigentes |
| PROP-S04 | Invariante | Remover um gerador nunca reduz a quantidade de ocorrências pagas |
| PROP-S05 | Ida e volta | Exportar e importar reproduz o estado observável por completo |
| PROP-S06 | Invariante | Uma importação recusada nunca altera o estado |
| PROP-S07 | Oráculo | A projeção via serviço equivale à composição manual dos passos puros com os mesmos dados |

---

## Teste Stateful (PBT-06)

A regra PBT-06, marcada N/A na Unidade 1, é **aplicável aqui**: o banco é estado mutável e o resultado de uma operação depende das anteriores.

### Modelo simplificado

Um espelho em memória do estado: quatro mapas de identificador para entidade, mais uma lista de âncoras. O modelo não reimplementa a lógica de projeção — apenas registra o que deveria estar armazenado.

### Comandos gerados

`criarRegra`, `editarRegraAPartirDe`, `editarRegraDesdeSempre`, `removerRegra`, `criarParcelamento`, `removerParcelamento`, `criarCartao`, `registrarPagamento`, `desfazerPagamento`, `ajustarValor`, `adiarVencimento`, `ignorarNoMes`, `definirAncora`, `exportarEImportar`.

### Invariantes verificadas após cada comando

1. Toda entidade no banco satisfaz suas invariantes (RN-43)
2. Nenhum parcelamento referencia cartão inexistente (RN-44)
3. Nenhuma competência tem duas regras da mesma linhagem vigentes (RN-15)
4. A quantidade de ocorrências pagas nunca diminui, exceto por `desfazerPagamento` (RN-46)
5. A âncora vigente em qualquer data é a mais recente até ela (RN-49)
6. O estado do banco é igual ao do modelo, entidade por entidade

O comando `exportarEImportar` merece destaque: inserido em uma sequência aleatória, ele verifica que o ciclo de backup preserva o estado **em qualquer ponto da vida do banco**, não apenas em um cenário arrumado. É o que protege o dado que não tem cópia em lugar nenhum.

Sequências de comprimento variável, incluindo a sequência vazia.
