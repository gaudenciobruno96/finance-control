import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ErroDeDominio } from '../domain/errors.js'
import { criarBanco, type BancoFinanceiro } from './db.js'
import { criarRepositorios, type Repositorios } from './repositories.js'
import type { AncoraSaldo, Categoria, Ocorrencia, Parcelamento, Regra } from '../domain/types.js'

const HOJE = '2026-08-15'

let db: BancoFinanceiro
let repos: Repositorios
let contador = 0

beforeEach(async () => {
  contador += 1
  db = criarBanco(`teste-repos-${contador}`)
  repos = criarRepositorios(db)
  await db.open()
})

afterEach(async () => {
  db.close()
  await db.delete()
})

function regra(over: Partial<Regra> = {}): Regra {
  return {
    id: 'r1',
    tipo: 'saida',
    nome: 'Aluguel',
    valorCentavos: 180_000,
    valorEhEstimativa: false,
    diaDoMes: 10,
    ajusteFimDeSemana: 'nenhum',
    vigenteDe: '2026-01',
    vigenteAte: null,
    categoria: null,
    ...over,
  }
}

function parcelamento(over: Partial<Parcelamento> = {}): Parcelamento {
  return {
    id: 'p1',
    nome: 'Notebook',
    valorParcelaCentavos: 30_000,
    quantidadeParcelas: 10,
    primeiroVencimento: '2026-08-28',
    categoria: null,
    ...over,
  }
}

function ocorrencia(over: Partial<Ocorrencia> = {}): Ocorrencia {
  return {
    id: 'o1',
    geradorTipo: 'regra',
    geradorId: 'r1',
    competencia: '2026-08',
    tipo: 'saida',
    nome: 'Aluguel',
    valorPrevistoCentavos: 180_000,
    dataVencimento: '2026-08-10',
    dataPagamento: null,
    valorPagoCentavos: null,
    pagamentoRegistradoEm: null,
    ignorado: false,
    observacao: null,
    categoria: null,
    ...over,
  }
}

function ancora(over: Partial<AncoraSaldo> = {}): AncoraSaldo {
  return { id: 'a1', data: '2026-08-01', saldoCentavos: 100_000, declaradaEm: null, ...over }
}

describe('repositorios', () => {
  describe('operacoes basicas', () => {
    it('grava e recupera uma regra', async () => {
      await repos.regras.salvar(regra())

      expect(await repos.regras.obter('r1')).toMatchObject({ nome: 'Aluguel' })
      expect(await repos.regras.listar()).toHaveLength(1)
    })

    it('devolve nulo para identificador inexistente', async () => {
      expect(await repos.regras.obter('nao-existe')).toBeNull()
    })

    it('grava e recupera um parcelamento', async () => {
      await repos.parcelamentos.salvar(parcelamento())

      const lista = await repos.parcelamentos.listar()

      expect(lista).toHaveLength(1)
      expect(lista[0]?.quantidadeParcelas).toBe(10)
    })

    it('sobrescreve ao salvar com o mesmo identificador', async () => {
      await repos.regras.salvar(regra({ valorCentavos: 180_000 }))
      await repos.regras.salvar(regra({ valorCentavos: 200_000 }))

      expect(await repos.regras.listar()).toHaveLength(1)
      expect((await repos.regras.obter('r1'))?.valorCentavos).toBe(200_000)
    })
  })

  describe('invariantes de escrita (RN-43)', () => {
    it('rejeita valor fracionario sem tocar o banco', async () => {
      await expect(repos.regras.salvar(regra({ valorCentavos: 1.5 }))).rejects.toThrow(
        ErroDeDominio,
      )

      expect(await repos.regras.listar()).toHaveLength(0)
    })

    it('rejeita vigencia invertida', async () => {
      await expect(
        repos.regras.salvar(regra({ vigenteDe: '2026-08', vigenteAte: '2026-01' })),
      ).rejects.toThrowError(expect.objectContaining({ codigo: 'VIGENCIA_INVERTIDA' }))
    })

    it('rejeita dia do mes fora da faixa', async () => {
      await expect(repos.regras.salvar(regra({ diaDoMes: 32 }))).rejects.toThrow(ErroDeDominio)
    })

    /** RN-45: declarar saldo para data futura nao tem significado. */
    it('rejeita ancora com data futura', async () => {
      await expect(
        repos.ancoras.salvar(ancora({ data: '2027-01-01' }), HOJE),
      ).rejects.toThrowError(expect.objectContaining({ codigo: 'ANCORA_FUTURA' }))
    })

    it('rejeita ocorrencia com pagamento pela metade', async () => {
      await expect(
        repos.ocorrencias.salvar(ocorrencia({ dataPagamento: '2026-08-09', valorPagoCentavos: null })),
      ).rejects.toThrow(ErroDeDominio)

      await expect(
        repos.ocorrencias.salvar(ocorrencia({ dataPagamento: null, valorPagoCentavos: 100 })),
      ).rejects.toThrow(ErroDeDominio)
    })

    /**
     * A lista das quinze categorias NAO tem check constraint no banco, por
     * decisao de desenho: quem a faz valer e `ehCategoriaValida`, chamada
     * daqui. Sem este teste, faze-la devolver `true` incondicionalmente
     * passaria na suite inteira -- a unica barreira do dominio ficaria sem
     * nenhuma prova.
     *
     * 'Mercado' e o erro provavel de verdade: a categoria certa existe, so que
     * em minuscula.
     */
    it('rejeita categoria fora da lista das quinze, nos tres tipos', async () => {
      const foraDaLista = 'Mercado' as unknown as Categoria

      await expect(
        repos.regras.salvar(regra({ categoria: foraDaLista })),
      ).rejects.toThrowError(expect.objectContaining({ codigo: 'CATEGORIA_INVALIDA' }))

      await expect(
        repos.parcelamentos.salvar(parcelamento({ categoria: foraDaLista })),
      ).rejects.toThrowError(expect.objectContaining({ codigo: 'CATEGORIA_INVALIDA' }))

      await expect(
        repos.ocorrencias.salvar(ocorrencia({ categoria: foraDaLista })),
      ).rejects.toThrowError(expect.objectContaining({ codigo: 'CATEGORIA_INVALIDA' }))

      // Sem tocar o banco.
      expect(await repos.regras.listar()).toHaveLength(0)
      expect(await repos.parcelamentos.listar()).toHaveLength(0)

      // E uma da lista continua passando -- a barreira nao rejeita tudo.
      await repos.regras.salvar(regra({ categoria: 'moradia' }))
      expect((await repos.regras.obter('r1'))?.categoria).toBe('moradia')
    })
  })

  describe('consultas de ocorrencias', () => {
    it('lista por intervalo de competencia, inclusive nas bordas', async () => {
      await repos.ocorrencias.salvar(ocorrencia({ id: 'o1', competencia: '2026-06' }))
      await repos.ocorrencias.salvar(ocorrencia({ id: 'o2', competencia: '2026-07' }))
      await repos.ocorrencias.salvar(ocorrencia({ id: 'o3', competencia: '2026-08' }))
      await repos.ocorrencias.salvar(ocorrencia({ id: 'o4', competencia: '2026-09' }))

      const encontradas = await repos.ocorrencias.listarPorIntervalo('2026-06', '2026-08')

      expect(encontradas.map((o) => o.competencia).sort()).toEqual(['2026-06', '2026-07', '2026-08'])
    })

    /** Base da idempotencia do pagamento (RN-51). */
    it('busca pela chave de sobreposicao', async () => {
      await repos.ocorrencias.salvar(ocorrencia({ id: 'o1', geradorId: 'r1', competencia: '2026-08' }))
      await repos.ocorrencias.salvar(ocorrencia({ id: 'o2', geradorId: 'r1', competencia: '2026-09' }))

      const encontrada = await repos.ocorrencias.obterPorChave('regra', 'r1', '2026-08')

      expect(encontrada?.id).toBe('o1')
      expect(await repos.ocorrencias.obterPorChave('regra', 'r1', '2026-12')).toBeNull()
    })

    it('lista o historico de um gerador', async () => {
      await repos.ocorrencias.salvar(ocorrencia({ id: 'o1', geradorId: 'r1', competencia: '2026-07' }))
      await repos.ocorrencias.salvar(ocorrencia({ id: 'o2', geradorId: 'r1', competencia: '2026-08' }))
      await repos.ocorrencias.salvar(ocorrencia({ id: 'o3', geradorId: 'r2', competencia: '2026-08' }))

      expect(await repos.ocorrencias.porGerador('regra', 'r1')).toHaveLength(2)
    })
  })

  describe('ancoras de saldo', () => {
    /** RN-48: acumulam, nao substituem. */
    it('acumula multiplas ancoras', async () => {
      await repos.ancoras.salvar(ancora({ id: 'a1', data: '2026-06-01' }), HOJE)
      await repos.ancoras.salvar(ancora({ id: 'a2', data: '2026-07-01' }), HOJE)

      expect(await repos.ancoras.listar()).toHaveLength(2)
    })

    /** RN-49: vale a mais recente que nao ultrapassa a data. */
    it('seleciona a ancora vigente', async () => {
      await repos.ancoras.salvar(ancora({ id: 'a1', data: '2026-06-01', saldoCentavos: 10_000 }), HOJE)
      await repos.ancoras.salvar(ancora({ id: 'a2', data: '2026-07-01', saldoCentavos: 20_000 }), HOJE)
      await repos.ancoras.salvar(ancora({ id: 'a3', data: '2026-08-01', saldoCentavos: 30_000 }), HOJE)

      expect((await repos.ancoras.vigenteEm('2026-07-15'))?.saldoCentavos).toBe(20_000)
      expect((await repos.ancoras.vigenteEm('2026-08-01'))?.saldoCentavos).toBe(30_000)
      expect((await repos.ancoras.vigenteEm('2026-12-31'))?.saldoCentavos).toBe(30_000)
    })

    it('devolve nulo quando nenhuma ancora antecede a data', async () => {
      await repos.ancoras.salvar(ancora({ data: '2026-08-01' }), HOJE)

      expect(await repos.ancoras.vigenteEm('2026-01-01')).toBeNull()
    })
  })

  describe('remocao (RN-46)', () => {
    it('remover a regra NAO remove as ocorrencias ja materializadas', async () => {
      await repos.regras.salvar(regra())
      await repos.ocorrencias.salvar(
        ocorrencia({ dataPagamento: '2026-08-09', valorPagoCentavos: 180_000 }),
      )

      await repos.regras.remover('r1')

      expect(await repos.regras.listar()).toHaveLength(0)
      expect(await repos.ocorrencias.listar()).toHaveLength(1)
    })
  })

  describe('configuracoes', () => {
    it('registra e recupera a data da ultima exportacao', async () => {
      expect(await repos.configuracoes.ultimaExportacao()).toBeNull()

      await repos.configuracoes.registrarExportacao('2026-08-15')

      expect(await repos.configuracoes.ultimaExportacao()).toBe('2026-08-15')
    })
  })
})
