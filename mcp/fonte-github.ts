/**
 * Leitura do backup no repositorio privado do GitHub.
 *
 * Este modulo nao possui funcao que escreva. A ausencia e a garantia: nao ha
 * caminho de codigo daqui que altere o backup, e portanto nada que o servidor
 * MCP faca pode danificar os dados reais.
 *
 * O cache e chaveado pelo SHA do arquivo remoto. A chamada de rede acontece
 * sempre -- e barata e resolve a pergunta "mudou?" -- mas a desserializacao e
 * a reconstrucao do banco sao evitadas quando o SHA se repete: o download do
 * envelope e a decodificacao do conteudo sao passos separados, e o SHA e
 * comparado entre um e outro.
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

  /** Baixa o envelope da API. Nao decodifica: o sha ainda vai ser comparado. */
  async function baixarEnvelope(): Promise<RespostaConteudo> {
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

    return (await resposta.json()) as RespostaConteudo
  }

  function decodificar(corpo: RespostaConteudo): DocumentoBackup {
    const texto = Buffer.from(corpo.content, 'base64').toString('utf-8')
    return JSON.parse(texto) as DocumentoBackup
  }

  return {
    async obter(): Promise<DocumentoBackup> {
      const corpo = await baixarEnvelope()

      // A comparacao vem ANTES do decode: e o decode que o cache existe para
      // evitar. Compara-lo depois faria o trabalho caro de qualquer forma e o
      // cache so trocaria a referencia devolvida.
      if (corpo.sha === shaEmCache && docEmCache !== null) return docEmCache

      const doc = decodificar(corpo)
      shaEmCache = corpo.sha
      docEmCache = doc
      return doc
    },

    async obterSemCache(): Promise<DocumentoBackup> {
      return decodificar(await baixarEnvelope())
    },
  }
}
