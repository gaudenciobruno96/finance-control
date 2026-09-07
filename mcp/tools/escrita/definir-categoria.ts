/**
 * Define ou corrige a categoria de algo que ja existe.
 *
 * Sem esta ferramenta, os lancamentos anteriores a este projeto ficariam sem
 * categoria para sempre -- e o relatorio por setor nasceria vazio, so ficando
 * util depois de meses de lancamentos novos.
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
        'Vale para os próximos meses. As contas já materializadas guardam a categoria que tinham quando aconteceram.',
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
        'Vale para as próximas parcelas. As já materializadas guardam a categoria que tinham.',
      ],
    }
  }

  const o = await app.repos.ocorrencias.obter(args.id)
  if (o === null) {
    throw new ErroDeUsuario(
      `Nao encontrei nenhum lancamento avulso com esse id. Confira em exportar ou no recibo do lancamento.`,
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
