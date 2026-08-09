# Dependências entre Unidades de Trabalho

**Estágio**: INCEPTION — Units Generation (Parte 2)
**Data**: 2026-08-08

---

## Matriz de Dependências

Leitura: a linha depende da coluna.

| ↓ depende de → | U1 Domínio | U2 Persistência | U3 Interface |
|---|---|---|---|
| **U1 Domínio** | — | não | não |
| **U2 Persistência** | **sim** | — | não |
| **U3 Interface** | **sim** | **sim** | — |

Grafo acíclico e estritamente linear. Não há dependência circular, nem oportunidade de paralelização.

```
U1 dominio  ---->  U2 persistencia  ---->  U3 interface
```

---

## Detalhamento das Dependências

### U2 depende de U1

| O que U2 consome | De onde |
|---|---|
| Tipos do domínio (`Regra`, `Ocorrencia`, `Cartao`, `Parcelamento`, `AncoraSaldo`) | DOM-01 |
| Validação de valor monetário na escrita e na importação | DOM-02 |
| Aritmética de datas para consulta por intervalo e por competência | DOM-03 |
| Expansores, resolvedor, projetor e sumarizadores, invocados pelos serviços | DOM-04 a DOM-10 |
| Semântica de vigência aplicada por `ruleService` | DOM-11 |

**Natureza**: import direto de funções puras. Sem contrato de rede, sem serialização entre unidades.

### U3 depende de U1 e U2

| O que U3 consome | De onde |
|---|---|
| Tipos do domínio, para tipar props e estado das telas | DOM-01 |
| Formatação monetária para exibição | DOM-02 |
| Navegação entre meses e formatação de datas | DOM-03 |
| Os quatro serviços de orquestração | SVC-01 a SVC-04 |
| `useLiveQuery` sobre as tabelas do banco | DAT-01, via hooks de UI-11 |

**Natureza**: import direto. A dependência de U3 sobre `dexie-react-hooks` é a única quebra reconhecida da regra de camadas, contida nos três hooks de UI-11.

---

## Interfaces entre Unidades

Não há protocolo entre unidades: são módulos do mesmo bundle. As "interfaces" são as assinaturas TypeScript documentadas em `component-methods.md`.

| Fronteira | Superfície de contrato |
|---|---|
| U1 → U2 | Funções puras exportadas por `src/domain/` |
| U1 → U3 | Tipos, mais `money` e `calendar` para formatação |
| U2 → U3 | Métodos dos quatro serviços, mais os tipos de retorno `MesProjetado`, `ResumoMes`, `PontoCurva`, `ResumoFuturo`, `ResultadoValidacao` |

A estabilidade dessas assinaturas é o que permite construir uma unidade sem revisitar a anterior. Uma alteração de assinatura após a conclusão de uma unidade é retrabalho e deve ser tratada como sinal de que o Functional Design daquela unidade ficou incompleto.

---

## Sequência de Construção

| Ordem | Unidade | Pré-condição | Critério de conclusão |
|---|---|---|---|
| 1 | U1 Domínio | nenhuma | Testes por exemplo e por propriedade passando; regra de lint de fronteira ativa e verificada com um import proibido |
| 2 | U2 Persistência | U1 concluída | Testes com `fake-indexeddb` passando; migração de schema exercitada; ida e volta do backup produzindo estado idêntico |
| 3 | U3 Interface | U1 e U2 concluídas | Cinco critérios de sucesso verificados, incluindo instalação real no iPhone e operação offline |

---

## Pontos de Coordenação

| Ponto | Momento | O que é decidido |
|---|---|---|
| Assinaturas do domínio | Functional Design da U1 | Fixar as assinaturas que a U2 vai consumir |
| Tipos de retorno dos serviços | Functional Design da U2 | Fixar `MesProjetado` e afins, que a U3 vai consumir |
| Escolha do framework de PBT | NFR Requirements da U1 | Vale para as três unidades (PBT-09) |
| Estratégia de rota e CSP | Infrastructure Design da U3 | Compatibilidade com hospedagem estática e SECURITY-04 |

---

## Riscos de Dependência

| Risco | Avaliação | Mitigação |
|---|---|---|
| Assinatura do domínio mudar durante a U2 | Moderado | Functional Design da U1 fixa as assinaturas antes de a U2 começar |
| Tipo de retorno de serviço se mostrar inadequado durante a U3 | Moderado | Functional Design da U2 define os tipos a partir das necessidades já conhecidas das telas, que estão aprovadas no documento de design |
| Regra de lint não configurada, permitindo import proibido | **Alto se ignorado** | Elevada a entregável verificável da U1; sem ela a pureza do domínio depende de disciplina manual |
| Problema de experiência de uso descoberto apenas na U3 | Baixo | As cinco telas e seus fluxos já foram aprovados no documento de design |
| Cadeia linear sem paralelização atrasar a entrega | Não aplicável | Desenvolvedor único; paralelizar não traria ganho |
