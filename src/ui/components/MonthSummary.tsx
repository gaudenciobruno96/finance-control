/**
 * UI-03 — O bloco que responde a pergunta central do app (RF-22).
 *
 * Um numero grande: quanto sobra depois de pagar tudo. Os demais valores
 * aparecem como a CONTA que leva ate ele, nao como numeros concorrentes.
 *
 * A versao anterior mostrava quatro numeros com peso igual, e o usuario tinha
 * de fazer a conta de cabeca para chegar no que queria saber.
 */

import { formatarBRL } from '../../domain/money.js'
import type { Centavos, OcorrenciaResolvida } from '../../domain/types.js'
import { MoneyInput } from './MoneyInput.js'
import estilos from './MonthSummary.module.css'

export interface MonthSummaryProps {
  readonly sobraCentavos: Centavos
  readonly saldoNaReferenciaCentavos: Centavos
  readonly referenciaEhHoje: boolean
  readonly temAncora: boolean
  readonly saldoRelativo: boolean
  readonly aindaEntraCentavos: Centavos
  readonly faltaPagarCentavos: Centavos

  /**
   * O que compoe cada uma das duas linhas.
   *
   * As linhas abrem porque o total sozinho nao responde a pergunta seguinte:
   * 'ainda entra quanto, vindo de onde?'. Um recebimento antecipado sai do
   * total sem deixar rastro, e sem a lista nao ha como conferir.
   */
  readonly detalheEntra: readonly OcorrenciaResolvida[]
  readonly detalheSai: readonly OcorrenciaResolvida[]
  readonly editandoSaldo: boolean
  readonly saldoEmEdicao: Centavos
  readonly onAbrirEdicao: () => void
  readonly onMudarSaldo: (v: Centavos) => void
  readonly onSalvarSaldo: () => void
  readonly onCancelarEdicao: () => void
}

export function MonthSummary({
  sobraCentavos,
  saldoNaReferenciaCentavos,
  referenciaEhHoje,
  temAncora,
  saldoRelativo,
  aindaEntraCentavos,
  faltaPagarCentavos,
  detalheEntra,
  detalheSai,
  editandoSaldo,
  saldoEmEdicao,
  onAbrirEdicao,
  onMudarSaldo,
  onSalvarSaldo,
  onCancelarEdicao,
}: MonthSummaryProps) {
  const semSaldo = !temAncora

  return (
    <section className={estilos.bloco} aria-label="Resumo do mês">
      <p className={estilos.rotuloPrincipal}>Sobra no fim do mês</p>
      <strong
        className={sobraCentavos < 0 ? estilos.sobraNegativa : estilos.sobra}
        data-testid="sobra-do-mes"
      >
        {formatarBRL(sobraCentavos)}
      </strong>

      <div className={estilos.conta}>
        {editandoSaldo ? (
          <div className={estilos.edicao} data-testid="edicao-saldo">
            <MoneyInput
              id="saldo-inline"
              rotulo="Quanto você tem hoje"
              valorCentavos={saldoEmEdicao}
              onChange={onMudarSaldo}
              autoFocus
            />
            <div className={estilos.acoesEdicao}>
              <button
                type="button"
                className={estilos.salvar}
                onClick={onSalvarSaldo}
                data-testid="salvar-saldo-inline"
              >
                Salvar
              </button>
              <button type="button" onClick={onCancelarEdicao}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={estilos.linhaSaldo}
            onClick={onAbrirEdicao}
            data-testid="editar-saldo"
          >
            <span className={estilos.valorConta}>
              {formatarBRL(saldoNaReferenciaCentavos)}
            </span>
            <span className={estilos.descricaoConta}>
              {semSaldo
                ? 'toque para informar seu saldo'
                : referenciaEhHoje
                  ? 'que você tem hoje'
                  : 'no início deste mês'}
            </span>
            <span className={estilos.editar} aria-hidden="true">
              ✎
            </span>
          </button>
        )}

        <LinhaAbrivel
          sinal="+"
          valorCentavos={aindaEntraCentavos}
          descricao="ainda entra"
          itens={detalheEntra}
          testId="detalhe-entra"
        />

        <LinhaAbrivel
          sinal="−"
          valorCentavos={faltaPagarCentavos}
          descricao="ainda sai"
          itens={detalheSai}
          testId="detalhe-sai"
        />
      </div>

      {/* O aviso segue o sinal da PROJECAO, nao a mera ausencia de ancora: a
          curva tambem fica relativa ao abrir um mes anterior ao saldo
          declarado, e sem isso um numero relativo era exibido como absoluto. */}
      {saldoRelativo && (
        <p className={estilos.aviso} data-testid="aviso-saldo-relativo">
          {semSaldo
            ? 'Sem o seu saldo, os valores acima são relativos — a forma da curva e o dia de aperto já estão corretos, só o nível está deslocado.'
            : 'Este mês é anterior ao saldo que você informou, então os valores acima são relativos: as diferenças estão certas, o nível não.'}
        </p>
      )}
    </section>
  )
}

const MES_CURTO = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

/**
 * Uma linha da conta que se abre no que a compoe.
 *
 * Sem itens a linha vira um paragrafo comum: um `<details>` que abre para nada
 * convida ao toque e nao entrega nada.
 */
function LinhaAbrivel({
  sinal,
  valorCentavos,
  descricao,
  itens,
  testId,
}: {
  sinal: string
  valorCentavos: Centavos
  descricao: string
  itens: readonly OcorrenciaResolvida[]
  testId: string
}) {
  const corpo = (
    <>
      <span className={estilos.sinal}>{sinal}</span>
      <span className={estilos.valorConta}>{formatarBRL(valorCentavos)}</span>
      <span className={estilos.descricaoConta}>{descricao}</span>
    </>
  )

  if (itens.length === 0) {
    return <p className={estilos.linhaConta}>{corpo}</p>
  }

  return (
    <details className={estilos.detalhe}>
      <summary className={estilos.linhaConta} data-testid={testId}>
        {corpo}
        <span className={estilos.seta} aria-hidden="true">
          ⌄
        </span>
      </summary>

      <ul className={estilos.itens}>
        {itens.map((o) => {
          const data = o.dataPagamento ?? o.dataVencimento
          const mes = MES_CURTO[Number(data.slice(5, 7)) - 1] ?? ''
          return (
            <li key={o.chave} className={estilos.item}>
              <span className={estilos.itemNome}>{o.nome}</span>
              <span className={estilos.itemData}>
                dia {Number(data.slice(8, 10))} de {mes}
              </span>
              <span className={estilos.itemValor}>
                {formatarBRL(o.valorPagoCentavos ?? o.valorPrevistoCentavos)}
              </span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

