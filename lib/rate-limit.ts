// Compteur en mémoire par IP — suffisant pour une app mono-utilisateur.
// Se remet à zéro au redémarrage du process (comportement attendu).

interface Entry {
  count: number
  resetAt: number
}

const store = new Map<string, Entry>()

export interface RateLimitOptions {
  /** Nombre de requêtes autorisées dans la fenêtre */
  limit: number
  /** Durée de la fenêtre en millisecondes */
  windowMs: number
}

/**
 * Retourne true si la requête doit être bloquée (limite atteinte).
 * key : identifiant unique — typiquement `ip:route` ou `email:route`.
 */
export function isRateLimited(key: string, { limit, windowMs }: RateLimitOptions): boolean {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }

  entry.count += 1
  if (entry.count > limit) return true

  return false
}
