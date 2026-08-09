/**
 * DAT-07 — Credencial de sincronizacao.
 *
 * Guardada em `localStorage`, NAO na tabela `configuracoes`.
 *
 * A razao e concreta: a tabela de configuracoes entra no documento de backup,
 * e o documento de backup e exatamente o que sobe para o repositorio. O token
 * acabaria comitado no proprio repositorio que ele destranca, legivel por
 * qualquer um que ganhasse acesso -- inclusive num arquivo exportado e enviado
 * por e-mail.
 *
 * A separacao tambem descreve a verdade: a credencial pertence a este
 * aparelho, os dados pertencem a pessoa.
 */

const CHAVE = 'finance-control:sync'

export interface CredencialSync {
  /** No formato `dono/repositorio`. Precisa ser um repositorio PRIVADO. */
  readonly repositorio: string
  readonly token: string
  readonly caminho: string
  readonly ativo: boolean
}

export const CAMINHO_PADRAO = 'orcamento.json'

export function lerCredencial(): CredencialSync | null {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (bruto === null) return null

    const dados: unknown = JSON.parse(bruto)
    if (typeof dados !== 'object' || dados === null) return null

    const d = dados as Record<string, unknown>
    const repositorio = typeof d['repositorio'] === 'string' ? d['repositorio'] : ''
    const token = typeof d['token'] === 'string' ? d['token'] : ''

    if (repositorio === '' || token === '') return null

    return {
      repositorio,
      token,
      caminho: typeof d['caminho'] === 'string' && d['caminho'] !== ''
        ? d['caminho']
        : CAMINHO_PADRAO,
      ativo: d['ativo'] !== false,
    }
  } catch {
    // localStorage indisponivel (modo privado, storage cheio) nao pode
    // derrubar o app: sem credencial, a sincronizacao apenas nao acontece.
    return null
  }
}

export function gravarCredencial(c: CredencialSync): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(c))
  } catch {
    // Idem: falhar em gravar a credencial nao pode impedir o uso do app.
  }
}

export function apagarCredencial(): void {
  try {
    localStorage.removeItem(CHAVE)
    localStorage.removeItem(CHAVE_ULTIMO_SHA)
  } catch {
    // Idem.
  }
}

const CHAVE_ULTIMO_SHA = 'finance-control:sync-sha'

/**
 * Identificador da ultima versao que ESTE aparelho enviou.
 *
 * Serve para detectar que o arquivo remoto mudou por outro caminho. Sem isso,
 * dois aparelhos se sobrescreveriam em silencio, e o backup -- a unica copia
 * dos dados -- perderia o que o outro gravou.
 */
export function lerUltimoSha(): string | null {
  try {
    return localStorage.getItem(CHAVE_ULTIMO_SHA)
  } catch {
    return null
  }
}

export function gravarUltimoSha(sha: string): void {
  try {
    localStorage.setItem(CHAVE_ULTIMO_SHA, sha)
  } catch {
    // Idem.
  }
}
