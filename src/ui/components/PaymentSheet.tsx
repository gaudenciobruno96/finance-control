/**
 * UI-06 — Folha de pagamento (RF-13 a RF-18, RN-73).
 *
 * O vocabulario segue o tipo: uma entrada nao se "paga", se recebe, e chamar
 * de pagamento o salario que caiu confunde quem le.
 *
 * Confirmar sao DOIS TOQUES no caso comum: abrir a folha e confirmar. Data
 * preenchida com hoje, valor com o previsto. Acoes secundarias abaixo,
 * visiveis mas sem competir com a principal.
 *
 * Se este fluxo der trabalho, o usuario para de marcar pagamentos -- e todo o
 * resto do app perde o sentido.
 */

import { useState } from 'react'
import { formatarBRL } from '../../domain/money.js'
import type { Centavos, DataISO, OcorrenciaResolvida } from '../../domain/types.js'
import { MoneyInput } from './MoneyInput.js'
import estilos from './PaymentSheet.module.css'

export interface PaymentSheetProps {
  readonly ocorrencia: OcorrenciaResolvida
  readonly hoje: DataISO
  readonly onPagar: (data: DataISO, valor: Centavos) => void
  readonly onDesfazerPagamento: () => void
  readonly onAjustarValor: (valor: Centavos) => void
  readonly onRegistrarParte: (parte: Centavos) => void
  readonly onAdiar: (data: DataISO) => void
  readonly onIgnorar: () => void
  readonly onReativar: () => void
  readonly onFechar: () => void
}

export function PaymentSheet({
  ocorrencia,
  hoje,
  onPagar,
  onDesfazerPagamento,
  onAjustarValor,
  onRegistrarParte,
  onAdiar,
  onIgnorar,
  onReativar,
  onFechar,
}: PaymentSheetProps) {
  const [data, setData] = useState<DataISO>(ocorrencia.dataPagamento ?? hoje)

  // Dois valores SEPARADOS, deliberadamente.
  //
  // Antes ambos os campos compartilhavam um unico estado: corrigir a previsao
  // da conta de luz em 'Outras acoes' sobrescrevia silenciosamente o valor do
  // pagamento, e confirmar registrava o numero errado.
  //
  // Sao grandezas independentes -- quanto se espera pagar e quanto se pagou --
  // e precisam de estados independentes.
  const [valorPago, setValorPago] = useState<Centavos>(
    ocorrencia.valorPagoCentavos ?? ocorrencia.valorPrevistoCentavos,
  )
  const [valorPrevisto, setValorPrevisto] = useState<Centavos>(
    ocorrencia.valorPrevistoCentavos,
  )

  const [vencimento, setVencimento] = useState<DataISO>(ocorrencia.dataVencimento)

  const [parte, setParte] = useState<Centavos>(0)

  const jaPago = ocorrencia.dataPagamento !== null
  const ehEntrada = ocorrencia.tipo === 'entrada'

  // Zero nao diz nada, e o previsto inteiro nao e 'parte': e o total, e nesse
  // caso o certo e confirmar o pagamento, com data.
  const parteValida = parte > 0 && parte < ocorrencia.valorPrevistoCentavos

  return (
    <div className={estilos.fundo} onClick={onFechar} data-testid="payment-sheet">
      <div
        className={estilos.folha}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pagamento-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={estilos.cabecalho}>
          <h2 className={estilos.titulo} id="pagamento-titulo">
            {ocorrencia.nome}
          </h2>
          <p className={estilos.previsto}>
            Previsto: {formatarBRL(ocorrencia.valorPrevistoCentavos)} · vence dia{' '}
            {Number(ocorrencia.dataVencimento.slice(8, 10))}
          </p>
        </header>

        {!ocorrencia.ignorado && (
          <div className={estilos.principal}>
            <label className={estilos.rotulo} htmlFor="pagamento-data">
              {ehEntrada ? 'Data em que caiu' : 'Data do pagamento'}
            </label>
            <input
              id="pagamento-data"
              data-testid="pagamento-data"
              className={estilos.entrada}
              type="date"
              value={data}
              max={hoje}
              onChange={(e) => setData(e.target.value)}
            />

            <MoneyInput
              id="pagamento-valor"
              rotulo={ehEntrada ? 'Valor recebido' : 'Valor pago'}
              valorCentavos={valorPago}
              onChange={setValorPago}
            />

            <button
              type="button"
              className={estilos.confirmar}
              onClick={() => onPagar(data, valorPago)}
              data-testid="confirmar-pagamento"
            >
              {ehEntrada
                ? jaPago
                  ? 'Atualizar recebimento'
                  : 'Confirmar recebimento'
                : jaPago
                  ? 'Atualizar pagamento'
                  : 'Confirmar pagamento'}
            </button>
          </div>
        )}

        {/* Recebimento parcial e um caso frequente -- adiantamento de salario,
            conta paga pela metade -- e por isso fica VISIVEL aqui, e nao
            dentro de 'Outras acoes': escondido, ninguem encontrava. */}
        {!ocorrencia.ignorado && !jaPago && (
          <details className={estilos.parcial}>
            <summary data-testid="parte-antecipada">
              {ehEntrada ? 'Já recebi uma parte' : 'Já paguei uma parte'}
            </summary>

            <div className={estilos.grupo}>
              <MoneyInput
                id="parte-antecipada"
                rotulo={ehEntrada ? 'Quanto já caiu' : 'Quanto já saiu'}
                descricao={
                  ehEntrada
                    ? 'Vale só para este mês. Os próximos continuam com o valor de sempre.'
                    : 'Vale só para este mês.'
                }
                valorCentavos={parte}
                onChange={setParte}
              />

              <p className={estilos.resta} data-testid="resta-apos-parte">
                {parteValida
                  ? `${ehEntrada ? 'Resta receber' : 'Resta pagar'}: ${formatarBRL(
                      ocorrencia.valorPrevistoCentavos - parte,
                    )}`
                  : `Informe um valor entre R$ 0,01 e ${formatarBRL(
                      ocorrencia.valorPrevistoCentavos - 1,
                    )}. Se já veio tudo, confirme o ${
                      ehEntrada ? 'recebimento' : 'pagamento'
                    } acima.`}
              </p>

              <button
                type="button"
                disabled={!parteValida}
                onClick={() => onRegistrarParte(parte)}
                data-testid="salvar-parte"
              >
                Salvar
              </button>
            </div>
          </details>
        )}

        <details className={estilos.secundarias}>
          <summary data-testid="acoes-secundarias">Outras ações</summary>

          <div className={estilos.grupo}>
            <MoneyInput
              id="ajuste-valor"
              rotulo={
                ehEntrada ? 'Mudar o valor só deste mês' : 'Corrigir o valor previsto'
              }
              descricao={
                ehEntrada
                  ? 'Quando o valor deste mês é outro. Os próximos continuam com o de sempre.'
                  : 'Para contas de valor variável, como luz e água. Vale só para este mês.'
              }
              valorCentavos={valorPrevisto}
              onChange={setValorPrevisto}
            />
            <button
              type="button"
              onClick={() => onAjustarValor(valorPrevisto)}
              data-testid="ajustar-valor"
            >
              {ehEntrada ? 'Salvar só para este mês' : 'Salvar sem marcar como pago'}
            </button>
          </div>

          <div className={estilos.grupo}>
            <label className={estilos.rotulo} htmlFor="novo-vencimento">
              Adiar vencimento
            </label>
            <input
              id="novo-vencimento"
              data-testid="novo-vencimento"
              className={estilos.entrada}
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
            <button type="button" onClick={() => onAdiar(vencimento)} data-testid="adiar">
              Adiar
            </button>
          </div>

          <div className={estilos.grupo}>
            {ocorrencia.ignorado ? (
              <button type="button" onClick={onReativar} data-testid="reativar">
                Voltar a considerar neste mês
              </button>
            ) : (
              <button type="button" onClick={onIgnorar} data-testid="ignorar">
                {ehEntrada ? 'Não vou receber neste mês' : 'Ignorar neste mês'}
              </button>
            )}

            {jaPago && (
              <button
                type="button"
                className={estilos.desfazer}
                onClick={onDesfazerPagamento}
                data-testid="desfazer-pagamento"
              >
                {ehEntrada ? 'Desfazer recebimento' : 'Desfazer pagamento'}
              </button>
            )}
          </div>
        </details>

        <button type="button" className={estilos.fechar} onClick={onFechar}>
          Fechar
        </button>
      </div>
    </div>
  )
}
