import { NextResponse } from 'next/server'

export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

// Codes utilisés dans le projet :
// 400 — requête invalide (paramètre manquant, format incorrect)
// 401 — non authentifié
// 403 — authentifié mais non autorisé (ALLOWED_EMAIL)
// 404 — ressource non trouvée (ou non possédée par cet utilisateur)
// 429 — trop de requêtes
// 500 — erreur serveur interne
// 502 — erreur de service externe (Ollama, webhook n8n)
