/**
 * Autenticacao do servidor MCP remoto.
 *
 * Este e o unico cadeado da porta. O servidor fica numa URL publica com
 * financas pessoais atras dela, e o que separa uma coisa da outra e o header
 * conferido aqui.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

const PREFIXO = 'Bearer '
const NOME_DA_VARIAVEL = 'FINANCE_MCP_SEGREDO'

/**
 * Le o segredo do ambiente, ou lanca.
 *
 * A mensagem nomeia a variavel e nada mais: ela vai para o log do Railway, e
 * um segredo em log e um segredo vazado.
 */
export function lerSegredo(env: Record<string, string | undefined>): string {
  const valor = env[NOME_DA_VARIAVEL]

  if (valor === undefined || valor.trim() === '') {
    throw new Error(
      `${NOME_DA_VARIAVEL} nao esta definida. O servidor nao sobe sem ela: ` +
        'subir sem segredo publicaria um endpoint aberto na internet.',
    )
  }

  // Trimado: um segredo colado no Railway com espaco a mais nao pode virar um
  // 401 sem explicacao (por design, a resposta de auth nao diz nada sobre o
  // motivo da recusa).
  return valor.trim()
}

/**
 * Compara sem vazar informacao por tempo.
 *
 * `timingSafeEqual` exige buffers do mesmo tamanho e lanca quando diferem, e
 * comparar tamanhos antes vazaria o tamanho do segredo. Passar os dois por
 * SHA-256 resolve as duas coisas: o digest tem sempre 32 bytes, entao a
 * comparacao nunca lanca e nao revela nada sobre o comprimento.
 */
function iguais(a: string, b: string): boolean {
  const digest = (s: string): Buffer => createHash('sha256').update(s, 'utf8').digest()
  return timingSafeEqual(digest(a), digest(b))
}

export function conferir(cabecalho: string | undefined, segredo: string): boolean {
  if (cabecalho === undefined) return false

  // `startsWith` e comparacao de prefixo publico e conhecido -- nao ha segredo
  // nele, entao nao precisa ser em tempo constante.
  if (!cabecalho.startsWith(PREFIXO)) return false

  return iguais(cabecalho.slice(PREFIXO.length), segredo)
}

export function criarMiddlewareDeAuth(
  segredo: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    if (!conferir(req.header('authorization'), segredo)) {
      // Corpo vazio e sempre o mesmo status: nada distingue os motivos.
      res.status(401).end()
      return
    }

    next()
  }
}
