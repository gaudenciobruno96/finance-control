/**
 * Servidor MCP de consulta financeira.
 *
 * Somente leitura. Toda a matematica vem de src/domain/ e src/services/, sem
 * uma linha reimplementada -- um numero devolvido aqui e o mesmo que a tela do
 * app exibe, porque veio do mesmo projetor.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { criarAcessoAoApp } from './cache-do-app.js'
import { lerConfiguracao } from './configuracao.js'
import { criarFonteGitHub, type FonteBackup } from './fonte-github.js'
import { historicoDeGastos } from './tools/historico-de-gastos.js'
import { oQueVence } from './tools/o-que-vence.js'
import { situacaoDoMes } from './tools/situacao-do-mes.js'
import { simularCenario } from './tools/simular-cenario.js'

const COMPETENCIA = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Competencia no formato AAAA-MM')

const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD')

/**
 * Unico ponto do servidor que le o relogio.
 *
 * O dominio recebe a data corrente como parametro em todo lugar (RN-04), e
 * manter a leitura confinada aqui e o que permite testar as ferramentas em
 * qualquer data sem tocar no relogio da maquina.
 */
function hojeDoSistema(): string {
  const agora = new Date()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${mes}-${dia}`
}

function json(valor: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(valor, null, 2) }] }
}

/**
 * A configuracao e lida na primeira chamada, nao no boot.
 *
 * Um erro de boot se perde no log do cliente MCP e aparece so como "servidor
 * indisponivel", que leva ao diagnostico errado. Falhando na chamada, a
 * mensagem chega inteira ao usuario.
 */
function criarAcesso(): () => FonteBackup {
  let fonte: FonteBackup | null = null
  return () => {
    if (fonte === null) fonte = criarFonteGitHub(lerConfiguracao(process.env))
    return fonte
  }
}

const acesso = criarAcesso()

/**
 * App em memoria reusado enquanto o backup nao mudar.
 *
 * A logica de cache/memoizacao vive em `cache-do-app.ts`, nao aqui: este
 * modulo chama `server.connect(...)` no topo (linha final do arquivo), entao
 * nada daqui pode ser importado por um teste sem tambem conectar um
 * transporte de verdade.
 *
 * `{ obter: () => acesso().obter() }` preserva a leitura preguicosa da
 * configuracao (comentario de `criarAcesso` acima): `acesso()` so roda
 * quando `obterApp()` e chamado pela primeira vez, nunca no import deste
 * modulo.
 */
const obterApp = criarAcessoAoApp({
  obter: () => acesso().obter(),
  obterSemCache: () => acesso().obterSemCache(),
})

const server = new McpServer({
  name: 'financas',
  version: '1.0.0',
})

server.registerTool(
  'situacao_do_mes',
  {
    title: 'Situacao do mes',
    description:
      'Quanto sobra no mes, quanto ainda entra e sai, e em que dia o saldo ' +
      'chega ao minimo. Quando saldoRelativo for verdadeiro, NAO afirme um ' +
      'saldo absoluto: leia avisoSaldoRelativo. Valores vem em centavos ' +
      '(valorCentavos) e em texto ja formatado (valor) -- use o texto ao escrever.',
    inputSchema: {
      competencia: COMPETENCIA.optional().describe('Mes AAAA-MM. Padrao: mes corrente'),
      hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
    },
  },
  async ({ competencia, hoje }) => {
    const app = await obterApp()
    return json(
      await situacaoDoMes(app, {
        ...(competencia === undefined ? {} : { competencia }),
        hoje: hoje ?? hojeDoSistema(),
      }),
    )
  },
)

server.registerTool(
  'o_que_vence',
  {
    title: 'O que vence',
    description:
      'Contas a pagar e recebimentos a confirmar numa janela de dias a partir ' +
      'de hoje, mais tudo que ja esta atrasado. Atraso vale apenas para ' +
      'saidas: uma entrada nao confirmada aparece em aConfirmar, nunca como atrasada.',
    inputSchema: {
      dias: z.number().int().min(1).max(365).optional().describe('Janela em dias. Padrao: 7'),
      hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
    },
  },
  async ({ dias, hoje }) => {
    const app = await obterApp()
    return json(
      await oQueVence(app, {
        ...(dias === undefined ? {} : { dias }),
        hoje: hoje ?? hojeDoSistema(),
      }),
    )
  },
)

server.registerTool(
  'historico_de_gastos',
  {
    title: 'Historico de gastos',
    description:
      'Quanto foi efetivamente pago, agregado por nome, nos ultimos meses. ' +
      'Considera apenas saidas ja pagas -- entradas e previsoes ficam de fora. ' +
      'Use para comparar meses e identificar tendencia.',
    inputSchema: {
      meses: z.number().int().min(1).max(60).optional().describe('Janela em meses. Padrao: 6'),
      nome: z.string().optional().describe('Filtra por nome, sem diferenciar maiuscula'),
      hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
    },
  },
  async ({ meses, nome, hoje }) => {
    const app = await obterApp()
    return json(
      await historicoDeGastos(app, {
        ...(meses === undefined ? {} : { meses }),
        ...(nome === undefined ? {} : { nome }),
        hoje: hoje ?? hojeDoSistema(),
      }),
    )
  },
)

server.registerTool(
  'simular_cenario',
  {
    title: 'Simular cenario',
    description:
      'Projeta o efeito de gastos hipoteticos, comparando mes a mes com e sem ' +
      'eles. Nada e gravado: a simulacao roda num banco descartavel. Use para ' +
      'responder se cabe assumir uma despesa nova ou um parcelamento. Quando ' +
      'saldoRelativo for verdadeiro (no mes ou na resposta), NAO afirme um ' +
      'saldo absoluto: leia avisoSaldoRelativo.',
    inputSchema: {
      lancamentos: z
        .array(
          z.discriminatedUnion('tipo', [
            z.object({
              tipo: z.literal('regra'),
              regra: z.object({
                tipo: z.enum(['entrada', 'saida']),
                nome: z.string(),
                valorCentavos: z.number().int(),
                valorEhEstimativa: z.boolean(),
                diaDoMes: z.number().int().min(1).max(31),
                ajusteFimDeSemana: z.enum(['nenhum', 'antecipa', 'posterga']),
                vigenteDe: COMPETENCIA,
                vigenteAte: COMPETENCIA.nullable(),
                // Categorizar o hipotetico chega na Task 3.
                categoria: z.null().default(null),
              }),
            }),
            z.object({
              tipo: z.literal('parcelamento'),
              parcelamento: z.object({
                nome: z.string(),
                valorParcelaCentavos: z.number().int(),
                quantidadeParcelas: z.number().int().min(1),
                primeiroVencimento: DATA,
                // Categorizar o hipotetico chega na Task 3.
                categoria: z.null().default(null),
              }),
            }),
            z.object({
              tipo: z.literal('avulso'),
              ocorrencia: z.object({
                // Seis campos mecanicos de um lancamento HIPOTETICO: um
                // avulso simulado ja nasce nao pago e nao ignorado, e so
                // pode ter vindo de 'avulso' (nunca de uma regra ou
                // parcelamento que nao existe de verdade). Default poupa o
                // modelo de preencher seis valores com exatamente uma
                // resposta sensata cada.
                geradorTipo: z.literal('avulso').default('avulso'),
                geradorId: z.null().default(null),
                competencia: COMPETENCIA,
                tipo: z.enum(['entrada', 'saida']),
                nome: z.string(),
                valorPrevistoCentavos: z.number().int(),
                dataVencimento: DATA,
                dataPagamento: DATA.nullable().default(null),
                valorPagoCentavos: z.number().int().nullable().default(null),
                pagamentoRegistradoEm: z.null().default(null),
                ignorado: z.boolean().default(false),
                observacao: z.string().nullable(),
                // Categorizar o hipotetico chega na Task 3.
                categoria: z.null().default(null),
              }),
            }),
          ]),
        )
        .describe('Gastos hipoteticos. Valores SEMPRE em centavos inteiros'),
      ate: COMPETENCIA.describe('Ultima competencia a projetar. Maximo de 24 meses'),
      hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
    },
  },
  async ({ lancamentos, ate, hoje }) => {
    // obterSemCache: uma simulacao nunca deve rodar sobre documento antigo.
    const doc = await acesso().obterSemCache()
    return json(
      await simularCenario(doc, {
        lancamentos,
        ate,
        hoje: hoje ?? hojeDoSistema(),
      }),
    )
  },
)

await server.connect(new StdioServerTransport())
