# Requisitos Não Funcionais — Unidade 1 (`dominio`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

> Estas decisões valem para **todo o projeto**. As Unidades 2 e 3 as herdam, conforme o plano de execução, que marca NFR Requirements como pulado naquelas unidades.

---

## 1. Escalabilidade — N/A

Aplicação de usuário único, executada no próprio dispositivo. Não há carga concorrente, crescimento de base, gatilho de escala ou planejamento de capacidade.

O volume-alvo está fixado em RNF-12: até 10 regras recorrentes e 50 lançamentos por mês. Mesmo acumulando anos de histórico, a ordem de grandeza permanece em milhares de registros — irrelevante para IndexedDB.

---

## 2. Desempenho

| ID | Requisito | Verificação |
|---|---|---|
| NFR-D01 | A projeção completa de um mês, incluindo expansão, resolução, curva e resumo, executa em tempo imperceptível no volume-alvo | Medição na fase Build and Test |
| NFR-D02 | Nenhum algoritmo da unidade tem complexidade pior que linear no número de ocorrências do intervalo, exceto a ordenação final | Revisão dos algoritmos em `business-logic-model.md` |
| NFR-D03 | A resolução de sobreposição usa índice por chave, não busca linear aninhada | Já especificado no algoritmo DOM-07 |

NFR-D03 não é otimização prematura: a alternativa ingênua — para cada virtual, varrer todas as reais — é quadrática, e o algoritmo já foi especificado com índice justamente para evitá-la.

---

## 3. Disponibilidade — N/A

Não há serviço a manter no ar, failover, RTO ou RPO. A extensão de resiliência foi desabilitada por opção do usuário.

O único risco correlato — perda de dados locais — é endereçado pelo backup (RF-28 a RF-31), que pertence à Unidade 2.

---

## 4. Segurança

| ID | Requisito | Regra |
|---|---|---|
| NFR-S01 | Todas as dependências com versão travada e `package-lock.json` versionado no repositório | SECURITY-10 |
| NFR-S02 | `npm audit` executado como parte do script de verificação antes de qualquer publicação | SECURITY-10 |
| NFR-S03 | Nenhuma dependência não utilizada no `package.json` | SECURITY-10 |
| NFR-S04 | Dependências obtidas exclusivamente do registro oficial do npm | SECURITY-10 |
| NFR-S05 | A unidade não registra em log nenhum valor monetário, data ou nome de lançamento | SECURITY-03 por analogia |

NFR-S05 merece explicação: a regra SECURITY-03 é N/A para este projeto por não haver serviço de log centralizado. Ainda assim, o princípio de não emitir dado financeiro em log se aplica — mensagens de erro do domínio descrevem **qual invariante foi violada**, nunca o valor que a violou.

### Limitação consciente

`npm audit` no script de verificação depende de execução manual antes de publicar. Uma vulnerabilidade divulgada após a última publicação passa despercebida até a próxima verificação. Aceito para um app sem servidor, sem autenticação e sem dado de terceiro. O passo será documentado nas instruções de build, tornando-se procedimento em vez de lembrança.

---

## 5. Confiabilidade

| ID | Requisito |
|---|---|
| NFR-C01 | Funções de domínio rejeitam entrada inválida lançando erro, nunca devolvendo valor especial (RN-40) |
| NFR-C02 | Nenhuma função devolve resultado parcialmente calculado (RN-41) |
| NFR-C03 | Mensagens de erro identificam a invariante violada e o componente, sem expor o dado |
| NFR-C04 | A unidade não realiza I/O; não há falha de rede, disco ou tempo limite a tratar |

---

## 6. Manutenibilidade

| ID | Requisito |
|---|---|
| NFR-M01 | TypeScript em modo `strict`, com `noUncheckedIndexedAccess` habilitado |
| NFR-M02 | Regra de lint de fronteira de import ativa e verificada com um import proibido |
| NFR-M03 | Todo módulo da unidade tem teste por exemplo e teste por propriedade |
| NFR-M04 | Testes por propriedade executam com semente aleatória, registrada na saída em caso de falha |
| NFR-M05 | Geradores de domínio centralizados em `src/test-support/`, reutilizáveis entre unidades |
| NFR-M06 | Arquivos de teste distinguem natureza pelo sufixo: `.test.ts` e `.prop.test.ts` |

NFR-M01 não é preferência de estilo. O domínio manipula índices de arrays de datas e mapas de movimentos por dia. Sem `noUncheckedIndexedAccess`, o TypeScript trata `curva[i]` como sempre definido; um acesso fora de faixa vira `undefined` em tempo de execução, dentro de aritmética monetária — e o resultado é `NaN` propagando por toda a curva.

---

## 7. Usabilidade — N/A

A unidade não possui interface. Os requisitos de usabilidade e acessibilidade (RNF-14 a RNF-19) pertencem à Unidade 3.

---

## 8. Compatibilidade de Plataforma

| ID | Requisito |
|---|---|
| NFR-P01 | Alvo mínimo: iOS 16 e Safari correspondente |
| NFR-P02 | Alvo de compilação configurado para o conjunto de recursos suportado pelo Safari do iOS 16 |
| NFR-P03 | Nenhum recurso de plataforma usado sem verificação de disponibilidade, quando não garantido no alvo |

NFR-P03 vale sobretudo para `navigator.storage.persist()` (RNF-06), cuja disponibilidade varia — o design nunca dependeu do resultado dessa chamada, apenas a tenta quando existe.

---

## 9. Rastreabilidade

| NFR desta unidade | Requisito de origem | Regra de extensão |
|---|---|---|
| NFR-D01 a NFR-D03 | RNF-12, RNF-13 | — |
| NFR-S01 a NFR-S04 | RNF-23 | SECURITY-10 |
| NFR-S05 | — | SECURITY-03 (por princípio) |
| NFR-C01 a NFR-C04 | RNF-25 | SECURITY-15 |
| NFR-M01, NFR-M02 | RNF-27 | — |
| NFR-M03 a NFR-M06 | RNF-28 a RNF-31 | PBT-07, PBT-08, PBT-09, PBT-10 |
| NFR-P01 a NFR-P03 | RNF-01, RNF-06 | — |
