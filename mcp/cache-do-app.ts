/**
 * App em memoria reusado enquanto o backup nao mudar.
 *
 * Reconstruir o banco Dexie a cada chamada e o custo real de uma consulta --
 * bem maior que o download ou a desserializacao. `fonte.obter()` devolve a
 * MESMA referencia de documento enquanto o sha remoto se repete, entao
 * comparar por identidade responde "mudou?" sem que este modulo precise
 * conhecer sha algum.
 *
 * O app anterior e encerrado ao ser trocado, nunca abandonado: o
 * fake-indexeddb guarda bancos nao deletados pelo resto do processo.
 *
 * POR QUE A PROMESSA EM CONSTRUCAO E MEMOIZADA, NAO SO O VALOR PRONTO
 *
 * O SDK do MCP despacha chamadas sem esperar a anterior terminar, e um bloco
 * de ferramentas do Claude Code rotineiramente pede varias de uma vez (ex.:
 * `situacao_do_mes` + `o_que_vence` no mesmo turno). Se duas chamadas
 * concorrentes chegassem aqui antes da primeira construcao terminar e cada
 * uma comecasse seu proprio `criarAppDoBackup`, a atribuicao da perdedora
 * sobrescreveria a da vencedora -- e o banco da perdedora nunca seria
 * `delete()`-ado, vazando pelo resto do processo.
 *
 * A defesa e guardar a PROMESSA pendente, nao o resultado: uma segunda
 * chamada que chega no meio de uma construcao recebe a mesma promessa em vez
 * de iniciar a sua. Uma construcao que rejeita limpa a promessa memoizada
 * no `finally`, entao a proxima chamada tenta de novo em vez de ficar presa
 * numa rejeicao permanente.
 */

import type { DocumentoBackup } from '../src/data/backup-serializer.js'
import { criarAppDoBackup, type AppEmMemoria } from './app-em-memoria.js'
import type { FonteBackup } from './fonte-github.js'

export function criarAcessoAoApp(
  fonte: FonteBackup,
  construir: (doc: DocumentoBackup) => Promise<AppEmMemoria> = criarAppDoBackup,
): () => Promise<AppEmMemoria> {
  let docDoApp: DocumentoBackup | null = null
  let appEmCache: AppEmMemoria | null = null
  // Promessa da construcao em andamento, se houver. Memoizar ISTO -- e nao
  // so `appEmCache` -- e o que impede duas chamadas concorrentes de
  // construirem dois apps para o mesmo documento novo.
  let construcaoEmAndamento: Promise<AppEmMemoria> | null = null

  return async () => {
    const doc = await fonte.obter()

    if (doc === docDoApp && appEmCache !== null) return appEmCache

    // Uma construcao ja esta em voo para (presumivelmente) este mesmo
    // documento -- entra na fila dela em vez de comecar outra.
    if (construcaoEmAndamento !== null) return construcaoEmAndamento

    const promessa = (async () => {
      try {
        if (appEmCache !== null) {
          await appEmCache.encerrar()
          // Nulo mesmo se a construcao seguinte falhar: o app antigo ja foi
          // encerrado, entao nao pode continuar sendo devolvido como cache
          // valido.
          appEmCache = null
        }

        const app = await construir(doc)
        appEmCache = app
        docDoApp = doc
        return app
      } finally {
        construcaoEmAndamento = null
      }
    })()

    construcaoEmAndamento = promessa
    return promessa
  }
}
