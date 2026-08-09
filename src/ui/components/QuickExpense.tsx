/**
 * Lancamento rapido de uma conta que chegou.
 *
 * Tres campos e pronto. O cadastro completo exige decidir antes se e
 * recorrente, parcelamento ou cartao -- escolha que, para um boleto que
 * apareceu, e atrito puro: voce so queria anotar "devo 340 dia 20".
 */

import { useState } from 'react'
import { competenciaDe, construirData } from '../../domain/calendar.js'
import type { Centavos, Competencia, DataISO, TipoMovimento } from '../../domain/types.js'
import { MoneyInput } from './MoneyInput.js'
import estilos from './QuickExpense.module.css'

export interface NovoLancamento {
  readonly tipo: TipoMovimento
  readonly nome: string
  readonly valorPrevistoCentavos: Centavos
  readonly dataVencimento: DataISO
  readonly competencia: Competencia
}

export interface QuickExpenseProps {
  readonly competencia: Competencia
  readonly hoje: DataISO
  readonly onSalvar: (dados: NovoLancamento) => void
  readonly onCancelar: () => void
}

export function QuickExpense({
  competencia,
  hoje,
  onSalvar,
  onCancelar,
}: QuickExpenseProps) {
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState<Centavos>(0)
  const [dia, setDia] = useState(() => Number(hoje.slice(8, 10)))
  const [tipo, setTipo] = useState<TipoMovimento>('saida')

  const valido = nome.trim() !== '' && valor > 0 && Number.isInteger(dia)

  return (
    <form
      className={estilos.caixa}
      data-testid="quick-expense"
      onSubmit={(e) => {
        e.preventDefault()
        // Validacao na confirmacao, nao a cada tecla (RN-79).
        if (!valido) return

        const vencimento = construirData(competencia, dia)
        onSalvar({
          tipo,
          nome: nome.trim(),
          valorPrevistoCentavos: valor,
          dataVencimento: vencimento,
          competencia: competenciaDe(vencimento),
        })
      }}
    >
      <div className={estilos.tipos}>
        <label>
          <input
            type="radio"
            name="quick-tipo"
            checked={tipo === 'saida'}
            onChange={() => setTipo('saida')}
            data-testid="quick-saida"
          />
          Conta a pagar
        </label>
        <label>
          <input
            type="radio"
            name="quick-tipo"
            checked={tipo === 'entrada'}
            onChange={() => setTipo('entrada')}
            data-testid="quick-entrada"
          />
          Dinheiro a receber
        </label>
      </div>

      <label className={estilos.rotulo} htmlFor="quick-nome">
        O que é
      </label>
      <input
        id="quick-nome"
        data-testid="quick-nome"
        className={estilos.entrada}
        value={nome}
        maxLength={60}
        placeholder="Ex.: IPTU, dentista, conserto"
        onChange={(e) => setNome(e.target.value)}
      />

      <MoneyInput
        id="quick-valor"
        rotulo="Quanto"
        valorCentavos={valor}
        onChange={setValor}
      />

      <label className={estilos.rotulo} htmlFor="quick-dia">
        Dia do vencimento
      </label>
      <input
        id="quick-dia"
        data-testid="quick-dia"
        className={estilos.entrada}
        type="number"
        inputMode="numeric"
        min={1}
        max={31}
        value={Number.isInteger(dia) ? dia : ''}
        // Campo vazio produz NaN em Number(''): guardamos o valor apenas
        // quando e um inteiro na faixa, e o botao permanece inerte ate la.
        onChange={(e) => {
          const n = Number(e.target.value)
          setDia(e.target.value === '' || !Number.isInteger(n) ? Number.NaN : n)
        }}
      />

      <div className={estilos.acoes}>
        <button
          type="submit"
          className={estilos.salvar}
          disabled={!valido}
          data-testid="salvar-quick"
        >
          Anotar
        </button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
