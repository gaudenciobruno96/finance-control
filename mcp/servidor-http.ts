/**
 * Servidor MCP remoto, exposto por Streamable HTTP.
 *
 * Diferente de `mcp/server.ts`, que fala stdio com um cliente local, este vive
 * numa URL publica e e alcancado pela infraestrutura da Anthropic quando o
 * usuario pergunta algo pelo celular. E por isso que funciona com o computador
 * do usuario desligado, e e por isso que a autenticacao aqui nao e opcional.
 *
 * As dezesseis ferramentas financeiras (mais `ping`) vivem sobre Postgres (`mcp/dados/`,
 * `mcp/app-pg.ts`), montado uma unica vez em `iniciar()` -- nao dentro de
 * `criarServidorMcp()`, que roda por requisicao.
 */

import { readFileSync } from 'node:fs'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Express, NextFunction, Request, Response } from 'express'
import { z } from 'zod'

import { criarMiddlewareDeAuth, lerSegredo } from './auth.js'
import { criarPool, descreverErro, lerUrlDoBanco } from './dados/conexao.js'
import { aplicarMigracoes } from './dados/migracoes.js'
import { criarAppPg, type AppPg } from './app-pg.js'
import { situacaoDoMes } from './tools/situacao-do-mes.js'
import { oQueVence } from './tools/o-que-vence.js'
import { historicoDeGastos } from './tools/historico-de-gastos.js'
import { simularCenario } from './tools/simular-cenario.js'
import { cadastrarRecorrente } from './tools/escrita/cadastrar-recorrente.js'
import { lancarAvulso } from './tools/escrita/lancar-avulso.js'
import { marcarPago } from './tools/escrita/marcar-pago.js'
import { ajustarConta } from './tools/escrita/ajustar-conta.js'
import { ignorarConta } from './tools/escrita/ignorar-conta.js'
import { registrarParte } from './tools/escrita/registrar-parte.js'
import { declararSaldo } from './tools/escrita/declarar-saldo.js'
import { declararSaldoEstrangeiro } from './tools/escrita/declarar-saldo-estrangeiro.js'
import { cadastrarParcelamento } from './tools/escrita/cadastrar-parcelamento.js'
import { patrimonio } from './tools/patrimonio.js'
import { desfazer } from './tools/desfazer.js'
import { exportar } from './tools/exportar.js'
import { ErroDeUsuario } from './tools/erro-do-usuario.js'
import { ehErroDeDominio } from '../src/domain/errors.js'

const COMPETENCIA = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Competencia no formato AAAA-MM')

const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD')

/**
 * Fuso de quem usa o app -- NAO o fuso do container.
 *
 * O Railway roda o processo em UTC; o dono dos dados vive em BRT. Mudar esta
 * constante muda em que dia uma escrita sem data explicita e gravada.
 */
const FUSO_DO_USUARIO = 'America/Sao_Paulo'

/**
 * A data corrente, no fuso de quem usa o app, a partir de um instante dado.
 *
 * Exportada separada de `hojeDoSistema` para ser testavel sem tocar no
 * relogio global: o instante entra como parametro, como o resto do dominio
 * exige (RN-04).
 *
 * `getDate()` e `getMonth()` leem o fuso do PROCESSO, e o container roda em
 * UTC enquanto o usuario vive em BRT -- entre 21h e meia-noite (horario de
 * Brasilia) a data sairia um dia adiantada, e no virar do mes a competencia
 * inteira sairia errada. E o mesmo deslocamento que o projeto recusa colunas
 * DATE para evitar (ver `mcp/dados/migracoes.ts`), soh que entrando pelo unico
 * lugar que ainda le o relogio.
 *
 * 'en-CA' emite AAAA-MM-DD, que e o formato que o dominio espera.
 */
export function dataNoFuso(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_DO_USUARIO }).format(instante)
}

/**
 * Unico ponto do servidor que le o relogio.
 *
 * Duplicado de `mcp/server.ts` de proposito -- aquele arquivo nao pode ser
 * importado aqui (importa-lo executaria `server.connect(new
 * StdioServerTransport())` no topo do modulo, abrindo um segundo transporte).
 * O dominio recebe a data corrente como parametro em todo lugar (RN-04), e
 * manter a leitura confinada aqui e o que permite testar as ferramentas em
 * qualquer data sem tocar no relogio da maquina.
 */
function hojeDoSistema(): string {
  return dataNoFuso(new Date())
}

function json(valor: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text' as const, text: JSON.stringify(valor, null, 2) }] }
}

/**
 * Envolve o corpo de uma ferramenta MCP: erros que o usuario precisa ler
 * atravessam intactos, qualquer outro erro sai sanitizado.
 *
 * O SDK do MCP devolve para quem chamou qualquer coisa que uma ferramenta
 * lance, como texto. Nenhuma ferramenta aqui envolve `pool.query`
 * individualmente -- sem este wrapper, um erro cru do `pg` (que pode conter a
 * string de conexao inteira, senha inclusa) alcancaria o contexto do modelo.
 *
 * `ErroDeUsuario` (`mcp/tools/erro-do-usuario.ts`) e `ErroDeDominio`
 * (`src/data/invariants.ts`, via `src/domain/errors.js`) sao as duas formas de
 * erro pensadas para o usuario ler -- "Nao entendi o valor", "Nao encontrei
 * essa chave" -- e sao exatamente como o assistente sabe o que tentar
 * diferente na proxima chamada; precisam atravessar verbatim. Qualquer outra
 * coisa (erro de `pg`, bug de programacao) passa por `descreverErro` antes de
 * virar a mensagem que o cliente ve, e o erro original vai so para o log do
 * Railway.
 */
async function executarFerramenta<T>(
  corpo: () => Promise<T>,
): Promise<{ content: { type: 'text'; text: string }[] }> {
  try {
    return json(await corpo())
  } catch (e) {
    if (e instanceof ErroDeUsuario || ehErroDeDominio(e)) {
      throw e
    }

    const descricao = descreverErro(e)
    console.error('erro nao tratado numa ferramenta MCP: %s', descricao)
    throw new Error('Falha interna ao processar a ferramenta. Tente novamente em instantes.', {
      // `cause` leva a descricao SANITIZADA, nunca `e` em si -- o mesmo
      // motivo do catch em `iniciar()` mais abaixo: um erro cru do `pg` pode
      // conter a string de conexao inteira, senha inclusa.
      // eslint-disable-next-line preserve-caught-error -- ver comentario acima: `e` cru nunca pode virar `cause`
      cause: descricao,
    })
  }
}

export const VERSAO: string = (
  JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string }
).version

export interface RespostaPing {
  readonly resposta: 'pong'
  readonly horaDoServidor: string
  readonly versao: string
}

/**
 * A hora entra como parametro, nao e lida aqui dentro.
 *
 * O mesmo motivo do dominio financeiro (RN-04): funcao que le o relogio nao se
 * testa sem manipular o relogio global. Quem chama decide que instante e este.
 */
export function responderPing(agora: Date, versao: string): RespostaPing {
  return {
    resposta: 'pong',
    horaDoServidor: agora.toISOString(),
    versao,
  }
}

function criarServidorMcp(app: AppPg): McpServer {
  const server = new McpServer({ name: 'financas-remoto', version: VERSAO })

  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description:
        'Verifica se o servidor de financas esta no ar. Devolve a hora do ' +
        'servidor, que prova que ele executou agora e nao devolveu cache.',
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(responderPing(new Date(), VERSAO), null, 2),
        },
      ],
    }),
  )

  server.registerTool(
    'situacao_do_mes',
    {
      title: 'Situacao do mes',
      description:
        'Quanto sobra no mes, o que falta pagar e entrar, e em que dia o ' +
        'saldo chega ao minimo. Quando saldoRelativo for verdadeiro, NAO ' +
        'afirme um saldo absoluto: leia avisoSaldoRelativo. Cada item traz ' +
        'uma chave, que e o que voce usa para registrar pagamento. A lista ' +
        'ignorados traz as contas que foram tiradas da projecao deste mes: ' +
        'elas nao entram em nenhum total, e a chave delas e como voce as traz ' +
        'de volta, com ignorar_conta(ignorar: false).',
      inputSchema: {
        competencia: COMPETENCIA.optional().describe('Mes AAAA-MM. Padrao: mes corrente'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ competencia, hoje }) =>
      executarFerramenta(() =>
        situacaoDoMes(app, {
          ...(competencia === undefined ? {} : { competencia }),
          hoje: hoje ?? hojeDoSistema(),
        }),
      ),
  )

  server.registerTool(
    'o_que_vence',
    {
      title: 'O que vence',
      description:
        'Responde "o que preciso pagar nos proximos dias?". Janela curta a ' +
        'partir de hoje, que pode cruzar a virada do mes, mais tudo que ja ' +
        'esta atrasado. Para o quadro completo de um mes use situacao_do_mes.',
      inputSchema: {
        dias: z.number().int().min(1).max(365).optional().describe('Janela em dias. Padrao: 7'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ dias, hoje }) =>
      executarFerramenta(() =>
        oQueVence(app, {
          ...(dias === undefined ? {} : { dias }),
          hoje: hoje ?? hojeDoSistema(),
        }),
      ),
  )

  server.registerTool(
    'historico_de_gastos',
    {
      title: 'Historico de gastos',
      description:
        'Responde "quanto eu gastei com isso?". Olha o PASSADO ja pago, ' +
        'agregado por nome, nos ultimos meses. Nao mostra previsao nem conta ' +
        'em aberto -- para isso use situacao_do_mes ou o_que_vence.',
      inputSchema: {
        meses: z.number().int().min(1).max(60).optional().describe('Janela em meses. Padrao: 6'),
        nome: z.string().optional().describe('Filtra por nome, sem diferenciar maiuscula'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ meses, nome, hoje }) =>
      executarFerramenta(() =>
        historicoDeGastos(app, {
          ...(meses === undefined ? {} : { meses }),
          ...(nome === undefined ? {} : { nome }),
          hoje: hoje ?? hojeDoSistema(),
        }),
      ),
  )

  server.registerTool(
    'cadastrar_recorrente',
    {
      title: 'Cadastrar recorrente',
      description:
        'Cadastra um lancamento que se repete todo mes: salario, aluguel, ' +
        'conta de luz. O valor vai como a pessoa fala ("1800", "1800,00", ' +
        '"1.800,00"), nunca em centavos.',
      inputSchema: {
        tipo: z.enum(['entrada', 'saida']),
        nome: z.string().min(1),
        valor: z
          .string()
          .describe('Valor como a pessoa fala, nunca em centavos. Ex: "1800", "1.800,00"'),
        diaDoMes: z.number().int().min(1).max(31),
        vigenteDe: COMPETENCIA.describe('Mes a partir do qual a regra vale, AAAA-MM'),
        ajusteFimDeSemana: z.enum(['nenhum', 'antecipa', 'posterga']).optional(),
        valorEhEstimativa: z.boolean().optional(),
      },
    },
    async ({ tipo, nome, valor, diaDoMes, vigenteDe, ajusteFimDeSemana, valorEhEstimativa }) =>
      executarFerramenta(() =>
        cadastrarRecorrente(app, {
          tipo,
          nome,
          valor,
          diaDoMes,
          vigenteDe,
          ...(ajusteFimDeSemana === undefined ? {} : { ajusteFimDeSemana }),
          ...(valorEhEstimativa === undefined ? {} : { valorEhEstimativa }),
        }),
      ),
  )

  server.registerTool(
    'lancar_avulso',
    {
      title: 'Lancar avulso',
      description:
        'Registra um gasto ou entrada pontual, que nao se repete. Sem data, ' +
        'usa hoje. O valor vai como a pessoa fala, nunca em centavos.',
      inputSchema: {
        tipo: z.enum(['entrada', 'saida']),
        nome: z.string().min(1),
        valor: z.string().describe('Valor como a pessoa fala, nunca em centavos'),
        data: DATA.optional().describe('Data do lancamento. Padrao: hoje'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
        observacao: z.string().optional(),
      },
    },
    async ({ tipo, nome, valor, data, hoje, observacao }) =>
      executarFerramenta(() =>
        lancarAvulso(app, {
          tipo,
          nome,
          valor,
          ...(data === undefined ? {} : { data }),
          hoje: hoje ?? hojeDoSistema(),
          ...(observacao === undefined ? {} : { observacao }),
        }),
      ),
  )

  server.registerTool(
    'marcar_pago',
    {
      title: 'Marcar pago',
      description:
        'Registra que uma conta foi paga ou um valor foi recebido. Use a ' +
        'chave que veio em situacao_do_mes; consulte antes se nao tiver. ' +
        'Repetir a mesma chamada nao cria lancamento duplicado.',
      inputSchema: {
        chave: z.string().min(1).describe('A chave devolvida por situacao_do_mes'),
        valor: z
          .string()
          .optional()
          .describe('Valor efetivamente pago/recebido, se diferente do previsto'),
        data: DATA.optional().describe('Data do pagamento. Padrao: hoje'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ chave, valor, data, hoje }) =>
      executarFerramenta(() =>
        marcarPago(app, {
          chave,
          ...(valor === undefined ? {} : { valor }),
          ...(data === undefined ? {} : { data }),
          hoje: hoje ?? hojeDoSistema(),
        }),
      ),
  )

  server.registerTool(
    'ajustar_conta',
    {
      title: 'Ajustar conta',
      description:
        'Corrige o valor previsto ou o vencimento de uma conta que ainda NAO ' +
        'foi paga, usando a chave que a consulta devolve. Vale so para o mes ' +
        'daquela conta -- a recorrencia que a gerou nao muda. Para corrigir o ' +
        'valor de algo JA PAGO, use marcar_pago de novo, que atualiza o mesmo ' +
        'registro.',
      inputSchema: {
        chave: z.string().min(1).describe('A chave devolvida pela consulta'),
        valor: z
          .string()
          .optional()
          .describe('Novo valor previsto, como a pessoa fala, nunca em centavos'),
        vencimento: DATA.optional().describe('Novo vencimento'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ chave, valor, vencimento, hoje }) =>
      executarFerramenta(() =>
        ajustarConta(app, {
          chave,
          ...(valor === undefined ? {} : { valor }),
          ...(vencimento === undefined ? {} : { vencimento }),
          hoje: hoje ?? hojeDoSistema(),
        }),
      ),
  )

  server.registerTool(
    'ignorar_conta',
    {
      title: 'Ignorar conta no mes',
      description:
        'Tira uma conta da projecao deste mes (ignorar=true) ou a traz de ' +
        'volta (ignorar=false). Use quando a conta simplesmente nao existe ' +
        'neste mes -- um gasto previsto que nao aconteceu, por exemplo. A ' +
        'recorrencia continua valendo nos meses seguintes. ATENCAO: ignorar ' +
        'uma conta ja paga APAGA o pagamento registrado; o recibo avisa e diz ' +
        'o valor apagado.',
      inputSchema: {
        chave: z.string().min(1).describe('A chave devolvida pela consulta'),
        ignorar: z
          .boolean()
          .describe('true tira da projecao deste mes, false traz de volta'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ chave, ignorar, hoje }) =>
      executarFerramenta(() =>
        ignorarConta(app, { chave, ignorar, hoje: hoje ?? hojeDoSistema() }),
      ),
  )

  server.registerTool(
    'registrar_parte',
    {
      title: 'Registrar parte antecipada',
      description:
        'Registra que PARTE do valor ja entrou ou saiu antes do vencimento, ' +
        'reduzindo o que ainda falta. Exemplo: o salario e 18.000 e vieram ' +
        '8.000 de adiantamento -- restam 10.000 a receber. Vale so para este ' +
        'mes. Recebimento ou pagamento INTEGRAL nao passa por aqui: use ' +
        'marcar_pago.',
      inputSchema: {
        chave: z.string().min(1).describe('A chave devolvida pela consulta'),
        valor: z
          .string()
          .describe('Quanto ja entrou ou saiu, como a pessoa fala, nunca em centavos'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ chave, valor, hoje }) =>
      executarFerramenta(() =>
        registrarParte(app, { chave, valor, hoje: hoje ?? hojeDoSistema() }),
      ),
  )

  server.registerTool(
    'declarar_saldo',
    {
      title: 'Declarar saldo',
      description:
        'Informa o saldo real da conta numa data. E o que faz os valores ' +
        'projetados deixarem de ser relativos. Errar aqui desloca a curva ' +
        'inteira: confira o recibo.',
      inputSchema: {
        valor: z.string().describe('Saldo real, como a pessoa fala, nunca em centavos'),
        data: DATA.optional().describe('Data do saldo. Padrao: hoje'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ valor, data, hoje }) =>
      executarFerramenta(() =>
        declararSaldo(app, {
          valor,
          ...(data === undefined ? {} : { data }),
          hoje: hoje ?? hojeDoSistema(),
        }),
      ),
  )

  server.registerTool(
    'declarar_saldo_estrangeiro',
    {
      title: 'Declarar saldo em moeda estrangeira',
      description:
        'Informa quanto ha em uma moeda estrangeira, como dolares parados em ' +
        'conta internacional. Este valor NAO entra na projecao do mes: ele so ' +
        'paga contas depois de convertido em reais. Declarar de novo substitui ' +
        'o valor anterior, e nao ha desfazer. Para aposentar uma moeda (por ' +
        'exemplo, depois de converter tudo para reais), declare o saldo como 0.',
      inputSchema: {
        moeda: z.string().describe('Codigo de tres letras, como USD ou EUR'),
        valor: z
          .string()
          .describe('Saldo na moeda de origem, como a pessoa fala, nunca em centavos'),
        data: DATA.optional().describe('Data do saldo. Padrao: hoje'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ moeda, valor, data, hoje }) =>
      executarFerramenta(() =>
        declararSaldoEstrangeiro(app, {
          moeda,
          valor,
          ...(data === undefined ? {} : { data }),
          hoje: hoje ?? hojeDoSistema(),
        }),
      ),
  )

  server.registerTool(
    'patrimonio',
    {
      title: 'Patrimonio total',
      description:
        'Responde "quanto eu tenho no total?" -- o saldo em reais mais os ' +
        'saldos em moeda estrangeira convertidos. Para "como estou este mes?" ' +
        'use situacao_do_mes, que so olha reais e o fluxo do mes. ' +
        'ANTES de chamar, busque a cotacao do dia de cada moeda com saldo e ' +
        'informe em `cotacoes`; diga ao usuario qual cotacao usou. Se nao ' +
        'conseguir uma cotacao confiavel, pergunte -- nunca estime de memoria. ' +
        'Se `avisoSaldoDesatualizado` vier preenchido, mostre-o: ha saldo ' +
        'estrangeiro declarado antes do mes atual, que pode ja ter sido ' +
        'convertido e esquecido de zerar.',
      inputSchema: {
        cotacoes: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Cotacao em reais de cada moeda, como texto. Exemplo: ' +
              '{ "USD": "5,4321" }. Ate quatro casas decimais.',
          ),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ cotacoes, hoje }) =>
      executarFerramenta(() =>
        patrimonio(app, {
          ...(cotacoes === undefined ? {} : { cotacoes }),
          hoje: hoje ?? hojeDoSistema(),
        }),
      ),
  )

  server.registerTool(
    'cadastrar_parcelamento',
    {
      title: 'Cadastrar parcelamento',
      description:
        'Cadastra uma compra parcelada. O valor e o da PARCELA como aparece ' +
        'na fatura, nunca o total -- o total e devolvido no recibo para voce ' +
        'conferir.',
      inputSchema: {
        nome: z.string().min(1),
        valorParcela: z
          .string()
          .describe('Valor da PARCELA como a pessoa fala, nunca em centavos. Ex: "300", "300,00"'),
        // .max(360): 30 anos de parcelas mensais e teto generoso o bastante
        // para qualquer compra real. Nao e cortesia arbitraria -- sem ele,
        // uma quantidade mal transcrita (ex.: "1000000" em vez de "10")
        // sobrevive ao cadastro e faz `expandirParcelamentos` (chamado em
        // TODA projecao futura) iterar uma vez por parcela antes de
        // descartar as que caem fora do intervalo. Isso nao falha uma vez:
        // cada consulta seguinte volta a pagar o custo, ate travar o event
        // loop, derrubar o healthcheck do Railway e colocar o servico em
        // loop de reinicio -- e, antes do Fix 1, sem `desfazer` alcancavel
        // pelo protocolo, a unica saida era acesso direto ao banco.
        quantidadeParcelas: z.number().int().min(1).max(360),
        primeiroVencimento: DATA.describe('Data de vencimento da primeira parcela'),
      },
    },
    async ({ nome, valorParcela, quantidadeParcelas, primeiroVencimento }) =>
      executarFerramenta(() =>
        cadastrarParcelamento(app, {
          nome,
          valorParcela,
          quantidadeParcelas,
          primeiroVencimento,
        }),
      ),
  )

  server.registerTool(
    'desfazer',
    {
      title: 'Desfazer',
      description:
        'Remove uma escrita de QUALQUER data, usando o tipo e o id -- do ' +
        'recibo, de `exportar` ou da chave devolvida numa consulta. Serve ' +
        'tanto para desfazer um engano recente quanto para apagar um ' +
        'registro antigo. Desfazer um pagamento nao apaga a conta, so o ' +
        'registro de que foi paga. Nao ha confirmacao previa: confira o id ' +
        'antes de chamar, e repita ao usuario o que foi removido. Para tirar ' +
        'uma conta de UM mes so, use ignorar_conta: desfazer com ' +
        "tipo 'recorrente' apaga a regra inteira, e com ela a conta de todos " +
        'os meses seguintes -- raramente e o que a pessoa quer dizer.',
      inputSchema: {
        tipo: z.enum(['recorrente', 'avulso', 'pagamento', 'saldo', 'parcelamento']),
        id: z.string().min(1).describe('O id do recibo -- para tipo pagamento, a chave'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ tipo, id, hoje }) =>
      executarFerramenta(() =>
        desfazer(app, { tipo, id, hoje: hoje ?? hojeDoSistema() }),
      ),
  )

  server.registerTool(
    'exportar',
    {
      title: 'Exportar',
      description:
        'Devolve todos os dados em JSON, no formato de backup. Use quando a ' +
        'pessoa quiser uma copia dos proprios dados.',
      inputSchema: {
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ hoje }) => executarFerramenta(() => exportar(app, { hoje: hoje ?? hojeDoSistema() })),
  )

  server.registerTool(
    'simular_cenario',
    {
      title: 'Simular cenario',
      description:
        'Responde "se eu assumir esse gasto, atravesso os proximos meses?". ' +
        'Projeta lancamentos hipoteticos e compara mes a mes com e sem eles. ' +
        'Nada e gravado. Valores dos lancamentos vao em centavos inteiros ' +
        'aqui, diferente das ferramentas de cadastro. Quando saldoRelativo ' +
        'for verdadeiro (no mes ou na resposta), NAO afirme um saldo ' +
        'absoluto: leia avisoSaldoRelativo.',
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
                }),
              }),
              z.object({
                tipo: z.literal('parcelamento'),
                parcelamento: z.object({
                  nome: z.string(),
                  valorParcelaCentavos: z.number().int(),
                  // .max(360): mesmo limite de cadastrar_parcelamento, e pela
                  // mesma razao -- expandirParcelamentos percorre
                  // quantidadeParcelas inteiro em CADA projecao antes de
                  // descartar o que cai fora do intervalo, e simular_cenario
                  // projeta ate 24 competencias em dois apps (48 projecoes
                  // por chamada).
                  quantidadeParcelas: z.number().int().min(1).max(360),
                  primeiroVencimento: DATA,
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
                }),
              }),
            ]),
          )
          .describe('Gastos hipoteticos. Valores SEMPRE em centavos inteiros'),
        ate: COMPETENCIA.describe('Ultima competencia a projetar. Maximo de 24 meses'),
        hoje: DATA.optional().describe('Data de referencia. Padrao: hoje'),
      },
    },
    async ({ lancamentos, ate, hoje }) =>
      executarFerramenta(async () => {
        // `simularCenario` consome um DocumentoBackup e monta dois bancos
        // descartaveis. `exportar` ja produz exatamente esse documento, entao a
        // ferramenta nao muda: so muda quem a alimenta. E ela segue sem alcancar
        // o Postgres, que e o que a torna segura.
        const doc = await exportar(app, { hoje: hoje ?? hojeDoSistema() })
        return simularCenario(doc, { lancamentos, ate, hoje: hoje ?? hojeDoSistema() })
      }),
  )

  return server
}

function statusDoErro(err: unknown): number {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status?: unknown }).status
    if (typeof status === 'number') return status
  }

  return 500
}

/**
 * Middleware de erro do Express (assinatura de 4 parametros -- e assim que o
 * Express reconhece que e um tratador de erro, nao um middleware normal).
 *
 * Existe porque `express.json()`, montado globalmente por
 * `createMcpExpressApp`, roda ANTES de `criarMiddlewareDeAuth`. Um corpo JSON
 * malformado estoura no parser antes da autenticacao ter a chance de rodar --
 * autenticado ou nao. Sem este tratador, o erro cairia no handler padrao do
 * Express, que sem `NODE_ENV=production` devolve uma pagina HTML com stack
 * trace e caminho de arquivo para quem nao tem o segredo.
 *
 * A resposta ao cliente e sempre a mesma forma fixa: nunca `err.stack`, nunca
 * `err.message` (a mensagem original do body-parser pode descrever a
 * localizacao exata do erro de sintaxe, informacao interna que nao precisa
 * sair). O status HTTP e preservado quando o erro declara um (400 para corpo
 * malformado, por exemplo) porque isso e publico e nao depende do segredo;
 * cai para 500 quando o erro nao diz nada sobre si mesmo.
 *
 * O Express 5 encaminha automaticamente promessas rejeitadas de handlers
 * assincronos para este middleware -- entao nao e so o SyntaxError do parser
 * que passa por aqui, e sim qualquer falha do handler de `/mcp`
 * (`connect`, `handleRequest`, o que vier no Projeto 1). Responder sem
 * registrar apagaria o rastro que o handler padrao do Express deixava antes
 * (`console.error(err.stack)`, ver `express/lib/application.js`), e este
 * arquivo e a fundacao de transporte de todas as ferramentas financeiras que
 * vem a seguir -- um defeito nelas precisa aparecer no log do Railway, nao
 * so sumir num JSON generico. Por isso o log ANTES de responder.
 *
 * Restricao que sobrevive a este log: NUNCA registrar `req` (nem
 * `req.headers`, que carrega o segredo, nem `req.body`, que no Projeto 1 vai
 * carregar valores financeiros) -- e, pelo mesmo motivo, NUNCA registrar o
 * objeto `err` inteiro. Parece contraintuitivo, mas o `body-parser`, ao
 * falhar o parse, chama `createError(400, err, { body: str, ... })` e o
 * `http-errors` MUTA o `SyntaxError` original no lugar, anexando `err.body`
 * com o corpo cru inteiro da requisicao. `console.error` de um `Error`
 * imprime o stack e, depois dele, todas as propriedades proprias
 * enumeraveis -- inclusive esse `body`. Por isso registramos so o `stack`
 * (string montada pelo runtime com nome, mensagem e quadros de pilha; nao
 * inclui propriedades proprias como `err.body`), nunca o `err` em si.
 *
 * Mais um canal fechado, que sobrevivia ao anterior: a MENSAGEM do erro (que
 * faz parte de `err.stack`) ainda pode citar um trecho da entrada -- o
 * SyntaxError que o V8 lanca para JSON invalido embute um excerto do texto
 * que falhou ("Unexpected token 'S', "[1,2,SENTINELA-9271]" is not valid
 * JSON"), e esse excerto e texto controlado por quem mandou a requisicao,
 * sem autenticar, e pode conter quebra de linha (forjando linhas de log). Um
 * erro de parse de corpo e reconhecivel por `err.type ===
 * 'entity.parse.failed'` (e o proprio body-parser que marca, ver
 * `body-parser/lib/read.js`) -- para esse caso especifico, registramos so o
 * NOME e o STATUS do erro, nunca `message` nem `stack`. Para qualquer outro
 * erro (que vem do nosso proprio codigo, nao de entrada de terceiros) o
 * `stack` continua sendo logado, porque e para isso que este log existe.
 */
function ehErroDeParseDeCorpo(err: unknown): err is Error & { type: string } {
  return (
    err instanceof Error &&
    'type' in err &&
    (err as { type: unknown }).type === 'entity.parse.failed'
  )
}

function tratarErroDeCorpo(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (ehErroDeParseDeCorpo(err)) {
    console.error(
      'erro nao tratado em /mcp: falha ao parsear corpo (nome=%s status=%d)',
      err.name,
      statusDoErro(err),
    )
  } else if (err instanceof Error) {
    console.error('erro nao tratado em /mcp:', err.stack)
  } else {
    console.error('erro nao tratado em /mcp:', String(err))
  }

  if (res.headersSent) {
    next(err)
    return
  }

  res.status(statusDoErro(err)).json({ erro: 'requisicao invalida' })
}

/**
 * Hostname fixo com que o Railway faz o healthcheck -- NUNCA o dominio
 * publico do servico.
 *
 * `hostHeaderValidation` (ligado por `allowedHosts` abaixo) e montado pelo
 * SDK ANTES de qualquer rota, inclusive `GET /`. Sem esta entrada, definir
 * `FINANCE_MCP_HOST_PERMITIDO` derruba o healthcheck do Railway (403 em vez
 * de 200) e o deploy e marcado como falho -- comportamento verificado contra
 * o app real. Nao remova pensando que e lixo: e o healthcheck do Railway que
 * teria que ser removido primeiro.
 */
const HOST_HEALTHCHECK_RAILWAY = 'healthcheck.railway.app'

/**
 * Monta o app.
 *
 * `createMcpExpressApp` com host '0.0.0.0' NAO liga a protecao contra DNS
 * rebinding automaticamente -- ela so vale para bind local. Num endereco
 * publico, quem faz esse papel e `allowedHosts`, alimentado pelo dominio do
 * Railway quando ele for conhecido (mais `HOST_HEALTHCHECK_RAILWAY`, sempre).
 */
export function criarApp(segredo: string, appPg: AppPg): Express {
  if (segredo.trim() === '') {
    // Defesa na fronteira: `iniciar()` ja nao chega aqui sem segredo (
    // `lerSegredo` lanca antes), mas este modulo nao controla quem mais vai
    // chamar `criarApp` -- um app que aceita segredo vazio autenticaria
    // `Authorization: Bearer ` (header vazio) como valido.
    throw new Error(
      'criarApp requer um segredo nao vazio: um app sem segredo aceitaria ' +
        'qualquer requisicao como autenticada.',
    )
  }

  const hostPermitido = process.env['FINANCE_MCP_HOST_PERMITIDO']

  const app = createMcpExpressApp(
    hostPermitido === undefined || hostPermitido === ''
      ? { host: '0.0.0.0' }
      : { host: '0.0.0.0', allowedHosts: [hostPermitido, HOST_HEALTHCHECK_RAILWAY] },
  )

  // Framework fingerprinting de graca, inclusive pre-autenticacao -- sem
  // ganho nenhum em manter.
  app.disable('x-powered-by')

  // Healthcheck do Railway. Sem autenticacao de proposito, e por isso nao
  // devolve nada alem de um sinal de vida -- nem a versao, nem qualquer
  // outro dado (RN: "Nao expoe dado algum").
  app.get('/', (_req, res) => {
    res.status(200).json({ vivo: true })
  })

  // `createMcpExpressApp` ja monta `express.json()` globalmente, antes de
  // qualquer rota registrada aqui -- por isso o corpo ja chega parseado ao
  // handler, sem precisar (e sem poder, sem duplicar o parser) de outro
  // `express.json()` nesta rota.
  //
  // A autenticacao vem ANTES do transporte: nada do protocolo MCP roda para
  // quem nao passou pelo cadeado. O que ela NAO consegue ficar na frente e do
  // parser global: um corpo JSON malformado estoura no parser, antes deste
  // middleware rodar, autenticado ou nao. E por isso que existe
  // `tratarErroDeCorpo` abaixo -- ele garante que esse erro tambem sai
  // controlado, sem stack nem estrutura interna, e sem dizer se quem mandou
  // tinha o segredo certo.
  app.post('/mcp', criarMiddlewareDeAuth(segredo), async (req, res) => {
    // Modo stateless: sem sessao em memoria. O Railway reinicia e escala o
    // processo quando quer, e sessao guardada aqui se perderia no meio de uma
    // conversa. Omitir `sessionIdGenerator` (em vez de passar `undefined`
    // explicitamente) e a forma documentada pelo SDK de desligar sessao, e a
    // unica que sobrevive a `exactOptionalPropertyTypes`.
    const transporte = new StreamableHTTPServerTransport({})

    res.on('close', () => {
      void transporte.close()
    })

    // @ts-expect-error TS2379: o acessor `onclose` de StreamableHTTPServerTransport e
    // tipado `(() => void) | undefined`, enquanto `Transport.onclose` e uma
    // propriedade opcional `() => void`. So esta classe do SDK tem esse
    // descompasso -- StdioServerTransport (usado em mcp/server.ts) declara
    // `onclose?: () => void` puro e nao aciona o erro. Falso positivo de
    // `exactOptionalPropertyTypes` contra a propria tipagem do SDK.
    await criarServidorMcp(appPg).connect(transporte)
    await transporte.handleRequest(req, res, req.body)
  })

  // Precisa vir depois das rotas: o Express so identifica um middleware como
  // tratador de erro pela aridade de 4 parametros, e so o alcanca quando algo
  // antes dele -- rota ou middleware global, como o parser de corpo -- chama
  // `next(err)` ou rejeita uma promise.
  app.use(tratarErroDeCorpo)

  return app
}

const PORTA_PADRAO = 8080

/**
 * Le a porta do ambiente, ou lanca.
 *
 * `Number(valor)` para uma `PORT` malformada (vazia depois de trim nao
 * conta, string nao numerica, fracionaria, negativa ou zero) vira `NaN`, e
 * `server.listen(NaN, ...)` nao falha -- o Node escuta numa porta aleatoria
 * escolhida pelo SO. O healthcheck do Railway (que bate numa porta
 * conhecida) falha, e nada no log explica o motivo: um servidor escutando
 * numa porta desconhecida e um servidor que ninguem alcanca. Falha alto e
 * explicito no boot, do mesmo jeito que a falta do segredo.
 */
export function lerPorta(env: Record<string, string | undefined>): number {
  const bruta = env['PORT']
  if (bruta === undefined || bruta.trim() === '') return PORTA_PADRAO

  const porta = Number(bruta)
  if (!Number.isInteger(porta) || porta <= 0) {
    throw new Error(
      `PORT invalida: "${bruta}". Precisa ser um numero inteiro positivo.`,
    )
  }

  return porta
}

/**
 * Bootstrap, exportado mas nao chamado aqui.
 *
 * Quem chama e `mcp/main-http.ts`. Detectar "sou o ponto de entrada?" por
 * comparacao entre `import.meta.url` e `process.argv[1]` e fragil no Windows e
 * sob o tsx; um arquivo de entrada separado nao tem esse problema, e este
 * modulo passa a ser importavel pelos testes sem subir servidor nenhum.
 *
 * Assincrona porque precisa aplicar migracoes antes de escutar (ver abaixo).
 * `mcp/main-http.ts` faz `await iniciar()`.
 */
export async function iniciar(): Promise<void> {
  // lerSegredo lanca quando a variavel falta, e e exatamente o que se quer:
  // um processo que sobe sem segredo publica um endpoint aberto. lerPorta
  // lanca pelo mesmo motivo: um processo escutando numa porta que ninguem
  // sabe qual e tao inalcancavel quanto um processo fora do ar. lerUrlDoBanco
  // lanca pelo mesmo motivo tambem: sem banco nao ha o que servir.
  const segredo = lerSegredo(process.env)
  const porta = lerPorta(process.env)
  const url = lerUrlDoBanco(process.env)

  // O pool e a app sobre Postgres sao montados uma unica vez aqui, nao dentro
  // de `criarServidorMcp()` -- aquela funcao roda por requisicao (uma
  // instancia nova de `McpServer` a cada POST /mcp), e um pool criado la
  // abriria uma conexao nova por chamada.
  const pool = criarPool(url)

  try {
    // Se as migracoes falharem, o processo NAO sobe: um servidor no ar sobre
    // um esquema incompleto responderia errado em silencio, que e pior do
    // que nao responder. `descreverErro` porque a mensagem crua de um erro
    // do `pg` pode conter a string de conexao inteira, senha inclusa -- e
    // isso nao pode aparecer no log do Railway.
    await aplicarMigracoes(pool)
  } catch (e) {
    const descricao = descreverErro(e)
    console.error('falha ao aplicar migracoes, servidor nao sobe: %s', descricao)
    await pool.end()
    // `cause` leva a descricao SANITIZADA (`descreverErro`), nunca `e` em si:
    // um erro nao tratado sobe ate o processo e o handler padrao do Node
    // imprime a cadeia de `cause` inteira no stderr -- anexar `e` cru
    // reabriria exatamente o vazamento que este catch existe para fechar.
    throw new Error('falha ao aplicar migracoes: servidor nao sobe sobre esquema incompleto', {
      // eslint-disable-next-line preserve-caught-error -- ver comentario acima: `e` cru nunca pode virar `cause`
      cause: descricao,
    })
  }

  const app = criarAppPg(pool)

  criarApp(segredo, app).listen(porta, '0.0.0.0', () => {
    // Sem segredo, sem porta de origem, sem nada alem do fato de estar no ar.
    console.log(`servidor MCP de financas no ar, versao ${VERSAO}`)
  })
}
