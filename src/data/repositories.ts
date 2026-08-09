/**
 * DAT-02 — Repositorios por entidade.
 *
 * Isolam o acesso ao banco: nenhuma camada acima conhece Dexie. Toda escrita
 * valida invariantes antes de gravar (RN-43) -- entrada invalida e rejeitada e
 * o banco nao e tocado.
 */

import { ErroDeDominio } from '../domain/errors.js'
import { comparar } from '../domain/calendar.js'
import type {
  AncoraSaldo,
  Cartao,
  Competencia,
  DataISO,
  Ocorrencia,
  Parcelamento,
  Regra,
  TipoGerador,
} from '../domain/types.js'
import type { BancoFinanceiro } from './db.js'
import {
  validarAncora,
  validarCartao,
  validarOcorrencia,
  validarParcelamento,
  validarRegra,
} from './invariants.js'

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

export function criarRegraRepository(db: BancoFinanceiro) {
  return {
    listar: (): Promise<Regra[]> => db.regras.toArray(),

    obter: async (id: string): Promise<Regra | null> =>
      (await db.regras.get(id)) ?? null,

    salvar: async (r: Regra): Promise<void> => {
      validarRegra(r)
      await db.regras.put(r)
    },

    /** RN-46: a remocao NAO cascateia. Ocorrencias materializadas permanecem. */
    remover: async (id: string): Promise<void> => {
      await db.regras.delete(id)
    },
  }
}

// ---------------------------------------------------------------------------
// Parcelamentos
// ---------------------------------------------------------------------------

export function criarParcelamentoRepository(db: BancoFinanceiro) {
  return {
    listar: (): Promise<Parcelamento[]> => db.parcelamentos.toArray(),

    obter: async (id: string): Promise<Parcelamento | null> =>
      (await db.parcelamentos.get(id)) ?? null,

    /** RN-44: integridade referencial verificada na escrita. */
    salvar: async (p: Parcelamento): Promise<void> => {
      validarParcelamento(p)

      if (p.cartaoId !== null) {
        const cartao = await db.cartoes.get(p.cartaoId)
        if (cartao === undefined) {
          throw new ErroDeDominio('COMPETENCIA_INVALIDA', 'repositorio')
        }
      }

      await db.parcelamentos.put(p)
    },

    remover: async (id: string): Promise<void> => {
      await db.parcelamentos.delete(id)
    },

    porCartao: (cartaoId: string): Promise<Parcelamento[]> =>
      db.parcelamentos.where('cartaoId').equals(cartaoId).toArray(),
  }
}

// ---------------------------------------------------------------------------
// Cartoes
// ---------------------------------------------------------------------------

export function criarCartaoRepository(db: BancoFinanceiro) {
  return {
    listar: (): Promise<Cartao[]> => db.cartoes.toArray(),

    obter: async (id: string): Promise<Cartao | null> =>
      (await db.cartoes.get(id)) ?? null,

    salvar: async (c: Cartao): Promise<void> => {
      validarCartao(c)
      await db.cartoes.put(c)
    },

    remover: async (id: string): Promise<void> => {
      await db.cartoes.delete(id)
    },
  }
}

// ---------------------------------------------------------------------------
// Ocorrencias
// ---------------------------------------------------------------------------

export function criarOcorrenciaRepository(db: BancoFinanceiro) {
  return {
    listar: (): Promise<Ocorrencia[]> => db.ocorrencias.toArray(),

    obter: async (id: string): Promise<Ocorrencia | null> =>
      (await db.ocorrencias.get(id)) ?? null,

    salvar: async (o: Ocorrencia): Promise<void> => {
      validarOcorrencia(o)
      await db.ocorrencias.put(o)
    },

    remover: async (id: string): Promise<void> => {
      await db.ocorrencias.delete(id)
    },

    /**
     * Consulta principal da projecao. O intervalo e sempre maior que a
     * competencia pedida (RN-61), para alcancar atrasados de meses anteriores.
     */
    listarPorIntervalo: (de: Competencia, ate: Competencia): Promise<Ocorrencia[]> =>
      db.ocorrencias.where('competencia').between(de, ate, true, true).toArray(),

    /**
     * Busca pela chave de sobreposicao. Base da idempotencia do pagamento
     * (RN-51): registrar duas vezes atualiza o mesmo registro.
     */
    obterPorChave: async (
      geradorTipo: TipoGerador,
      geradorId: string,
      competencia: Competencia,
    ): Promise<Ocorrencia | null> => {
      const encontrada = await db.ocorrencias
        .where('[geradorTipo+geradorId+competencia]')
        .equals([geradorTipo, geradorId, competencia])
        .first()
      return encontrada ?? null
    },

    /** Historico de um gerador. Insumo da media de estimativa (DOM-12). */
    porGerador: (geradorTipo: TipoGerador, geradorId: string): Promise<Ocorrencia[]> =>
      db.ocorrencias
        .where('[geradorTipo+geradorId]')
        .equals([geradorTipo, geradorId])
        .toArray(),
  }
}

// ---------------------------------------------------------------------------
// Ancoras
// ---------------------------------------------------------------------------

export function criarAncoraRepository(db: BancoFinanceiro) {
  return {
    listar: (): Promise<AncoraSaldo[]> => db.ancoras.toArray(),

    /** RN-48: ancoras acumulam, nao substituem. */
    salvar: async (a: AncoraSaldo, hoje: DataISO): Promise<void> => {
      validarAncora(a, hoje)
      await db.ancoras.put(a)
    },

    remover: async (id: string): Promise<void> => {
      await db.ancoras.delete(id)
    },

    /**
     * RN-49: a ancora vigente e a de maior data que nao ultrapassa a data
     * pedida. RN-50: havendo empate de data, a gravada por ultimo prevalece.
     */
    vigenteEm: async (data: DataISO): Promise<AncoraSaldo | null> => {
      const candidatas = await db.ancoras.where('data').belowOrEqual(data).toArray()
      if (candidatas.length === 0) return null

      let vigente = candidatas[0] as AncoraSaldo
      for (const a of candidatas) {
        if (comparar(a.data, vigente.data) >= 0) vigente = a
      }
      return vigente
    },
  }
}

// ---------------------------------------------------------------------------
// Configuracoes
// ---------------------------------------------------------------------------

const CHAVE_ULTIMA_EXPORTACAO = 'ultimaExportacao'

export function criarConfiguracaoRepository(db: BancoFinanceiro) {
  return {
    obter: async (chave: string): Promise<string | null> =>
      (await db.configuracoes.get(chave))?.valor ?? null,

    definir: async (chave: string, valor: string): Promise<void> => {
      await db.configuracoes.put({ chave, valor })
    },

    ultimaExportacao: async (): Promise<DataISO | null> =>
      (await db.configuracoes.get(CHAVE_ULTIMA_EXPORTACAO))?.valor ?? null,

    registrarExportacao: async (data: DataISO): Promise<void> => {
      await db.configuracoes.put({ chave: CHAVE_ULTIMA_EXPORTACAO, valor: data })
    },
  }
}

// ---------------------------------------------------------------------------
// Agregado
// ---------------------------------------------------------------------------

export interface Repositorios {
  readonly regras: ReturnType<typeof criarRegraRepository>
  readonly parcelamentos: ReturnType<typeof criarParcelamentoRepository>
  readonly cartoes: ReturnType<typeof criarCartaoRepository>
  readonly ocorrencias: ReturnType<typeof criarOcorrenciaRepository>
  readonly ancoras: ReturnType<typeof criarAncoraRepository>
  readonly configuracoes: ReturnType<typeof criarConfiguracaoRepository>
}

export function criarRepositorios(db: BancoFinanceiro): Repositorios {
  return {
    regras: criarRegraRepository(db),
    parcelamentos: criarParcelamentoRepository(db),
    cartoes: criarCartaoRepository(db),
    ocorrencias: criarOcorrenciaRepository(db),
    ancoras: criarAncoraRepository(db),
    configuracoes: criarConfiguracaoRepository(db),
  }
}
