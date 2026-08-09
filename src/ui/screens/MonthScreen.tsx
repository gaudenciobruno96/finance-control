/**
 * UI-02 — Tela do mes (RF-22 a RF-25).
 *
 * A competencia vive na rota (RN-85), o que permite voltar pelo gesto do iOS e
 * recarregar sem perder o mes em que se estava.
 */

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { competenciaDe, somarMeses } from '../../domain/calendar.js'
import type { Centavos, Competencia, DataISO, OcorrenciaResolvida } from '../../domain/types.js'
import { MonthSummary } from '../components/MonthSummary.js'
import { BalanceCurve } from '../components/BalanceCurve.js'
import { OccurrenceList } from '../components/OccurrenceList.js'
import { PaymentSheet } from '../components/PaymentSheet.js'
import { useAgora } from '../hooks/useAgora.js'
import { useApp } from '../hooks/useApp.js'
import { useAcao } from '../hooks/useErro.js'
import { useMonthProjection } from '../hooks/useProjection.js'
import estilos from './MonthScreen.module.css'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function rotularCompetencia(c: Competencia): string {
  const mes = MESES[Number(c.slice(5, 7)) - 1] ?? c
  return `${mes} de ${c.slice(0, 4)}`
}

export function MonthScreen() {
  const agora = useAgora()
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()

  const competencia = params.get('mes') ?? competenciaDe(agora)
  const mes = useMonthProjection(competencia)

  const { pagamento } = useApp()
  const executar = useAcao()
  const [selecionada, setSelecionada] = useState<OcorrenciaResolvida | null>(null)

  const irPara = (c: Competencia) => setParams({ mes: c })

  if (mes === undefined) {
    return <p className={estilos.carregando}>Carregando…</p>
  }

  const componentesDeFatura = [...mes.aVencer, ...mes.atrasados, ...mes.pagos].filter(
    (o) => o.ehComponenteDeFatura,
  )
  const semComponentes = (lista: readonly OcorrenciaResolvida[]) =>
    lista.filter((o) => !o.ehComponenteDeFatura)

  const fechar = () => setSelecionada(null)

  const acao = (operacao: () => Promise<void>) => {
    void executar(operacao).then(fechar)
  }

  return (
    <div className={estilos.tela}>
      <header className={estilos.navegador}>
        <button
          type="button"
          onClick={() => irPara(somarMeses(competencia, -1))}
          aria-label="Mês anterior"
          data-testid="mes-anterior"
        >
          ‹
        </button>

        <label className={estilos.seletor}>
          <span className={estilos.mesAtual} data-testid="mes-atual">
            {rotularCompetencia(competencia)}
          </span>
          {/* Tocar no titulo abre o seletor nativo de mes, que permite saltar
              para qualquer competencia sem toques repetidos (RN-77). */}
          <input
            type="month"
            className={estilos.inputMes}
            value={competencia}
            onChange={(e) => irPara(e.target.value)}
            aria-label="Escolher mês"
            data-testid="escolher-mes"
          />
        </label>

        <button
          type="button"
          onClick={() => irPara(somarMeses(competencia, 1))}
          aria-label="Próximo mês"
          data-testid="proximo-mes"
        >
          ›
        </button>
      </header>

      <MonthSummary
        resumo={mes.resumo}
        saldoRelativo={mes.curva.saldoRelativo}
        onDeclararSaldo={() => navegar('/ajustes')}
      />

      <div className={estilos.curva}>
        <BalanceCurve curva={mes.curva} />
      </div>

      <OccurrenceList
        titulo="Atrasado"
        ocorrencias={semComponentes(mes.atrasados)}
        componentesDeFatura={componentesDeFatura}
        onSelecionar={setSelecionada}
      />
      <OccurrenceList
        titulo="A vencer"
        ocorrencias={semComponentes(mes.aVencer)}
        componentesDeFatura={componentesDeFatura}
        onSelecionar={setSelecionada}
      />
      <OccurrenceList
        titulo="Pago"
        ocorrencias={semComponentes(mes.pagos)}
        componentesDeFatura={componentesDeFatura}
        onSelecionar={setSelecionada}
      />
      <OccurrenceList
        titulo="Ignorado neste mês"
        ocorrencias={semComponentes(mes.ignorados)}
        componentesDeFatura={componentesDeFatura}
        onSelecionar={setSelecionada}
      />

      {/* Ao fim da lista, proporcional a frequencia de uso (RN-78). */}
      <div className={estilos.rodape}>
        <button
          type="button"
          className={estilos.avulso}
          onClick={() => navegar(`/avulso?mes=${competencia}`)}
          data-testid="lancar-avulso"
        >
          + Lançar entrada ou saída avulsa
        </button>
      </div>

      {selecionada !== null && (
        <PaymentSheet
          ocorrencia={selecionada}
          hoje={agora}
          onFechar={fechar}
          onPagar={(data: DataISO, valor: Centavos) =>
            acao(() => pagamento.registrarPagamento(selecionada, data, valor))
          }
          onDesfazerPagamento={() =>
            acao(() => pagamento.desfazerPagamento(selecionada))
          }
          onAjustarValor={(valor: Centavos) =>
            acao(() => pagamento.ajustarValorPrevisto(selecionada, valor))
          }
          onAdiar={(data: DataISO) =>
            acao(() => pagamento.adiarVencimento(selecionada, data))
          }
          onIgnorar={() => acao(() => pagamento.ignorarNoMes(selecionada))}
          onReativar={() => acao(() => pagamento.reativarNoMes(selecionada))}
        />
      )}
    </div>
  )
}
