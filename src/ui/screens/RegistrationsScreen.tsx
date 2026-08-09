/**
 * UI-08 — Receitas e contas fixas.
 *
 * So SE CRIA receita aqui. Conta a pagar -- de uma vez, repetida ou parcelada
 * -- nasce na tela do mes, na mesma caixa, porque e la que voce esta quando o
 * boleto chega.
 *
 * As contas fixas ja criadas continuam listadas nesta tela, em secao propria:
 * sao a unica forma de altera-las ou remove-las, e escondendo-as elas ficariam
 * presas no app para sempre.
 */

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { competenciaDe } from '../../domain/calendar.js'
import { formatarBRL } from '../../domain/money.js'
import { mediaDosUltimosPagos } from '../../domain/estimation.js'
import type { Centavos, Regra } from '../../domain/types.js'
import { MoneyInput } from '../components/MoneyInput.js'
import { ConfirmSheet } from '../components/ConfirmSheet.js'
import { QuickExpense } from '../components/QuickExpense.js'
import { useAgora } from '../hooks/useAgora.js'
import { useApp } from '../hooks/useApp.js'
import { useSalvarLancamento } from '../hooks/useLancamento.js'
import { useAcao } from '../hooks/useErro.js'
import estilos from './RegistrationsScreen.module.css'

export function RegistrationsScreen() {
  const agora = useAgora()
  const { repos, regras } = useApp()
  const executar = useAcao()
  const salvarLancamento = useSalvarLancamento()

  const lista = useLiveQuery(() => repos.regras.listar(), [repos]) ?? []
  const ocorrencias = useLiveQuery(() => repos.ocorrencias.listar(), [repos]) ?? []
  const parcelamentos = useLiveQuery(() => repos.parcelamentos.listar(), [repos]) ?? []

  const [editando, setEditando] = useState<Regra | null>(null)
  const [removendo, setRemovendo] = useState<Regra | null>(null)
  const [criando, setCriando] = useState(false)

  const receitas = lista.filter((r) => r.tipo === 'entrada')
  const fixas = lista.filter((r) => r.tipo === 'saida')

  return (
    <div className={estilos.tela}>
      <section className={estilos.painel} aria-label="Receitas">
        <h2 className={estilos.titulo}>O que entra todo mês</h2>

        <ListaDeRegras
          regras={receitas}
          onSelecionar={setEditando}
          vazio="Cadastre seus salários. Depois disso o mês aparece sozinho, sem lançamento manual."
        />

        {criando ? (
          <QuickExpense
            competencia={competenciaDe(agora)}
            hoje={agora}
            tipoFixo="entrada"
            onCancelar={() => setCriando(false)}
            onSalvar={(dados) => {
              void executar(async () => {
                await salvarLancamento(dados)
                setCriando(false)
              })
            }}
          />
        ) : (
          <button
            type="button"
            className={estilos.principal}
            onClick={() => setCriando(true)}
            data-testid="nova-regra"
          >
            + Nova receita
          </button>
        )}
      </section>

      <section className={estilos.painel} aria-label="Contas fixas">
        <h2 className={estilos.titulo}>Contas que se repetem</h2>

        <ListaDeRegras
          regras={fixas}
          onSelecionar={setEditando}
          vazio="Nenhuma ainda. Marque “repete todo mês” ao anotar uma conta na tela do mês."
        />
      </section>

      {parcelamentos.length > 0 && (
        <section className={estilos.painel} aria-label="Parcelamentos">
          <h2 className={estilos.titulo}>Compras parceladas</h2>
          <ul className={estilos.lista}>
            {parcelamentos.map((p) => (
              <li key={p.id} className={estilos.item}>
                <span>
                  <strong>{p.nome}</strong>
                  <span className={estilos.meta}>
                    {p.quantidadeParcelas}x a partir de{' '}
                    {p.primeiroVencimento.slice(8, 10)}/{p.primeiroVencimento.slice(5, 7)}
                  </span>
                </span>
                <span className={estilos.saida}>
                  {formatarBRL(p.valorParcelaCentavos)}
                </span>
              </li>
            ))}
          </ul>
        </section>
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

      <p className={estilos.nota} data-testid="dica-cadastros">
        Contas a pagar são anotadas na tela do mês — inclusive as que se repetem
        e as parceladas.
      </p>
    </div>
  )

}

function ListaDeRegras({
  regras,
  onSelecionar,
  vazio,
}: {
  regras: readonly Regra[]
  onSelecionar: (r: Regra) => void
  vazio: string
}) {
  if (regras.length === 0) {
    return <p className={estilos.vazio}>{vazio}</p>
  }

  return (
    <ul className={estilos.lista}>
      {regras.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            className={estilos.item}
            onClick={() => onSelecionar(r)}
            data-testid={`regra-${r.nome}`}
          >
            <span>
              <strong>{r.nome}</strong>
              <span className={estilos.meta}>
                dia {r.diaDoMes}
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

      <p className={estilos.nota}>
        Isto muda o valor daqui para a frente. Para mudar só um mês — um
        adiantamento, por exemplo — toque no item na tela do mês.
      </p>

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
        <button
          type="button"
          className={estilos.remover}
          onClick={onRemover}
          data-testid="remover-regra"
        >
          Remover
        </button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
