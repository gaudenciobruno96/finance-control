/**
 * UI-08 — Compromissos dos proximos 12 meses (RF-26).
 *
 * E o que da sentido a cadastrar uma compra em 10x: sem esta tela, o app
 * saberia das parcelas mas nunca as mostraria.
 */

import { competenciaDe } from '../../domain/calendar.js'
import { formatarBRL } from '../../domain/money.js'
import { useAgora } from '../hooks/useAgora.js'
import { useFutureCommitments } from '../hooks/useProjection.js'
import estilos from './FutureScreen.module.css'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function FutureScreen() {
  const agora = useAgora()
  const meses = useFutureCommitments(competenciaDe(agora), 12)

  if (meses === undefined) return <p className={estilos.carregando}>Carregando…</p>

  return (
    <div className={estilos.tela}>
      <h1 className={estilos.titulo}>Próximos 12 meses</h1>

      <table className={estilos.tabela}>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">A pagar</th>
            <th scope="col">De parcelas</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.competencia} data-testid={`futuro-${m.competencia}`}>
              <th scope="row" className={estilos.mes}>
                {MESES[Number(m.competencia.slice(5, 7)) - 1]}/{m.competencia.slice(2, 4)}
              </th>
              <td className={estilos.valor}>{formatarBRL(m.totalAPagarCentavos)}</td>
              <td className={estilos.parcelas}>
                {m.deParcelamentosCentavos > 0
                  ? formatarBRL(m.deParcelamentosCentavos)
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className={estilos.nota}>
        A coluna de parcelas inclui as que estão dentro da fatura do cartão, para
        revelar o peso dos parcelamentos que de outro modo ficaria escondido.
      </p>
    </div>
  )
}
