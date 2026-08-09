# Testes de Segurança

**Fase**: CONSTRUCTION — Build and Test
**Data**: 2026-08-09

---

## Escopo Real

A extensão de segurança está habilitada em modo bloqueante. Das 15 regras, **5 são genuinamente aplicáveis** — as outras 10 pressupõem servidor, autenticação ou rede, que este projeto não tem.

Testar o que não existe produziria relatório verde sem significado. O que segue verifica só o que é real.

---

## SECURITY-10 · Cadeia de Suprimentos

```bash
npm audit --audit-level=high     # esperado: found 0 vulnerabilities
npm ls --depth=0                 # confere se há dependência não utilizada
git ls-files package-lock.json   # o lock precisa estar versionado
```

**Dependências de produção**: `dexie`, `react`, `react-dom`, `react-router`, `dexie-react-hooks`. Cinco, todas com versão exata.

Nenhuma biblioteca de gráficos, máscara, formulários, estado global ou telemetria — cada ausência foi uma decisão registrada, e cada uma é uma dependência a menos na superfície de ataque.

**No pipeline**: `npm run verify` roda antes de publicar. Vulnerabilidade alta interrompe a publicação.

---

## SECURITY-04 · Cabeçalhos e CSP

```bash
npm run build
grep -A3 'Content-Security-Policy' dist/index.html
```

Esperado: política sem `unsafe-inline` nem `unsafe-eval`, com `connect-src 'none'`.

**Verificação no navegador**: abra o app com o console aberto. Nenhuma violação de CSP deve aparecer. Uma violação significa que algum código tentou injetar estilo ou script em tempo de execução.

### Limitações conhecidas — não são falhas de teste

| Diretiva | Situação |
|---|---|
| `Strict-Transport-Security` | Não alcançável: o GitHub Pages não permite cabeçalhos customizados. Mitigado — `github.io` está na lista de pré-carregamento de HSTS dos navegadores |
| `frame-ancestors` e `X-Frame-Options` | Não aplicáveis por meta. Mitigado — sem sessão, sem autenticação e sem ação privilegiada, não há superfície de clickjacking |

Documentado em `infrastructure-design.md`. Se um dia forem necessários de fato, a saída é trocar por uma hospedagem que permita cabeçalhos.

---

## SECURITY-13 · Integridade e Entrada Não Confiável

O arquivo de backup é a **única entrada não confiável** do sistema. Já coberto por teste automatizado:

| Verificação | Onde |
|---|---|
| JSON inválido é recusado | `services.test.ts` |
| Estrutura que não é backup é recusada | `services.test.ts` |
| Versão de schema futura é recusada | `services.test.ts` |
| Pagamento pela metade é recusado | `services.test.ts` |
| Referência a cartão ausente é recusada | `services.test.ts` |
| Importação recusada **não altera o banco** | `stateful.prop.test.ts`, por propriedade |
| Conteúdo arbitrário nunca é aceito | `backup.prop.test.ts`, com entrada gerada livremente |

**Verificação manual complementar**: pegue um backup válido, corrompa alguns bytes no meio e tente importar. O app deve recusar com mensagem clara, e **o estado atual deve permanecer intacto**.

**Sem recurso externo**: nenhuma CDN, fonte ou script de terceiro.

```bash
grep -rE 'https?://' dist/assets/*.js | grep -v 'schema\|w3\.org\|localhost'
```

---

## SECURITY-09 · Mensagens de Erro

Já coberto por teste: `errors.test.ts` verifica que a mensagem de erro de domínio **não contém dígito algum**, o que impede vazamento de valor financeiro.

**Verificação manual**: force uma falha — importe um arquivo inválido — e confirme que a mensagem orienta a ação sem expor nome de tabela, rastreamento de pilha ou código técnico.

---

## SECURITY-15 · Tratamento de Falha

**Verificação manual da cota de armazenamento**, que é o caso real mais provável:

1. Ferramentas de desenvolvimento → Application → Storage
2. Reduza a cota ao mínimo
3. Tente salvar algo

Esperado: faixa de erro sugerindo exportar backup e liberar espaço. **A tela permanece utilizável** — não trava nem fica em branco.

---

## O Que Não Faz Sentido Testar Aqui

| Teste usual | Motivo |
|---|---|
| Teste de invasão | Não há servidor a invadir |
| Força bruta em login | Não há login |
| Injeção de SQL | Não há SQL nem entrada em consulta |
| XSS por parâmetro | Não há parâmetro de servidor; a CSP bloqueia script inline |
| Escalação de privilégio | Não há privilégio, papel ou sessão |
| Vazamento de dado em trânsito | Nenhum dado trafega |

A última linha é a mais importante: **a arquitetura elimina a categoria**. Não há dado em trânsito a proteger porque não há trânsito.
