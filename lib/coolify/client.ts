import { isAllowedWebhookUrl } from '@/lib/security'

export interface CoolifyClient {
  triggerDeploy(input: { projectId: string; serviceId: string }): Promise<{ deploymentId: string }>
  getDeployment(input: { deploymentId: string }): Promise<{ status: string }>
}

interface CreateCoolifyClientInput {
  env?: NodeJS.ProcessEnv
  fetchFn?: typeof fetch
}

function getRequiredEnv(env: NodeJS.ProcessEnv, key: 'COOLIFY_URL' | 'COOLIFY_TOKEN') {
  const value = env[key]
  if (!value) throw new Error(`${key} missing`)
  return value
}

function normalizeBaseUrl(url: string, env: NodeJS.ProcessEnv) {
  if (!isAllowedWebhookUrl(url, env)) {
    throw new Error('COOLIFY_URL is not allowed')
  }

  return url.replace(/\/+$/, '')
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function readDeploymentId(payload: Record<string, unknown>): string {
  const deploymentId = payload.deploymentId ?? payload.deployment_id ?? payload.uuid ?? payload.id

  if (typeof deploymentId !== 'string' || deploymentId.length === 0) {
    throw new Error('Coolify response missing deployment id')
  }

  return deploymentId
}

export function createCoolifyClient(input: CreateCoolifyClientInput = {}): CoolifyClient {
  const env = input.env ?? process.env
  const fetchFn = input.fetchFn ?? fetch
  const baseUrl = normalizeBaseUrl(getRequiredEnv(env, 'COOLIFY_URL'), env)
  const token = getRequiredEnv(env, 'COOLIFY_TOKEN')

  async function request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const response = await fetchFn(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...init.headers,
      },
    })

    const payload = await parseJson(response)
    if (!response.ok) {
      throw new Error(`Coolify request failed: ${response.status}`)
    }

    return payload
  }

  return {
    async triggerDeploy(input) {
      const payload = await request('/api/v1/deployments', {
        method: 'POST',
        body: JSON.stringify({
          projectId: input.projectId,
          serviceId: input.serviceId,
        }),
      })

      return { deploymentId: readDeploymentId(payload) }
    },

    async getDeployment(input) {
      const payload = await request(`/api/v1/deployments/${encodeURIComponent(input.deploymentId)}`)

      const status = payload.status
      if (typeof status !== 'string' || status.length === 0) {
        throw new Error('Coolify response missing status')
      }

      return { status }
    },
  }
}
