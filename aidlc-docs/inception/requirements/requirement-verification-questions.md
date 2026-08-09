# Perguntas de Verificação de Requisitos

**Estágio**: INCEPTION — Requirements Analysis
**Data**: 2026-08-08
**Status**: ✅ RESPONDIDO

> **Nota de procedimento**: a pedido do usuário, as perguntas foram apresentadas pelo menu interativo do Claude Code em vez de serem respondidas dentro deste arquivo. As respostas coletadas foram transcritas abaixo para preservar o rastro documental exigido pelo AI-DLC.

> **Contexto**: o documento de design aprovado (`docs/superpowers/specs/2026-08-08-controle-orcamentario-design.md`) já resolveu plataforma, modelo de dados, motor de projeção, telas, backup e estratégia de testes. As perguntas abaixo cobrem **apenas** o que ficou em aberto e o que o AI-DLC exige explicitamente.

---

## Question 1
O app deve permitir navegar para **meses passados** e consultar o histórico de pagamentos?

A) Sim — navegação livre para qualquer mês passado ou futuro, com os dados que existirem

B) Sim, mas somente leitura no passado — meses anteriores ao atual não podem ser editados

C) Não — apenas o mês corrente e os próximos, sem consulta ao passado

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 2
Você precisa lançar **entradas avulsas** (13º salário, férias, freelance, venda de algo, reembolso)?

A) Sim — é comum e precisa entrar na projeção do mês

B) Sim, mas é raro — basta existir a possibilidade, sem destaque na interface

C) Não — todas as minhas entradas são os salários recorrentes já cadastrados

X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 3
O app deve exigir alguma **trava de acesso própria** (PIN ou Face ID) ao abrir?

A) Não — a senha e o Face ID do próprio iPhone já protegem o aparelho, e uma trava extra só atrapalha o uso diário

B) Sim — quero um PIN definido no app, pedido a cada abertura

C) Sim — quero Face ID / Touch ID via WebAuthn, com PIN como alternativa

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 4
Qual **aparência** o app deve ter?

A) Seguir automaticamente o tema do iOS (claro ou escuro conforme o sistema)

B) Somente tema escuro

C) Somente tema claro

D) Seguir o sistema, mas com um botão para forçar claro ou escuro

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 5
Onde os arquivos do app serão **hospedados**?

A) GitHub Pages — gratuito, publica direto do repositório, HTTPS automático

B) Cloudflare Pages — gratuito, HTTPS automático, deploy um pouco mais rápido

C) Netlify ou Vercel — gratuito, HTTPS automático

D) Decidir depois — construir o app agora e resolver a publicação no fim

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 6
Qual o **volume de dados** que você espera?

A) Pequeno — algo como até 10 regras recorrentes e até 50 lançamentos por mês

B) Médio — até 30 regras e até 200 lançamentos por mês

C) Não sei estimar — trate como pequeno e otimize apenas se der problema

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 7
Qual o nível de **acessibilidade** desejado?

A) Básico — contraste adequado, alvos de toque grandes e suporte ao ajuste de tamanho de fonte do iOS

B) Completo — o item A mais rotulagem ARIA para leitor de tela (VoiceOver) e navegação por teclado

C) Nenhum requisito específico

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 8: Extensão de Segurança
As regras da extensão de **segurança** devem ser aplicadas neste projeto?

A) Sim — aplicar todas as regras de SEGURANÇA como restrições bloqueantes

B) Não — pular todas as regras de SEGURANÇA

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 9: Extensão de Resiliência
A baseline de **resiliência** deve ser aplicada neste projeto?

A) Sim — aplicar a baseline de resiliência como orientação direcional de design

B) Não — pular a baseline de resiliência

X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 10: Extensão de Testes Baseados em Propriedades
As regras de **teste baseado em propriedades** (PBT) devem ser aplicadas neste projeto?

A) Sim — aplicar todas as regras de PBT como restrições bloqueantes

B) Parcial — aplicar PBT apenas para funções puras e ida e volta de serialização

C) Não — pular todas as regras de PBT

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Análise de Contradições e Ambiguidades

**Resultado**: nenhuma contradição ou ambiguidade detectada.

Verificações realizadas:

| Verificação | Resultado |
|---|---|
| Escopo vs. impacto | Coerente — novo projeto, sistema completo, complexidade moderada |
| Volume pequeno (Q6) vs. navegação livre a qualquer mês (Q1) | Coerente — mesmo com muitos meses acumulados, o volume por mês é baixo e o motor consulta por competência |
| Segurança habilitada (Q8) vs. ausência de servidor e autenticação | Coerente — a maioria das regras será marcada N/A; as aplicáveis (SECURITY-04, -09, -10, -13, -15) são reais e valem o esforço |
| Resiliência desabilitada (Q9) vs. risco de perda de dados locais | Coerente — o risco está endereçado pelo backup no design, não pela baseline de nuvem |
| PBT completo (Q10) vs. complexidade do domínio | Coerente — o motor de projeção é código puro com propriedades claras de ida e volta, invariante e idempotência |
| Sem trava de acesso (Q3) vs. segurança habilitada (Q8) | Coerente — SECURITY-12 trata autenticação de aplicações multiusuário com servidor; um app local de usuário único protegido pelo desbloqueio do aparelho não se enquadra |
