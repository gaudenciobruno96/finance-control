/**
 * SVC-05 — Backup num repositorio privado do GitHub.
 *
 * Nao e sincronizacao de verdade: nao ha fusao, nao ha resolucao de conflito.
 * E um backup automatico com historico, que e o que faltava -- o iOS apaga o
 * armazenamento de sites abertos no Safari depois de dias sem visita, e o
 * backup manual so protege quem lembra de fazer.
 *
 * O que se ganha de brinde e o historico: cada envio e um commit, entao da
 * para voltar a qualquer estado anterior pelo proprio GitHub.
 *
 * SEGURANCA: o repositorio precisa ser PRIVADO, e o token deve ser
 * fine-grained, limitado a ele e apenas a permissao de conteudo. O app nao tem
 * como verificar nem uma coisa nem outra -- quem configura decide.
 */

import {
  gravarUltimoSha,
  lerUltimoSha,
  type CredencialSync,
} from '../data/sync-credentials.js'

export type ResultadoEnvio =
  | { readonly tipo: 'enviado'; readonly sha: string }
  | { readonly tipo: 'semMudanca' }
  | { readonly tipo: 'offline' }
  /**
   * O arquivo remoto mudou por fora deste aparelho. Enviar por cima apagaria
   * o que o outro gravou, entao o envio para e pede uma decisao.
   */
  | { readonly tipo: 'conflito'; readonly shaRemoto: string }
  | { readonly tipo: 'erro'; readonly mensagem: string }

interface ArquivoRemoto {
  readonly conteudo: string
  readonly sha: string
}

const RAIZ = 'https://api.github.com'

function cabecalhos(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function url(c: CredencialSync): string {
  // O caminho vai codificado por segmento: `encodeURIComponent` sozinho
  // escaparia as barras e transformaria `pasta/arquivo.json` num nome unico.
  const caminho = c.caminho.split('/').map(encodeURIComponent).join('/')
  return `${RAIZ}/repos/${c.repositorio}/contents/${caminho}`
}

/**
 * Base64 de texto UTF-8.
 *
 * `btoa` opera sobre unidades de 8 bits e quebra em qualquer acento. A
 * conversao passa pelo TextEncoder, em pedacos: espalhar um array de centenas
 * de milhares de bytes em `String.fromCharCode(...)` estoura a pilha.
 */
function paraBase64(texto: string): string {
  const bytes = new TextEncoder().encode(texto)
  const PEDACO = 0x8000
  let binario = ''

  for (let i = 0; i < bytes.length; i += PEDACO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + PEDACO))
  }

  return btoa(binario)
}

function deBase64(codificado: string): string {
  // A API devolve o conteudo quebrado em linhas.
  const binario = atob(codificado.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

async function mensagemDeErro(r: Response): Promise<string> {
  if (r.status === 401) return 'Token recusado. Gere outro e cole de novo.'
  if (r.status === 403) return 'Token sem permissão de escrita neste repositório.'
  if (r.status === 404) {
    return 'Repositório ou caminho não encontrado. Confira o nome e se o token alcança este repositório.'
  }

  try {
    const corpo: unknown = await r.json()
    const m = (corpo as { message?: unknown })?.message
    if (typeof m === 'string') return m
  } catch {
    // Corpo nao-JSON: cai na mensagem generica.
  }

  return `GitHub respondeu ${r.status}.`
}

async function buscar(c: CredencialSync): Promise<ArquivoRemoto | null> {
  const r = await fetch(url(c), { headers: cabecalhos(c.token) })

  // Arquivo ainda nao existe: e o primeiro envio, nao um erro.
  if (r.status === 404) return null
  if (!r.ok) throw new Error(await mensagemDeErro(r))

  const corpo = (await r.json()) as { content?: string; sha?: string }
  if (typeof corpo.sha !== 'string') throw new Error('Resposta do GitHub sem sha.')

  return {
    conteudo: typeof corpo.content === 'string' ? deBase64(corpo.content) : '',
    sha: corpo.sha,
  }
}

export function criarSyncService() {
  return {
    /** Confere credencial e repositorio antes de ligar a sincronizacao. */
    async testar(c: CredencialSync): Promise<{ ok: boolean; mensagem: string }> {
      try {
        const r = await fetch(`${RAIZ}/repos/${c.repositorio}`, {
          headers: cabecalhos(c.token),
        })

        if (!r.ok) return { ok: false, mensagem: await mensagemDeErro(r) }

        const repo = (await r.json()) as { private?: boolean }

        if (repo.private !== true) {
          return {
            ok: false,
            mensagem:
              'Este repositório é PÚBLICO. Seus dados financeiros ficariam visíveis para qualquer pessoa. Use um repositório privado.',
          }
        }

        return { ok: true, mensagem: 'Conectado.' }
      } catch {
        return { ok: false, mensagem: 'Não foi possível falar com o GitHub.' }
      }
    },

    async enviar(
      c: CredencialSync,
      conteudo: string,
      mensagemDoCommit: string,
    ): Promise<ResultadoEnvio> {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return { tipo: 'offline' }
      }

      try {
        const remoto = await buscar(c)

        if (remoto !== null) {
          if (remoto.conteudo === conteudo) {
            // Nada mudou de fato. Evita um commit por toque na tela.
            gravarUltimoSha(remoto.sha)
            return { tipo: 'semMudanca' }
          }

          const ultimo = lerUltimoSha()
          if (ultimo !== null && ultimo !== remoto.sha) {
            return { tipo: 'conflito', shaRemoto: remoto.sha }
          }
        }

        const r = await fetch(url(c), {
          method: 'PUT',
          headers: { ...cabecalhos(c.token), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: mensagemDoCommit,
            content: paraBase64(conteudo),
            ...(remoto !== null ? { sha: remoto.sha } : {}),
          }),
        })

        if (!r.ok) return { tipo: 'erro', mensagem: await mensagemDeErro(r) }

        const corpo = (await r.json()) as { content?: { sha?: string } }
        const sha = corpo.content?.sha ?? ''
        if (sha !== '') gravarUltimoSha(sha)

        return { tipo: 'enviado', sha }
      } catch (e) {
        return {
          tipo: 'erro',
          mensagem: e instanceof Error ? e.message : 'Falha ao enviar.',
        }
      }
    },

    /** Baixa o conteudo bruto. A validacao e a substituicao ficam com o backup. */
    async baixar(c: CredencialSync): Promise<string | null> {
      const remoto = await buscar(c)
      if (remoto === null) return null
      gravarUltimoSha(remoto.sha)
      return remoto.conteudo
    },

    /** Aceita a versao remota como base, liberando o proximo envio. */
    aceitarRemoto: (sha: string): void => gravarUltimoSha(sha),
  }
}

export type SyncService = ReturnType<typeof criarSyncService>
