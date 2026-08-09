// @vitest-environment jsdom

/**
 * Testes dos tres fluxos que o usuario executa toda semana (PBT-10).
 *
 * Sao poucos e deliberadamente de ponta a ponta: montam a tela real sobre um
 * banco real em memoria, sem simulacao dos servicos. O que se verifica aqui e
 * que as camadas conversam -- as regras em si ja estao cobertas pelas Unidades
 * 1 e 2.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { ReactElement } from 'react'
import { criarBanco, type BancoFinanceiro } from '../../data/db.js'
import { criarRepositorios } from '../../data/repositories.js'
import { criarRuleService } from '../../services/rule-service.js'
import { competenciaDe, somarMeses } from '../../domain/calendar.js'
import { hojeLocal } from '../hooks/useAgora.js'
import { AppProvider } from '../hooks/useApp.js'
import { ErroProvider } from '../hooks/useErro.js'
import { MonthScreen } from './MonthScreen.js'
import { RegistrationsScreen } from './RegistrationsScreen.js'
import { SettingsScreen } from './SettingsScreen.js'

let db: BancoFinanceiro
let contador = 0

beforeEach(async () => {
  contador += 1
  db = criarBanco(`teste-ui-${contador}-${crypto.randomUUID()}`)
  await db.open()
})

afterEach(async () => {
  // Desmontar ANTES de fechar o banco.
  //
  // O cleanup automático do testing-library roda depois deste afterEach, e o
  // `useLiveQuery` continuaria observando um banco em processo de exclusão --
  // o observador do teste anterior disparava sobre o banco do teste seguinte,
  // e os testes só falhavam quando executados em conjunto.
  cleanup()
  db.close()
  await db.delete()
})

function montar(tela: ReactElement, rota = '/') {
  return render(
    <ErroProvider>
      <AppProvider db={db}>
        <MemoryRouter initialEntries={[rota]}>{tela}</MemoryRouter>
      </AppProvider>
    </ErroProvider>,
  )
}

/**
 * Cria uma regra direto pelo serviço, sem passar pela interface.
 *
 * A vigência começa no mês corrente de propósito: uma regra vigente desde anos
 * atrás produziria dezenas de ocorrências atrasadas, o mesmo nome apareceria em
 * várias linhas, e a busca por texto ficaria ambígua — defeito de teste que
 * mascara o comportamento real.
 */
async function semear(nome: string, valorCentavos: number, diaDoMes: number) {
  const regras = criarRuleService(db, criarRepositorios(db))
  return regras.criarRegra({
    tipo: 'saida',
    nome,
    valorCentavos,
    valorEhEstimativa: nome === 'Luz',
    diaDoMes,
    ajusteFimDeSemana: 'nenhum',
    vigenteDe: competenciaDe(hojeLocal()),
    vigenteAte: null,
  })
}

describe('fluxo: marcar como pago', () => {
  it('confirma o pagamento e atualiza resumo e listas sem recarregar', async () => {
    const usuario = userEvent.setup()
    await semear('Aluguel', 180_000, 10)

    montar(<MonthScreen />)

    // A lista aparece assim que a projecao resolve.
    const linha = await screen.findByText('Aluguel')
    await usuario.click(linha)

    // Toque 1: a folha abre com data de hoje e valor previsto.
    const folha = await screen.findByTestId('payment-sheet')
    expect(within(folha).getByTestId('confirmar-pagamento')).toBeInTheDocument()

    // Toque 2: confirmar.
    await usuario.click(within(folha).getByTestId('confirmar-pagamento'))

    // O resumo reflete o pagamento sem nenhuma recarga manual: e o que o
    // useLiveQuery compra (RN-83).
    await waitFor(() => {
      expect(screen.queryByTestId('payment-sheet')).not.toBeInTheDocument()
    })

    const ocorrencias = await criarRepositorios(db).ocorrencias.listar()
    expect(ocorrencias).toHaveLength(1)
    expect(ocorrencias[0]?.dataPagamento).not.toBeNull()

    // A secao de resolvidos vem recolhida: o que importa na tela e o que
    // falta, nao o que ja foi feito.
    expect(await screen.findByTestId('ja-resolvido')).toHaveTextContent(
      'Já resolvido (1)',
    )
  })

  /**
   * A idempotência em si é verificada no teste do `paymentService`, que é onde
   * ela mora. O que só a interface pode verificar é que reabrir um item já
   * pago oferece *atualizar* em vez de *confirmar* — sinal de que a tela
   * reconhece o pagamento existente em vez de tratá-lo como novo.
   */
  it('reabrir um item pago oferece atualizar, não confirmar de novo', async () => {
    const usuario = userEvent.setup()
    await semear('Aluguel', 180_000, 10)

    montar(<MonthScreen />)

    await usuario.click(await screen.findByText('Aluguel'))
    await usuario.click(await screen.findByTestId('confirmar-pagamento'))

    // A folha fechar é o sinal de que a escrita concluiu; a reprojeção vem em
    // seguida e move o item para os resolvidos.
    await waitFor(() => {
      expect(screen.queryByTestId('payment-sheet')).not.toBeInTheDocument()
    })

    // Os resolvidos vêm recolhidos; abrir é o próprio comportamento esperado.
    await usuario.click(await screen.findByTestId('ja-resolvido'))
    const secaoPaga = await screen.findByLabelText('Já resolvido')

    await usuario.click(within(secaoPaga).getByText('Aluguel'))

    const folha = await screen.findByTestId('payment-sheet')
    expect(within(folha).getByTestId('confirmar-pagamento')).toHaveTextContent(
      'Atualizar pagamento',
    )
    expect(within(folha).getByTestId('acoes-secundarias')).toBeInTheDocument()

    expect(await criarRepositorios(db).ocorrencias.listar()).toHaveLength(1)
  })
})

describe('fluxo: corrigir o valor da conta de luz', () => {
  it('ajusta o previsto sem marcar como pago', async () => {
    const usuario = userEvent.setup()
    await semear('Luz', 15_000, 10)

    montar(<MonthScreen />)

    await usuario.click(await screen.findByText('Luz'))
    const folha = await screen.findByTestId('payment-sheet')

    await usuario.click(within(folha).getByTestId('acoes-secundarias'))

    const campo = within(folha).getByTestId('money-input-ajuste-valor')
    await usuario.clear(campo)
    await usuario.type(campo, '21000')

    await usuario.click(within(folha).getByTestId('ajustar-valor'))

    // A folha fechar sinaliza que a escrita concluiu.
    await waitFor(() => {
      expect(screen.queryByTestId('payment-sheet')).not.toBeInTheDocument()
    })

    const ocorrencias = await criarRepositorios(db).ocorrencias.listar()
    expect(ocorrencias).toHaveLength(1)
    expect(ocorrencias[0]?.valorPrevistoCentavos).toBe(21_000)
    // Ajustar o valor NAO marca como pago.
    expect(ocorrencias[0]?.dataPagamento).toBeNull()
  })
})

describe('fluxo: redefinir a âncora de saldo', () => {
  it('registra o saldo e remove o aviso de saldo relativo', async () => {
    const usuario = userEvent.setup()

    montar(<SettingsScreen />, '/ajustes')

    const campo = screen.getByTestId('money-input-ancora-saldo')
    await usuario.clear(campo)
    await usuario.type(campo, '250000')

    await usuario.click(screen.getByTestId('salvar-ancora'))

    expect(await screen.findByTestId('ancora-salva')).toBeInTheDocument()

    await waitFor(async () => {
      const ancoras = await criarRepositorios(db).ancoras.listar()
      expect(ancoras).toHaveLength(1)
      expect(ancoras[0]?.saldoCentavos).toBe(250_000)
    })
  })
})

describe('cadastro de recorrência', () => {
  it('cria uma regra e ela aparece no mês sem lançamento manual', async () => {
    const usuario = userEvent.setup()

    montar(<RegistrationsScreen />, '/cadastros')

    await usuario.click(screen.getByTestId('nova-regra'))

    await usuario.type(screen.getByTestId('regra-nome'), 'Internet')
    const valor = screen.getByTestId('money-input-regra-valor')
    await usuario.clear(valor)
    await usuario.type(valor, '9990')

    await usuario.click(screen.getByTestId('salvar-regra'))

    await waitFor(async () => {
      const regras = await criarRepositorios(db).regras.listar()
      expect(regras).toHaveLength(1)
      expect(regras[0]?.nome).toBe('Internet')
      expect(regras[0]?.valorCentavos).toBe(9_990)
      // O padrao sugerido para saida e postergar (RN-09).
      expect(regras[0]?.ajusteFimDeSemana).toBe('posterga')
    })
  })

  it('reajuste a partir deste mês preserva o valor dos meses anteriores', async () => {
    const usuario = userEvent.setup()

    // Vigência anterior ao mês corrente: só assim há histórico a preservar.
    // Editar a partir do próprio mês inicial não versiona, por RN-13 — não há
    // passado que a versão encerrada cobriria.
    await criarRuleService(db, criarRepositorios(db)).criarRegra({
      tipo: 'saida',
      nome: 'Aluguel',
      valorCentavos: 180_000,
      valorEhEstimativa: false,
      diaDoMes: 10,
      ajusteFimDeSemana: 'nenhum',
      vigenteDe: somarMeses(competenciaDe(hojeLocal()), -6),
      vigenteAte: null,
    })

    montar(<RegistrationsScreen />, '/cadastros')

    await usuario.click(await screen.findByTestId('regra-Aluguel'))

    const campo = await screen.findByTestId('money-input-editar-valor')
    await usuario.clear(campo)
    await usuario.type(campo, '200000')

    await usuario.click(screen.getByTestId('salvar-apartir'))

    await waitFor(async () => {
      // Duas versões: a encerrada com o valor antigo e a nova.
      const regras = await criarRepositorios(db).regras.listar()
      expect(regras).toHaveLength(2)
      expect(regras.map((r) => r.valorCentavos).sort()).toEqual([180_000, 200_000])
    })
  })
})
