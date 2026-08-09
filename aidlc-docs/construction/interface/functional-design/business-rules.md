# Regras de Apresentação — Unidade 3 (`interface`)

**Fase**: CONSTRUCTION
**Data**: 2026-08-08

> Numeração continua a da Unidade 2, que foi até RN-65. Estas são regras de **apresentação e interação** — nenhuma decide algo de negócio, o que continua sendo responsabilidade das Unidades 1 e 2.

---

## Entrada de Valores

### RN-66 · Máscara progressiva
O campo monetário acumula dígitos e formata da direita para a esquerda. Nunca aceita estado intermediário inválido.

### RN-67 · Teclado numérico simples
`inputMode="numeric"`. A máscara elimina a necessidade da tecla de vírgula, que no teclado do iPhone exige alternar de painel.

### RN-68 · `deEntradaUsuario` permanece como caminho secundário
Continua sendo usada para valor colado da área de transferência, e sustenta a propriedade de ida e volta PROP-M04. Não é código morto.

---

## Apresentação de Valores e Situação

### RN-69 · Saldo relativo é sempre sinalizado
Quando a projeção devolve `saldoRelativo`, o resumo exibe aviso e um atalho para declarar o saldo. Um número que parece absoluto sem ser é pior que a ausência do número.

### RN-70 · Situação nunca é comunicada apenas por cor
Atrasado, a vencer, pago e ignorado sempre têm rótulo textual além da cor.

### RN-71 · Componentes de fatura aparecem aninhados
Recuados sob a fatura do cartão, sem valor somado ao total. O usuário vê o que compõe a fatura sem que a leitura conte o mesmo dinheiro duas vezes.

### RN-72 · Fatura suprimida não aparece na lista, mas o cartão permanece acessível
Coerente com RN-23 e RN-24: a supressão vale para a listagem do mês; informar a fatura de qualquer competência continua possível pelo cadastro do cartão.

---

## Interação

### RN-73 · Marcar como pago são dois toques
Abrir a folha e confirmar. Data preenchida com hoje, valor com o previsto. Ações secundárias abaixo, sem competir com a principal.

### RN-74 · Ação destrutiva exige confirmação com texto próprio
Cada ação declara sua mensagem, explicando a consequência real. Diálogo nativo do navegador é proibido: bloqueia a página inteira no iOS.

### RN-75 · Só a importação anuncia perda de dado
Remover regra, parcelamento ou cartão preserva o que já foi pago (RN-46), e a mensagem diz isso. Importar substitui tudo (RN-57), e é a única mensagem que avisa que a ação não pode ser desfeita.

### RN-76 · Backup importa em dois passos
Validar e mostrar o resumo; só então oferecer a confirmação. O botão de confirmar não existe antes do resumo.

### RN-77 · Navegação por setas e seletor
Setas para mês anterior e seguinte; o título abre seletor. Deslize horizontal é descartado por conflitar com o gesto de voltar do iOS.

### RN-78 · Lançamento avulso fica ao fim da lista
Proporcional à frequência de uso.

---

## Validação

### RN-79 · Validação na confirmação, não a cada tecla
Validar durante a digitação faz o formulário reclamar de um campo que o usuário ainda está preenchendo.

### RN-80 · A mensagem de erro diz o que fazer
Não apenas o que falhou. "Seu armazenamento pode estar cheio; exporte um backup e libere espaço" em vez de "erro ao salvar".

### RN-81 · Erro não bloqueia a tela
Faixa no topo; o restante permanece utilizável.

### RN-82 · Erro nunca expõe detalhe interno
Sem rastreamento de pilha, sem nome de tabela, sem código técnico (RNF-26, SECURITY-09).

---

## Estado e Reatividade

### RN-83 · Nenhuma tela recarrega manualmente
`useLiveQuery` propaga toda escrita. Uma recarga manual seria sinal de que a assinatura está incompleta.

### RN-84 · `dexie-react-hooks` só existe nos três hooks
Nenhum componente de tela o importa. É a concessão consciente à regra de camadas, e mantê-la contida é o que permite revertê-la barato.

### RN-85 · A competência vive na rota
`/?mes=2026-08`. Permite voltar pelo gesto do iOS e recarregar sem perder o mês em que se estava.

---

## Tema e Acessibilidade

### RN-86 · Tema segue o sistema por CSS
`prefers-color-scheme`, sem estado em JavaScript. Evita descompasso no primeiro quadro.

### RN-87 · Alvos de toque de no mínimo 44 pontos

### RN-88 · Tipografia em unidades relativas
Respeita o ajuste de tamanho de fonte do iOS.

### RN-89 · A curva tem alternativa textual
`aria-label` com saldo inicial, saldo final e o dia de saldo mínimo com seu valor.

---

## Rastreabilidade

| Regras | Requisito |
|---|---|
| RN-66 a RN-68 | RNF-17 |
| RN-69 a RN-72 | RF-22, RF-24, RN-30 |
| RN-73 | RF-15 |
| RN-74 a RN-76 | RF-21, RF-29, RF-30 |
| RN-77, RN-78 | RF-03, RF-25 |
| RN-79 a RN-82 | RNF-25, RNF-26 |
| RN-83 a RN-85 | RNF-27 |
| RN-86 a RN-89 | RNF-15, RNF-18, RNF-19 |
