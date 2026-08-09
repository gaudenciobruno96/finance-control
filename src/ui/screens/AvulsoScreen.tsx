/** Lancamento avulso (RF-03, RF-07). */

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { competenciaDe } from '../../domain/calendar.js'
import type { Centavos, TipoMovimento } from '../../domain/types.js'
import { MoneyInput } from '../components/MoneyInput.js'
import { useAgora } from '../hooks/useAgora.js'
import { useApp } from '../hooks/useApp.js'
import { useAcao } from '../hooks/useErro.js'
import estilos from './RegistrationsScreen.module.css'

export function AvulsoScreen() {
  const agora = useAgora()
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const { pagamento } = useApp()
  const executar = useAcao()

  const [tipo, setTipo] = useState<TipoMovimento>('saida')
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState<Centavos>(0)
  const [vencimento, setVencimento] = useState(agora)

  const competencia = params.get('mes') ?? competenciaDe(agora)

  return (
    <div className={estilos.painel}>
      <h1 className={estilos.titulo}>Lançamento avulso</h1>

      <form
        className={estilos.formulario}
        onSubmit={(e) => {
          e.preventDefault()
          if (nome.trim() === '' || valor <= 0) return
          void executar(async () => {
            await pagamento.lancarAvulso({
              tipo,
              nome: nome.trim(),
              valorPrevistoCentavos: valor,
              dataVencimento: vencimento,
              competencia: competenciaDe(vencimento),
            })
            navegar(`/?mes=${competencia}`)
          })
        }}
      >
        <div className={estilos.tipos}>
          <label>
            <input type="radio" name="tipo" checked={tipo === 'saida'} onChange={() => setTipo('saida')} data-testid="avulso-saida" />
            Saída
          </label>
          <label>
            <input type="radio" name="tipo" checked={tipo === 'entrada'} onChange={() => setTipo('entrada')} data-testid="avulso-entrada" />
            Entrada
          </label>
        </div>

        <label className={estilos.rotulo} htmlFor="avulso-nome">Descrição</label>
        <input id="avulso-nome" data-testid="avulso-nome" className={estilos.entradaTexto} value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} />

        <MoneyInput id="avulso-valor" rotulo="Valor" valorCentavos={valor} onChange={setValor} />

        <label className={estilos.rotulo} htmlFor="avulso-data">Data</label>
        <input id="avulso-data" data-testid="avulso-data" className={estilos.entradaTexto} type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />

        <div className={estilos.acoes}>
          <button type="submit" className={estilos.principal} data-testid="salvar-avulso">Salvar</button>
          <button type="button" onClick={() => navegar(-1)}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}
