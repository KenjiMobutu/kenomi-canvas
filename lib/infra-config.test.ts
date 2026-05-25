import { describe, expect, it } from 'vitest'
import {
  applyUserInfraSettings,
  getSanitizedInfraServices,
  parseInfraServices,
  resolveHealthServiceUrls,
} from './infra-config'

describe('infra config', () => {
  it('redacts internal URLs while preserving UI metadata', () => {
    const services = parseInfraServices([
      {
        id: 'ollama',
        label: 'Ollama',
        endpoint: 'http://192.168.0.14:11434',
        role: 'LLM',
        healthKey: 'ollama',
        short: 'OLL',
        color: '#fb923c',
        vmid: null,
        kind: 'external',
      },
    ])

    expect(getSanitizedInfraServices(services)).toEqual([
      {
        id: 'ollama',
        label: 'Ollama',
        role: 'LLM',
        healthKey: 'ollama',
        endpointLabel: 'private',
        short: 'OLL',
        color: '#fb923c',
        vmid: null,
        kind: 'external',
      },
    ])
  })

  it('keeps public host labels without protocol or path', () => {
    const services = parseInfraServices([
      {
        id: 'n8n',
        label: 'n8n',
        endpoint: 'https://n8n.kenomi.eu/healthz',
        role: 'Automation',
        healthKey: 'n8n',
        short: 'N8N',
        color: '#e879f9',
        vmid: null,
        kind: 'service',
      },
    ])

    expect(getSanitizedInfraServices(services)[0].endpointLabel).toBe('n8n.kenomi.eu')
  })

  it('applies the Hermes Agent public endpoint before redaction', () => {
    const services = parseInfraServices([
      {
        id: 'hermesAgent',
        label: 'Hermes Agent',
        endpoint: 'https://hermes-api.kenomi.eu',
        role: 'Hermes API',
        healthKey: 'hermesAgent',
        short: 'HRM',
        color: '#f97316',
        vmid: 102,
        kind: 'service',
      },
    ])

    const configured = applyUserInfraSettings(services, {
      hermes_agent_url: 'https://hermes.tailnet.local',
    })

    expect(configured[0].endpoint).toBe('https://hermes.tailnet.local')
    expect(getSanitizedInfraServices(configured)[0].endpointLabel).toBe('hermes.tailnet.local')
  })

  it('applies saved service endpoints before redacting them for the UI', () => {
    const services = parseInfraServices([
      {
        id: 'coolify',
        label: 'Coolify',
        endpoint: 'http://192.168.0.19:8000',
        role: 'Deployments',
        healthKey: 'coolify',
        short: 'COOL',
        color: '#34d399',
        vmid: 102,
        kind: 'service',
      },
      {
        id: 'nginx',
        label: 'Nginx PM',
        endpoint: 'https://npm.tailnet.local',
        role: 'Proxy',
        healthKey: null,
        short: 'NPM',
        color: '#22d3ee',
        vmid: 101,
        kind: 'edge',
      },
    ])

    const configured = applyUserInfraSettings(services, {
      coolify_url: 'https://coolify.tailnet.local',
      nginx_pm_url: '',
    })

    expect(configured[0].endpoint).toBe('https://coolify.tailnet.local')
    expect(configured[1].endpoint).toBe('https://npm.tailnet.local')
    expect(getSanitizedInfraServices(configured)[0].endpointLabel).toBe('coolify.tailnet.local')
  })

  it('resolves health check URLs from saved settings with env fallbacks', () => {
    const urls = resolveHealthServiceUrls(
      {
        hermes_agent_url: 'https://hermes.local',
        ollama_base_url: 'http://ollama.local:11434/',
        n8n_base_url: '',
        supabase_url: 'https://supabase.local/',
        coolify_url: 'https://coolify.local/',
      },
      {
        HERMES_AGENT_URL: 'https://hermes.env',
        N8N_BASE_URL: 'https://n8n.env',
        NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.env',
        COOLIFY_URL: 'https://coolify.env',
      }
    )

    expect(urls).toEqual({
      hermesAgent: 'https://hermes.local/v1/health',
      ollama: 'http://ollama.local:11434/api/tags',
      n8n: 'https://n8n.env/healthz',
      supabase: 'https://supabase.local/rest/v1/',
      coolify: 'https://coolify.local/api/v1/version',
    })
  })
})
