/**
 * Configuracao por variavel de ambiente.
 *
 * Segredo nunca em arquivo versionado: o token de leitura do backup e o unico
 * segredo do servidor, e ele entra pelo ambiente.
 */

export interface Configuracao {
  readonly token: string
  readonly repositorio: string
  readonly caminho: string
}

const NOMES = {
  token: 'FINANCE_GITHUB_TOKEN',
  repositorio: 'FINANCE_GITHUB_REPO',
  caminho: 'FINANCE_BACKUP_PATH',
} as const

/**
 * A mensagem nomeia a variavel ausente e nada mais.
 *
 * Nunca ecoa o valor de nenhuma delas: a mensagem vai para o log do cliente
 * MCP, e um token no log e um token vazado.
 */
export function lerConfiguracao(env: Record<string, string | undefined>): Configuracao {
  const faltando = (Object.keys(NOMES) as (keyof typeof NOMES)[])
    .filter((k) => {
      const v = env[NOMES[k]]
      return v === undefined || v.trim() === ''
    })
    .map((k) => NOMES[k])

  if (faltando.length > 0) {
    throw new Error(
      `Configuracao incompleta do MCP financeiro. Faltam: ${faltando.join(', ')}. ` +
        'Defina essas variaveis no registro do servidor MCP.',
    )
  }

  return {
    token: env[NOMES.token] as string,
    repositorio: env[NOMES.repositorio] as string,
    caminho: env[NOMES.caminho] as string,
  }
}
