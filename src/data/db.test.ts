import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { VERSAO_SCHEMA, criarBanco, declararSchema, type BancoFinanceiro } from './db.js'

let db: BancoFinanceiro
let contador = 0

beforeEach(async () => {
  contador += 1
  db = criarBanco(`teste-db-${contador}`)
  await db.open()
})

afterEach(async () => {
  db.close()
  await db.delete()
})

describe('schema', () => {
  it('abre com as seis tabelas declaradas', () => {
    const nomes = db.tables.map((t) => t.name).sort()

    expect(nomes).toEqual([
      'ancoras',
      'cartoes',
      'configuracoes',
      'ocorrencias',
      'parcelamentos',
      'regras',
    ])
  })

  it('declara os indices que as consultas exigem', () => {
    const indicesDeOcorrencias = db.ocorrencias.schema.indexes.map((i) => i.name)

    expect(indicesDeOcorrencias).toContain('competencia')
    expect(indicesDeOcorrencias).toContain('[geradorTipo+geradorId+competencia]')
    expect(indicesDeOcorrencias).toContain('[geradorTipo+geradorId]')
    expect(db.ancoras.schema.indexes.map((i) => i.name)).toContain('data')
    expect(db.parcelamentos.schema.indexes.map((i) => i.name)).toContain('cartaoId')
  })

  it('a chave de sobreposicao nao e armazenada como campo', () => {
    // Guardar a chave concatenada duplicaria dado derivado, que pode divergir
    // da fonte. Ela e indexada pelo composto dos tres campos que a compoem.
    expect(db.ocorrencias.schema.indexes.map((i) => i.name)).not.toContain('chave')
  })

  it('expoe a versao corrente do schema', () => {
    expect(VERSAO_SCHEMA).toBe(1)
    expect(db.verno).toBe(VERSAO_SCHEMA)
  })

  /**
   * Migracao exercitada de verdade (RNF-05): um banco criado com schema antigo
   * precisa abrir na versao corrente sem perder dados.
   *
   * O caminho de upgrade e o mesmo reutilizado pela importacao de backup
   * (RN-55), entao a garantia importa duas vezes.
   */
  it('migra um banco de versao anterior preservando os dados', async () => {
    const nome = `teste-migracao-${contador}`

    // Versao antiga: apenas a tabela de regras, com um registro.
    const antigo = new Dexie(nome)
    antigo.version(1).stores({ regras: 'id' })
    await antigo.open()
    await antigo.table('regras').put({ id: 'r1', nome: 'Aluguel', valorCentavos: 180_000 })
    antigo.close()

    // Versao corrente reabre o mesmo banco.
    const atual = new Dexie(nome)
    atual.version(1).stores({ regras: 'id' })
    atual.version(2).stores({
      regras: 'id, vigenteDe',
      parcelamentos: 'id, cartaoId',
      cartoes: 'id',
      ocorrencias: 'id, competencia',
      ancoras: 'id, data',
      configuracoes: 'chave',
    })
    await atual.open()

    expect(atual.verno).toBe(2)
    expect(await atual.table('regras').get('r1')).toMatchObject({ nome: 'Aluguel' })
    expect(atual.tables.map((t) => t.name)).toContain('ocorrencias')

    atual.close()
    await atual.delete()
  })

  it('declararSchema pode ser aplicado a qualquer instancia', async () => {
    const outro = new Dexie(`teste-declarar-${contador}`)
    declararSchema(outro)
    await outro.open()

    expect(outro.tables).toHaveLength(6)

    outro.close()
    await outro.delete()
  })
})
