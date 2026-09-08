/**
 * Define ou corrige a categoria de algo que ja existe.
 *
 * Sem esta ferramenta, os lancamentos anteriores a este projeto ficariam sem
 * categoria para sempre -- e o relatorio por setor so ficaria util depois de
 * meses de lancamentos novos.
 *
 * O alcance de cada tipo NAO e o mesmo, e a diferenca importa:
 *
 * - `recorrente` e `parcelamento` mudam o MOLDE. Uma ocorrencia ja
 *   materializada congelou a categoria que tinha (RN-52, a mesma regra que
 *   congela nome e valor), entao os meses ja pagos continuam onde estavam e o
 *   efeito comeca no proximo pagamento;
 * - `avulso` muda a OCORRENCIA de id informado -- qualquer uma, tenha vindo de
 *   avulso, de regra ou de parcelamento. E por ai que se corrige um mes ja
 *   pago, um de cada vez, com o id que `exportar` mostra.
 *
 * Nao entra no `desfazer`: reverter e chamar de novo com a categoria anterior,
 * que o recibo mostra.
 */

import type { Categoria } from '../../../src/domain/types.js'
import type { AppPg } from '../../app-pg.js'
import type { ReciboDeAjuste } from '../../recibo.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'

export type TipoCategorizavel = 'recorrente' | 'parcelamento' | 'avulso'

export interface ArgsDefinirCategoria {
  readonly tipo: TipoCategorizavel
  readonly id: string
  readonly categoria: Categoria
  readonly hoje: string
}

/** Rotulo para o recibo: nulo vira texto, nao string vazia. */
function rotulo(c: Categoria | null): string {
  return c ?? 'sem categoria'
}

export async function definirCategoria(
  app: AppPg,
  args: ArgsDefinirCategoria,
): Promise<ReciboDeAjuste> {
  if (args.tipo === 'recorrente') {
    const regra = await app.repos.regras.obter(args.id)
    if (regra === null) {
      throw new ErroDeUsuario(
        `Nao encontrei nenhuma recorrencia com esse id. Confira em exportar ou no recibo do cadastro.`,
      )
    }

    await app.repos.regras.salvar({ ...regra, categoria: args.categoria })

    return {
      chave: args.id,
      nome: regra.nome,
      antes: rotulo(regra.categoria),
      depois: args.categoria,
      resumo: `"${regra.nome}" agora é ${args.categoria}.`,
      avisos: [
        'Vale a partir do próximo pagamento. Os meses já pagos continuam com a categoria que tinham, e não mudam de lugar no relatório.',
        'Para corrigir um mês já pago, chame definir_categoria de novo com tipo "avulso" e o id daquela conta (veja em exportar) — um mês por chamada.',
      ],
    }
  }

  if (args.tipo === 'parcelamento') {
    const p = await app.repos.parcelamentos.obter(args.id)
    if (p === null) {
      throw new ErroDeUsuario(
        `Nao encontrei nenhum parcelamento com esse id. Confira em exportar ou no recibo do cadastro.`,
      )
    }

    await app.repos.parcelamentos.salvar({ ...p, categoria: args.categoria })

    return {
      chave: args.id,
      nome: p.nome,
      antes: rotulo(p.categoria),
      depois: args.categoria,
      resumo: `"${p.nome}" agora é ${args.categoria}.`,
      avisos: [
        'Vale a partir da próxima parcela. As parcelas já pagas continuam com a categoria que tinham, e não mudam de lugar no relatório.',
        'Para corrigir uma parcela já paga, chame definir_categoria de novo com tipo "avulso" e o id daquela parcela (veja em exportar) — uma parcela por chamada.',
      ],
    }
  }

  // `avulso` alcanca QUALQUER ocorrencia pelo id, nao so as lancadas avulsas:
  // e o unico caminho para recategorizar um mes ja pago, que congelou a
  // categoria que tinha. A mensagem nao pode dizer "lancamento avulso" sob
  // pena de esconder justamente esse uso.
  const o = await app.repos.ocorrencias.obter(args.id)
  if (o === null) {
    throw new ErroDeUsuario(
      `Nao encontrei nenhuma conta com esse id. Vale para qualquer conta de um mes -- avulsa, de recorrencia ou de parcelamento. Confira em exportar ou no recibo do lancamento.`,
    )
  }

  await app.repos.ocorrencias.salvar({ ...o, categoria: args.categoria })

  return {
    chave: args.id,
    nome: o.nome,
    antes: rotulo(o.categoria),
    depois: args.categoria,
    resumo: `"${o.nome}" agora é ${args.categoria}.`,
    avisos: [],
  }
}
