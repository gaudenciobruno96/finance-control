# Resumo de Build e Testes

**Fase**: CONSTRUCTION — Build and Test
**Data**: 2026-08-09

---

## Build

| Item | Resultado |
|---|---|
| Ferramenta | Vite 8.2.1 |
| Situação | **Sucesso** |
| Módulos transformados | 137 |
| JavaScript | 382 KB (121 KB comprimido) |
| CSS | 14 KB (3 KB comprimido) |
| Service worker | 12 entradas pré-cacheadas, 405 KB |
| Tempo | menos de 1 segundo |

Artefatos em `dist/`, prontos para hospedagem estática.

**Caminho base verificado** no artefato construído: `index.html`, manifesto e service worker concordam em `/finance-control/`.

---

## Testes Automatizados

```
Test Files  31 passed (31)
     Tests  309 passed (309)
```

**309 testes, 0 falhas.**

### Por natureza

| Natureza | Papel |
|---|---|
| Por exemplo (`*.test.ts`) | Fixa comportamento concreto com valor esperado |
| Por propriedade (`*.prop.test.ts`) | Verifica invariantes sobre centenas de entradas geradas |
| Stateful (PBT-06) | Sequências aleatórias de comandos com invariantes a cada passo |

### Cobertura por camada

| Camada | Linhas |
|---|---|
| `domain` | **99,05%** |
| `services` | 93,90% |
| `data` | 85,34% |
| `ui/components` | 90,27% |
| `ui/hooks` | 62,50% |
| `ui/screens` | 45,45% |
| **Total** | **84,02%** |

A distribuição é intencional. A estratégia definida no documento de design previa concentrar o esforço no motor puro e manter poucos testes de interface, restritos aos fluxos semanais. A cobertura reflete isso: quase total onde o erro é caro e silencioso, seletiva onde o erro aparece na tela.

### Integração

Executada junto com os unitários — não há serviço a subir. Cobre U1→U2 (`services.test.ts`), U2 interna (`stateful.prop.test.ts`) e U1+U2→U3 (`flows.test.tsx`, sobre banco real, sem simulação de serviço).

### Segurança

| Regra | Situação |
|---|---|
| SECURITY-04 | **Parcial, documentado** — CSP restritiva sem `unsafe-inline`; HSTS e `frame-ancestors` inalcançáveis no GitHub Pages, com mitigações analisadas |
| SECURITY-09 | **Conforme** — verificado por teste que assegura ausência de dígitos nas mensagens de erro |
| SECURITY-10 | **Conforme** — 0 vulnerabilidades, 5 dependências de produção, lock versionado, varredura no pipeline |
| SECURITY-13 | **Conforme** — 7 verificações automatizadas sobre a única entrada não confiável |
| SECURITY-15 | **Conforme** — falha de escrita vira faixa; fronteira de erro como último recurso |
| Demais 10 regras | **N/A** — pressupõem servidor, autenticação ou rede |

### Desempenho

Testes de carga **não se aplicam**: não há servidor nem concorrência. O que existe é a verificação de que a projeção é imperceptível no volume-alvo, feita no aparelho.

---

## Defeitos Encontrados Durante a Construção

Quatro, todos corrigidos. Vale registrar **como** cada um apareceu:

| # | Defeito | Como apareceu |
|---|---|---|
| 1 | Projeção de mês futuro descartava movimentos entre a âncora e o mês | Um teste mal escrito falhou; investigar mostrou que o erro estava no código |
| 2 | Ocorrências órfãs sumiam do histórico ao remover uma regra | Uma pergunta de design da Unidade 2 expôs uma suposição implícita da Unidade 1 |
| 3 | PROP-P02 contradizia o comportamento implementado | O teste stateful falhou com uma sequência de **um único comando** |
| 4 | `ErrorBoundary` marcado como feito sem ter sido criado | Conferência dos checkboxes contra os arquivos em disco |

Nenhum dos quatro seria encontrado por revisão de código lendo o diff. Dois vieram de testes, um de uma pergunta de design, um de conferência manual.

---

## Situação Geral

| Item | Situação |
|---|---|
| Build | **Sucesso** |
| Testes automatizados | **309 passando, 0 falhas** |
| Vulnerabilidades | **0** |
| Achados bloqueantes | **Nenhum** |
| **Verificação no aparelho** | **Pendente** |

### O que "pendente" significa aqui

O app não foi executado em nenhum iPhone. Isto não está verificado:

- instalação pela tela de início e abertura pelo ícone;
- funcionamento offline após a instalação;
- safe area, teclado numérico, tamanho de fonte, tema;
- exportação de backup pela folha de compartilhamento do iOS.

O checklist está em `e2e-test-instructions.md`. **O item de maior risco** é o app abrir em branco pelo ícone por divergência de caminho base — os artefatos concordam, mas isso só se confirma instalando.

---

## Arquivos Gerados

| Arquivo | Conteúdo |
|---|---|
| `build-instructions.md` | Pré-requisitos, passos, verificação do caminho base, solução de problemas |
| `unit-test-instructions.md` | Execução, cobertura, como reproduzir falha por semente |
| `integration-test-instructions.md` | Cenários entre unidades e a armadilha de isolamento entre testes |
| `performance-test-instructions.md` | O que medir e o que foi deliberadamente não otimizado |
| `security-test-instructions.md` | As 5 regras aplicáveis e as 10 que não são |
| `e2e-test-instructions.md` | Checklist manual no iPhone |
| `build-and-test-summary.md` | Este documento |

---

## Próximo Passo

Pronto para a fase de Operations, que no AI-DLC atual é um marcador para expansão futura.

**Antes de considerar o projeto concluído**, execute o checklist de `e2e-test-instructions.md` num iPhone. É o que separa "os testes passam" de "o app funciona".
