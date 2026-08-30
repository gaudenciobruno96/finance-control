/**
 * Conexao com o Postgres.
 *
 * O pool vive em escopo de modulo, nao por requisicao: `criarServidorMcp()`
 * roda a cada chamada, e um pool criado la abriria uma conexao por consulta.
 */

import pg, { type Pool } from 'pg'

const NOME_DA_VARIAVEL = 'DATABASE_URL'

/**
 * BIGINT volta como string no driver por padrao, para nao perder precisao
 * acima de 2^53. Centavos nunca chegam perto disso, e string quebraria a
 * aritmetica do dominio em silencio: '100' + 1 da '1001'.
 *
 * O parser 20 e o do BIGINT (int8).
 */
pg.types.setTypeParser(20, (valor: string) => Number.parseInt(valor, 10))

export function lerUrlDoBanco(env: Record<string, string | undefined>): string {
  const valor = env[NOME_DA_VARIAVEL]

  if (valor === undefined || valor.trim() === '') {
    throw new Error(
      `${NOME_DA_VARIAVEL} nao esta definida. O servidor nao sobe sem banco.`,
    )
  }

  return valor.trim()
}

export function criarPool(url: string): Pool {
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    // Sem timeout, um pool esgotado faz toda chamada de ferramenta pendurar
    // sem erro, em vez de falhar.
    connectionTimeoutMillis: 10_000,
  })

  // `pg-pool` emite 'error' no proprio Pool quando uma conexao OCIOSA quebra
  // (restart do Postgres, queda do proxy, TCP idle drop). Sem ouvinte aqui,
  // Node trata como excecao nao tratada e DERRUBA O PROCESSO -- com
  // `restartPolicyMaxRetries: 3` no railway.json, tres desses eventos ao
  // longo da vida do servico deixam ele fora do ar ate alguem fazer deploy a
  // mao. E tambem o unico lugar onde um erro cru do `pg` alcancaria o log: o
  // handler padrao do Node imprimiria o erro inteiro, que e exatamente o que
  // `descreverErro` existe para impedir em todo o resto do codigo.
  pool.on('error', (e) => {
    console.error('erro em conexao ociosa do banco: %s', descreverErro(e))
  })

  return pool
}

/**
 * Descricao segura de um erro do banco.
 *
 * A mensagem crua do `pg` pode conter a string de conexao inteira, senha
 * inclusa. O que se registra e a classe e o codigo do Postgres -- suficiente
 * para diagnosticar, insuficiente para vazar.
 */
export function descreverErro(e: unknown): string {
  if (!(e instanceof Error)) return 'erro nao-Error'

  const codigo = (e as { code?: unknown }).code
  const sufixo = typeof codigo === 'string' ? ` code=${codigo}` : ''

  return `${e.name}${sufixo}`
}
