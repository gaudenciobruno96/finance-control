/**
 * UI-05 — Lista de ocorrencias.
 *
 * Uma linha por ocorrencia, sem hierarquia. Toda linha e um botao: e a unica
 * porta de entrada para a folha de pagamento.
 */

import { formatarBRL } from '../../domain/money.js'
import type { OcorrenciaResolvida } from '../../domain/types.js'
import estilos from './OccurrenceList.module.css'

/**
 * Marca exibida ao lado do item.
 *
 * "Atrasado" nunca aparece em entrada: e vocabulario de divida (RN-90).
 */
const MARCA: Partial<Record<string, string>> = {
  atrasado: 'venceu',
  a_confirmar: 'confira se caiu',
  ignorado: 'ignorado neste mês',
}

export interface OccurrenceListProps {
  readonly titulo: string
  readonly total?: number | undefined
  readonly ocorrencias: readonly OcorrenciaResolvida[]
  readonly onSelecionar: (o: OcorrenciaResolvida) => void
  readonly vazio?: string | undefined
  /** Competencia exibida na tela; linhas de outros meses ganham o rotulo do mes. */
  readonly competenciaExibida?: string | undefined
}

export function OccurrenceList({
  titulo,
  total,
  ocorrencias,
  onSelecionar,
  vazio,
  competenciaExibida,
}: OccurrenceListProps) {
  if (ocorrencias.length === 0) {
    if (vazio === undefined) return null
    return (
      <section className={estilos.secao} aria-label={titulo}>
        <Cabecalho titulo={titulo} total={total} />
        <p className={estilos.vazio}>{vazio}</p>
      </section>
    )
  }

  return (
    <section className={estilos.secao} aria-label={titulo}>
      <Cabecalho titulo={titulo} total={total} />

      <ul className={estilos.lista}>
        {ocorrencias.map((o) => (
          <li key={o.chave}>
            <Linha
              ocorrencia={o}
              onSelecionar={onSelecionar}
              mostrarMes={
                competenciaExibida !== undefined && o.competencia !== competenciaExibida
              }
            />

          </li>
        ))}
      </ul>
    </section>
  )
}

function Cabecalho({ titulo, total }: { titulo: string; total?: number | undefined }) {
  return (
    <header className={estilos.cabecalho}>
      <h2 className={estilos.titulo}>{titulo}</h2>
      {total !== undefined && (
        <span className={estilos.total}>{formatarBRL(total)}</span>
      )}
    </header>
  )
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function mesCurto(competencia: string): string {
  return MES_CURTO[Number(competencia.slice(5, 7)) - 1] ?? competencia
}

function Linha({
  ocorrencia,
  onSelecionar,
  mostrarMes = false,
}: {
  ocorrencia: OcorrenciaResolvida
  onSelecionar: (o: OcorrenciaResolvida) => void
  mostrarMes?: boolean
}) {
  const valor = ocorrencia.valorPagoCentavos ?? ocorrencia.valorPrevistoCentavos
  const data = ocorrencia.dataPagamento ?? ocorrencia.dataVencimento
  const dia = Number(data.slice(8, 10))
  const marca = MARCA[ocorrencia.situacao]

  return (
    <button
      type="button"
      className={estilos.linha}
      onClick={() => onSelecionar(ocorrencia)}
      data-testid={`ocorrencia-${ocorrencia.chave}`}
    >
      <span className={estilos.info}>
        <span className={estilos.nome}>{ocorrencia.nome}</span>
        <span className={estilos.meta}>
          {/* A situacao nunca e comunicada apenas por cor (RN-70). */}
          {/* A lista mescla dividas de meses anteriores com as do mes atual.
              Sem o mes, duas linhas do mesmo aluguel liam ambas 'dia 10'. */}
          dia {dia}
          {mostrarMes ? ` de ${mesCurto(ocorrencia.competencia)}` : ''}
          {marca !== undefined && (
            <>
              {' · '}
              <span
                className={
                  ocorrencia.situacao === 'atrasado' ? estilos.alerta : undefined
                }
              >
                {marca}
              </span>
            </>
          )}
          {/* Sem isto, um salario de 18.000 que virou 10.000 por causa de um
              adiantamento aparece como 10.000 e mais nada -- e daqui a duas
              semanas ninguem lembra por que. */}
          {ocorrencia.observacao !== null && ` · ${ocorrencia.observacao}`}
        </span>
      </span>

      <span className={ocorrencia.tipo === 'entrada' ? estilos.entrada : estilos.saida}>
        {ocorrencia.tipo === 'entrada' ? '+' : '−'} {formatarBRL(valor)}
      </span>
    </button>
  )
}
