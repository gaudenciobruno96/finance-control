/**
 * Testes por propriedade do ciclo de backup (PROP-D01, PROP-D02, PROP-D06).
 *
 * PBT-02 exige teste de ida e volta para toda operacao com inversa. Backup e a
 * operacao mais critica do projeto neste aspecto: e a unica protecao do dado
 * que nao tem copia em lugar nenhum.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { criarHarness } from '../test-support/app-harness.js'
import { migrarDocumento, serializar } from './backup-serializer.js'
import { validar } from './backup-validator.js'
import { VERSAO_SCHEMA } from './db.js'
import {
  ancoraSaldo,
  parcelamentoAvulso,
  regra,
} from '../test-support/generators.js'

const HOJE = '2026-08-15'

/** Estado coerente para popular o banco. */
const estado = () =>
  fc.record({
    regras: fc.uniqueArray(regra(), { maxLength: 5, selector: (r) => r.id }),
    parcelamentos: fc.uniqueArray(parcelamentoAvulso(), {
      maxLength: 3,
      selector: (p) => p.id,
    }),
    ancoras: fc.uniqueArray(ancoraSaldo(), { maxLength: 3, selector: (a) => a.data }),
  })

describe('backup — propriedades', () => {
  /** PROP-D01 · Serializar e desserializar devolve estado igual ao original. */
  it('PROP-D01: o estado sobrevive ao ciclo de exportar e importar', async () => {
    await fc.assert(
      fc.asyncProperty(estado(), async (dados) => {
        const app = await criarHarness()
        try {
          for (const r of dados.regras) await app.repos.regras.salvar(r)
          for (const p of dados.parcelamentos) await app.repos.parcelamentos.salvar(p)
          for (const a of dados.ancoras) {
            if (a.data <= HOJE) await app.repos.ancoras.salvar(a, HOJE)
          }

          const conteudo = await app.backup.exportar(HOJE)
          const antes = await serializar(app.db, HOJE)

          await app.db.regras.clear()
          await app.db.parcelamentos.clear()
          await app.db.ancoras.clear()

          const resultado = app.backup.validarImportacao(conteudo)
          expect(resultado.valido).toBe(true)
          if (!resultado.valido) return
          await app.backup.confirmarImportacao(resultado.documento)

          const depois = await serializar(app.db, HOJE)

          expect(ordenar(depois.regras)).toEqual(ordenar(antes.regras))
          expect(ordenar(depois.parcelamentos)).toEqual(ordenar(antes.parcelamentos))
          expect(ordenar(depois.ancoras)).toEqual(ordenar(antes.ancoras))
        } finally {
          await app.encerrar()
        }
      }),
      { numRuns: 15 },
    )
  }, 120_000)

  /** PROP-D02 · Exportar, importar e exportar de novo produz documento igual. */
  it('PROP-D02: o ciclo e estavel na segunda passagem', async () => {
    await fc.assert(
      fc.asyncProperty(estado(), async (dados) => {
        const app = await criarHarness()
        try {
          for (const r of dados.regras) await app.repos.regras.salvar(r)

          const primeiro = await app.backup.exportar(HOJE)
          const r1 = app.backup.validarImportacao(primeiro)
          if (!r1.valido) return
          await app.backup.confirmarImportacao(r1.documento)

          const segundo = await app.backup.exportar(HOJE)
          const r2 = app.backup.validarImportacao(segundo)
          expect(r2.valido).toBe(true)
          if (!r2.valido) return

          expect(ordenar(r2.documento.regras)).toEqual(ordenar(r1.documento.regras))
        } finally {
          await app.encerrar()
        }
      }),
      { numRuns: 12 },
    )
  }, 120_000)

  /** PROP-D06 · Migrar duas vezes produz o mesmo resultado. */
  it('PROP-D06: a migracao de documento e idempotente', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: VERSAO_SCHEMA }), (versao) => {
        const doc = {
          versaoSchema: versao,
          exportadoEm: HOJE,
          regras: [],
          parcelamentos: [],
          cartoes: [],
          ocorrencias: [],
          ancoras: [],
          configuracoes: [],
        }

        const umaVez = migrarDocumento(doc)
        const duasVezes = migrarDocumento(umaVez)

        expect(duasVezes).toEqual(umaVez)
        expect(umaVez.versaoSchema).toBe(VERSAO_SCHEMA)
      }),
    )
  })

  /**
   * PROP-S06 aplicada a validacao: nenhum conteudo arbitrario e aceito como
   * backup valido.
   *
   * Entrada nao confiavel nunca deve atravessar a validacao por acidente
   * (SECURITY-13).
   */
  it('conteudo arbitrario nunca e aceito como backup', () => {
    fc.assert(
      fc.property(fc.anything(), (qualquerCoisa) => {
        const resultado = validar(qualquerCoisa)
        if (resultado.valido) {
          // Se por acaso a estrutura gerada for um backup valido, todas as
          // listas obrigatorias precisam existir de fato.
          expect(Array.isArray(resultado.documento.regras)).toBe(true)
          expect(Array.isArray(resultado.documento.ocorrencias)).toBe(true)
        } else {
          expect(typeof resultado.erro).toBe('string')
          expect(resultado.erro.length).toBeGreaterThan(0)
        }
      }),
    )
  })
})

function ordenar<T extends { id: string }>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
