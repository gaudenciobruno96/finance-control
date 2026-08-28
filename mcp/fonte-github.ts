/**
 * Leitura do backup no repositorio privado do GitHub.
 *
 * Este modulo nao possui funcao que escreva. A ausencia e a garantia: nao ha
 * caminho de codigo daqui que altere o backup, e portanto nada que o servidor
 * MCP faca pode danificar os dados reais.
 *
 * O cache e chaveado pelo SHA do arquivo remoto. A chamada de rede acontece
 * sempre -- e barata e resolve a pergunta "mudou?" -- mas a desserializacao e
 * a reconstrucao do banco sao evitadas quando o SHA se repete.
 */

import type { DocumentoBackup } from '../src/data/backup-serializer.js'
import type { Configuracao } from './configuracao.js'

const RAIZ = 'https://api.github.com'

interface RespostaConteudo {
  readonly content: string
  readonly sha: string
}

/**
 * Codifica segmento a segmento.
 *
 * `encodeURIComponent` sobre o caminho inteiro escaparia as barras e
 * transformaria `pasta/arquivo.json` num nome unico. Mesma escolha de
 * `src/services/sync-service.ts`.
 */
function url(cfg: Configuracao): string {
  const caminho = cfg.caminho.split('/').map(encodeURIComponent).join('/')
  return `${RAIZ}/repos/${cfg.repositorio}/contents/${caminho}`
}

export interface FonteBackup {
  readonly obter: () => Promise<DocumentoBackup>
  readonly obterSemCache: () => Promise<DocumentoBackup>
}

export function criarFonteGitHub(
  cfg: Configuracao,
  buscar: typeof fetch = fetch,
): FonteBackup {
  let shaEmCache: string | null = null
  let docEmCache: DocumentoBackup | null = null

  async function baixar(): Promise<{ doc: DocumentoBackup; sha: string }> {
    const resposta = await buscar(url(cfg), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!resposta.ok) {
      // Sem token, sem repositorio, sem caminho: o codigo HTTP basta para
      // diagnosticar, e qualquer um dos tres na mensagem seria vazamento.
      throw new Error(
        `Nao foi possivel ler o backup: o GitHub respondeu ${resposta.status}. ` +
          'Verifique o token, o repositorio e o caminho configurados.',
      )
    }

    const corpo = (await resposta.json()) as RespostaConteudo
    const texto = Buffer.from(corpo.content, 'base64').toString('utf-8')

    return { doc: JSON.parse(texto) as DocumentoBackup, sha: corpo.sha }
  }

  return {
    async obter(): Promise<DocumentoBackup> {
      const { doc, sha } = await baixar()

      if (sha === shaEmCache && docEmCache !== null) return docEmCache

      shaEmCache = sha
      docEmCache = doc
      return doc
    },

    async obterSemCache(): Promise<DocumentoBackup> {
      const { doc } = await baixar()
      return doc
    },
  }
}
