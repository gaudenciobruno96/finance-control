# Modelo de Lógica de Negócio — Unidade 1 (`dominio`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

---

## Composição do Motor

```
   regras          parcelamentos       cartoes
      |                  |                |
      v                  v                v
   DOM-04            DOM-05           DOM-06
   expandir          expandir         expandir
   regras            parcelas         faturas
      |                  |                |
      +--------+---------+----------------+
               |
               v
        ocorrencias virtuais         ocorrencias reais
               |                            |
               +-------------+--------------+
                             |
                             v
                          DOM-07
                     resolver sobreposicao
                             |
                             v
                   ocorrencias resolvidas
                             |
              +--------------+--------------+
              |              |              |
              v              v              v
           DOM-08         DOM-09         DOM-10
           curva          resumo         futuro
```

Todo o pipeline é composto de funções puras. Nenhuma etapa consulta banco ou relógio: a data corrente entra como parâmetro no ponto de entrada.

---

## Algoritmo: Expansão de Regras (DOM-04)

```
Para cada regra em regras:
    Para cada competencia em intervalo:
        Se competencia < regra.vigenteDe: continuar          [RN-12]
        Se regra.vigenteAte existe e competencia > vigenteAte: continuar
        
        diaEfetivo = min(regra.diaDoMes, ultimoDiaDoMes(competencia))   [RN-05]
        dataBase   = construirData(competencia, diaEfetivo)
        vencimento = aplicarAjuste(dataBase, regra.ajusteFimDeSemana)   [RN-06]
        
        emitir ocorrencia virtual com:
            competencia = competencia        (NAO derivada do vencimento)  [RN-08]
            dataVencimento = vencimento
            chave = "regra:" + regra.id + ":" + competencia
```

O comentário na penúltima linha é o ponto sutil: a competência vem do laço, não da data ajustada. Derivá-la do vencimento faria uma ocorrência de 31 de maio postergada para 2 de junho migrar para a competência de junho, mudando sua chave e ressuscitando um item já pago.

---

## Algoritmo: Expansão de Parcelamentos (DOM-05)

```
Para cada parcelamento em parcelamentos:
    competenciaInicial = competenciaDe(parcelamento.primeiroVencimento)
    diaBase = dia de primeiroVencimento
    
    Para n de 1 ate parcelamento.quantidadeParcelas:            [RN-16]
        competencia = competenciaInicial + (n - 1) meses
        Se competencia fora do intervalo: continuar
        
        diaEfetivo = min(diaBase, ultimoDiaDoMes(competencia))   [RN-17]
        
        emitir ocorrencia virtual com:
            numeroParcela = n
            valor = parcelamento.valorParcelaCentavos
            ehComponenteDeFatura = (parcelamento.cartaoId nao e nulo)   [RN-18]
            chave = "parcelamento:" + parcelamento.id + ":" + competencia
```

**`diaBase` é preservado, não o dia truncado.** Um parcelamento com primeiro vencimento em 31 de janeiro vence em 28 de fevereiro, mas volta a 31 de março. Propagar o dia truncado faria todas as parcelas seguintes migrarem para o dia 28 — erro cumulativo clássico.

---

## Algoritmo: Expansão de Faturas (DOM-06)

```
Para cada cartao em cartoes:
    Para cada competencia em intervalo:
        parcelas = parcelas do cartao na competencia            [DOM-05]
        estimado = somar(valores de parcelas) + cartao.gastoMensalTipico   [RN-19]
        
        Se estimado == 0: continuar                             [RN-23]
        
        vencimento = vencimentoDaFatura(cartao, competencia)    [RN-21]
        
        emitir ocorrencia virtual de fatura com:
            valor = estimado
            chave = "cartao:" + cartao.id + ":" + competencia
```

Quando existe ocorrência real de fatura com essa chave, DOM-07 a sobrepõe e o valor real **substitui** integralmente o estimado (RN-20). Nada é somado — é aqui que um design ingênuo contaria as parcelas duas vezes.

### Vencimento da fatura

```
vencimentoDaFatura(cartao, competencia):
    Se cartao.diaVencimento >= cartao.diaFechamento:
        mes = competencia
    Senao:
        mes = competencia + 1 mes                               [RN-21]
    dia = min(cartao.diaVencimento, ultimoDiaDoMes(mes))
    devolver construirData(mes, dia)
```

---

## Algoritmo: Resolução (DOM-07)

```
indice = mapa vazio
Para cada real em ocorrenciasReais:
    Se real.geradorTipo != "avulso":
        indice[chaveDe(real)] = real

resultado = lista vazia
Para cada virtual em ocorrenciasVirtuais:
    Se indice contem virtual.chave:
        resultado += indice[virtual.chave] marcada como origem "real"   [RN-25]
    Senao:
        resultado += virtual marcada como origem "virtual"

Para cada real em ocorrenciasReais com geradorTipo == "avulso":
    resultado += real                                            [RN-26]

Para cada item em resultado:
    item.situacao = derivarSituacao(item, hoje)                  [RN-28]

devolver resultado ordenado por (dataVencimento, nome)
```

A construção por índice torna a operação idempotente (RN-27) e independente da ordem de entrada.

---

## Algoritmo: Projeção da Curva (DOM-08)

```
ancora = ancoraVigente ou { data: primeiroDiaDaCompetencia, saldo: 0 }   [RN-30]
saldoRelativo = (ancoraVigente nao existe)

atrasados = ocorrencias onde:
      situacao == "atrasado"
  e   dataVencimento >= (hoje - 12 meses)                        [RN-34]
  e   nao ehComponenteDeFatura                                   [RN-18]

movimentos = mapa de data -> lista de deltas

Para cada atrasado:
    movimentos[ancora.data] += delta(atrasado)                   [RN-33]

Para cada ocorrencia da competencia:
    Se ignorado: continuar                                       [RN-35]
    Se ehComponenteDeFatura: continuar                           [RN-18]
    
    Se pago:
        Se dataPagamento < ancora.data: continuar                [RN-32]
        movimentos[dataPagamento] += delta(valorPago)            [RN-31]
    Senao:
        Se dataVencimento < ancora.data: ja tratado como atrasado
        Senao: movimentos[dataVencimento] += delta(valorPrevisto)

saldo = ancora.saldo
curva = lista vazia
Para cada dia em diasDaCompetencia:
    saldo += soma de movimentos[dia]
    curva += { data: dia, saldo: saldo }

diaMinimo = primeiro ponto de menor saldo                        [RN-36]
devolver { curva, diaMinimo, saldoRelativo }
```

Onde `delta(o)` é positivo para entrada e negativo para saída.

Três exclusões definem a corretude do número: componentes de fatura nunca entram sozinhos (já estão na fatura), ignorados nunca entram, e pagos anteriores à âncora nunca entram. Errar qualquer uma produz um saldo plausível e falso — a pior categoria de defeito num app de dinheiro.

---

## Algoritmo: Resumo do Mês (DOM-09)

```
aReceber = soma dos previstos de entrada nao ignorados
aPagar   = soma dos previstos de saida nao ignorados, excluindo componentes de fatura
balanco  = aReceber - aPagar
jaPago   = soma dos valores pagos de saida
falta    = aPagar - jaPago
saldoFinal = ultimo ponto da curva
```

---

## Algoritmo: Compromissos Futuros (DOM-10)

```
Para cada competencia nos proximos N meses:
    totalAPagar = soma dos previstos de saida, excluindo componentes de fatura
    deParcelamentos = soma das parcelas nao vinculadas a cartao
                    + soma das parcelas vinculadas, dentro das faturas
    emitir { competencia, totalAPagar, deParcelamentos }
```

`deParcelamentos` contabiliza as parcelas de cartão mesmo estando embutidas na fatura — o objetivo desta tela é justamente revelar o peso dos parcelamentos, que de outro modo ficaria escondido dentro do valor da fatura.

---

## Algoritmo: Média para Sugestão (DOM-12)

Componente acrescentado à unidade em decorrência da Question 3.

```
mediaDosUltimosPagos(ocorrencias, regraId, quantidadeMeses):
    pagas = ocorrencias onde geradorId == regraId
                       e dataPagamento nao e nula
            ordenadas por dataPagamento decrescente
            limitadas a quantidadeMeses
    
    Se contagem de pagas < quantidadeMeses: devolver nulo        [RN-38]
    
    devolver soma(valoresPagos) dividida pela contagem, arredondada
             para o inteiro de centavos mais proximo             [RN-39]
```

Função pura. A decisão de apresentá-la como sugestão pertence à Unidade 3.

---

## Algoritmo: Versionamento de Regra (DOM-11)

```
editarAPartirDe(regra, alteracao, competencia):
    Se competencia <= regra.vigenteDe:
        devolver [regra com alteracao aplicada]     // nao ha historico a preservar
    
    encerrada = regra com vigenteAte = competencia - 1 mes       [RN-13]
    nova      = regra com alteracao aplicada,
                novo id,
                vigenteDe = competencia,
                vigenteAte = regra.vigenteAte
    devolver [encerrada, nova]
```

O caso de guarda no início evita criar uma regra encerrada de vigência vazia quando a edição alcança a própria competência inicial.

---

## Propriedades Testáveis (PBT-01)

### Aritmética monetária — DOM-02

| ID | Categoria | Propriedade |
|---|---|---|
| PROP-M01 | Invariante | A soma de quaisquer centavos é inteira |
| PROP-M02 | Comutatividade | `somar(a, b) == somar(b, a)` |
| PROP-M03 | Invariante | `subtrair(somar(a, b), b) == a` |
| PROP-M04 | Ida e volta | `deEntradaUsuario(formatarBRL(v)) == v` |
| PROP-M05 | Invariante | Multiplicar por inteiro equivale a somar repetidamente |

### Calendário — DOM-03

| ID | Categoria | Propriedade |
|---|---|---|
| PROP-C01 | Ida e volta | `somarDias(somarDias(d, n), -n) == d` |
| PROP-C02 | Invariante | `construirData` nunca devolve data de outro mês que não a competência |
| PROP-C03 | Invariante | O dia devolvido nunca excede o número de dias do mês |
| PROP-C04 | Invariante | `aplicarAjuste` com `antecipa` ou `posterga` nunca devolve sábado ou domingo |
| PROP-C05 | Idempotência | `aplicarAjuste(aplicarAjuste(d, a), a) == aplicarAjuste(d, a)` |
| PROP-C06 | Invariante | `competenciaDe(construirData(c, dia)) == c` para todo dia válido |
| PROP-C07 | Oráculo | `intervaloDeCompetencias` produz sequência contígua e sem repetição |

### Expansão — DOM-04, DOM-05, DOM-06

| ID | Categoria | Propriedade |
|---|---|---|
| PROP-X01 | Invariante | Toda ocorrência expandida tem competência dentro do intervalo pedido |
| PROP-X02 | Invariante | Uma regra produz no máximo uma ocorrência por competência |
| PROP-X03 | Invariante | Um parcelamento de N parcelas produz no máximo N ocorrências, com números distintos de 1 a N |
| PROP-X04 | Invariante | A competência de uma ocorrência independe do ajuste de fim de semana aplicado |
| PROP-X05 | Invariante | Nenhuma ocorrência é emitida para competência fora da vigência da regra |
| PROP-X06 | Invariante | A fatura estimada é sempre igual à soma das parcelas do cartão mais o gasto típico |
| PROP-X07 | Invariante | Nenhuma fatura de valor zero é emitida |
| PROP-X08 | Invariante | O dia base de um parcelamento não sofre erosão ao atravessar meses curtos |

### Resolução — DOM-07

| ID | Categoria | Propriedade |
|---|---|---|
| PROP-R01 | Idempotência | `resolver(resolver(v, r), r) == resolver(v, r)` |
| PROP-R02 | Invariante | Nenhuma virtual sobrevive quando existe real com a mesma chave |
| PROP-R03 | Invariante | Toda ocorrência avulsa aparece no resultado |
| PROP-R04 | Invariante | O resultado não contém chaves duplicadas entre não avulsas |
| PROP-R05 | Comutatividade | O resultado independe da ordem das listas de entrada |

### Projeção — DOM-08

| ID | Categoria | Propriedade |
|---|---|---|
| PROP-P01 | Invariante | O saldo do último ponto da curva é igual à âncora somada a todos os movimentos do período |
| PROP-P02 | Invariante | A curva é contígua, sem lacuna nem repetição, e termina no último dia da competência |
| PROP-P03 | Invariante | O dia de saldo mínimo tem saldo menor ou igual ao de todos os demais pontos |
| PROP-P04 | Invariante | Ocorrências ignoradas não alteram a curva |
| PROP-P05 | Invariante | Componentes de fatura não alteram a curva por si sós |
| PROP-P06 | Oráculo | O saldo em cada dia equivale à soma direta dos movimentos até aquele dia |
| PROP-P07 | Invariante | Sem âncora, a diferença entre dois pontos quaisquer é idêntica à do caso com âncora |

PROP-P07 formaliza o que RN-30 afirma: sem âncora, a **forma** da curva permanece correta e apenas o nível se desloca.

**Correção de PROP-P02.** O enunciado original era "a curva tem exatamente um ponto por dia da competência". O teste stateful da Unidade 2 expôs a contradição: quando a âncora cai **dentro** do mês exibido, a curva começa no dia da âncora, não no dia 1 — desenhar os dias anteriores seria inventar um saldo que o usuário nunca declarou. O comportamento estava correto; o enunciado é que estava errado, e foi reescrito acima. Uma propriedade complementar cobre explicitamente o caso da âncora no meio do mês, que o gerador de cenário não alcançava por ancorar sempre no dia 1.

### Versionamento — DOM-11

| ID | Categoria | Propriedade |
|---|---|---|
| PROP-V01 | Invariante | Após editar a partir de uma competência, nenhuma outra competência tem duas regras vigentes da mesma linhagem |
| PROP-V02 | Invariante | Competências anteriores à edição mantêm exatamente o valor anterior |
| PROP-V03 | Invariante | Competências a partir da edição refletem o novo valor |
| PROP-V04 | Invariante | A união das vigências não deixa lacuna entre a regra encerrada e a nova |

### Média — DOM-12

| ID | Categoria | Propriedade |
|---|---|---|
| PROP-A01 | Invariante | A média devolvida está entre o menor e o maior valor da amostra |
| PROP-A02 | Invariante | Com menos amostras que o exigido, o resultado é nulo |
| PROP-A03 | Invariante | O resultado é sempre inteiro em centavos |

---

## Testes por Exemplo Obrigatórios (PBT-10)

Propriedades verificam a regra geral; exemplos fixam o comportamento concreto. Os caminhos críticos exigem ambos:

| Cenário | Por quê |
|---|---|
| Regra dia 31 em fevereiro de ano bissexto e não bissexto | Casos concretos de RN-05 |
| Salário em sábado com `antecipa`; boleto em domingo com `posterga` | Casos concretos de RN-06 |
| Regra dia 31 com `posterga` que escorrega para o mês seguinte, mantendo a competência | O bug que RN-08 previne |
| Parcelamento iniciado em 31 de janeiro, verificado até a quarta parcela | O erro cumulativo que PROP-X08 previne |
| Fatura estimada e depois confirmada com valor real | Verificação de que RN-20 substitui e não soma |
| Conta vencida há dois meses aparecendo no dia da âncora | Caso concreto de RN-33 |
| Conta vencida há treze meses **não** aparecendo | Fronteira de RN-34 |
| Aluguel reajustado a partir de agosto, com julho intacto | Caso concreto de RN-13 e RN-14 |

---

## Componentes Consolidados da Unidade 1

| ID | Módulo | Origem |
|---|---|---|
| DOM-01 a DOM-11 | conforme Application Design | Inception |
| **DOM-12** | `estimation` — `mediaDosUltimosPagos` | Acrescentado neste estágio, por decorrência da Question 3 |
