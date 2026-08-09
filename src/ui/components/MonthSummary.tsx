/**
 * UI-03 — Os quatro numeros do topo (RF-22).
 */

import { formatarBRL } from '../../domain/money.js'
import type { ResumoMes } from '../../domain/types.js'
import estilos from './MonthSummary.module.css'

export interface MonthSummaryProps {
  readonly resumo: ResumoMes
  readonly saldoRelativo: boolean
  readonly onDeclararSaldo: () => void
}

export function MonthSummary({ resumo, saldoRelativo, onDeclararSaldo }: MonthSummaryProps) {
  return (
    <section className={estilos.bloco} aria-label="Resumo do mês">
      <div className={estilos.grade}>
        <Numero rotulo="A receber" valor={resumo.aReceberCentavos} tom="entrada" />
        <Numero rotulo="A pagar" valor={resumo.aPagarCentavos} tom="saida" />
        <Numero rotulo="Balanço previsto" valor={resumo.balancoPrevistoCentavos} tom="auto" />
        <Numero
          rotulo="Saldo no fim do mês"
          valor={resumo.saldoFinalProjetadoCentavos}
          tom="auto"
          destaque
        />
      </div>

      <p className={estilos.falta} data-testid="resumo-falta">
        Falta pagar {formatarBRL(resumo.faltaPagarCentavos)} de{' '}
        {formatarBRL(resumo.aPagarCentavos)}
      </p>

      {saldoRelativo && (
        <div className={estilos.aviso} data-testid="aviso-saldo-relativo">
          <p>
            Os valores acima são <strong>relativos</strong>: você ainda não informou seu
            saldo atual. A forma da curva e o dia de menor saldo já estão corretos.
          </p>
          <button type="button" onClick={onDeclararSaldo} data-testid="declarar-saldo">
            Informar meu saldo
          </button>
        </div>
      )}
    </section>
  )
}

function Numero({
  rotulo,
  valor,
  tom,
  destaque = false,
}: {
  rotulo: string
  valor: number
  tom: 'entrada' | 'saida' | 'auto'
  destaque?: boolean
}) {
  const classe =
    tom === 'entrada'
      ? estilos.entrada
      : tom === 'saida'
        ? estilos.saida
        : valor < 0
          ? estilos.saida
          : estilos.entrada

  return (
    <div className={destaque ? estilos.itemDestaque : estilos.item}>
      <span className={estilos.rotulo}>{rotulo}</span>
      <strong className={`${estilos.valor} ${classe}`}>{formatarBRL(valor)}</strong>
    </div>
  )
}
