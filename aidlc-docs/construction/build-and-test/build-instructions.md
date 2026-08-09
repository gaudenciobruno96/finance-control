# Instruções de Build

**Fase**: CONSTRUCTION — Build and Test
**Data**: 2026-08-09

---

## Pré-requisitos

| Item | Versão |
|---|---|
| Node.js | 20 ou superior (verificado em 24.18) |
| npm | 10 ou superior (verificado em 11.18) |
| Sistema | Windows, macOS ou Linux |

**Não há variáveis de ambiente.** O app não tem configuração de servidor, chave de API nem segredo — consequência de não haver backend.

---

## Passos

### 1. Instalar dependências

```bash
npm ci
```

Use `npm ci`, não `npm install`: ele respeita o `package-lock.json` exatamente, que é o que garante builds reproduzíveis (SECURITY-10).

### 2. Verificar

```bash
npm run verify
```

Encadeia lint, tipos, testes e varredura de vulnerabilidades. **Rode isto antes de publicar** — é o que substitui o monitoramento contínuo que não existe.

### 3. Construir

```bash
npm run build
```

### 4. Conferir o resultado

Saída esperada:

```
dist/manifest.webmanifest                       0.55 kB
dist/index.html                                 2.28 kB │ gzip:   1.04 kB
dist/assets/index-*.css                        13.97 kB │ gzip:   2.95 kB
dist/assets/workbox-window.prod.es5-*.js        5.65 kB │ gzip:   2.20 kB
dist/assets/index-*.js                        382.28 kB │ gzip: 120.64 kB

PWA v1.3.0
mode      generateSW
precache  12 entries (405.01 KiB)
files generated
  dist/sw.js
  dist/workbox-*.js
```

**Artefatos**: tudo em `dist/`, pronto para hospedagem estática.

### 5. Testar localmente

```bash
npm run dev       # desenvolvimento, com recarga
npm run preview   # serve o build de produção
```

`npm run preview` é o mais próximo do comportamento real, pois serve os arquivos construídos com o service worker ativo.

---

## Verificação Crítica: o Caminho Base

O app é servido de `/finance-control/`, não da raiz. **Três lugares precisam concordar**, e divergência quebra o app de forma silenciosa:

```bash
grep -o 'src="[^"]*"' dist/index.html          # /finance-control/assets/...
grep -o '"start_url":"[^"]*"' dist/manifest.webmanifest  # /finance-control/
grep -c 'finance-control' dist/sw.js           # deve ser > 0
```

**Modo típico de falha**: o app funciona ao abrir pelo Safari e abre **em branco** quando aberto pelo ícone da tela de início. Não há erro visível.

Se o repositório tiver outro nome, ajuste `BASE` em `vite.config.ts`.

---

## Solução de Problemas

### Falha de dependência no `npm ci`

**Causa**: `package-lock.json` dessincronizado do `package.json`.
**Solução**: `rm -rf node_modules package-lock.json && npm install`, e versione o novo lock.

### Falha de tipos

**Causa**: mais comum é `noUncheckedIndexedAccess`, que obriga a tratar acesso indexado como possivelmente indefinido.
**Solução**: não desative a opção. Trate o caso — ela existe porque um índice fora de faixa em aritmética monetária produz `NaN` propagando pela curva inteira.

### Falha de lint na fronteira de import

**Causa**: um import cruzou a fronteira entre camadas.
**Solução**: a mensagem indica a regra violada. `src/domain/` não pode importar de `data`, `services`, `ui`, Dexie ou React — a pureza do domínio é o que sustenta o teste por propriedades.

### `npm audit` acusa vulnerabilidade

**Solução**: `npm audit fix`. Se exigir mudança incompatível, avalie o impacto real antes de atualizar; o app não tem servidor nem entrada de rede, o que reduz muito a superfície.
