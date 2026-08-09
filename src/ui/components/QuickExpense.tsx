/**
 * UI-07 — Caixa unica de lancamento.
 *
 * Uma so caixa cria as tres formas que existem: o gasto de uma vez, o que
 * repete todo mes e o parcelado. Antes eram tres telas diferentes, e escolher
 * entre elas ANTES de digitar era atrito puro -- voce so queria anotar "devo
 * 340 dia 20" e precisava primeiro decidir a categoria do lancamento.
 *
 * As duas flags sao caixas de marcar, nao abas: o caso comum e nenhuma marcada,
 * e o formulario nao muda de forma quando estao desmarcadas.
 */

import { useState } from 'react'
import { competenciaDe, construirData } from '../../domain/calendar.js'
import type {
  Centavos,
  Competencia,
  DataISO,
  TipoMovimento,
} from '../../domain/types.js'
import { MoneyInput } from './MoneyInput.js'
import estilos from './QuickExpense.module.css'

/**
 * O que sai da caixa. Uniao discriminada porque as tres formas guardam coisas
 * diferentes: o avulso vira uma ocorrencia, a recorrencia vira uma regra e o
 * parcelado vira um parcelamento.
 */
export type NovoLancamento =
  | {
      readonly forma: 'avulso'
      readonly tipo: TipoMovimento
      readonly nome: string
      readonly valorPrevistoCentavos: Centavos
      readonly dataVencimento: DataISO
      readonly competencia: Competencia
    }
  | {
      readonly forma: 'recorrente'
      readonly tipo: TipoMovimento
      readonly nome: string
      readonly valorCentavos: Centavos
      readonly diaDoMes: number
      readonly vigenteDe: Competencia
    }
  | {
      readonly forma: 'parcelado'
      readonly nome: string
      readonly valorParcelaCentavos: Centavos
      readonly quantidadeParcelas: number
      readonly primeiroVencimento: DataISO
    }

export interface QuickExpenseProps {
  readonly competencia: Competencia
  readonly hoje: DataISO
  /** Restringe a caixa a um dos tipos. A tela de receitas usa 'entrada'. */
  readonly tipoFixo?: TipoMovimento | undefined
  readonly onSalvar: (dados: NovoLancamento) => void
  readonly onCancelar: () => void
}

const MAXIMO_DE_PARCELAS = 120

export function QuickExpense({
  competencia,
  hoje,
  tipoFixo,
  onSalvar,
  onCancelar,
}: QuickExpenseProps) {
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState<Centavos>(0)
  const [dia, setDia] = useState(() => Number(hoje.slice(8, 10)))
  const [tipo, setTipo] = useState<TipoMovimento>(tipoFixo ?? 'saida')

  const [repete, setRepete] = useState(false)
  const [parcelado, setParcelado] = useState(false)
  const [parcelas, setParcelas] = useState(2)

  // As duas flags se excluem: uma compra em 10x nao repete indefinidamente, e
  // uma conta que repete todo mes nao tem numero de parcelas. Marcar uma
  // desmarca a outra, em vez de deixar o usuario montar um estado sem sentido
  // e so descobrir no erro.
  const marcarRepete = (v: boolean) => {
    setRepete(v)
    if (v) setParcelado(false)
  }
  const marcarParcelado = (v: boolean) => {
    setParcelado(v)
    if (v) setRepete(false)
  }

  // A faixa precisa ser verificada aqui: min/max no input nao bloqueiam
  // digitacao, e construirData lanca SINCRONAMENTE dentro do onSubmit -- fora
  // do executar, entao o erro nao chegaria a faixa e o formulario apenas
  // morreria sem explicacao.
  const diaValido = Number.isInteger(dia) && dia >= 1 && dia <= 31
  const parcelasValidas =
    !parcelado ||
    (Number.isInteger(parcelas) && parcelas >= 2 && parcelas <= MAXIMO_DE_PARCELAS)

  const valido = nome.trim() !== '' && valor > 0 && diaValido && parcelasValidas

  const enviar = () => {
    const vencimento = construirData(competencia, dia)
    const limpo = nome.trim()

    if (parcelado) {
      onSalvar({
        forma: 'parcelado',
        nome: limpo,
        valorParcelaCentavos: valor,
        quantidadeParcelas: parcelas,
        primeiroVencimento: vencimento,
      })
      return
    }

    if (repete) {
      onSalvar({
        forma: 'recorrente',
        tipo,
        nome: limpo,
        valorCentavos: valor,
        // O dia digitado, nao o dia da data construida: construirData trunca
        // 31 em fevereiro, e a regra guardaria 28 para sempre.
        diaDoMes: dia,
        vigenteDe: competencia,
      })
      return
    }

    onSalvar({
      forma: 'avulso',
      tipo,
      nome: limpo,
      valorPrevistoCentavos: valor,
      dataVencimento: vencimento,
      competencia: competenciaDe(vencimento),
    })
  }

  const rotuloDoValor = parcelado ? 'Valor de cada parcela' : 'Quanto'

  return (
    <form
      className={estilos.caixa}
      data-testid="quick-expense"
      onSubmit={(e) => {
        e.preventDefault()
        // Validacao na confirmacao, nao a cada tecla (RN-79).
        if (!valido) return
        enviar()
      }}
    >
      {tipoFixo === undefined && (
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
      )}

      <label className={estilos.rotulo} htmlFor="quick-nome">
        O que é
      </label>
      <input
        id="quick-nome"
        data-testid="quick-nome"
        className={estilos.entrada}
        value={nome}
        maxLength={60}
        placeholder={
          tipo === 'entrada' ? 'Ex.: salário, aluguel recebido' : 'Ex.: IPTU, dentista'
        }
        onChange={(e) => setNome(e.target.value)}
      />

      <MoneyInput
        id="quick-valor"
        rotulo={rotuloDoValor}
        valorCentavos={valor}
        onChange={setValor}
      />

      <label className={estilos.rotulo} htmlFor="quick-dia">
        {parcelado ? 'Dia da primeira parcela' : 'Dia do vencimento'}
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

      <div className={estilos.flags}>
        <label className={estilos.flag}>
          <input
            type="checkbox"
            checked={repete}
            onChange={(e) => marcarRepete(e.target.checked)}
            data-testid="quick-repete"
          />
          Repete todo mês
        </label>

        {/* Parcelar uma entrada nao faz sentido: salario nao vem em 10x. */}
        {tipo === 'saida' && (
          <label className={estilos.flag}>
            <input
              type="checkbox"
              checked={parcelado}
              onChange={(e) => marcarParcelado(e.target.checked)}
              data-testid="quick-parcelado"
            />
            É parcelado
          </label>
        )}
      </div>

      {parcelado && (
        <div className={estilos.caixaParcelas}>
          <label className={estilos.rotulo} htmlFor="quick-parcelas">
            Em quantas vezes
          </label>
          <input
            id="quick-parcelas"
            data-testid="quick-parcelas"
            className={estilos.entrada}
            type="number"
            inputMode="numeric"
            min={2}
            max={MAXIMO_DE_PARCELAS}
            value={Number.isInteger(parcelas) ? parcelas : ''}
            onChange={(e) => {
              const n = Number(e.target.value)
              setParcelas(
                e.target.value === '' || !Number.isInteger(n) ? Number.NaN : n,
              )
            }}
          />
          {valido && (
            <p className={estilos.ajuda} data-testid="quick-parcelas-resumo">
              {parcelas}x de {(valor / 100).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </p>
          )}
        </div>
      )}

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
