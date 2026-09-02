// @vitest-environment jsdom

/**
 * Regressao do defeito mais grave da revisao (#4).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentSheet } from './PaymentSheet.js'
import type { OcorrenciaResolvida } from '../../domain/types.js'

afterEach(cleanup)

const LUZ: OcorrenciaResolvida = {
  chave: 'regra:r1:2026-08',
  origem: 'virtual',
  idReal: null,
  situacao: 'previsto',
  numeroParcela: null,
  geradorTipo: 'regra',
  geradorId: 'r1',
  competencia: '2026-08',
  tipo: 'saida',
  nome: 'Luz',
  valorPrevistoCentavos: 18_000,
  dataVencimento: '2026-08-10',
  dataPagamento: null,
  valorPagoCentavos: null,
  pagamentoRegistradoEm: null,
  ignorado: false,
  observacao: null,
}

function montar(over: Partial<Parameters<typeof PaymentSheet>[0]> = {}) {
  const props = {
    ocorrencia: LUZ,
    hoje: '2026-08-15',
    onPagar: vi.fn(),
    onDesfazerPagamento: vi.fn(),
    onAjustarValor: vi.fn(),
    onRegistrarParte: vi.fn(),
    onAdiar: vi.fn(),
    onIgnorar: vi.fn(),
    onReativar: vi.fn(),
    onFechar: vi.fn(),
    ...over,
  }
  render(<PaymentSheet {...props} />)
  return props
}

describe('PaymentSheet — valores independentes', () => {
  /**
   * O defeito: os dois campos compartilhavam um unico estado. Corrigir a
   * previsao da conta de luz em "Outras acoes" sobrescrevia o valor do
   * pagamento, e confirmar registrava o numero errado.
   *
   * Sao grandezas distintas -- quanto se espera pagar e quanto se pagou.
   */
  it('corrigir o previsto NAO altera o valor do pagamento', async () => {
    const usuario = userEvent.setup()
    const props = montar()

    await usuario.click(screen.getByTestId('acoes-secundarias'))

    const previsto = screen.getByTestId('money-input-ajuste-valor')
    await usuario.clear(previsto)
    await usuario.type(previsto, '25000')

    await usuario.click(screen.getByTestId('confirmar-pagamento'))

    // O pagamento mantem o valor previsto ORIGINAL, nao a correcao.
    expect(props.onPagar).toHaveBeenCalledWith('2026-08-15', 18_000)
  })

  it('alterar o valor pago NAO altera o previsto', async () => {
    const usuario = userEvent.setup()
    const props = montar()

    const pago = screen.getByTestId('money-input-pagamento-valor')
    await usuario.clear(pago)
    await usuario.type(pago, '20000')

    await usuario.click(screen.getByTestId('acoes-secundarias'))
    await usuario.click(screen.getByTestId('ajustar-valor'))

    expect(props.onAjustarValor).toHaveBeenCalledWith(18_000)
  })

  it('cada campo envia o proprio valor', async () => {
    const usuario = userEvent.setup()
    const props = montar()

    const pago = screen.getByTestId('money-input-pagamento-valor')
    await usuario.clear(pago)
    await usuario.type(pago, '19500')

    await usuario.click(screen.getByTestId('acoes-secundarias'))
    const previsto = screen.getByTestId('money-input-ajuste-valor')
    await usuario.clear(previsto)
    await usuario.type(previsto, '25000')

    await usuario.click(screen.getByTestId('ajustar-valor'))
    expect(props.onAjustarValor).toHaveBeenCalledWith(25_000)

    await usuario.click(screen.getByTestId('confirmar-pagamento'))
    expect(props.onPagar).toHaveBeenCalledWith('2026-08-15', 19_500)
  })
})
