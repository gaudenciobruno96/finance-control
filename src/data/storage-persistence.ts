/**
 * DAT-05 — Solicitacao de armazenamento persistente (RNF-06).
 *
 * O app NUNCA depende do resultado. Web apps adicionados a tela de inicio
 * escapam da limpeza automatica de sete dias do Safari, e esta chamada pede
 * proteção adicional ao sistema -- mas nenhuma das duas coisas e garantia.
 *
 * A protecao real dos dados e o backup (RF-28 a RF-31).
 */

export interface EstadoDeArmazenamento {
  readonly persistente: boolean
  readonly suportado: boolean
}

/** Nunca lanca: a indisponibilidade da API e situacao normal, nao erro. */
export async function solicitarPersistencia(): Promise<EstadoDeArmazenamento> {
  try {
    if (typeof navigator === 'undefined' || navigator.storage?.persist === undefined) {
      return { persistente: false, suportado: false }
    }

    if (navigator.storage.persisted !== undefined) {
      const jaPersistente = await navigator.storage.persisted()
      if (jaPersistente) return { persistente: true, suportado: true }
    }

    return { persistente: await navigator.storage.persist(), suportado: true }
  } catch {
    return { persistente: false, suportado: false }
  }
}

/** Espaco usado e disponivel, quando o navegador informa. */
export async function estimarEspaco(): Promise<{ usado: number; total: number } | null> {
  try {
    if (typeof navigator === 'undefined' || navigator.storage?.estimate === undefined) {
      return null
    }
    const { usage, quota } = await navigator.storage.estimate()
    if (usage === undefined || quota === undefined) return null
    return { usado: usage, total: quota }
  } catch {
    return null
  }
}
