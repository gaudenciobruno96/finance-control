/**
 * Ponto de entrada do servidor MCP remoto.
 *
 * Existe separado para que `servidor-http.ts` possa ser importado por teste sem
 * efeito colateral: importar um modulo nao pode subir um servidor.
 */

import { iniciar } from './servidor-http.js'

await iniciar()
