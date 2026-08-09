# Verificação no Aparelho

**Fase**: CONSTRUCTION — Build and Test
**Data**: 2026-08-09

---

## Por Que Este Checklist é Manual

Automatizar Safari em iOS custa muito mais do que rende num projeto de uma pessoa. A decisão está registrada desde o documento de design.

**Nada do que segue foi verificado.** É a lista do que só existe quando o app está num iPhone real, e o motivo de o projeto não poder ser declarado pronto sem ela.

---

## Preparação

1. Publique — um push para `main` dispara o pipeline — ou sirva localmente na rede:

```bash
npm run build && npm run preview -- --host
```

2. No iPhone, abra a URL **no Safari**.

> Apenas o Safari oferece "Adicionar à Tela de Início" no iOS. Chrome e Firefox no iPhone não apresentam a opção — é a pegadinha mais comum.

---

## Checklist

### Instalação

- [ ] A página abre no Safari sem erro
- [ ] Compartilhar → "Adicionar à Tela de Início" está disponível
- [ ] O ícone aparece na tela de início, sem moldura branca em volta
- [ ] **Abrir pelo ícone mostra o app, não uma tela em branco**
- [ ] Abre em tela cheia, sem barra de endereço

> O quarto item é o mais importante da lista. Divergência no caminho base faz o app funcionar no Safari e falhar pelo ícone, **sem erro visível**. É a falha mais provável de toda a configuração.

### Funcionamento offline

- [ ] Com o app aberto, ative o modo avião
- [ ] Feche e reabra pelo ícone — carrega normalmente
- [ ] Navegue por todas as cinco telas offline
- [ ] Marque um pagamento offline; ele persiste
- [ ] Desative o modo avião; nada se perde nem se duplica

### Layout no aparelho

- [ ] Nenhum conteúdo fica sob o notch ou a barra inferior
- [ ] A barra de navegação inferior não é cortada
- [ ] Nada exige rolagem horizontal
- [ ] Aumente o tamanho de fonte nos Ajustes do iOS: o texto acompanha e nada quebra
- [ ] Alterne o tema do iOS entre claro e escuro: o app acompanha, sem clarão ao abrir

### Entrada de dados

- [ ] Tocar num campo de dinheiro abre o **teclado numérico**, não o alfabético
- [ ] Digitar `1`, `8`, `0`, `0`, `0` mostra `R$ 180,00`
- [ ] Todos os botões são tocáveis confortavelmente com o polegar

### Os fluxos de verdade

- [ ] Cadastre um salário e uma conta fixa
- [ ] **O mês aparece correto sem nenhum lançamento manual adicional**
- [ ] Marcar como pago leva **dois toques**
- [ ] A curva mostra o dia de menor saldo, e o número confere com a realidade
- [ ] Corrija o valor de uma conta variável sem marcá-la como paga
- [ ] Reajuste uma regra "a partir deste mês" e confira que o mês anterior não mudou

### Backup

- [ ] Exportar abre a folha de compartilhamento do iOS
- [ ] Salvar no iCloud Drive funciona
- [ ] Importar o arquivo restaura o estado
- [ ] **Exportar e reimportar reproduz exatamente o mesmo estado**
- [ ] Importar arquivo inválido é recusado e **nada se perde**

### Persistência ao longo do tempo

- [ ] Feche o app por um dia e reabra: os dados continuam lá
- [ ] Reinicie o iPhone e reabra: os dados continuam lá

> Este é o item que só o tempo verifica, e o que justifica o backup existir. Web apps na tela de início escapam da limpeza automática do Safari, mas isso não é garantia.

---

## Critérios de Sucesso do Projeto

| # | Critério | Verificado por |
|---|---|---|
| 1 | Instala pela tela de início e abre offline | Checklist acima |
| 2 | Mês correto sem lançamento manual | Checklist acima e testes de fluxo |
| 3 | Marcar como pago em dois toques | Checklist acima e `flows.test.tsx` |
| 4 | A curva mostra o dia de menor saldo e confere | Checklist acima e as 8 propriedades do projetor |
| 5 | Backup reproduz o mesmo estado | Checklist acima, `backup.prop.test.ts` e o teste stateful |

Os cinco têm cobertura automatizada parcial. **Nenhum está integralmente verificado sem o aparelho.**
