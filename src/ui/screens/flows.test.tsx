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
    //
    // A busca e ESCOPADA na secao: o nome tambem aparece no detalhe de
    // 'ainda sai', e uma busca global acharia duas ocorrencias do texto.
    const aPagar = await screen.findByLabelText('Falta pagar')
    await usuario.click(await within(aPagar).findByText('Aluguel'))

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

    const aPagar = await screen.findByLabelText('Falta pagar')
    await usuario.click(await within(aPagar).findByText('Aluguel'))
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

    const aPagar = await screen.findByLabelText('Falta pagar')
    await usuario.click(await within(aPagar).findByText('Luz'))
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
  it('cria uma receita recorrente marcando a flag de repetição', async () => {
    const usuario = userEvent.setup()

    montar(<RegistrationsScreen />, '/cadastros')

    await usuario.click(screen.getByTestId('nova-regra'))

    await usuario.type(screen.getByTestId('quick-nome'), 'Freela')
    const valor = screen.getByTestId('money-input-quick-valor')
    await usuario.clear(valor)
    await usuario.type(valor, '9990')

    // A flag e o que transforma o lancamento em recorrencia.
    await usuario.click(screen.getByTestId('quick-repete'))
    await usuario.click(screen.getByTestId('salvar-quick'))

    await waitFor(async () => {
      const regras = await criarRepositorios(db).regras.listar()
      expect(regras).toHaveLength(1)
      expect(regras[0]?.nome).toBe('Freela')
      expect(regras[0]?.tipo).toBe('entrada')
      expect(regras[0]?.valorCentavos).toBe(9_990)
      // O padrao sugerido para entrada e antecipar (RN-09).
      expect(regras[0]?.ajusteFimDeSemana).toBe('antecipa')
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

describe('lançamento pela caixa única', () => {
  /**
   * As tres formas nascem do mesmo formulario. Cada flag muda para onde o
   * lancamento vai, e e a unica coisa que o usuario decide alem do valor.
   */
  it('cria um parcelamento marcando a flag e informando as vezes', async () => {
    const usuario = userEvent.setup()

    montar(<MonthScreen />)

    await usuario.click(await screen.findByTestId('anotar-conta'))

    await usuario.type(screen.getByTestId('quick-nome'), 'Notebook')
    const valor = screen.getByTestId('money-input-quick-valor')
    await usuario.clear(valor)
    await usuario.type(valor, '30000')

    await usuario.click(screen.getByTestId('quick-parcelado'))

    const vezes = screen.getByTestId('quick-parcelas')
    await usuario.clear(vezes)
    await usuario.type(vezes, '10')

    await usuario.click(screen.getByTestId('salvar-quick'))

    await waitFor(async () => {
      const lista = await criarRepositorios(db).parcelamentos.listar()
      expect(lista).toHaveLength(1)
      expect(lista[0]?.quantidadeParcelas).toBe(10)
      expect(lista[0]?.valorParcelaCentavos).toBe(30_000)
    })

    // Nenhuma ocorrencia avulsa foi criada junto: a parcela e virtual.
    expect(await criarRepositorios(db).ocorrencias.listar()).toHaveLength(0)
  })

  it('anota uma conta de uma vez só quando nenhuma flag está marcada', async () => {
    const usuario = userEvent.setup()

    montar(<MonthScreen />)

    await usuario.click(await screen.findByTestId('anotar-conta'))
    await usuario.type(screen.getByTestId('quick-nome'), 'Dentista')
    const valor = screen.getByTestId('money-input-quick-valor')
    await usuario.clear(valor)
    await usuario.type(valor, '25000')
    await usuario.click(screen.getByTestId('salvar-quick'))

    await waitFor(async () => {
      const lista = await criarRepositorios(db).ocorrencias.listar()
      expect(lista).toHaveLength(1)
      expect(lista[0]?.geradorTipo).toBe('avulso')
      expect(lista[0]?.nome).toBe('Dentista')
    })

    expect(await criarRepositorios(db).regras.listar()).toHaveLength(0)
  })
})

describe('adiantamento de salário', () => {
  /**
   * O caso que motivou o ajuste de valor por mes: recebi adiantado, entao
   * NESTE mes entra mais -- e nos proximos continua o de sempre.
   */
  it('muda o valor de um mês sem tocar nos seguintes', async () => {
    const usuario = userEvent.setup()

    const regra = await criarRuleService(db, criarRepositorios(db)).criarRegra({
      tipo: 'entrada',
      nome: 'Salário',
      valorCentavos: 300_000,
      valorEhEstimativa: false,
      diaDoMes: 5,
      ajusteFimDeSemana: 'antecipa',
      vigenteDe: competenciaDe(hojeLocal()),
      vigenteAte: null,
    })

    montar(<MonthScreen />)

    const secao = await screen.findByLabelText('Ainda entra')
    await usuario.click(await within(secao).findByText('Salário'))

    const folha = await screen.findByTestId('payment-sheet')
    await usuario.click(within(folha).getByTestId('acoes-secundarias'))

    const campo = within(folha).getByTestId('money-input-ajuste-valor')
    await usuario.clear(campo)
    await usuario.type(campo, '450000')

    await usuario.click(within(folha).getByTestId('ajustar-valor'))

    await waitFor(() => {
      expect(screen.queryByTestId('payment-sheet')).not.toBeInTheDocument()
    })

    const repos = criarRepositorios(db)

    // Uma ocorrencia real cobre so este mes.
    const ocorrencias = await repos.ocorrencias.listar()
    expect(ocorrencias).toHaveLength(1)
    expect(ocorrencias[0]?.competencia).toBe(competenciaDe(hojeLocal()))
    expect(ocorrencias[0]?.valorPrevistoCentavos).toBe(450_000)

    // A regra permanece intacta: os proximos meses seguem em 3.000.
    const regras = await repos.regras.listar()
    expect(regras).toHaveLength(1)
    expect(regras[0]?.id).toBe(regra.id)
    expect(regras[0]?.valorCentavos).toBe(300_000)
  })
})

describe('abrir os totais da conta', () => {
  /**
   * O total sozinho nao responde a pergunta seguinte: entra quanto, vindo de
   * onde? E o item ja recebido some do total sem deixar rastro -- abrir e a
   * unica forma de conferir.
   */
  it('“ainda sai” lista os itens que ainda vão sair', async () => {
    const usuario = userEvent.setup()

    await semear('Aluguel', 180_000, 10)

    montar(<MonthScreen />)

    // Avanca um mes em vez de contar com o dia de hoje: no dia 20 uma conta do
    // dia 10 ja passou, e o teste falharia por causa da data em que roda.
    await usuario.click(await screen.findByTestId('proximo-mes'))

    const linha = await screen.findByTestId('detalhe-sai')
    await usuario.click(linha)

    const detalhe = linha.closest('details')
    expect(detalhe).not.toBeNull()
    expect(within(detalhe as HTMLElement).getByText('Aluguel')).toBeInTheDocument()
  })
})

describe('recebimento parcial', () => {
  /**
   * O caso relatado: salário de 18.000 no dia 31, 8.000 já vieram de
   * adiantamento, restam 10.000 a receber -- e só neste mês.
   */
  it('registra a parte já recebida e deixa o restante para receber', async () => {
    const usuario = userEvent.setup()

    await criarRuleService(db, criarRepositorios(db)).criarRegra({
      tipo: 'entrada',
      nome: 'Salário',
      valorCentavos: 1_800_000,
      valorEhEstimativa: false,
      diaDoMes: 31,
      ajusteFimDeSemana: 'antecipa',
      vigenteDe: competenciaDe(hojeLocal()),
      vigenteAte: null,
    })

    montar(<MonthScreen />)

    const secao = await screen.findByLabelText('Ainda entra')
    await usuario.click(await within(secao).findByText('Salário'))

    const folha = await screen.findByTestId('payment-sheet')

    // Visível na própria folha, não escondido em "Outras ações".
    await usuario.click(within(folha).getByTestId('parte-antecipada'))

    const campo = within(folha).getByTestId('money-input-parte-antecipada')
    await usuario.clear(campo)
    await usuario.type(campo, '800000')

    expect(within(folha).getByTestId('resta-apos-parte')).toHaveTextContent(
      'Resta receber',
    )

    await usuario.click(within(folha).getByTestId('salvar-parte'))

    await waitFor(() => {
      expect(screen.queryByTestId('payment-sheet')).not.toBeInTheDocument()
    })

    const repos = criarRepositorios(db)

    const ocorrencias = await repos.ocorrencias.listar()
    expect(ocorrencias).toHaveLength(1)
    expect(ocorrencias[0]?.competencia).toBe(competenciaDe(hojeLocal()))
    expect(ocorrencias[0]?.valorPrevistoCentavos).toBe(1_000_000)
    expect(ocorrencias[0]?.observacao).toContain('8.000,00')
    // Não vira pagamento: os 10.000 continuam a receber.
    expect(ocorrencias[0]?.dataPagamento).toBeNull()

    // A regra fica intacta: os próximos meses seguem em 18.000.
    const regras = await repos.regras.listar()
    expect(regras).toHaveLength(1)
    expect(regras[0]?.valorCentavos).toBe(1_800_000)
  })

  it('não aceita uma parte igual ou maior que o previsto', async () => {
    const usuario = userEvent.setup()
    await semear('Aluguel', 180_000, 28)

    montar(<MonthScreen />)

    const aPagar = await screen.findByLabelText('Falta pagar')
    await usuario.click(await within(aPagar).findByText('Aluguel'))

    const folha = await screen.findByTestId('payment-sheet')
    await usuario.click(within(folha).getByTestId('parte-antecipada'))

    const campo = within(folha).getByTestId('money-input-parte-antecipada')
    await usuario.clear(campo)
    await usuario.type(campo, '180000')

    // Pagar tudo é confirmar o pagamento, com data — não é "uma parte".
    expect(within(folha).getByTestId('salvar-parte')).toBeDisabled()
  })
})

describe('painéis laterais', () => {
  /**
   * Empilhadas, ver "ainda entra" custava rolar a tela inteira do que sai.
   * Os dois painéis existem juntos -- é o que permite o arraste -- e as abas
   * dizem qual está à vista.
   */
  it('a tela do mês separa o que sai do que entra em painéis', async () => {
    const usuario = userEvent.setup()
    await semear('Aluguel', 180_000, 10)

    montar(<MonthScreen />)

    const abaSai = await screen.findByTestId('aba-falta-pagar')
    const abaEntra = screen.getByTestId('aba-ainda-entra')

    expect(abaSai).toHaveAttribute('aria-selected', 'true')
    expect(abaEntra).toHaveAttribute('aria-selected', 'false')

    // O total fica na própria aba: dá para comparar sem trocar de painel.
    expect(abaSai).toHaveTextContent('1.800,00')

    await usuario.click(abaEntra)

    expect(abaEntra).toHaveAttribute('aria-selected', 'true')
    expect(abaSai).toHaveAttribute('aria-selected', 'false')

    // Trocar de painel não some com o outro: ele está ao lado, e o conteúdo
    // continua acessível.
    expect(screen.getByLabelText('Falta pagar')).toBeInTheDocument()
    expect(screen.getByLabelText('Ainda entra')).toBeInTheDocument()
  })

  it('a tela de receitas separa o que entra das contas fixas', async () => {
    const usuario = userEvent.setup()

    montar(<RegistrationsScreen />, '/cadastros')

    const abaEntra = await screen.findByTestId('aba-receitas')
    const abaFixas = screen.getByTestId('aba-fixas')

    expect(abaEntra).toHaveAttribute('aria-selected', 'true')

    await usuario.click(abaFixas)
    expect(abaFixas).toHaveAttribute('aria-selected', 'true')
  })
})

describe('edição de receita', () => {
  /**
   * O formulário nascia no fim da página: tocar numa receita e ter de rolar
   * até embaixo para achar o campo -- e rolar de volta -- era o caminho mais
   * longo possível entre a intenção e a ação.
   */
  it('abre como folha sobre a lista, não no fim da página', async () => {
    const usuario = userEvent.setup()

    await criarRuleService(db, criarRepositorios(db)).criarRegra({
      tipo: 'entrada',
      nome: 'Salário',
      valorCentavos: 300_000,
      valorEhEstimativa: false,
      diaDoMes: 5,
      ajusteFimDeSemana: 'antecipa',
      vigenteDe: competenciaDe(hojeLocal()),
      vigenteAte: null,
    })

    montar(<RegistrationsScreen />, '/cadastros')

    await usuario.click(await screen.findByTestId('regra-Salário'))

    // Diálogo modal, não um bloco no fim do documento.
    const folha = await screen.findByRole('dialog')
    expect(folha).toHaveAttribute('aria-modal', 'true')
    expect(folha).toHaveAccessibleName('Salário')

    // E fecha sem salvar nada.
    await usuario.click(within(folha).getByText('Fechar'))

    await waitFor(() => {
      expect(screen.queryByTestId('editar-regra')).not.toBeInTheDocument()
    })

    const regras = await criarRepositorios(db).regras.listar()
    expect(regras[0]?.valorCentavos).toBe(300_000)
  })
})
