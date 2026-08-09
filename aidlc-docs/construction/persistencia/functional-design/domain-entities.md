# Schema Persistido — Unidade 2 (`persistencia`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

> As entidades de negócio já estão definidas no Functional Design da Unidade 1. Este documento trata do que é específico da persistência: tabelas, índices, versionamento e o formato do arquivo de backup.

---

## Tabelas

| Tabela | Chave primária | Índices | Entidade |
|---|---|---|---|
| `regras` | `id` | `vigenteDe` | `Regra` |
| `parcelamentos` | `id` | `cartaoId` | `Parcelamento` |
| `cartoes` | `id` | — | `Cartao` |
| `ocorrencias` | `id` | `competencia`, `chave`, `[geradorTipo+geradorId]` | `Ocorrencia` |
| `ancoras` | `id` | `data` | `AncoraSaldo` |
| `configuracoes` | `chave` | — | pares chave-valor |

### Justificativa dos índices

Nenhum índice existe por precaução: cada um serve a uma consulta identificada nos fluxos de `services.md`.

| Índice | Consulta que atende |
|---|---|
| `ocorrencias.competencia` | Carregar o intervalo estendido de uma projeção — a consulta mais frequente do app |
| `ocorrencias.chave` | Buscar a real existente ao registrar pagamento; base da idempotência |
| `ocorrencias.[geradorTipo+geradorId]` | Histórico de uma regra, insumo da média de estimativa (DOM-12) |
| `ancoras.data` | Selecionar a âncora vigente, a mais recente até uma data |
| `parcelamentos.cartaoId` | Compor a estimativa de fatura |
| `regras.vigenteDe` | Ordenar versões de uma linhagem |

No volume-alvo (RNF-12), nenhum desses índices é indispensável ao desempenho. Existem porque expressam a intenção da consulta e evitam varredura completa quando o histórico acumular anos.

---

## Configurações

Tabela de pares chave-valor, para o que não é entidade de negócio:

| Chave | Conteúdo |
|---|---|
| `ultimaExportacao` | `DataISO` da última exportação de backup, insumo do aviso de 14 dias (RF-31) |
| `versaoSchema` | Espelho da versão corrente, usado na geração do backup |

---

## Versionamento e Migrações

O schema é versionado. Cada versão declara sua estrutura e, quando necessário, a função de migração a partir da anterior.

**Versão 1** — estrutura inicial, com as seis tabelas acima.

Migrações futuras seguem duas regras:

1. **Nunca destrutivas sem caminho de recuperação.** Um campo removido é ignorado, não apagado, até que uma versão posterior confirme que nada depende dele.
2. **Idempotentes.** Aplicar a mesma migração duas vezes produz o mesmo resultado. O IndexedDB não repete migrações em condições normais, mas a importação de backup reutiliza esse mesmo caminho — e ali a garantia importa.

---

## Formato do Arquivo de Backup

```
DocumentoBackup
  versaoSchema:      inteiro
  exportadoEm:       DataISO
  regras:            Regra[]
  parcelamentos:     Parcelamento[]
  cartoes:           Cartao[]
  ocorrencias:       Ocorrencia[]
  ancoras:           AncoraSaldo[]
  configuracoes:     pares chave-valor
```

`versaoSchema` é o primeiro campo lido e determina todo o resto do processamento. `exportadoEm` não participa da restauração — existe para o usuário distinguir arquivos ao escolher qual importar.

### Migração na importação

Um backup de versão anterior é migrado pelo **mesmo caminho** usado ao abrir o banco, aplicado ao conteúdo importado antes da escrita.

Isso importa mais do que parece: um backup só é usado em emergência — troca de aparelho, dados perdidos —, e é justamente aí que ele tende a ser antigo. Recusá-lo por ser de uma versão anterior transformaria a única cópia dos dados em arquivo inútil no pior momento possível.

Backup de versão **posterior** à do app continua sendo recusado: não há como saber o que a versão futura mudou.

---

## Identificadores

Gerados com `crypto.randomUUID()`, disponível no Safari do iOS 16 em contexto seguro — e o app é servido por HTTPS.

A escolha é motivada pela importação: o arquivo traz identificadores de outra origem, e a substituição integral do estado (RF-30) apaga tudo antes de escrever. Ainda assim, identificadores universalmente únicos eliminam qualquer possibilidade de colisão se um dia a importação vier a mesclar em vez de substituir.

---

## Ocorrências Órfãs

Ocorrência real cujo gerador foi removido. O registro **permanece na tabela**: não há remoção em cascata.

A resolução as exibe normalmente (RN-42, acrescentada à Unidade 1 em decorrência desta decisão). Do ponto de vista da persistência, nenhuma consulta as trata de forma especial — são ocorrências como as outras, apenas com `geradorId` sem correspondente.

---

## Propriedades Testáveis do Schema (PBT-01)

| ID | Categoria | Propriedade |
|---|---|---|
| PROP-D01 | Ida e volta | `desserializar(serializar(estado))` devolve estado igual ao original |
| PROP-D02 | Ida e volta | Exportar, importar e exportar de novo produz documento idêntico ao primeiro |
| PROP-D03 | Invariante | Toda escrita aceita pelo repositório satisfaz as invariantes da entidade |
| PROP-D04 | Invariante | Nenhuma escrita rejeitada altera o estado do banco |
| PROP-D05 | Invariante | A âncora vigente em uma data é sempre a mais recente que não a ultrapassa |
| PROP-D06 | Idempotência | Aplicar a mesma migração duas vezes produz o mesmo resultado |
