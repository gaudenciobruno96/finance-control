/**
 * UI-04 — Curva de saldo em SVG proprio.
 *
 * Sem biblioteca de graficos (decisao 5 do Application Design): a curva e uma
 * polilinha com o ponto minimo destacado, e escrever isso custa menos que
 * carregar e manter uma dependencia.
 */

import { formatarBRL } from '../../domain/money.js'
import type { CurvaSaldo } from '../../domain/types.js'
import estilos from './BalanceCurve.module.css'

const LARGURA = 320
const ALTURA = 120
const MARGEM = 8

export interface Ponto {
  readonly x: number
  readonly y: number
}

/**
 * Converte a curva em coordenadas de tela.
 *
 * Funcao pura, exportada para teste por propriedade.
 *
 * O caso que exige cuidado: quando todos os saldos sao iguais -- ou ha um
 * unico ponto -- a amplitude e zero, e uma normalizacao ingenua dividiria por
 * zero, produzindo NaN em toda coordenada. O SVG resultante desapareceria
 * silenciosamente, sem erro no console (PROP-U06).
 */
export function calcularPontos(curva: CurvaSaldo): readonly Ponto[] {
  const total = curva.pontos.length
  if (total === 0) return []

  const saldos = curva.pontos.map((p) => p.saldoCentavos)
  const minimo = Math.min(...saldos)
  const maximo = Math.max(...saldos)
  const amplitude = maximo - minimo

  const alturaUtil = ALTURA - MARGEM * 2
  const larguraUtil = LARGURA - MARGEM * 2

  return curva.pontos.map((ponto, i) => ({
    x: total === 1 ? LARGURA / 2 : MARGEM + (i / (total - 1)) * larguraUtil,
    y:
      amplitude === 0
        ? ALTURA / 2
        : MARGEM + (1 - (ponto.saldoCentavos - minimo) / amplitude) * alturaUtil,
  }))
}

/** Posicao vertical do zero, quando a curva cruza o negativo. */
function linhaDoZero(curva: CurvaSaldo): number | null {
  const saldos = curva.pontos.map((p) => p.saldoCentavos)
  if (saldos.length === 0) return null

  const minimo = Math.min(...saldos)
  const maximo = Math.max(...saldos)
  if (minimo >= 0 || maximo < 0) return null

  const amplitude = maximo - minimo
  if (amplitude === 0) return null

  return MARGEM + (1 - (0 - minimo) / amplitude) * (ALTURA - MARGEM * 2)
}

function descrever(curva: CurvaSaldo): string {
  const primeiro = curva.pontos[0]
  const ultimo = curva.pontos[curva.pontos.length - 1]
  if (primeiro === undefined || ultimo === undefined) return 'Sem dados no período.'

  const dia = Number(curva.diaMinimo.data.slice(8, 10))

  return (
    `Saldo de ${formatarBRL(primeiro.saldoCentavos)} no início do período ` +
    `a ${formatarBRL(ultimo.saldoCentavos)} no fim. ` +
    `O menor saldo é ${formatarBRL(curva.diaMinimo.saldoCentavos)}, no dia ${dia}.` +
    (curva.saldoRelativo ? ' Os valores são relativos: você ainda não informou seu saldo atual.' : '')
  )
}

export function BalanceCurve({ curva }: { curva: CurvaSaldo }) {
  const pontos = calcularPontos(curva)
  if (pontos.length === 0) return null

  const caminho = pontos.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const zero = linhaDoZero(curva)

  const indiceMinimo = curva.pontos.findIndex((p) => p.data === curva.diaMinimo.data)
  const pontoMinimo = pontos[indiceMinimo] ?? pontos[0]

  return (
    <figure className={estilos.figura} data-testid="balance-curve">
      <svg
        className={estilos.svg}
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        preserveAspectRatio="none"
        // Um grafico sem alternativa textual e invisivel para leitor de tela, e
        // a informacao essencial da curva cabe em uma frase (RN-89).
        role="img"
        aria-label={descrever(curva)}
      >
        {zero !== null && (
          <line
            className={estilos.zero}
            x1={MARGEM}
            y1={zero}
            x2={LARGURA - MARGEM}
            y2={zero}
          />
        )}

        <polyline className={estilos.linha} points={caminho} />

        {pontoMinimo !== undefined && (
          <circle
            className={estilos.minimo}
            cx={pontoMinimo.x}
            cy={pontoMinimo.y}
            r={4}
          />
        )}
      </svg>

      <figcaption className={estilos.legenda}>
        Menor saldo:{' '}
        <strong
          className={curva.diaMinimo.saldoCentavos < 0 ? estilos.negativo : undefined}
          data-testid="curva-minimo"
        >
          {formatarBRL(curva.diaMinimo.saldoCentavos)}
        </strong>{' '}
        no dia {Number(curva.diaMinimo.data.slice(8, 10))}
      </figcaption>
    </figure>
  )
}
