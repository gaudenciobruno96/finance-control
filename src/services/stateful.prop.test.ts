/**
 * PBT-06 — Teste stateful da camada de persistencia e orquestracao.
 *
 * Gera sequencias aleatorias de comandos, executa contra o sistema real e
 * verifica invariantes apos CADA passo, comparando contra um modelo
 * simplificado.
 *
 * E onde aparecem os defeitos de ordem de operacao: pagar, editar a regra,
 * desfazer, remover e importar em ordens que ninguem escreveria a mao.
 *
 * O comando `exportarEImportar` entra DENTRO das sequencias, e nao num teste
 * separado. Assim o ciclo de backup e verificado em qualquer ponto da vida do
 * banco, e nao apenas num cenario arrumado.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { criarHarness, type Harness } from '../test-support/app-harness.js'
import { regraVigenteEm } from '../domain/rule-expander.js'
import { comparar } from '../domain/calendar.js'
import type { Regra } from '../domain/types.js'

const HOJE = '2026-08-15'
const COMPETENCIA = '2026-08'

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

type Comando =
  | { tipo: 'criarRegra'; valor: number; dia: number; entrada: boolean }
  | { tipo: 'editarAPartirDeste'; indice: number; valor: number }
  | { tipo: 'editarDesdeSempre'; indice: number; valor: number }
  | { tipo: 'removerRegra'; indice: number }
  | { tipo: 'criarParcelamento'; valor: number; parcelas: number }
  | { tipo: 'removerParcelamento'; indice: number }
  | { tipo: 'registrarPagamento'; indice: number; valor: number }
  | { tipo: 'desfazerPagamento'; indice: number }
  | { tipo: 'ajustarValor'; indice: number; valor: number }
  | { tipo: 'adiarVencimento'; indice: number; dia: number }
  | { tipo: 'ignorarNoMes'; indice: number }
  | { tipo: 'definirAncora'; saldo: number; dia: number }
  | { tipo: 'exportarEImportar' }

const valor = () => fc.integer({ min: 1, max: 500_000 })
const dia = () => fc.integer({ min: 1, max: 28 })
const indice = () => fc.integer({ min: 0, max: 5 })

const comando = (): fc.Arbitrary<Comando> =>
  fc.oneof(
    fc.record({ tipo: fc.constant('criarRegra' as const), valor: valor(), dia: dia(), entrada: fc.boolean() }),
    fc.record({ tipo: fc.constant('editarAPartirDeste' as const), indice: indice(), valor: valor() }),
    fc.record({ tipo: fc.constant('editarDesdeSempre' as const), indice: indice(), valor: valor() }),
    fc.record({ tipo: fc.constant('removerRegra' as const), indice: indice() }),
    fc.record({
      tipo: fc.constant('criarParcelamento' as const),
      valor: valor(),
      parcelas: fc.integer({ min: 1, max: 12 }),
    }),
    fc.record({ tipo: fc.constant('removerParcelamento' as const), indice: indice() }),
    fc.record({ tipo: fc.constant('registrarPagamento' as const), indice: indice(), valor: valor() }),
    fc.record({ tipo: fc.constant('desfazerPagamento' as const), indice: indice() }),
    fc.record({ tipo: fc.constant('ajustarValor' as const), indice: indice(), valor: valor() }),
    fc.record({ tipo: fc.constant('adiarVencimento' as const), indice: indice(), dia: dia() }),
    fc.record({ tipo: fc.constant('ignorarNoMes' as const), indice: indice() }),
    // O dia da ancora e limitado a 15 porque HOJE e 2026-08-15: uma ancora com
    // data futura e corretamente rejeitada pela invariante RN-45, e gera-la
    // aqui testaria o gerador, nao o sistema.
    fc.record({
      tipo: fc.constant('definirAncora' as const),
      saldo: fc.integer({ min: -200_000, max: 500_000 }),
      dia: fc.integer({ min: 1, max: 15 }),
    }),
    fc.record({ tipo: fc.constant('exportarEImportar' as const) }),
  )

// ---------------------------------------------------------------------------
// Execucao
// ---------------------------------------------------------------------------

/** Escolhe um elemento por indice circular. Nunca falha por lista curta. */
function escolher<T>(lista: readonly T[], i: number): T | null {
  if (lista.length === 0) return null
  return lista[i % lista.length] ?? null
}

/**
 * @param ordem Posicao do comando na sequencia. So serve para dar nome unico a
 * cada regra criada.
 *
 * A invariante 3 nao consegue identificar linhagem pelos dados -- o app
 * versiona criando uma nova Regra com mesmo nome e mesmo dia, sem campo que
 * aponte para a origem -- entao usa `tipo|nome|dia` como proxy. Duas regras
 * criadas de forma INDEPENDENTE com esses tres campos iguais sao legitimas
 * (dois salarios no dia 28), mas o proxy as lia como duas versoes vigentes da
 * mesma linhagem e acusava violacao onde nao havia.
 *
 * Nomear por ordem elimina a colisao sem enfraquecer o que a invariante
 * verifica: a edicao versionada preserva o nome, e continua caindo no mesmo
 * grupo.
 */
async function executar(app: Harness, cmd: Comando, ordem: number): Promise<void> {
  switch (cmd.tipo) {
    case 'criarRegra':
      await app.regras.criarRegra({
        tipo: cmd.entrada ? 'entrada' : 'saida',
        nome: `${cmd.entrada ? 'Entrada' : 'Saida'} ${ordem}`,
        valorCentavos: cmd.valor,
        valorEhEstimativa: false,
        diaDoMes: cmd.dia,
        ajusteFimDeSemana: 'nenhum',
        vigenteDe: '2026-06',
        vigenteAte: null,
      })
      return

    case 'editarAPartirDeste': {
      const r = escolher(await app.repos.regras.listar(), cmd.indice)
      if (r === null) return
      await app.regras.editarRegra(r.id, { valorCentavos: cmd.valor }, 'apartirDeste', COMPETENCIA)
      return
    }

    case 'editarDesdeSempre': {
      const r = escolher(await app.repos.regras.listar(), cmd.indice)
      if (r === null) return
      await app.regras.editarRegra(r.id, { valorCentavos: cmd.valor }, 'desdeSempre', COMPETENCIA)
      return
    }

    case 'removerRegra': {
      const r = escolher(await app.repos.regras.listar(), cmd.indice)
      if (r === null) return
      await app.regras.removerRegra(r.id)
      return
    }

    case 'criarParcelamento': {
      await app.regras.criarParcelamento({
        nome: 'Parcelado',
        valorParcelaCentavos: cmd.valor,
        quantidadeParcelas: cmd.parcelas,
        primeiroVencimento: '2026-08-15',
      })
      return
    }

    case 'removerParcelamento': {
      const p = escolher(await app.repos.parcelamentos.listar(), cmd.indice)
      if (p === null) return
      await app.regras.removerParcelamento(p.id)
      return
    }

    case 'registrarPagamento': {
      const mes = await app.projecao.projetarMes(COMPETENCIA, HOJE)
      const alvo = escolher([...mes.faltaPagar], cmd.indice)
      if (alvo === null) return
      await app.pagamento.registrarPagamento(alvo, '2026-08-14', cmd.valor)
      return
    }

    case 'desfazerPagamento': {
      const mes = await app.projecao.projetarMes(COMPETENCIA, HOJE)
      const alvo = escolher(mes.jaResolvido, cmd.indice)
      if (alvo === null) return
      await app.pagamento.desfazerPagamento(alvo)
      return
    }

    case 'ajustarValor': {
      const mes = await app.projecao.projetarMes(COMPETENCIA, HOJE)
      const alvo = escolher([...mes.faltaPagar], cmd.indice)
      if (alvo === null) return
      await app.pagamento.ajustarValorPrevisto(alvo, cmd.valor)
      return
    }

    case 'adiarVencimento': {
      const mes = await app.projecao.projetarMes(COMPETENCIA, HOJE)
      const alvo = escolher([...mes.faltaPagar], cmd.indice)
      if (alvo === null) return
      await app.pagamento.adiarVencimento(alvo, `2026-08-${String(cmd.dia).padStart(2, '0')}`)
      return
    }

    case 'ignorarNoMes': {
      const mes = await app.projecao.projetarMes(COMPETENCIA, HOJE)
      const alvo = escolher([...mes.faltaPagar], cmd.indice)
      if (alvo === null) return
      await app.pagamento.ignorarNoMes(alvo)
      return
    }

    case 'definirAncora':
      await app.regras.definirAncora(
        `2026-08-${String(cmd.dia).padStart(2, '0')}`,
        cmd.saldo,
        HOJE,
      )
      return

    case 'exportarEImportar': {
      const conteudo = await app.backup.exportar(HOJE)
      const resultado = app.backup.validarImportacao(conteudo)
      expect(resultado.valido).toBe(true)
      if (!resultado.valido) return
      await app.backup.confirmarImportacao(resultado.documento)
      return
    }
  }
}

// ---------------------------------------------------------------------------
// Invariantes
// ---------------------------------------------------------------------------

/** Agrupa regras por linhagem: mesma origem, versoes distintas. */
function porLinhagem(regras: readonly Regra[]): Map<string, Regra[]> {
  const grupos = new Map<string, Regra[]>()
  for (const r of regras) {
    const chave = `${r.tipo}|${r.nome}|${r.diaDoMes}`
    const grupo = grupos.get(chave)
    if (grupo === undefined) grupos.set(chave, [r])
    else grupo.push(r)
  }
  return grupos
}

async function verificarInvariantes(app: Harness): Promise<void> {
  const [regras, parcelamentos, ocorrencias, ancoras] = await Promise.all([
    app.repos.regras.listar(),
    app.repos.parcelamentos.listar(),
    app.repos.ocorrencias.listar(),
    app.repos.ancoras.listar(),
  ])

  // 1. Toda entidade satisfaz suas invariantes (RN-43).
  for (const r of regras) {
    expect(Number.isInteger(r.valorCentavos)).toBe(true)
    expect(r.valorCentavos).toBeGreaterThan(0)
    if (r.vigenteAte !== null) expect(r.vigenteDe <= r.vigenteAte).toBe(true)
  }
  for (const o of ocorrencias) {
    expect(Number.isInteger(o.valorPrevistoCentavos)).toBe(true)
    // Pagamento tem data e valor juntos, ou nenhum dos dois.
    expect(o.dataPagamento === null).toBe(o.valorPagoCentavos === null)
  }

  // 2. Todo parcelamento tem quantidade de parcelas positiva.
  for (const p of parcelamentos) {
    expect(p.quantidadeParcelas).toBeGreaterThan(0)
  }

  // 3. Nenhuma competencia tem duas regras da mesma linhagem vigentes (RN-15).
  for (const grupo of porLinhagem(regras).values()) {
    for (const c of ['2026-06', '2026-07', '2026-08', '2026-09', '2027-01']) {
      const vigentes = grupo.filter((r) => regraVigenteEm(r, c))
      expect(vigentes.length).toBeLessThanOrEqual(1)
    }
  }

  // 4. A ancora vigente e sempre a mais recente que nao ultrapassa a data (RN-49).
  const vigente = await app.repos.ancoras.vigenteEm(HOJE)
  const candidatas = ancoras.filter((a) => comparar(a.data, HOJE) <= 0)
  if (candidatas.length === 0) {
    expect(vigente).toBeNull()
  } else {
    const maisRecente = candidatas.reduce((a, b) => (comparar(a.data, b.data) >= 0 ? a : b))
    expect(vigente?.data).toBe(maisRecente.data)
  }

  // 5. A projecao nunca lanca; a curva e contigua e termina no ultimo dia do
  //    mes.
  //
  //    NAO se exige um ponto por dia da competencia: quando a ancora cai
  //    dentro do mes exibido, a curva comeca no dia da ancora, porque o saldo
  //    dos dias anteriores nao e conhecido. Esta invariante foi corrigida
  //    depois que o proprio teste stateful expos a contradicao com o enunciado
  //    original de PROP-P02.
  const mes = await app.projecao.projetarMes(COMPETENCIA, HOJE)
  expect(mes.curva.pontos.length).toBeGreaterThan(0)
  expect(mes.curva.pontos[mes.curva.pontos.length - 1]?.data).toBe('2026-08-31')

  for (let i = 1; i < mes.curva.pontos.length; i += 1) {
    const anterior = mes.curva.pontos[i - 1]!.data
    const atual = mes.curva.pontos[i]!.data
    expect(Number(atual.slice(8, 10)) - Number(anterior.slice(8, 10))).toBe(1)
  }

  // 6. O resumo e internamente coerente.
  expect(mes.resumo.balancoPrevistoCentavos).toBe(
    mes.resumo.aReceberCentavos - mes.resumo.aPagarCentavos,
  )
  expect(mes.resumo.faltaPagarCentavos).toBe(
    mes.resumo.aPagarCentavos - mes.resumo.jaPagoCentavos,
  )
  expect(Number.isInteger(mes.resumo.saldoFinalProjetadoCentavos)).toBe(true)
}

// ---------------------------------------------------------------------------
// Propriedades
// ---------------------------------------------------------------------------

describe('stateful — persistencia e orquestracao (PBT-06)', () => {
  it('nenhuma sequencia de comandos viola as invariantes do sistema', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(comando(), { maxLength: 14 }), async (comandos) => {
        const app = await criarHarness()
        try {
          for (const [ordem, cmd] of comandos.entries()) {
            await executar(app, cmd, ordem)
            await verificarInvariantes(app)
          }
        } finally {
          await app.encerrar()
        }
      }),
      { numRuns: 25 },
    )
  }, 120_000)

  /**
   * PROP-S05 · O ciclo de backup preserva o estado observavel.
   *
   * Verificado apos uma sequencia arbitraria, nao num cenario arrumado: e o
   * teste que protege o dado que nao tem copia em lugar nenhum.
   */
  it('PROP-S05: exportar e importar preserva o estado em qualquer ponto', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(comando(), { maxLength: 10 }), async (comandos) => {
        const app = await criarHarness()
        try {
          for (const [ordem, cmd] of comandos.entries()) await executar(app, cmd, ordem)

          const antes = await app.projecao.projetarMes(COMPETENCIA, HOJE)
          const conteudo = await app.backup.exportar(HOJE)

          await app.db.regras.clear()
          await app.db.parcelamentos.clear()
          await app.db.ocorrencias.clear()
          await app.db.ancoras.clear()

          const resultado = app.backup.validarImportacao(conteudo)
          expect(resultado.valido).toBe(true)
          if (!resultado.valido) return
          await app.backup.confirmarImportacao(resultado.documento)

          const depois = await app.projecao.projetarMes(COMPETENCIA, HOJE)
          expect(depois.resumo).toEqual(antes.resumo)
          expect(depois.curva.pontos).toEqual(antes.curva.pontos)
        } finally {
          await app.encerrar()
        }
      }),
      { numRuns: 20 },
    )
  }, 120_000)

  /** PROP-S06 · Uma importacao recusada nunca altera o estado. */
  it('PROP-S06: importacao recusada nao altera o estado', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(comando(), { maxLength: 8 }),
        fc.constantFrom('lixo', '{}', '{"versaoSchema":999}', '[]', ''),
        async (comandos, arquivoInvalido) => {
          const app = await criarHarness()
          try {
            for (const [ordem, cmd] of comandos.entries()) await executar(app, cmd, ordem)

            const antes = await app.projecao.projetarMes(COMPETENCIA, HOJE)

            const resultado = app.backup.validarImportacao(arquivoInvalido)
            expect(resultado.valido).toBe(false)

            const depois = await app.projecao.projetarMes(COMPETENCIA, HOJE)
            expect(depois.resumo).toEqual(antes.resumo)
          } finally {
            await app.encerrar()
          }
        },
      ),
      { numRuns: 15 },
    )
  }, 120_000)
})
