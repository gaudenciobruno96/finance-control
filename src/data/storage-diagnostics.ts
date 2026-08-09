/**
 * DAT-06 — Diagnostico do armazenamento.
 *
 * Existe por causa de um relato de "cadastrei e sumiu". Sem isto, a unica
 * resposta possivel e um encolher de ombros: a tela vazia de quem perdeu os
 * dados e identica a de quem nunca cadastrou nada.
 *
 * Nenhum destes numeros conserta nada sozinho. Eles transformam "sumiu" numa
 * pergunta que se pode responder.
 */

import type { BancoFinanceiro } from './db.js'

export interface Diagnostico {
  /**
   * Verdadeiro quando o app roda pelo icone da tela de inicio.
   *
   * E o dado mais importante da lista. No Safari, o iOS APAGA todo o
   * armazenamento de um site apos 7 dias sem visita -- e nao avisa. O app
   * instalado na tela de inicio esta fora dessa regra.
   */
  readonly instalado: boolean

  /**
   * Verdadeiro quando o navegador prometeu nao descartar os dados sob pressao
   * de espaco. O Safari costuma recusar; nao ha o que fazer alem de instalar.
   */
  readonly persistente: boolean
  readonly persistenciaSuportada: boolean

  readonly bytesUsados: number | null

  readonly registros: {
    readonly regras: number
    readonly parcelamentos: number
    readonly ocorrencias: number
    readonly ancoras: number
  }

  readonly versaoDoBanco: number
}

export async function diagnosticar(db: BancoFinanceiro): Promise<Diagnostico> {
  const [regras, parcelamentos, ocorrencias, ancoras] = await Promise.all([
    db.regras.count(),
    db.parcelamentos.count(),
    db.ocorrencias.count(),
    db.ancoras.count(),
  ])

  return {
    instalado: ehInstalado(),
    ...(await estadoDaPersistencia()),
    bytesUsados: await estimarUso(),
    registros: { regras, parcelamentos, ocorrencias, ancoras },
    versaoDoBanco: db.verno,
  }
}

function ehInstalado(): boolean {
  if (typeof window === 'undefined') return false

  // `navigator.standalone` e a forma do Safari no iOS, e nao existe no tipo
  // padrao. As duas verificacoes juntas cobrem iOS e o resto.
  const doSafari = (navigator as { standalone?: boolean }).standalone === true

  return doSafari || window.matchMedia?.('(display-mode: standalone)').matches === true
}

async function estadoDaPersistencia(): Promise<{
  persistente: boolean
  persistenciaSuportada: boolean
}> {
  if (typeof navigator === 'undefined' || navigator.storage?.persisted === undefined) {
    return { persistente: false, persistenciaSuportada: false }
  }

  try {
    return { persistente: await navigator.storage.persisted(), persistenciaSuportada: true }
  } catch {
    return { persistente: false, persistenciaSuportada: false }
  }
}

async function estimarUso(): Promise<number | null> {
  if (typeof navigator === 'undefined' || navigator.storage?.estimate === undefined) {
    return null
  }

  try {
    return (await navigator.storage.estimate()).usage ?? null
  } catch {
    return null
  }
}
