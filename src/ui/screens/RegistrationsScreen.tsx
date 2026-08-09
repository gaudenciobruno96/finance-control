/**
 * UI-07 — Cadastros de regras, parcelamentos e cartoes.
 */

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ajustePadrao, competenciaDe } from '../../domain/calendar.js'
import { formatarBRL } from '../../domain/money.js'
import { mediaDosUltimosPagos } from '../../domain/estimation.js'
import type { Centavos, Regra, TipoMovimento } from '../../domain/types.js'
import { MoneyInput } from '../components/MoneyInput.js'
import { ConfirmSheet } from '../components/ConfirmSheet.js'
import { useAgora } from '../hooks/useAgora.js'
import { useApp } from '../hooks/useApp.js'
import { useAcao } from '../hooks/useErro.js'
import estilos from './RegistrationsScreen.module.css'

type Aba = 'regras' | 'parcelamentos' | 'cartoes'

export function RegistrationsScreen() {
  const [aba, setAba] = useState<Aba>('regras')

  return (
    <div className={estilos.tela}>
      <div className={estilos.abas} role="tablist">
        {(['regras', 'parcelamentos', 'cartoes'] as const).map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={aba === a}
            className={aba === a ? estilos.abaAtiva : estilos.aba}
            onClick={() => setAba(a)}
            data-testid={`aba-cadastro-${a}`}
          >
            {a === 'regras' ? 'Recorrentes' : a === 'parcelamentos' ? 'Parcelas' : 'Cartões'}
          </button>
        ))}
      </div>

      {aba === 'regras' && <PainelRegras />}
      {aba === 'parcelamentos' && <PainelParcelamentos />}
      {aba === 'cartoes' && <PainelCartoes />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function PainelRegras() {
  const agora = useAgora()
  const { repos, regras } = useApp()
  const executar = useAcao()

  const lista = useLiveQuery(() => repos.regras.listar(), [repos]) ?? []
  const ocorrencias = useLiveQuery(() => repos.ocorrencias.listar(), [repos]) ?? []

  const [editando, setEditando] = useState<Regra | null>(null)
  const [removendo, setRemovendo] = useState<Regra | null>(null)
  const [criando, setCriando] = useState(false)

  return (
    <section className={estilos.painel}>
      <ul className={estilos.lista}>
        {lista.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className={estilos.item}
              onClick={() => setEditando(r)}
              data-testid={`regra-${r.nome}`}
            >
              <span>
                <strong>{r.nome}</strong>
                <span className={estilos.meta}>
                  dia {r.diaDoMes} · {r.tipo === 'entrada' ? 'entrada' : 'saída'}
                  {r.valorEhEstimativa ? ' · estimativa' : ''}
                </span>
              </span>
              <span className={r.tipo === 'entrada' ? estilos.entrada : estilos.saida}>
                {formatarBRL(r.valorCentavos)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {lista.length === 0 && (
        <p className={estilos.vazio}>
          Cadastre seus salários e contas fixas. Depois disso o mês aparece sozinho, sem
          lançamento manual.
        </p>
      )}

      <button
        type="button"
        className={estilos.principal}
        onClick={() => setCriando(true)}
        data-testid="nova-regra"
      >
        + Nova recorrência
      </button>

      {criando && (
        <FormularioRegra
          sugestao={null}
          onCancelar={() => setCriando(false)}
          onSalvar={(dados) => {
            void executar(async () => {
              await regras.criarRegra({ ...dados, vigenteDe: competenciaDe(agora), vigenteAte: null })
              setCriando(false)
            })
          }}
        />
      )}

      {editando !== null && (
        <FormularioEdicao
          regra={editando}
          mediaSugerida={
            editando.valorEhEstimativa
              ? mediaDosUltimosPagos(ocorrencias, editando.id)
              : null
          }
          onCancelar={() => setEditando(null)}
          onRemover={() => {
            setRemovendo(editando)
            setEditando(null)
          }}
          onSalvar={(valor, escopo) => {
            void executar(async () => {
              await regras.editarRegra(
                editando.id,
                { valorCentavos: valor },
                escopo,
                competenciaDe(agora),
              )
              setEditando(null)
            })
          }}
        />
      )}

      {removendo !== null && (
        <ConfirmSheet
          titulo={`Remover ${removendo.nome}?`}
          mensagem="Os pagamentos já registrados serão mantidos no histórico. Apenas os meses futuros deixam de aparecer."
          rotuloConfirmar="Remover"
          destrutivo
          onConfirmar={() => {
            void executar(async () => {
              await regras.removerRegra(removendo.id)
              setRemovendo(null)
            })
          }}
          onCancelar={() => setRemovendo(null)}
        />
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

interface DadosRegra {
  readonly tipo: TipoMovimento
  readonly nome: string
  readonly valorCentavos: Centavos
  readonly valorEhEstimativa: boolean
  readonly diaDoMes: number
  readonly ajusteFimDeSemana: 'nenhum' | 'antecipa' | 'posterga'
}

function FormularioRegra({
  sugestao,
  onSalvar,
  onCancelar,
}: {
  sugestao: Centavos | null
  onSalvar: (dados: DadosRegra) => void
  onCancelar: () => void
}) {
  const [tipo, setTipo] = useState<TipoMovimento>('saida')
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState<Centavos>(sugestao ?? 0)
  const [estimativa, setEstimativa] = useState(false)
  const [dia, setDia] = useState(10)

  const valido = nome.trim() !== '' && valor > 0

  return (
    <form
      className={estilos.formulario}
      onSubmit={(e) => {
        e.preventDefault()
        // Validacao na confirmacao, nao a cada tecla (RN-79).
        if (!valido) return
        onSalvar({
          tipo,
          nome: nome.trim(),
          valorCentavos: valor,
          valorEhEstimativa: estimativa,
          diaDoMes: dia,
          // O padrao sugerido depende do tipo (RN-09): salario costuma ser
          // antecipado, boleto costuma aceitar o proximo dia util.
          ajusteFimDeSemana: ajustePadrao(tipo),
        })
      }}
    >
      <div className={estilos.tipos}>
        <label>
          <input
            type="radio"
            name="tipo"
            checked={tipo === 'saida'}
            onChange={() => setTipo('saida')}
            data-testid="tipo-saida"
          />
          Saída
        </label>
        <label>
          <input
            type="radio"
            name="tipo"
            checked={tipo === 'entrada'}
            onChange={() => setTipo('entrada')}
            data-testid="tipo-entrada"
          />
          Entrada
        </label>
      </div>

      <label className={estilos.rotulo} htmlFor="regra-nome">
        Nome
      </label>
      <input
        id="regra-nome"
        data-testid="regra-nome"
        className={estilos.entradaTexto}
        value={nome}
        maxLength={60}
        onChange={(e) => setNome(e.target.value)}
      />

      <MoneyInput id="regra-valor" rotulo="Valor" valorCentavos={valor} onChange={setValor} />

      <label className={estilos.rotulo} htmlFor="regra-dia">
        Dia do mês
      </label>
      <input
        id="regra-dia"
        data-testid="regra-dia"
        className={estilos.entradaTexto}
        type="number"
        min={1}
        max={31}
        value={dia}
        onChange={(e) => setDia(Number(e.target.value))}
      />

      <label className={estilos.caixa}>
        <input
          type="checkbox"
          checked={estimativa}
          onChange={(e) => setEstimativa(e.target.checked)}
          data-testid="regra-estimativa"
        />
        Valor variável (luz, água) — o previsto é uma estimativa
      </label>

      <div className={estilos.acoes}>
        <button type="submit" className={estilos.principal} data-testid="salvar-regra">
          Salvar
        </button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------

function FormularioEdicao({
  regra,
  mediaSugerida,
  onSalvar,
  onRemover,
  onCancelar,
}: {
  regra: Regra
  mediaSugerida: Centavos | null
  onSalvar: (valor: Centavos, escopo: 'apartirDeste' | 'desdeSempre') => void
  onRemover: () => void
  onCancelar: () => void
}) {
  const [valor, setValor] = useState(regra.valorCentavos)

  return (
    <div className={estilos.formulario} data-testid="editar-regra">
      <h3 className={estilos.titulo}>{regra.nome}</h3>

      <MoneyInput
        id="editar-valor"
        rotulo="Valor"
        valorCentavos={valor}
        onChange={setValor}
      />

      {/* A media e SUGESTAO: o valor so muda por acao explicita (RN-37). */}
      {mediaSugerida !== null && (
        <button
          type="button"
          className={estilos.sugestao}
          onClick={() => setValor(mediaSugerida)}
          data-testid="usar-media"
        >
          Usar a média dos últimos 3 pagamentos: {formatarBRL(mediaSugerida)}
        </button>
      )}

      <p className={estilos.nota}>A partir de quando o novo valor vale?</p>

      <div className={estilos.acoes}>
        <button
          type="button"
          className={estilos.principal}
          onClick={() => onSalvar(valor, 'apartirDeste')}
          data-testid="salvar-apartir"
        >
          A partir deste mês
        </button>
        <button
          type="button"
          onClick={() => onSalvar(valor, 'desdeSempre')}
          data-testid="salvar-sempre"
        >
          Desde sempre
        </button>
      </div>

      <div className={estilos.acoes}>
        <button type="button" className={estilos.remover} onClick={onRemover} data-testid="remover-regra">
          Remover
        </button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function PainelParcelamentos() {
  const { repos, regras } = useApp()
  const executar = useAcao()

  const lista = useLiveQuery(() => repos.parcelamentos.listar(), [repos]) ?? []
  const cartoes = useLiveQuery(() => repos.cartoes.listar(), [repos]) ?? []

  const [nome, setNome] = useState('')
  const [valor, setValor] = useState<Centavos>(0)
  const [parcelas, setParcelas] = useState(10)
  const [primeiro, setPrimeiro] = useState('')
  const [cartaoId, setCartaoId] = useState('')

  return (
    <section className={estilos.painel}>
      <ul className={estilos.lista}>
        {lista.map((p) => (
          <li key={p.id} className={estilos.item}>
            <span>
              <strong>{p.nome}</strong>
              <span className={estilos.meta}>
                {p.quantidadeParcelas}x · {p.cartaoId === null ? 'boleto' : 'no cartão'}
              </span>
            </span>
            <span className={estilos.saida}>{formatarBRL(p.valorParcelaCentavos)}</span>
          </li>
        ))}
      </ul>

      <form
        className={estilos.formulario}
        onSubmit={(e) => {
          e.preventDefault()
          if (nome.trim() === '' || valor <= 0 || primeiro === '') return
          void executar(async () => {
            await regras.criarParcelamento({
              nome: nome.trim(),
              valorParcelaCentavos: valor,
              quantidadeParcelas: parcelas,
              primeiroVencimento: primeiro,
              cartaoId: cartaoId === '' ? null : cartaoId,
            })
            setNome('')
            setValor(0)
            setPrimeiro('')
          })
        }}
      >
        <label className={estilos.rotulo} htmlFor="parc-nome">Nome</label>
        <input id="parc-nome" data-testid="parc-nome" className={estilos.entradaTexto} value={nome} onChange={(e) => setNome(e.target.value)} />

        <MoneyInput id="parc-valor" rotulo="Valor da parcela" valorCentavos={valor} onChange={setValor} />

        <label className={estilos.rotulo} htmlFor="parc-qtd">Quantidade de parcelas</label>
        <input id="parc-qtd" data-testid="parc-qtd" className={estilos.entradaTexto} type="number" min={1} max={360} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} />

        <label className={estilos.rotulo} htmlFor="parc-primeiro">Primeiro vencimento</label>
        <input id="parc-primeiro" data-testid="parc-primeiro" className={estilos.entradaTexto} type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} />

        <label className={estilos.rotulo} htmlFor="parc-cartao">Cai na fatura do cartão?</label>
        <select id="parc-cartao" data-testid="parc-cartao" className={estilos.entradaTexto} value={cartaoId} onChange={(e) => setCartaoId(e.target.value)}>
          <option value="">Não — é boleto próprio</option>
          {cartoes.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>

        <p className={estilos.nota}>
          Use as datas de vencimento das faturas, não a data da compra.
        </p>

        <button type="submit" className={estilos.principal} data-testid="salvar-parcelamento">
          Salvar parcelamento
        </button>
      </form>
    </section>
  )
}

// ---------------------------------------------------------------------------

function PainelCartoes() {
  const { repos, regras } = useApp()
  const executar = useAcao()

  const lista = useLiveQuery(() => repos.cartoes.listar(), [repos]) ?? []

  const [nome, setNome] = useState('')
  const [fechamento, setFechamento] = useState(20)
  const [vencimento, setVencimento] = useState(28)
  const [gasto, setGasto] = useState<Centavos>(0)

  return (
    <section className={estilos.painel}>
      <ul className={estilos.lista}>
        {lista.map((c) => (
          <li key={c.id} className={estilos.item}>
            <span>
              <strong>{c.nome}</strong>
              <span className={estilos.meta}>
                fecha dia {c.diaFechamento} · vence dia {c.diaVencimento}
              </span>
            </span>
            <span className={estilos.saida}>{formatarBRL(c.gastoMensalTipicoCentavos)}</span>
          </li>
        ))}
      </ul>

      <form
        className={estilos.formulario}
        onSubmit={(e) => {
          e.preventDefault()
          if (nome.trim() === '') return
          void executar(async () => {
            await regras.criarCartao({
              nome: nome.trim(),
              diaFechamento: fechamento,
              diaVencimento: vencimento,
              gastoMensalTipicoCentavos: gasto,
            })
            setNome('')
            setGasto(0)
          })
        }}
      >
        <label className={estilos.rotulo} htmlFor="cartao-nome">Nome</label>
        <input id="cartao-nome" data-testid="cartao-nome" className={estilos.entradaTexto} value={nome} onChange={(e) => setNome(e.target.value)} />

        <label className={estilos.rotulo} htmlFor="cartao-fechamento">Dia de fechamento</label>
        <input id="cartao-fechamento" data-testid="cartao-fechamento" className={estilos.entradaTexto} type="number" min={1} max={31} value={fechamento} onChange={(e) => setFechamento(Number(e.target.value))} />

        <label className={estilos.rotulo} htmlFor="cartao-vencimento">Dia de vencimento</label>
        <input id="cartao-vencimento" data-testid="cartao-vencimento" className={estilos.entradaTexto} type="number" min={1} max={31} value={vencimento} onChange={(e) => setVencimento(Number(e.target.value))} />

        <MoneyInput
          id="cartao-gasto"
          rotulo="Gasto mensal típico"
          descricao="O que você costuma gastar por mês fora as parcelas. Usado só para estimar a fatura antes de ela fechar."
          valorCentavos={gasto}
          onChange={setGasto}
        />

        <button type="submit" className={estilos.principal} data-testid="salvar-cartao">
          Salvar cartão
        </button>
      </form>
    </section>
  )
}
