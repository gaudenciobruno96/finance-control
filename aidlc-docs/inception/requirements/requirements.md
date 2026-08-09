# Requisitos — Controle Orçamentário Pessoal

**Estágio**: INCEPTION — Requirements Analysis
**Profundidade**: Standard
**Data**: 2026-08-08
**Insumo principal**: `docs/superpowers/specs/2026-08-08-controle-orcamentario-design.md` (design aprovado)

---

## 1. Análise de Intenção

| Dimensão | Avaliação |
|---|---|
| **Pedido do usuário** | App de controle orçamentário pessoal para acompanhar múltiplos salários com datas de recebimento distintas, contas e boletos, entradas e saídas com suas datas, registro da data efetiva de pagamento e estimativa mensal do balanço |
| **Clareza** | Alta — o pedido original era claro e foi refinado por uma sessão de brainstorming com design aprovado |
| **Tipo** | Novo Projeto (greenfield) |
| **Escopo** | Sistema completo — aplicação inteira, do modelo de dados à interface |
| **Complexidade** | Moderada — a lógica de recorrência, calendário e projeção concentra a dificuldade; não há integrações externas, backend ou concorrência |
| **Risco** | Baixo/moderado — uso individual, sem dados de terceiros e sem exposição em rede. O principal risco é perda de dados locais, endereçado por backup |

### 1.1 Problema a resolver

O usuário recebe de múltiplas fontes em datas diferentes do mês e paga compromissos de naturezas distintas. A pergunta central é de **fluxo de caixa**, não de análise de consumo:

> Considerando tudo que ainda entra e tudo que ainda sai, eu atravesso o mês sem ficar no vermelho — e em qual dia o aperto acontece?

### 1.2 Restrições assumidas

| Restrição | Origem |
|---|---|
| Uso no iPhone sem passar pela App Store | Decisão do usuário |
| Sem servidor, sem autenticação, sem custo recorrente | Decisão do usuário |
| Dados exclusivamente no dispositivo | Decisão do usuário |
| Usuário único | Consequência das anteriores |
| Idioma da interface: Português (Brasil); moeda: BRL | Contexto do usuário |

---

## 2. Requisitos Funcionais

### 2.1 Entradas

| ID | Requisito | Prioridade |
|---|---|---|
| RF-01 | Cadastrar múltiplos salários recorrentes, cada um com nome, valor fixo e dia fixo do mês | Obrigatório |
| RF-02 | Cada salário define seu comportamento quando o dia cai em fim de semana: antecipar, postergar ou não ajustar | Obrigatório |
| RF-03 | Registrar entradas avulsas (13º, férias, freelance, reembolso), sem recorrência e sem destaque na interface | Obrigatório |
| RF-04 | Confirmar o recebimento de uma entrada, informando data e valor efetivos | Obrigatório |

### 2.2 Saídas

| ID | Requisito | Prioridade |
|---|---|---|
| RF-05 | Cadastrar despesas fixas recorrentes com valor e dia fixos | Obrigatório |
| RF-06 | Cadastrar despesas recorrentes de valor variável, cujo valor previsto é uma estimativa ajustável a cada mês | Obrigatório |
| RF-07 | Registrar boletos avulsos com valor e vencimento | Obrigatório |
| RF-08 | Cadastrar parcelamentos com valor da parcela, quantidade e primeiro vencimento, gerando uma ocorrência por mês até o fim | Obrigatório |
| RF-09 | Cadastrar cartões de crédito com dia de fechamento, dia de vencimento e gasto mensal típico | Obrigatório |
| RF-10 | Marcar um parcelamento como pertencente à fatura de um cartão, impedindo que ele gere saída em duplicidade | Obrigatório |
| RF-11 | Estimar a fatura do cartão como a soma das parcelas do mês mais o gasto mensal típico, enquanto não confirmada | Obrigatório |
| RF-12 | Confirmar o valor real da fatura, substituindo integralmente a estimativa | Obrigatório |

### 2.3 Pagamento e conciliação

| ID | Requisito | Prioridade |
|---|---|---|
| RF-13 | Registrar a data efetiva de pagamento de qualquer saída, distinta da data de vencimento | Obrigatório |
| RF-14 | Registrar o valor efetivamente pago, distinto do previsto (juros, multa ou desconto) | Obrigatório |
| RF-15 | Marcar como pago em, no máximo, dois toques no caso comum (pagou hoje, valor previsto) | Obrigatório |
| RF-16 | Marcar uma ocorrência como ignorada em um mês específico, sem excluir a regra | Obrigatório |
| RF-17 | Ajustar o valor previsto de uma ocorrência isolada sem alterar a regra que a gerou | Obrigatório |
| RF-18 | Adiar a data de vencimento de uma ocorrência isolada | Obrigatório |

### 2.4 Regras recorrentes e vigência

| ID | Requisito | Prioridade |
|---|---|---|
| RF-19 | Editar uma regra oferecendo a escolha entre aplicar a partir do mês corrente ou desde sempre | Obrigatório |
| RF-20 | Ao aplicar a partir do mês corrente, encerrar a vigência da regra anterior e criar uma nova, preservando o histórico | Obrigatório |
| RF-21 | Excluir uma regra, com efeito apenas sobre meses ainda não materializados | Obrigatório |

### 2.5 Visualização e projeção

| ID | Requisito | Prioridade |
|---|---|---|
| RF-22 | Exibir o resumo do mês: total a receber, total a pagar, balanço previsto e saldo projetado ao fim do mês | Obrigatório |
| RF-23 | Exibir a curva de saldo dia a dia do mês, destacando o dia de saldo mínimo | Obrigatório |
| RF-24 | Listar as ocorrências do mês agrupadas em atrasado, a vencer e pago | Obrigatório |
| RF-25 | Navegar livremente para qualquer mês, passado ou futuro, com edição permitida | Obrigatório |
| RF-26 | Exibir uma lista dos 12 meses seguintes com total a pagar e parcela do total oriundo de parcelamentos | Obrigatório |
| RF-27 | Definir e redefinir a âncora de saldo, informando o saldo real em uma data | Obrigatório |

### 2.6 Backup

| ID | Requisito | Prioridade |
|---|---|---|
| RF-28 | Exportar todo o estado como arquivo JSON contendo a versão do schema, entregue à folha de compartilhamento do iOS | Obrigatório |
| RF-29 | Validar o arquivo de importação antes de qualquer escrita no banco, exibindo um resumo do conteúdo para confirmação | Obrigatório |
| RF-30 | Importar substituindo integralmente o estado, jamais mesclando | Obrigatório |
| RF-31 | Exibir aviso discreto na tela inicial após 14 dias sem exportação | Desejável |

---

## 3. Requisitos Não Funcionais

### 3.1 Plataforma e distribuição

| ID | Requisito |
|---|---|
| RNF-01 | Aplicação web progressiva (PWA) instalável na tela de início do iOS, sem App Store, sem Mac e sem conta de desenvolvedor Apple |
| RNF-02 | Funcionamento integral offline após a instalação, sem qualquer chamada de rede em tempo de uso |
| RNF-03 | Publicação estática em GitHub Pages, servida por HTTPS (requisito para instalação de PWA no iOS) |
| RNF-04 | Nenhum dado do usuário trafega pela rede em qualquer circunstância |

### 3.2 Persistência

| ID | Requisito |
|---|---|
| RNF-05 | Armazenamento local em IndexedDB, com schema versionado e migrações executáveis entre versões |
| RNF-06 | Solicitar armazenamento persistente ao sistema quando a API estiver disponível, sem depender do resultado |
| RNF-07 | Camada de repositório isolando o acesso ao banco, de modo que a lógica de projeção não conheça a tecnologia de persistência |

### 3.3 Corretude

| ID | Requisito |
|---|---|
| RNF-08 | Valores monetários armazenados e processados como inteiros em centavos; ponto flutuante proibido em cálculo de dinheiro |
| RNF-09 | Datas representadas como strings `AAAA-MM-DD` com aritmética de calendário local; conversões que introduzam deslocamento por fuso horário são proibidas |
| RNF-10 | Dias inexistentes no mês truncam no último dia do mês, jamais transbordando para o mês seguinte |
| RNF-11 | A competência de uma ocorrência é determinada pela data prevista antes do ajuste de fim de semana, garantindo estabilidade da chave de sobreposição |

### 3.4 Desempenho

| ID | Requisito |
|---|---|
| RNF-12 | Volume-alvo: até 10 regras recorrentes e até 50 lançamentos por mês |
| RNF-13 | Abertura de um mês e recálculo da projeção perceptivelmente instantâneos no volume-alvo; paginação e otimização de consulta não são necessárias |

### 3.5 Usabilidade e acessibilidade

| ID | Requisito |
|---|---|
| RNF-14 | Interface em Português (Brasil), valores formatados em BRL |
| RNF-15 | Tema seguindo automaticamente a preferência clara ou escura do iOS |
| RNF-16 | Respeito à *safe area* do iOS em modo tela cheia |
| RNF-17 | Teclado numérico nos campos monetários |
| RNF-18 | Acessibilidade básica: contraste adequado, alvos de toque generosos e suporte ao ajuste de tamanho de fonte do iOS |
| RNF-19 | Nenhuma interação dependente de *hover* |

### 3.6 Segurança

| ID | Requisito |
|---|---|
| RNF-20 | Sem trava de acesso própria — a proteção do aparelho pelo iOS é considerada suficiente para um app local de usuário único |
| RNF-21 | Content Security Policy restritiva; sem `unsafe-inline` ou `unsafe-eval` sem justificativa documentada (SECURITY-04) |
| RNF-22 | Nenhum recurso carregado de CDN externa; todos os ativos servidos pela própria origem (SECURITY-04, SECURITY-13) |
| RNF-23 | Dependências com versões travadas e arquivo de lock versionado; varredura de vulnerabilidades configurada (SECURITY-10) |
| RNF-24 | Validação do arquivo de backup antes da desserialização, com rejeição de conteúdo malformado ou de versão desconhecida (SECURITY-13) |
| RNF-25 | Tratamento explícito de erro em toda operação de I/O, com *fail closed* e manipulador global de erros (SECURITY-15) |
| RNF-26 | Mensagens de erro ao usuário genéricas, sem expor detalhes internos (SECURITY-09) |

### 3.7 Testabilidade

| ID | Requisito |
|---|---|
| RNF-27 | Motor de projeção implementado como funções puras, sem dependência de banco, de interface ou de relógio implícito |
| RNF-28 | Framework de teste por propriedades configurado e integrado ao executor de testes (PBT-09) |
| RNF-29 | Geradores de domínio próprios para regras, ocorrências, parcelamentos e cartões, respeitando as restrições de negócio (PBT-07) |
| RNF-30 | *Shrinking* habilitado e semente registrada em caso de falha, garantindo reprodutibilidade (PBT-08) |
| RNF-31 | Testes por propriedade complementam, nunca substituem, os testes por exemplo nos caminhos críticos de negócio (PBT-10) |

---

## 4. Propriedades Testáveis Identificadas (PBT-01, preliminar)

Identificação inicial, a ser detalhada no Functional Design de cada unidade.

| Categoria | Propriedade |
|---|---|
| Ida e volta | `importar(exportar(estado)) == estado` |
| Ida e volta | `parseData(formatData(data)) == data` para toda data válida |
| Invariante | A expansão de uma regra em um intervalo nunca produz ocorrência fora do intervalo |
| Invariante | O dia gerado por uma regra nunca excede o número de dias do mês |
| Invariante | A soma de valores em centavos jamais produz fração |
| Invariante | O saldo final da curva é igual à âncora somada a todas as movimentações do período |
| Idempotência | Resolver a sobreposição duas vezes produz o mesmo resultado |
| Idempotência | Confirmar o mesmo pagamento duas vezes não duplica a movimentação |
| Oráculo | A curva diária calculada incrementalmente equivale à soma direta, dia a dia, das ocorrências |

---

## 5. Fora de Escopo

| Item | Justificativa |
|---|---|
| Categorias e relatórios de gasto | O problema é fluxo de caixa; categorias só rendem com lançamento granular, descartado |
| Lançamento de cartão compra a compra | Exige disciplina diária; o modelo de fatura mais parcelamentos entrega a visibilidade necessária |
| Múltiplas contas bancárias com saldo próprio | Decisão do usuário: caixa único |
| Sincronização entre dispositivos, login, backend | Dados permanecem no aparelho |
| Importação de OFX, extrato bancário ou open finance | Complexidade desproporcional ao uso individual |
| Calendário de feriados | Manutenção contínua de feriados nacionais e municipais é um projeto próprio; o erro resultante é de um a dois dias na data prevista, nunca no valor |
| Projeção multi-mês com gráfico | A lista de 12 meses (RF-26) cobre a necessidade criada pelos parcelamentos |
| Notificações push | Não solicitado; o aviso de vencimento vive na tela inicial |
| Trava de acesso própria | Decisão do usuário (Q3) |
| Baseline de resiliência AWS Well-Architected | Opt-out do usuário (Q9); pressupõe workload distribuído em nuvem, inexistente aqui |

---

## 6. Critérios de Sucesso

1. O app instala no iPhone pela tela de início e abre offline.
2. Cadastrados os salários e as despesas fixas, o mês corrente aparece correto **sem nenhum lançamento manual adicional**.
3. Marcar uma conta como paga leva dois toques.
4. A curva diária mostra o dia de menor saldo do mês e o número confere com a realidade.
5. Exportar e reimportar o backup reproduz exatamente o mesmo estado.

---

## 7. Conformidade com Extensões

### 7.1 Segurança (habilitada — todas as regras bloqueantes)

| Regra | Situação | Justificativa |
|---|---|---|
| SECURITY-01 Criptografia em repouso e em trânsito | N/A | Não há banco gerenciado, object storage ou conexão de rede. O armazenamento é o IndexedDB do aparelho, protegido pela criptografia de disco do iOS |
| SECURITY-02 Log de acesso em intermediários de rede | N/A | Não há load balancer, API gateway nem CDN |
| SECURITY-03 Log de aplicação | N/A | Não há serviço de log centralizado nem componente implantado; o app roda inteiramente no navegador do usuário |
| SECURITY-04 Cabeçalhos HTTP de segurança | **Aplicável** | Endereçado por RNF-21 e RNF-22. GitHub Pages não permite cabeçalhos customizados; CSP será entregue por `<meta http-equiv>` e a limitação documentada no Infrastructure Design |
| SECURITY-05 Validação de entrada em API | Parcialmente aplicável | Não há API, mas a importação de backup é entrada não confiável — coberta por RNF-24 |
| SECURITY-06 Políticas de menor privilégio | N/A | Não há IAM, papéis nem políticas |
| SECURITY-07 Configuração restritiva de rede | N/A | Não há VPC, sub-redes nem regras de firewall |
| SECURITY-08 Controle de acesso na aplicação | N/A | Usuário único, sem servidor e sem recurso compartilhado; não existe superfície de IDOR |
| SECURITY-09 Endurecimento e prevenção de má configuração | **Aplicável** | Endereçado por RNF-26; sem credenciais padrão, sem páginas de exemplo publicadas |
| SECURITY-10 Cadeia de suprimentos de software | **Aplicável** | Endereçado por RNF-23 |
| SECURITY-11 Princípios de design seguro | Parcialmente aplicável | Sem *rate limiting* (não há endpoint público). A separação de responsabilidades exigida está atendida pelo isolamento entre motor puro, repositório e interface |
| SECURITY-12 Autenticação e credenciais | N/A | Não há autenticação — decisão registrada em RNF-20. Não há credenciais no código |
| SECURITY-13 Integridade de software e dados | **Aplicável** | Endereçado por RNF-22 e RNF-24 |
| SECURITY-14 Alertas e monitoramento | N/A | Não há infraestrutura de log nem eventos de segurança a monitorar |
| SECURITY-15 Tratamento de exceções e padrões à prova de falha | **Aplicável** | Endereçado por RNF-25 |

**Achados bloqueantes nesta etapa**: nenhum. As cinco regras aplicáveis estão cobertas por requisitos não funcionais explícitos e serão verificadas nas etapas de design e geração de código.

### 7.2 Testes por Propriedades (habilitada — todas as regras bloqueantes)

| Regra | Situação nesta etapa |
|---|---|
| PBT-01 Identificação de propriedades no design | Iniciada — ver seção 4. Detalhamento pertence ao Functional Design |
| PBT-09 Seleção de framework | Endereçada por RNF-28. A escolha concreta pertence ao NFR Requirements |
| PBT-02 a PBT-08, PBT-10 | Aplicáveis nas etapas de Code Generation e Build and Test |

**Achados bloqueantes nesta etapa**: nenhum.

### 7.3 Resiliência

Desabilitada por opção do usuário. Regras não carregadas e não avaliadas.

---

## 8. Resumo

Projeto greenfield de complexidade moderada: um PWA offline de uso individual, sem backend, cujo valor está concentrado em um motor de projeção de fluxo de caixa que expande regras recorrentes e as combina com ocorrências reais.

São **31 requisitos funcionais** e **31 não funcionais**. A dificuldade real está concentrada em três pontos: a aritmética de calendário (dias inexistentes, ajuste de fim de semana, estabilidade da competência), a aritmética monetária em centavos e a regra de sobreposição entre ocorrências virtuais e reais. Os três são código puro, isolado e densamente testável — motivo pelo qual a extensão de teste por propriedades foi habilitada.

Das quinze regras de segurança, cinco são genuinamente aplicáveis e as dez restantes são N/A por ausência de servidor, autenticação e rede. Nenhum achado bloqueante nesta etapa.
