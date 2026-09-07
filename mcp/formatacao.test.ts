import { describe, expect, it } from 'vitest'
import { dinheiro, item, ponto } from './formatacao.js'
import type { OcorrenciaResolvida } from '../src/domain/types.js'

describe('dinheiro', () => {
  it('devolve os centavos intactos junto do texto', () => {
    expect(dinheiro(123456).valorCentavos).toBe(123456)
    expect(dinheiro(123456).valor).toMatch(/^R\$\s?1\.234,56$/u)
  })

  it('formata zero', () => {
    expect(dinheiro(0).valor).toMatch(/^R\$\s?0,00$/u)
  })

  it('formata negativo', () => {
    expect(dinheiro(-5000).valorCentavos).toBe(-5000)
    expect(dinheiro(-5000).valor).toContain('50,00')
  })
})

describe('item', () => {
  const base: OcorrenciaResolvida = {
    chave: 'regra|r-luz|2026-03',
    origem: 'real',
    idReal: 'o-luz-marco',
    situacao: 'pago',
    numeroParcela: null,
    geradorTipo: 'regra',
    geradorId: 'r-luz',
    competencia: '2026-03',
    tipo: 'saida',
    nome: 'Luz',
    valorPrevistoCentavos: 22000,
    dataVencimento: '2026-03-15',
    dataPagamento: '2026-03-14',
    valorPagoCentavos: 24590,
    pagamentoRegistradoEm: null,
    ignorado: false,
    observacao: null,
    categoria: null,
  }

  it('usa o valor pago quando existe', () => {
    expect(item(base).valorCentavos).toBe(24590)
    expect(item(base).valor).toMatch(/^R\$\s?245,90$/u)
  })

  it('cai para o previsto quando nao ha pagamento', () => {
    const previsto = { ...base, situacao: 'previsto' as const, dataPagamento: null, valorPagoCentavos: null }
    expect(item(previsto).valorCentavos).toBe(22000)
    expect(item(previsto).dataPagamento).toBeNull()
  })

  it('expoe a chave, mas nao vaza idReal, que e detalhe de persistencia', () => {
    // A chave identifica a ocorrencia entre uma consulta e a escrita
    // seguinte -- sem ela, `marcar_pago` nao teria como referenciar uma
    // ocorrencia virtual (gerada por regra) que ainda nao existe no banco.
    expect(item(base).chave).toBe('regra|r-luz|2026-03')
    expect(item(base)).not.toHaveProperty('idReal')
  })

  it('propaga a categoria da ocorrencia', () => {
    // O fixture `base` usa categoria: null so para satisfazer o tipo -- aqui
    // se prova que um valor NAO nulo atravessa o formatador. Sem isso, um
    // `item()` que sempre devolvesse null passaria despercebido.
    const comCategoria = { ...base, categoria: 'mercado' as const }

    expect(item(comCategoria).categoria).toBe('mercado')
  })
})

describe('ponto', () => {
  it('formata um ponto da curva', () => {
    expect(ponto({ data: '2026-03-10', saldoCentavos: -4300 })).toEqual({
      data: '2026-03-10',
      saldoCentavos: -4300,
      saldo: expect.stringContaining('43,00'),
    })
  })
})
