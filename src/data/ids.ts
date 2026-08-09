/**
 * Geracao de identificadores.
 *
 * `crypto.randomUUID()` esta disponivel no Safari do iOS 16 em contexto
 * seguro, e o app e servido por HTTPS (RNF-03).
 *
 * A escolha e motivada pela importacao de backup, que traz identificadores de
 * outra origem. Identificadores universalmente unicos eliminam qualquer
 * possibilidade de colisao.
 */

export function novoId(): string {
  return crypto.randomUUID()
}
