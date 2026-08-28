import { describe, expect, it } from 'vitest'
import { criarAppDoBackup } from '../app-em-memoria.js'
import {
  ORCAMENTO_SEM_ANCORA,
  ORCAMENTO_SIMPLES,
} from '../fixtures/orcamento-simples.js'
import { situacaoDoMes } from './situacao-do-mes.js'

describe('situacaoDoMes', () => {
  it('usa o mes de hoje quando a competencia nao vem', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await situacaoDoMes(app, { hoje: '2026-03-20' })

    expect(r.competencia).toBe('2026-03')
    await app.encerrar()
  })

  it('devolve totais em centavos e em texto', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-20' })

    expect(r.jaResolvido.valorCentavos).toBe(24590)
    // Espaco estreito (U+202F) do Intl: `\s` casa ASCII e nao-quebravel.
    expect(r.jaResolvido.valor).toMatch(/^R\$\s?245,90$/u)
    await app.encerrar()
  })

  it('lista o aluguel nao pago como pendente', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-20' })

    expect(r.faltaPagar.map((i) => i.nome)).toContain('Aluguel')
    expect(r.faltaPagar.every((i) => i.tipo === 'saida')).toBe(true)
    await app.encerrar()
  })

  it('marca saldoRelativo quando nao ha ancora', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SEM_ANCORA)

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-20' })

    expect(r.saldoRelativo).toBe(true)
    expect(r.avisoSaldoRelativo).toMatch(/ancora|âncora/i)
    await app.encerrar()
  })

  it('nao emite aviso quando ha ancora', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-20' })

    expect(r.saldoRelativo).toBe(false)
    expect(r.avisoSaldoRelativo).toBeNull()
    await app.encerrar()
  })

  it('expoe o dia de saldo minimo', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-20' })

    expect(r.diaMinimo.data).toMatch(/^2026-03-\d{2}$/)
    expect(typeof r.diaMinimo.saldoCentavos).toBe('number')
    await app.encerrar()
  })

  it('fecha a identidade saldo + entra - sai = sobra', async () => {
    const app = await criarAppDoBackup(ORCAMENTO_SIMPLES)

    const r = await situacaoDoMes(app, { competencia: '2026-03', hoje: '2026-03-20' })

    expect(
      r.saldoNaReferencia.valorCentavos +
        r.entraApos.valorCentavos -
        r.saiApos.valorCentavos,
    ).toBe(r.sobra.valorCentavos)
    await app.encerrar()
  })
})
