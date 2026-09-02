/**
 * Localiza uma conta pela chave de sobreposicao.
 *
 * A maior parte das contas NAO existe no banco: as geradas por regra sao
 * virtuais ate alguem interagir. Por isso as ferramentas de escrita recebem a
 * CHAVE, que a consulta devolve em cada item, e nao um identificador de linha.
 *
 * A competencia vem da PROPRIA chave, nao de `hoje`: projetar o mes corrente
 * acha o mes ERRADO sempre que a chave e de outro mes -- corrigir em setembro
 * uma conta de outubro, por exemplo.
 *
 * `ignorados` entra na busca porque reativar uma conta ignorada exige
 * encontra-la, e ela nao aparece em nenhuma das outras listas.
 */

import type { OcorrenciaResolvida } from '../../../src/domain/types.js'
import type { AppPg } from '../../app-pg.js'
import { competenciaDaChave } from '../competencia-da-chave.js'
import { ErroDeUsuario } from '../erro-do-usuario.js'

export async function localizarConta(
  app: AppPg,
  chave: string,
  hoje: string,
): Promise<OcorrenciaResolvida> {
  const competencia = competenciaDaChave(chave)
  const mes = await app.projecao.projetarMes(competencia, hoje)

  const alvo = [
    ...mes.faltaPagar,
    ...mes.aindaEntra,
    ...mes.jaResolvido,
    ...mes.ignorados,
  ].find((o) => o.chave === chave)

  if (alvo === undefined) {
    throw new ErroDeUsuario(
      `Nao encontrei nenhuma ocorrencia com a chave informada em ${competencia}. ` +
        'Consulte a situacao do mes e use a chave que vier na resposta.',
    )
  }

  return alvo
}
