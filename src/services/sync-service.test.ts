import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarSyncService } from './sync-service.js'
import type { CredencialSync } from '../data/sync-credentials.js'

const CRED: CredencialSync = {
  repositorio: 'alguem/orcamento-backup',
  token: 'token-de-teste',
  caminho: 'orcamento.json',
  ativo: true,
}

/** Base64 de UTF-8, como a API do GitHub devolve. */
function b64(texto: string): string {
  const bytes = new TextEncoder().encode(texto)
  return btoa(String.fromCharCode(...bytes))
}

function resposta(corpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as Response
}

/**
 * localStorage minimo.
 *
 * O modulo de credencial guarda ali o sha do ultimo envio. Trazer o jsdom so
 * por causa disso custaria dezenas de segundos ao arquivo inteiro de testes.
 */
function memoriaLocal(): Storage {
  const mapa = new Map<string, string>()
  return {
    getItem: (k) => mapa.get(k) ?? null,
    setItem: (k, v) => void mapa.set(k, String(v)),
    removeItem: (k) => void mapa.delete(k),
    clear: () => mapa.clear(),
    key: (i) => [...mapa.keys()][i] ?? null,
    get length() {
      return mapa.size
    },
  } as Storage
}

const sync = criarSyncService()

let fetchFalso: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchFalso = vi.fn()
  vi.stubGlobal('fetch', fetchFalso)
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('localStorage', memoriaLocal())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sync-service', () => {
  describe('conexão', () => {
    /**
     * A verificacao que mais importa. O repositorio que hospeda o app e
     * PUBLICO, e apontar o backup para ele -- ou para qualquer outro publico --
     * publicaria as financas de quem usa. Um erro de digitacao basta.
     */
    it('recusa repositório público', async () => {
      fetchFalso.mockResolvedValue(resposta({ private: false }))

      const r = await sync.testar(CRED)

      expect(r.ok).toBe(false)
      expect(r.mensagem).toContain('PÚBLICO')
    })

    it('aceita repositório privado', async () => {
      fetchFalso.mockResolvedValue(resposta({ private: true }))

      expect((await sync.testar(CRED)).ok).toBe(true)
    })

    it('explica um token recusado em vez de mostrar o código', async () => {
      fetchFalso.mockResolvedValue(resposta({}, 401))

      const r = await sync.testar(CRED)

      expect(r.ok).toBe(false)
      expect(r.mensagem).toContain('Token recusado')
    })
  })

  describe('envio', () => {
    it('cria o arquivo quando ele ainda não existe', async () => {
      fetchFalso
        .mockResolvedValueOnce(resposta({}, 404))
        .mockResolvedValueOnce(resposta({ content: { sha: 'sha-novo' } }))

      const r = await sync.enviar(CRED, '{"a":1}', 'primeiro')

      expect(r).toEqual({ tipo: 'enviado', sha: 'sha-novo' })

      // Sem `sha` no corpo: mandar um sha inexistente e erro na API.
      const corpo = JSON.parse(String(fetchFalso.mock.calls[1]?.[1]?.body))
      expect('sha' in corpo).toBe(false)
      expect(corpo.content).toBe(b64('{"a":1}'))
    })

    /**
     * Sem isto, abrir o app geraria um commit por dia sem nada ter mudado, e o
     * historico -- a melhor parte deste backup -- viraria ruido.
     */
    it('não commita quando o conteúdo é idêntico', async () => {
      fetchFalso.mockResolvedValue(
        resposta({ content: b64('{"a":1}'), sha: 'sha-atual' }),
      )

      expect(await sync.enviar(CRED, '{"a":1}', 'x')).toEqual({ tipo: 'semMudanca' })
      expect(fetchFalso).toHaveBeenCalledTimes(1)
    })

    it('preserva acentos na ida e na volta', async () => {
      const texto = '{"nome":"Salário de março — João"}'
      fetchFalso
        .mockResolvedValueOnce(resposta({}, 404))
        .mockResolvedValueOnce(resposta({ content: { sha: 's' } }))

      await sync.enviar(CRED, texto, 'x')

      const enviado = JSON.parse(String(fetchFalso.mock.calls[1]?.[1]?.body))

      fetchFalso.mockResolvedValue(resposta({ content: enviado.content, sha: 's' }))
      expect(await sync.baixar(CRED)).toBe(texto)
    })

    /**
     * Dois aparelhos escrevendo no mesmo arquivo se sobrescreveriam em
     * silencio -- e o backup e a UNICA copia dos dados.
     */
    it('para quando o arquivo remoto mudou desde o último envio', async () => {
      // Primeiro envio: grava o sha conhecido.
      fetchFalso
        .mockResolvedValueOnce(resposta({}, 404))
        .mockResolvedValueOnce(resposta({ content: { sha: 'sha-1' } }))
      await sync.enviar(CRED, '{"a":1}', 'x')

      // O remoto agora esta em outro sha: outro aparelho gravou.
      fetchFalso.mockReset()
      fetchFalso.mockResolvedValue(
        resposta({ content: b64('{"b":2}'), sha: 'sha-outro' }),
      )

      const r = await sync.enviar(CRED, '{"a":9}', 'x')

      expect(r).toEqual({ tipo: 'conflito', shaRemoto: 'sha-outro' })
      // Nenhum PUT: a busca e a unica chamada desta fase.
      expect(fetchFalso).toHaveBeenCalledTimes(1)
    })

    it('aceitar o remoto libera o próximo envio', async () => {
      fetchFalso
        .mockResolvedValueOnce(resposta({}, 404))
        .mockResolvedValueOnce(resposta({ content: { sha: 'sha-1' } }))
      await sync.enviar(CRED, '{"a":1}', 'x')

      sync.aceitarRemoto('sha-outro')

      fetchFalso.mockReset()
      fetchFalso
        .mockResolvedValueOnce(resposta({ content: b64('{"b":2}'), sha: 'sha-outro' }))
        .mockResolvedValueOnce(resposta({ content: { sha: 'sha-3' } }))

      expect(await sync.enviar(CRED, '{"a":9}', 'x')).toEqual({
        tipo: 'enviado',
        sha: 'sha-3',
      })
    })

    it('não tenta enviar sem rede', async () => {
      vi.stubGlobal('navigator', { onLine: false })

      expect(await sync.enviar(CRED, '{}', 'x')).toEqual({ tipo: 'offline' })
      expect(fetchFalso).not.toHaveBeenCalled()
    })

    it('devolve o erro sem lançar, para não derrubar a tela', async () => {
      fetchFalso.mockRejectedValue(new Error('rede caiu'))

      expect(await sync.enviar(CRED, '{}', 'x')).toEqual({
        tipo: 'erro',
        mensagem: 'rede caiu',
      })
    })
  })

  describe('download', () => {
    it('devolve nulo quando ainda não há backup', async () => {
      fetchFalso.mockResolvedValue(resposta({}, 404))

      expect(await sync.baixar(CRED)).toBeNull()
    })

    /** Uma barra escapada viraria um nome de arquivo esquisito, não uma pasta. */
    it('mantém as barras do caminho ao montar a URL', async () => {
      fetchFalso.mockResolvedValue(resposta({}, 404))

      await sync.baixar({ ...CRED, caminho: 'backups/orçamento.json' })

      expect(String(fetchFalso.mock.calls[0]?.[0])).toBe(
        'https://api.github.com/repos/alguem/orcamento-backup/contents/backups/or%C3%A7amento.json',
      )
    })
  })
})
