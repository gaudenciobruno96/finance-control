/**
 * UI-02 — Tela do mes (RF-22 a RF-25).
 *
 * Desenhada em torno de UMA pergunta: quanto sobra depois de pagar tudo.
 *
 * A competencia vive na rota (RN-85), o que permite voltar pelo gesto do iOS e
 * recarregar sem perder o mes em que se estava.
 */

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSearchParams } from 'react-router'
import {
  competenciaDe,
  ehCompetenciaValida,
  somarMeses,
} from '../../domain/calendar.js'
import type {
  Centavos,
  Competencia,
  DataISO,
  OcorrenciaResolvida,
} from '../../domain/types.js'
import { MonthSummary } from '../components/MonthSummary.js'
import { BalanceCurve } from '../components/BalanceCurve.js'
import { OccurrenceList } from '../components/OccurrenceList.js'
import { PaymentSheet } from '../components/PaymentSheet.js'
import { QuickExpense } from '../components/QuickExpense.js'
import { useAgora } from '../hooks/useAgora.js'
import { useApp } from '../hooks/useApp.js'
import { useSalvarLancamento } from '../hooks/useLancamento.js'
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

  // Valida antes de usar: um `?mes=` vazio ou malformado chegaria ao dominio,
  // que lancaria dentro do querier do useLiveQuery e derrubaria o app inteiro
  // na fronteira de erro, exigindo recarregar.
  const parametro = params.get('mes')
  const competencia =
    parametro !== null && ehCompetenciaValida(parametro)
      ? parametro
      : competenciaDe(agora)

  const mes = useMonthProjection(competencia)
  const { pagamento, regras, repos } = useApp()
  const executar = useAcao()
  const salvarLancamento = useSalvarLancamento()

  const ancora = useLiveQuery(() => repos.ancoras.vigenteEm(agora), [repos, agora])

  const [selecionada, setSelecionada] = useState<OcorrenciaResolvida | null>(null)
  const [editandoSaldo, setEditandoSaldo] = useState(false)
  const [saldoEmEdicao, setSaldoEmEdicao] = useState<Centavos>(0)
  const [lancando, setLancando] = useState(false)

  const irPara = (c: Competencia) => {
    if (ehCompetenciaValida(c)) setParams({ mes: c })
  }

  if (mes === undefined) {
    return <p className={estilos.carregando}>Carregando…</p>
  }

  const fechar = () => setSelecionada(null)

  const acao = (operacao: () => Promise<void>) => {
    void executar(operacao).then(fechar)
  }

  const abrirEdicaoDeSaldo = () => {
    setSaldoEmEdicao(ancora?.saldoCentavos ?? 0)
    setEditandoSaldo(true)
  }

  const salvarSaldo = () => {
    void executar(async () => {
      await regras.definirAncora(agora, saldoEmEdicao, agora)
      setEditandoSaldo(false)
    })
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
          {/* Tocar no titulo abre o seletor nativo, permitindo saltar meses
              sem toques repetidos (RN-77). Um valor vazio e ignorado. */}
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


        sobraCentavos={mes.sobraCentavos}
        saldoNaReferenciaCentavos={mes.saldoNaReferenciaCentavos}
        referenciaEhHoje={mes.referenciaEhHoje}
        temAncora={ancora !== undefined && ancora !== null}
        saldoRelativo={mes.saldoRelativo}
        aindaEntraCentavos={mes.entraAposReferenciaCentavos}
        faltaPagarCentavos={mes.saiAposReferenciaCentavos}
        detalheEntra={mes.detalheEntraApos}
        detalheSai={mes.detalheSaiApos}
        editandoSaldo={editandoSaldo}
        saldoEmEdicao={saldoEmEdicao}
        onAbrirEdicao={abrirEdicaoDeSaldo}
        onMudarSaldo={setSaldoEmEdicao}
        onSalvarSaldo={salvarSaldo}
        onCancelarEdicao={() => setEditandoSaldo(false)}
      />

      <div className={estilos.curva}>
        <BalanceCurve curva={mes.curva} />
      </div>

      <OccurrenceList
        titulo="Falta pagar"
        total={mes.totalFaltaPagarCentavos}
        ocorrencias={mes.faltaPagar}
        onSelecionar={setSelecionada}
        competenciaExibida={competencia}
        vazio="Nada a pagar neste mês."
      />

      <div className={estilos.rodapeLista}>
        {lancando ? (
          <QuickExpense
            competencia={competencia}
            hoje={agora}
            onCancelar={() => setLancando(false)}
            onSalvar={(dados) => {
              void executar(async () => {
                await salvarLancamento(dados)
                setLancando(false)
              })
            }}
          />
        ) : (
          <button
            type="button"
            className={estilos.anotar}
            onClick={() => setLancando(true)}
            data-testid="anotar-conta"
          >
            + Anotar uma conta
          </button>
        )}
      </div>

      <OccurrenceList
        titulo="Ainda entra"
        total={mes.totalAindaEntraCentavos}
        ocorrencias={mes.aindaEntra}
        onSelecionar={setSelecionada}
      />

      {mes.jaResolvido.length > 0 && (
        <details className={estilos.resolvido}>
          <summary data-testid="ja-resolvido">
            Já resolvido ({mes.jaResolvido.length})
          </summary>
          <OccurrenceList
            titulo="Já resolvido"
            ocorrencias={mes.jaResolvido}
                onSelecionar={setSelecionada}
          />
        </details>
      )}

      {mes.ignorados.length > 0 && (
        <details className={estilos.resolvido}>
          <summary>Ignorado neste mês ({mes.ignorados.length})</summary>
          <OccurrenceList
            titulo="Ignorado neste mês"
            ocorrencias={mes.ignorados}
                onSelecionar={setSelecionada}
          />
        </details>
      )}

      {selecionada !== null && (
        <PaymentSheet
          ocorrencia={selecionada}
          hoje={agora}
          onFechar={fechar}
          onPagar={(data: DataISO, valor: Centavos) =>
            acao(() => pagamento.registrarPagamento(selecionada, data, valor))
          }
          onDesfazerPagamento={() => acao(() => pagamento.desfazerPagamento(selecionada))}
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
