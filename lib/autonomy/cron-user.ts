export interface CronUser {
  id: string
  email?: string | null
}

export async function resolveCronUserId(input: {
  explicitUserId?: string | null
  allowedEmail?: string | null
  listUsers: () => Promise<CronUser[]>
}): Promise<string> {
  const explicit = input.explicitUserId?.trim()
  if (explicit) return explicit

  const email = input.allowedEmail?.trim().toLowerCase()
  if (!email) {
    throw new Error('AGENT_ORCHESTRATOR_USER_ID ou ALLOWED_EMAIL requis')
  }

  const users = await input.listUsers()
  const match = users.find((user) => user.email?.toLowerCase() === email)
  if (!match?.id) {
    throw new Error('Utilisateur orchestrateur introuvable pour ALLOWED_EMAIL')
  }
  return match.id
}
