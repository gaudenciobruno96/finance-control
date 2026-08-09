/**
 * UI-05 — Lista de ocorrencias, agrupada por situacao (RF-24).
 *
 * Componentes de fatura aparecem ANINHADOS sob a fatura do cartao, recuados e
 * sem valor somado ao total (RN-71). O usuario ve o que compoe a fatura sem
 * que a leitura conte o mesmo dinheiro duas vezes -- o mesmo cuidado que o
 * calculo ja tem.
 */

import { formatarBRL } from '../../domain/money.js'
import type { OcorrenciaResolvida } from '../../domain/types.js'
import estilos from './OccurrenceList.module.css'

const ROTULO_SITUACAO: Record<string, string> = {
  atrasado: 'Atrasado',
  previsto: 'A vencer',
  pago: 'Pago',
  ignorado: 'Ignorado',
}

export interface OccurrenceListProps {
  readonly titulo: string
  readonly ocorrencias: readonly OcorrenciaResolvida[]
  readonly componentesDeFatura: readonly OcorrenciaResolvida[]
  readonly onSelecionar: (o: OcorrenciaResolvida) => void
}

export function OccurrenceList({
  titulo,
  ocorrencias,
  componentesDeFatura,
  onSelecionar,
}: OccurrenceListProps) {
  if (ocorrencias.length === 0) return null

  return (
    <section className={estilos.secao} aria-label={titulo}>
      <h2 className={estilos.titulo}>{titulo}</h2>
      <ul className={estilos.lista}>
        {ocorrencias.map((o) => (
          <li key={o.chave}>
            <Linha ocorrencia={o} onSelecionar={onSelecionar} />
            {o.geradorTipo === 'cartao' && (
              <ul className={estilos.aninhada}>
                {componentesDeFatura
                  .filter((c) => c.competencia === o.competencia)
                  .map((c) => (
                    <li key={c.chave} className={estilos.componente}>
                      <span>{c.nome}</span>
                      <span className={estilos.componenteValor}>
                        {formatarBRL(c.valorPrevistoCentavos)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Linha({
  ocorrencia,
  onSelecionar,
}: {
  ocorrencia: OcorrenciaResolvida
  onSelecionar: (o: OcorrenciaResolvida) => void
}) {
  const valor = ocorrencia.valorPagoCentavos ?? ocorrencia.valorPrevistoCentavos
  const data = ocorrencia.dataPagamento ?? ocorrencia.dataVencimento
  const dia = Number(data.slice(8, 10))

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
          {/* A situacao NUNCA e comunicada apenas por cor (RN-70): o rotulo
              textual esta sempre presente. */}
          dia {dia} · {ROTULO_SITUACAO[ocorrencia.situacao] ?? ocorrencia.situacao}
        </span>
      </span>
      <span
        className={ocorrencia.tipo === 'entrada' ? estilos.entrada : estilos.saida}
      >
        {ocorrencia.tipo === 'entrada' ? '+' : '−'} {formatarBRL(valor)}
      </span>
    </button>
  )
}
