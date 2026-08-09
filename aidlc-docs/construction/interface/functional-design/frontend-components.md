# Componentes de Interface — Unidade 3 (`interface`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

---

## Hierarquia

```
AppShell                          rotas, barra inferior, tema, safe area, erro global
+-- MonthScreen            /              tela inicial
|   +-- MonthNavigator                    setas e seletor de mes
|   +-- MonthSummary                      os quatro numeros
|   +-- BalanceCurve                      SVG proprio
|   +-- OccurrenceList                    atrasado / a vencer / pago
|   |   +-- OccurrenceRow
|   +-- AddAvulsoButton                   fim da lista
|   +-- PaymentSheet                      folha de pagamento
+-- RegistrationsScreen    /cadastros
|   +-- RuleForm | InstallmentForm | CardForm
+-- FutureScreen           /futuro
+-- SettingsScreen         /ajustes
|   +-- AnchorForm
|   +-- BackupPanel
+-- BackupReminder                        faixa, quando aplicavel
+-- ErrorBanner                           faixa de erro
+-- ConfirmSheet                          confirmacao de acao destrutiva
+-- MoneyInput                            campo com mascara, reutilizado
```

---

## Componentes

### UI-01 · `AppShell`

**Estado**: tema (derivado do sistema), erro corrente.
**Responsabilidades**: roteador, barra inferior de quatro abas, safe area, fronteira de erro global.

O tema segue `prefers-color-scheme` por CSS puro, sem estado em JavaScript — evita descompasso entre a preferência do sistema e o que a tela mostra no primeiro quadro.

### UI-02 · `MonthScreen`

**Props**: nenhuma. A competência vem da rota (`/?mes=2026-08`).
**Estado**: ocorrência selecionada para pagamento.
**Dados**: `useMonthProjection(competencia)`.

### UI-02a · `MonthNavigator`

**Props**: `competencia`, `onMudar(competencia)`.
Setas para mês anterior e seguinte; tocar no título abre seletor de mês e ano.

### UI-03 · `MonthSummary`

**Props**: `resumo: ResumoMes`, `saldoRelativo: boolean`.

Quando `saldoRelativo` é verdadeiro, exibe aviso de que o saldo é relativo e um atalho para declarar o saldo atual. Sem isso, o número pareceria absoluto quando não é — exatamente o tipo de coisa que faz um app de dinheiro perder credibilidade.

### UI-04 · `BalanceCurve`

**Props**: `curva: CurvaSaldo`.

Polilinha em SVG, ponto mínimo destacado com rótulo, linha de zero quando a curva cruza o negativo.

**Acessibilidade**: `role="img"` com `aria-label` descrevendo saldo inicial, saldo final e o dia de saldo mínimo com seu valor. Um gráfico sem alternativa textual é invisível para leitor de tela, e a informação essencial da curva cabe em uma frase.

### UI-05 · `OccurrenceList` e `OccurrenceRow`

**Props**: as quatro listas de `MesProjetado`, `onSelecionar(ocorrencia)`.

Cada linha mostra nome, valor, data e situação. Componentes de fatura aparecem **aninhados** sob a fatura do cartão, recuados e sem valor próprio somado — o usuário vê o que compõe a fatura sem que a soma seja contada duas vezes na leitura.

### UI-06 · `PaymentSheet`

**Props**: `ocorrencia: OcorrenciaResolvida`, `onFechar()`.
**Estado**: data (inicia em hoje), valor (inicia no previsto).

Confirmar são **dois toques** no caso comum: abrir a folha e confirmar. Ações secundárias — adiar, ignorar, desfazer — ficam abaixo, visíveis mas sem competir com a principal.

### UI-07 · `RegistrationsScreen`, `RuleForm`, `InstallmentForm`, `CardForm`

`RuleForm` sugere `ajustePadrao(tipo)` ao criar (RN-09) e, para regra marcada como estimativa, oferece a média dos últimos pagos como sugestão de valor (RN-37), sem aplicá-la sozinha.

Ao editar o valor de uma regra existente, apresenta a escolha entre **a partir deste mês** e **desde sempre** (RF-19).

### UI-08 · `FutureScreen`

Uma linha por mês nos próximos 12: total a pagar e quanto vem de parcelamentos.

### UI-09 · `SettingsScreen`, `AnchorForm`, `BackupPanel`

`BackupPanel` executa o fluxo em dois passos: validar e exibir o resumo, depois confirmar. O botão de confirmar só aparece **depois** do resumo.

### UI-10 · `BackupReminder`

Faixa discreta quando `precisaAvisarBackup` devolve verdadeiro.

### UI-11 · Hooks

`useMonthProjection`, `useFutureCommitments`, `useBackupReminder`.

Todos assinam as tabelas via `useLiveQuery` e reprojetam quando o dado muda. São os **únicos** três arquivos que conhecem `dexie-react-hooks`: nenhum componente de tela o importa, de modo que trocar a estratégia de reatividade tocaria só estes três.

### UI-12 · `MoneyInput`

**Props**: `valorCentavos`, `onChange(centavos)`.

Máscara progressiva: acumula dígitos e formata da direita para a esquerda. Digitar `1`,`8`,`0`,`0`,`0` mostra `R$ 180,00`. Nunca produz valor inválido, e `inputMode="numeric"` basta — sem depender da tecla de vírgula.

### UI-13 · `ConfirmSheet`

**Props**: `titulo`, `mensagem`, `rotuloConfirmar`, `destrutivo`, `onConfirmar()`, `onCancelar()`.

Cada ação destrutiva declara sua própria mensagem. Diálogos nativos (`confirm`) são proibidos: bloqueiam a página inteira no iOS.

### UI-14 · `ErrorBanner`

Faixa no topo com mensagem e sugestão de ação. A tela permanece utilizável.

---

## Fluxos de Interação

### Marcar como pago — o fluxo mais frequente

```
1. Tocar na linha            -> PaymentSheet abre
                                data = hoje, valor = previsto
2. Tocar em "Confirmar"      -> paymentService.registrarPagamento
                             -> useLiveQuery detecta e reprojeta
                             -> resumo, curva e listas atualizam sozinhos
```

Dois toques. O passo de recarregar não existe — é o que a escolha de `useLiveQuery` compra.

### Corrigir a conta de luz

```
1. Tocar na linha            -> PaymentSheet
2. Editar o valor            -> MoneyInput
3. "Salvar sem pagar"        -> ajustarValorPrevisto
```

### Reajustar o aluguel

```
1. Cadastros -> tocar na regra
2. Editar o valor
3. Escolher "a partir deste mês" ou "desde sempre"
4. Salvar                    -> ruleService.editarRegra
```

### Importar backup

```
1. Ajustes -> Importar -> escolher arquivo
2. validarImportacao (nada e escrito)
3. Invalido -> ErrorBanner com o motivo, banco intocado
   Valido   -> resumo do conteudo
4. ConfirmSheet: "Todos os dados atuais serao substituidos.
                  Esta acao nao pode ser desfeita."
5. Confirmar                 -> confirmarImportacao
```

---

## Validação de Formulários

| Campo | Regra |
|---|---|
| Nome | Não vazio, até 60 caracteres |
| Valor | Maior que zero; a máscara já impede valor não inteiro |
| Dia do mês | 1 a 31; o seletor não oferece outros |
| Quantidade de parcelas | 1 a 360 |
| Vigência inicial | Competência válida |
| Data da âncora | Não futura (RN-45) |
| Arquivo de backup | Validação delegada ao `backupValidator` |

Validação acontece na **confirmação**, não a cada tecla: validar durante a digitação faz o formulário reclamar de um campo que o usuário ainda está preenchendo.

---

## Acessibilidade (RNF-18)

| Requisito | Como |
|---|---|
| Contraste | Mínimo 4.5:1 para texto, nos dois temas |
| Alvos de toque | Mínimo 44×44 pontos |
| Tamanho de fonte | Unidades relativas; respeita o ajuste do iOS |
| Curva | `role="img"` com descrição textual do essencial |
| Situação | Nunca comunicada apenas por cor — sempre com rótulo |
| Foco | Visível; a folha devolve o foco ao elemento de origem ao fechar |
| Sem hover | Nenhuma informação depende de passar o mouse |

"Situação nunca apenas por cor" importa aqui mais que o usual: atrasado, a vencer e pago são a informação central da lista, e distingui-los só por vermelho, cinza e verde os tornaria indistinguíveis para parte dos usuários.

---

## Propriedades Testáveis (PBT-01)

| ID | Categoria | Propriedade |
|---|---|---|
| PROP-U01 | Ida e volta | `MoneyInput`: digitar os dígitos de um valor e ler o resultado devolve o valor original |
| PROP-U02 | Invariante | A máscara nunca produz valor não inteiro em centavos |
| PROP-U03 | Invariante | A máscara nunca produz valor negativo |
| PROP-U04 | Idempotência | Reaplicar a formatação ao texto já formatado não o altera |
| PROP-U05 | Invariante | A polilinha da curva tem um ponto por elemento da curva recebida |
| PROP-U06 | Invariante | Toda coordenada gerada pela curva é finita — nunca `NaN` |

PROP-U06 não é paranoia: uma curva de um único ponto, ou com todos os saldos iguais, produz divisão por zero na normalização da escala se o cálculo for ingênuo, e o SVG resultante desaparece silenciosamente.

Os demais componentes são composição e apresentação, verificados por teste de exemplo com Testing Library — os três fluxos semanais: marcar como pago, corrigir valor, redefinir âncora.
