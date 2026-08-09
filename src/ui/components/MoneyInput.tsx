/**
 * SUP-06 / UI-12 — Campo monetario com mascara progressiva (RN-66, RN-67).
 *
 * Acumula digitos e formata da direita para a esquerda: digitar 1,8,0,0,0
 * mostra R$ 180,00. Nunca produz valor invalido, e `inputMode="numeric"` basta
 * -- sem depender da tecla de virgula, que no teclado do iPhone exige alternar
 * de painel.
 *
 * Centralizado porque a logica de mascara e sutil, e replica-la em cada
 * formulario produziria divergencia entre campos que deveriam se comportar
 * igual.
 */

import { formatarBRL } from '../../domain/money.js'
import type { Centavos } from '../../domain/types.js'
import estilos from './MoneyInput.module.css'

/** Limite de digitos: cem milhoes de reais. Evita estouro de inteiro seguro. */
const MAX_DIGITOS = 10

/**
 * Extrai apenas os digitos de um texto e devolve o valor em centavos.
 *
 * Funcao pura, exportada para teste por propriedade (PROP-U01 a PROP-U04).
 */
export function digitosParaCentavos(texto: string): Centavos {
  const digitos = texto.replace(/\D/gu, '').slice(0, MAX_DIGITOS)
  if (digitos === '') return 0
  const valor = Number(digitos)
  return Number.isSafeInteger(valor) ? valor : 0
}

export interface MoneyInputProps {
  readonly id: string
  readonly rotulo: string
  readonly valorCentavos: Centavos
  readonly onChange: (centavos: Centavos) => void
  readonly descricao?: string
  readonly autoFocus?: boolean
}

export function MoneyInput({
  id,
  rotulo,
  valorCentavos,
  onChange,
  descricao,
  autoFocus,
}: MoneyInputProps) {
  const idDescricao = descricao === undefined ? undefined : `${id}-descricao`

  return (
    <div className={estilos.campo}>
      <label className={estilos.rotulo} htmlFor={id}>
        {rotulo}
      </label>

      <input
        id={id}
        data-testid={`money-input-${id}`}
        className={estilos.entrada}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-describedby={idDescricao}
        value={formatarBRL(valorCentavos)}
        onChange={(e) => onChange(digitosParaCentavos(e.target.value))}
        // Ao focar, o cursor vai para o fim: a mascara cresce da direita para a
        // esquerda, e um cursor no meio produziria digitacao confusa.
        onFocus={(e) => {
          const fim = e.target.value.length
          e.target.setSelectionRange(fim, fim)
        }}
        onClick={(e) => {
          const alvo = e.currentTarget
          const fim = alvo.value.length
          alvo.setSelectionRange(fim, fim)
        }}
      />

      {descricao !== undefined && (
        <p className={estilos.descricao} id={idDescricao}>
          {descricao}
        </p>
      )}
    </div>
  )
}
