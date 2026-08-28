import { describe, expect, it, vi } from 'vitest'
import type { DocumentoBackup } from '../src/data/backup-serializer.js'
import type { AppEmMemoria } from './app-em-memoria.js'
import { criarAcessoAoApp } from './cache-do-app.js'
import { ORCAMENTO_SIMPLES } from './fixtures/orcamento-simples.js'

// Duas referencias distintas do mesmo formato de documento: o modulo compara
// por IDENTIDADE (===), nunca por conteudo -- e a mesma escolha que
// `fonte-github.ts` faz para responder "mudou?" sem conhecer sha nenhum.
const DOC_A: DocumentoBackup = { ...ORCAMENTO_SIMPLES }
const DOC_B: DocumentoBackup = { ...ORCAMENTO_SIMPLES, regras: [] }

function fonteQueDevolve(doc: DocumentoBackup) {
  return {
    obter: () => Promise.resolve(doc),
    obterSemCache: () => Promise.resolve(doc),
  }
}

function appFake(): { app: AppEmMemoria; encerrar: ReturnType<typeof vi.fn> } {
  const encerrar = vi.fn().mockResolvedValue(undefined)
  const app = { encerrar } as unknown as AppEmMemoria
  return { app, encerrar }
}

describe('criarAcessoAoApp', () => {
  it('constroi o app uma vez e devolve a mesma instancia quando o documento nao muda', async () => {
    const { app } = appFake()
    const construir = vi.fn().mockResolvedValue(app)
    const obterApp = criarAcessoAoApp(fonteQueDevolve(DOC_A), construir)

    const a = await obterApp()
    const b = await obterApp()

    expect(a).toBe(app)
    expect(b).toBe(a)
    expect(construir).toHaveBeenCalledTimes(1)
  })

  it('encerra o app antigo antes de construir o novo quando o documento muda', async () => {
    const ordem: string[] = []
    const { app: appA, encerrar: encerrarA } = appFake()
    const { app: appB } = appFake()
    encerrarA.mockImplementation(async () => {
      ordem.push('encerrar-a')
    })

    const construir = vi.fn().mockImplementation(async (doc: DocumentoBackup) => {
      ordem.push(doc === DOC_A ? 'construir-a' : 'construir-b')
      return doc === DOC_A ? appA : appB
    })

    let docAtual = DOC_A
    const obterApp = criarAcessoAoApp(
      { obter: () => Promise.resolve(docAtual), obterSemCache: () => Promise.resolve(docAtual) },
      construir,
    )

    const a = await obterApp()
    docAtual = DOC_B
    const b = await obterApp()

    expect(a).toBe(appA)
    expect(b).toBe(appB)
    // O antigo e encerrado DEPOIS que o novo comeca a ser construido? Nao --
    // antes: a ordem prova que encerrar-a acontece entre os dois construir.
    expect(ordem).toEqual(['construir-a', 'encerrar-a', 'construir-b'])
  })

  it('duas chamadas concorrentes constroem o app exatamente uma vez', async () => {
    const { app } = appFake()
    let resolverConstrucao: ((app: AppEmMemoria) => void) | undefined
    const construir = vi.fn().mockImplementation(
      () =>
        new Promise<AppEmMemoria>((resolve) => {
          resolverConstrucao = resolve
        }),
    )
    const obterApp = criarAcessoAoApp(fonteQueDevolve(DOC_A), construir)

    const p1 = obterApp()
    const p2 = obterApp()

    // Da tempo das duas chamadas alcancarem o ponto de decisao enquanto a
    // construcao ainda esta pendente -- e essa sobreposicao que prova (ou
    // reprova) a memoizacao. Sem isto o teste passaria mesmo sem memoizar,
    // por sorte de ordenacao de microtask.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(construir).toHaveBeenCalledTimes(1)

    resolverConstrucao?.(app)

    const [a, b] = await Promise.all([p1, p2])
    expect(a).toBe(app)
    expect(b).toBe(app)
  })

  it('uma construcao que falha nao deixa o cache permanentemente quebrado', async () => {
    const { app } = appFake()
    const construir = vi
      .fn()
      .mockRejectedValueOnce(new Error('falha de construcao'))
      .mockResolvedValueOnce(app)
    const obterApp = criarAcessoAoApp(fonteQueDevolve(DOC_A), construir)

    await expect(obterApp()).rejects.toThrow('falha de construcao')

    const a = await obterApp()

    expect(a).toBe(app)
    expect(construir).toHaveBeenCalledTimes(2)
  })
})
