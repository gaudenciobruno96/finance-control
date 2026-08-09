# Regras de Negócio — Unidade 2 (`persistencia`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

> Numeração continua a da Unidade 1, que foi até RN-42.

---

## Invariantes de Escrita

### RN-43 · Escrita valida antes de gravar
Todo repositório valida as invariantes da entidade antes de gravar. Entrada inválida é rejeitada com `ErroDeDominio` e **o banco não é tocado**.

### RN-44 · Integridade referencial na escrita
Parcelamento com `cartaoId` preenchido só é gravado se o cartão existir. Verificação feita na escrita, não contornada na leitura.

### RN-45 · Âncora não pode ter data futura
Declarar saldo para uma data que ainda não chegou não tem significado. Rejeitado na escrita.

### RN-46 · Remoção não cascateia
Remover regra, parcelamento ou cartão **não remove** as ocorrências já materializadas. Elas permanecem como órfãs e continuam visíveis (RN-42).

**Motivo**: o que o usuário já pagou é fato registrado. Meses fechados não mudam retroativamente.

### RN-47 · Toda escrita multirregistro é transacional
Edição com vigência, importação de backup e materialização de ocorrência rodam em transação única. Falha parcial deixaria vigências sobrepostas ou lacunas.

---

## Âncoras de Saldo

### RN-48 · Âncoras acumulam, não substituem
Cada declaração de saldo cria um registro novo. O histórico permite abrir um mês passado e ver a projeção com a âncora que valia à época, em vez de uma reconstrução falsa.

### RN-49 · A âncora vigente é a mais recente até a data
Dada uma data, vale a âncora de maior data que não a ultrapassa. Não havendo nenhuma, a projeção parte de zero com saldo relativo (RN-30).

### RN-50 · Duas âncoras na mesma data
A mais recentemente gravada prevalece. Corrigir o saldo do mesmo dia é operação natural e não deve exigir remoção prévia.

---

## Materialização

### RN-51 · Materializar é idempotente por chave
Registrar pagamento consulta a ocorrência real pela chave `(geradorTipo, geradorId, competencia)`. Existindo, é atualizada; não existindo, é criada. Registrar o mesmo pagamento duas vezes **atualiza o mesmo registro**, nunca cria dois.

### RN-52 · A materialização copia o estado da virtual
Ao materializar, os campos vêm da ocorrência virtual resolvida no momento — inclusive o valor previsto e a data de vencimento já ajustada. É o que congela o valor daquele mês contra futuras edições da regra.

### RN-53 · Desfazer pagamento não remove o registro
Limpa `dataPagamento` e `valorPagoCentavos`, mantendo a ocorrência materializada. Ela pode carregar outras alterações — valor ajustado, vencimento adiado — que não devem ser perdidas.

---

## Backup

### RN-54 · Validação antes de qualquer escrita
O arquivo é integralmente validado antes de o banco ser tocado: formato, versão conhecida, tipos de campo e integridade referencial interna. Arquivo inválido produz erro descritivo e **banco intacto**.

### RN-55 · Backup de versão anterior é migrado
Aplica-se ao conteúdo importado o mesmo caminho de migração usado ao abrir o banco.

**Motivo**: backup é usado em emergência, e emergência costuma alcançar arquivos antigos. Recusá-lo por idade transformaria a única cópia dos dados em arquivo inútil no pior momento.

### RN-56 · Backup de versão posterior é recusado
Não há como saber o que uma versão futura mudou. Recusa com mensagem clara.

### RN-57 · Importação substitui integralmente
Todas as tabelas são limpas e reescritas em transação única. **Nunca mescla.**

**Motivo**: mesclar dois estados financeiros divergentes produz duplicatas silenciosas — pior que perder o arquivo, porque nada indica o problema.

### RN-58 · O resumo precede a confirmação
Validado o arquivo, o usuário vê o que será aplicado — quantidades por entidade e período coberto — e confirma explicitamente antes da escrita.

### RN-59 · Exportar registra a data
A exportação grava `ultimaExportacao`, insumo do aviso de 14 dias (RF-31).

---

## Orquestração

### RN-60 · A data corrente é obtida uma vez por operação
A camada de serviço lê o relógio uma única vez e repassa o valor ao domínio. Duas leituras na mesma operação poderiam cair em dias diferentes à meia-noite.

### RN-61 · A projeção carrega intervalo estendido
Para projetar um mês, carrega-se de 12 meses antes até o próprio mês. Carregar só a competência corrente perderia as contas atrasadas que precisam ser empurradas para hoje (RN-33, RN-34).

### RN-62 · Serviço não contém regra de negócio
Serviços carregam, delegam ao domínio e persistem. Toda decisão de negócio vive na Unidade 1. Um cálculo que apareça em serviço é sinal de que pertence ao domínio.

---

## Erros

### RN-63 · Falha de I/O rejeita a operação inteira
Nenhuma operação prossegue parcialmente. Em caso de falha, a transação é revertida e o erro propagado.

### RN-64 · Erro de I/O é distinguível de erro de domínio
`ErroDeDominio` indica defeito de programação; falha de armazenamento é condição operacional. As camadas superiores reagem de forma diferente a cada um.

### RN-65 · Cota de armazenamento excedida orienta o usuário
Não é erro genérico: a mensagem sugere exportar backup e liberar espaço.

---

## Rastreabilidade

| Regras | Requisito |
|---|---|
| RN-43 a RN-45 | RNF-07, seção 7.4 dos requisitos |
| RN-46 | RF-21, RN-42 |
| RN-47, RN-63 | RNF-25 |
| RN-48 a RN-50 | RF-27 |
| RN-51 a RN-53 | RF-13 a RF-18 |
| RN-54 a RN-59 | RF-28 a RF-31, RNF-24 |
| RN-60 a RN-62 | RNF-27 |
| RN-64, RN-65 | RNF-26, seção 7.4 |
