import { describe, expect, it, vi } from 'vitest'
import { lerConfiguracao } from './configuracao.js'
import { criarFonteGitHub } from './fonte-github.js'
import { ORCAMENTO_SIMPLES } from './fixtures/orcamento-simples.js'

const CFG = {
  token: 'tok',
  repositorio: 'eu/backup',
  caminho: 'financas/backup.json',
}

/** Resposta da API de conteudos do GitHub: base64 de UTF-8, mais o sha. */
function respostaGitHub(doc: unknown, sha: string): Response {
  const conteudo = Buffer.from(JSON.stringify(doc), 'utf-8').toString('base64')
  return new Response(JSON.stringify({ content: conteudo, sha, encoding: 'base64' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('lerConfiguracao', () => {
  it('le as tres variaveis', () => {
    expect(
      lerConfiguracao({
        FINANCE_GITHUB_TOKEN: 'tok',
        FINANCE_GITHUB_REPO: 'eu/backup',
        FINANCE_BACKUP_PATH: 'financas/backup.json',
      }),
    ).toEqual(CFG)
  })

  it('nomeia a variavel que falta', () => {
    expect(() =>
      lerConfiguracao({ FINANCE_GITHUB_REPO: 'eu/backup' }),
    ).toThrow(/FINANCE_GITHUB_TOKEN/)
  })

  it('nao repete o token na mensagem de erro', () => {
    try {
      lerConfiguracao({ FINANCE_GITHUB_TOKEN: 'segredo-real' })
      expect.unreachable('deveria ter lancado')
    } catch (e) {
      expect(String(e)).not.toContain('segredo-real')
    }
  })
})

describe('criarFonteGitHub', () => {
  it('baixa e desserializa o documento', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaGitHub(ORCAMENTO_SIMPLES, 'sha1'))
    const fonte = criarFonteGitHub(CFG, buscar as unknown as typeof fetch)

    const doc = await fonte.obter()

    expect(doc.regras).toHaveLength(3)
    expect(buscar).toHaveBeenCalledOnce()
  })

  it('codifica cada segmento do caminho sem escapar as barras', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaGitHub(ORCAMENTO_SIMPLES, 'sha1'))
    const fonte = criarFonteGitHub(
      { ...CFG, caminho: 'minhas financas/backup.json' },
      buscar as unknown as typeof fetch,
    )

    await fonte.obter()

    const url = String(buscar.mock.calls[0]?.[0])
    expect(url).toContain('/repos/eu/backup/contents/minhas%20financas/backup.json')
  })

  it('nunca usa metodo de escrita', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaGitHub(ORCAMENTO_SIMPLES, 'sha1'))
    const fonte = criarFonteGitHub(CFG, buscar as unknown as typeof fetch)

    await fonte.obter()

    const init = buscar.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.method ?? 'GET').toBe('GET')
  })

  it('reaproveita o documento quando o sha nao mudou', async () => {
    const buscar = vi.fn().mockImplementation(() => respostaGitHub(ORCAMENTO_SIMPLES, 'sha1'))
    const fonte = criarFonteGitHub(CFG, buscar as unknown as typeof fetch)

    const a = await fonte.obter()
    const b = await fonte.obter()

    expect(b).toBe(a)
    expect(buscar).toHaveBeenCalledTimes(2)
  })

  it('devolve documento novo quando o sha muda', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(respostaGitHub(ORCAMENTO_SIMPLES, 'sha1'))
      .mockResolvedValueOnce(
        respostaGitHub({ ...ORCAMENTO_SIMPLES, regras: [] }, 'sha2'),
      )
    const fonte = criarFonteGitHub(CFG, buscar as unknown as typeof fetch)

    const a = await fonte.obter()
    const b = await fonte.obter()

    expect(a.regras).toHaveLength(3)
    expect(b.regras).toHaveLength(0)
  })

  it('ignora o cache em obterSemCache', async () => {
    const buscar = vi.fn().mockImplementation(() => respostaGitHub(ORCAMENTO_SIMPLES, 'sha1'))
    const fonte = criarFonteGitHub(CFG, buscar as unknown as typeof fetch)

    const a = await fonte.obter()
    const b = await fonte.obterSemCache()

    expect(b).not.toBe(a)
    expect(b.regras).toHaveLength(3)
  })

  it('explica o 404 sem citar o token', async () => {
    // Token distinto do CFG padrao: 'tok' e substring da propria palavra
    // "token" que aparece legitimamente na mensagem generica de orientacao,
    // o que faria /tok/ colidir mesmo sem vazamento real do segredo.
    const cfgComSegredo = { ...CFG, token: 'segredo-real-do-github' }
    const buscar = vi.fn().mockImplementation(() => new Response('', { status: 404 }))
    const fonte = criarFonteGitHub(cfgComSegredo, buscar as unknown as typeof fetch)

    await expect(fonte.obter()).rejects.toThrow(/404/)
    await expect(fonte.obter()).rejects.not.toThrow(/segredo-real-do-github/)
  })
})
