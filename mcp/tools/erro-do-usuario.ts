/**
 * Erro pensado para o assistente ler, nao para o log.
 *
 * As ferramentas MCP lancam mensagens de proposito -- "Nao entendi o valor",
 * "Nao encontrei essa chave" -- que sao o jeito do assistente saber o que
 * tentar diferente na proxima chamada (RN da UX conversacional: mostrar o
 * registro final em vez de pedir confirmacao antes, ver `mcp/recibo.ts`).
 * Essas mensagens precisam alcancar o cliente MCP verbatim.
 *
 * Um erro cru do `pg` (ou qualquer outra falha que ninguem previu) NAO deve
 * seguir o mesmo caminho: a mensagem pode conter a string de conexao inteira,
 * senha inclusa. Marcar so os erros pensados para o usuario com esta classe e
 * o que permite ao wrapper em `servidor-http.ts` (`executarFerramenta`)
 * decidir o que repassar sem repassar tudo -- um erro que nao e isto, nem
 * `ErroDeDominio` (de `src/data/invariants.ts`), passa por `descreverErro`
 * antes de chegar ao cliente.
 */
export class ErroDeUsuario extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeUsuario'
  }
}
