/**
 * UI-05 — Lista de ocorrencias.
 *
 * Componentes de fatura aparecem ANINHADOS sob a fatura do cartao a que
 * pertencem, recuados e sem valor somado ao total (RN-71). O usuario ve o que
 * compoe a fatura sem que a leitura conte o mesmo dinheiro duas vezes.
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
  readonly componentesDeFatura: readonly OcorrenciaResolvida[]
  readonly onSelecionar: (o: OcorrenciaResolvida) => void
  readonly vazio?: string | undefined
}

export function OccurrenceList({
  titulo,
  total,
  ocorrencias,
  componentesDeFatura,
  onSelecionar,
  vazio,
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
            <Linha ocorrencia={o} onSelecionar={onSelecionar} />

            {o.geradorTipo === 'cartao' && (
              <ul className={estilos.aninhada}>
                {componentesDeFatura
                  // Filtra pelo CARTAO, nao apenas pela competencia.
                  //
                  // Antes o filtro era só por competência: com dois cartões,
                  // cada fatura listava as parcelas de ambos, e o detalhamento
                  // não batia com o próprio total.
                  .filter(
                    (c) =>
                      c.competencia === o.competencia && c.cartaoId === o.cartaoId,
                  )
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
          dia {dia}
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
        </span>
      </span>

      <span className={ocorrencia.tipo === 'entrada' ? estilos.entrada : estilos.saida}>
        {ocorrencia.tipo === 'entrada' ? '+' : '−'} {formatarBRL(valor)}
      </span>
    </button>
  )
}
