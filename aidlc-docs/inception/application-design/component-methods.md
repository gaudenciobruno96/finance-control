# Métodos dos Componentes

**Estágio**: INCEPTION — Application Design
**Data**: 2026-08-08

> **Escopo**: assinaturas, propósito e tipos de entrada e saída. **As regras de negócio detalhadas pertencem ao Functional Design de cada unidade**, na fase de Construction.

---

## Tipos Fundamentais (DOM-01)

```typescript
type Centavos = number            // inteiro; fracao e invalida
type DataISO = string             // 'AAAA-MM-DD'
type Competencia = string         // 'AAAA-MM'

type TipoMovimento = 'entrada' | 'saida'
type AjusteFimDeSemana = 'nenhum' | 'antecipa' | 'posterga'
type TipoGerador = 'regra' | 'parcelamento' | 'cartao' | 'avulso'
type SituacaoOcorrencia = 'previsto' | 'pago' | 'ignorado'

interface Regra {
  id: string
  tipo: TipoMovimento
  nome: string
  valorCentavos: Centavos
  valorEhEstimativa: boolean
  diaDoMes: number                // 1 a 31
  ajusteFimDeSemana: AjusteFimDeSemana
  vigenteDe: Competencia
  vigenteAte: Competencia | null
}

interface Parcelamento {
  id: string
  nome: string
  valorParcelaCentavos: Centavos
  quantidadeParcelas: number
  primeiroVencimento: DataISO
  cartaoId: string | null
}

interface Cartao {
  id: string
  nome: string
  diaFechamento: number
  diaVencimento: number
  gastoMensalTipicoCentavos: Centavos
}

interface Ocorrencia {
  id: string
  geradorTipo: TipoGerador
  geradorId: string | null
  competencia: Competencia
  tipo: TipoMovimento
  nome: string
  valorPrevistoCentavos: Centavos
  dataVencimento: DataISO
  dataPagamento: DataISO | null
  valorPagoCentavos: Centavos | null
  ignorado: boolean
  observacao: string | null
}

interface AncoraSaldo {
  id: string
  data: DataISO
  saldoCentavos: Centavos
}

interface OcorrenciaResolvida {
  chave: string                   // `${geradorTipo}:${geradorId}:${competencia}`
  origem: 'virtual' | 'real'
  situacao: SituacaoOcorrencia
  ehComponenteDeFatura: boolean
  // demais campos espelham Ocorrencia
}
```

---

## DOM-02 · `money`

| Assinatura | Propósito |
|---|---|
| `somar(...valores: Centavos[]): Centavos` | Soma exata; lança se algum valor não for inteiro |
| `subtrair(a: Centavos, b: Centavos): Centavos` | Diferença exata |
| `multiplicarPorInteiro(v: Centavos, n: number): Centavos` | Repetição de parcela; `n` deve ser inteiro |
| `formatarBRL(v: Centavos): string` | Formatação para exibição |
| `deEntradaUsuario(texto: string): Centavos \| null` | Converte o que o usuário digitou; `null` se inválido |
| `ehCentavosValido(v: unknown): v is Centavos` | Guarda de tipo para validação de backup |

## DOM-03 · `calendar`

| Assinatura | Propósito |
|---|---|
| `hoje(agora: DataISO): DataISO` | Data corrente recebida por parâmetro; o módulo nunca lê o relógio |
| `comparar(a: DataISO, b: DataISO): number` | Ordenação |
| `somarDias(d: DataISO, n: number): DataISO` | Aritmética local, sem UTC |
| `ultimoDiaDoMes(c: Competencia): number` | 28, 29, 30 ou 31 |
| `diaDaSemana(d: DataISO): number` | 0 domingo a 6 sábado |
| `ehFimDeSemana(d: DataISO): boolean` | |
| `construirData(c: Competencia, dia: number): DataISO` | Trunca dia inexistente no último dia do mês |
| `aplicarAjuste(d: DataISO, a: AjusteFimDeSemana): DataISO` | Antecipa, posterga ou mantém |
| `competenciaDe(d: DataISO): Competencia` | |
| `intervaloDeCompetencias(de: Competencia, ate: Competencia): Competencia[]` | |
| `diasDaCompetencia(c: Competencia): DataISO[]` | Base da curva diária |

## DOM-04 · `ruleExpander`

| Assinatura | Propósito |
|---|---|
| `expandirRegras(regras: Regra[], intervalo: Competencia[]): OcorrenciaResolvida[]` | Uma ocorrência virtual por competência vigente |
| `regraVigenteEm(regras: Regra[], c: Competencia): Regra \| null` | Seleção por vigência |

## DOM-05 · `installmentExpander`

| Assinatura | Propósito |
|---|---|
| `expandirParcelamentos(ps: Parcelamento[], intervalo: Competencia[]): OcorrenciaResolvida[]` | Uma por parcela no intervalo; marca as de cartão como componentes de fatura |
| `parcelasDoCartaoEm(ps: Parcelamento[], cartaoId: string, c: Competencia): OcorrenciaResolvida[]` | Insumo da estimativa de fatura |

## DOM-06 · `cardInvoiceExpander`

| Assinatura | Propósito |
|---|---|
| `expandirFaturas(cartoes: Cartao[], ps: Parcelamento[], intervalo: Competencia[]): OcorrenciaResolvida[]` | Uma fatura por cartão por competência |
| `estimarFatura(cartao: Cartao, ps: Parcelamento[], c: Competencia): Centavos` | Parcelas do cartão mais gasto típico |
| `vencimentoDaFatura(cartao: Cartao, c: Competencia): DataISO` | Considera fechamento posterior ao vencimento |

## DOM-07 · `occurrenceResolver`

| Assinatura | Propósito |
|---|---|
| `chaveDe(geradorTipo, geradorId, competencia): string` | Chave de sobreposição |
| `resolver(virtuais: OcorrenciaResolvida[], reais: Ocorrencia[]): OcorrenciaResolvida[]` | Real sobrepõe virtual; avulsas incluídas; resultado ordenado |

## DOM-08 · `balanceProjector`

| Assinatura | Propósito |
|---|---|
| `projetarCurva(ocorrencias, ancora, competencia): PontoCurva[]` | Saldo por dia da competência |
| `diaDeSaldoMinimo(curva: PontoCurva[]): PontoCurva` | Ponto crítico do mês |

```typescript
interface PontoCurva { data: DataISO; saldoCentavos: Centavos }
```

## DOM-09 · `monthSummarizer`

| Assinatura | Propósito |
|---|---|
| `resumirMes(ocorrencias, ancora, competencia): ResumoMes` | Consolidação dos números do topo |

```typescript
interface ResumoMes {
  aReceberCentavos: Centavos
  aPagarCentavos: Centavos
  balancoPrevistoCentavos: Centavos
  saldoFinalProjetadoCentavos: Centavos
  jaPagoCentavos: Centavos
  faltaPagarCentavos: Centavos
}
```

## DOM-10 · `futureCommitments`

| Assinatura | Propósito |
|---|---|
| `resumirMeses(ocorrencias, intervalo): ResumoFuturo[]` | Total a pagar e parcela vinda de parcelamentos, por competência |

## DOM-11 · `ruleVersioning`

| Assinatura | Propósito |
|---|---|
| `editarAPartirDe(regra: Regra, alteracao: Partial<Regra>, c: Competencia): [Regra, Regra]` | Devolve a regra encerrada e a nova vigente |
| `editarDesdeSempre(regra: Regra, alteracao: Partial<Regra>): Regra` | Altera em lugar |

---

## DAT-01 · `db`

| Assinatura | Propósito |
|---|---|
| `abrir(): Promise<Dexie>` | Instância única com schema versionado |
| `versaoAtualDoSchema(): number` | Usada no arquivo de backup |

## DAT-02 · Repositórios

Padrão comum, exemplificado com `ruleRepository`:

| Assinatura | Propósito |
|---|---|
| `listar(): Promise<Regra[]>` | |
| `obter(id: string): Promise<Regra \| null>` | |
| `salvar(r: Regra): Promise<void>` | Valida invariantes antes de escrever |
| `remover(id: string): Promise<void>` | |

Específicos:

| Assinatura | Propósito |
|---|---|
| `occurrenceRepository.listarPorIntervalo(de: Competencia, ate: Competencia): Promise<Ocorrencia[]>` | Consulta principal da projeção |
| `occurrenceRepository.obterPorChave(chave: string): Promise<Ocorrencia \| null>` | Base da idempotência do pagamento |
| `anchorRepository.vigenteEm(d: DataISO): Promise<AncoraSaldo \| null>` | Âncora mais recente até a data |
| `settingsRepository.ultimaExportacao(): Promise<DataISO \| null>` | Insumo do aviso de backup |

## DAT-03 · `backupSerializer`

| Assinatura | Propósito |
|---|---|
| `exportar(): Promise<DocumentoBackup>` | Estado completo com versão de schema |
| `desserializar(doc: DocumentoBackup): EstadoCompleto` | Somente após validação |

## DAT-04 · `backupValidator`

| Assinatura | Propósito |
|---|---|
| `validar(bruto: unknown): ResultadoValidacao` | Verifica formato, versão, tipos e integridade referencial |

```typescript
type ResultadoValidacao =
  | { valido: true; resumo: ResumoBackup }
  | { valido: false; erro: string }

interface ResumoBackup {
  versaoSchema: number
  quantidadeRegras: number
  quantidadeParcelamentos: number
  quantidadeCartoes: number
  quantidadeOcorrencias: number
  competenciaInicial: Competencia | null
  competenciaFinal: Competencia | null
}
```

## DAT-05 · `storagePersistence`

| Assinatura | Propósito |
|---|---|
| `solicitarPersistencia(): Promise<boolean>` | Chama a API quando disponível; nunca lança |

---

## SVC-01 · `projectionService`

| Assinatura | Propósito |
|---|---|
| `projetarMes(c: Competencia, agora: DataISO): Promise<MesProjetado>` | Carrega, expande, resolve, projeta e sumariza |
| `projetarFuturo(de: Competencia, meses: number): Promise<ResumoFuturo[]>` | Alimenta a tela de 12 meses |

```typescript
interface MesProjetado {
  competencia: Competencia
  resumo: ResumoMes
  curva: PontoCurva[]
  diaMinimo: PontoCurva
  atrasados: OcorrenciaResolvida[]
  aVencer: OcorrenciaResolvida[]
  pagos: OcorrenciaResolvida[]
}
```

## SVC-02 · `paymentService`

| Assinatura | Propósito |
|---|---|
| `registrarPagamento(o: OcorrenciaResolvida, data: DataISO, valor: Centavos): Promise<void>` | Materializa e grava; idempotente por chave |
| `ajustarValorPrevisto(o: OcorrenciaResolvida, valor: Centavos): Promise<void>` | Conta de luz que veio diferente |
| `adiarVencimento(o: OcorrenciaResolvida, data: DataISO): Promise<void>` | |
| `ignorarNoMes(o: OcorrenciaResolvida): Promise<void>` | |
| `desfazerPagamento(o: OcorrenciaResolvida): Promise<void>` | Correção de engano |
| `lancarAvulso(dados: NovaOcorrenciaAvulsa): Promise<void>` | Boleto pontual ou entrada extra |

## SVC-03 · `ruleService`

| Assinatura | Propósito |
|---|---|
| `criarRegra(dados): Promise<Regra>` | |
| `editarRegra(id, alteracao, escopo: 'apartirDeste' \| 'desdeSempre', c): Promise<void>` | Aplica a semântica de vigência em transação |
| `removerRegra(id): Promise<void>` | |
| `criarParcelamento(dados): Promise<Parcelamento>` | |
| `criarCartao(dados): Promise<Cartao>` | |

## SVC-04 · `backupService`

| Assinatura | Propósito |
|---|---|
| `exportar(): Promise<Blob>` | Gera o arquivo e registra a data da exportação |
| `validarImportacao(arquivo: File): Promise<ResultadoValidacao>` | Valida sem escrever nada |
| `confirmarImportacao(doc: DocumentoBackup): Promise<void>` | Substitui o estado em transação única |
| `diasDesdeUltimaExportacao(agora: DataISO): Promise<number \| null>` | |

---

## UI-11 · Hooks

| Assinatura | Propósito |
|---|---|
| `useMonthProjection(c: Competencia): MesProjetado \| undefined` | Assina as tabelas via `useLiveQuery` e reprojeta quando o dado muda |
| `useFutureCommitments(de: Competencia, meses: number): ResumoFuturo[] \| undefined` | |
| `useBackupReminder(): number \| null` | Dias desde a última exportação |

---

## Observação sobre o Relógio

Nenhuma função de domínio lê o relógio do sistema. A data corrente entra sempre por parâmetro, a partir da camada de serviço. Isso não é preciosismo: sem essa disciplina, testar "conta vencida ontem" exigiria manipular o relógio global, e o teste por propriedades — que gera datas arbitrárias — seria impraticável.
