import { describe, expect, it } from 'vitest'
import {
  applyUserInfraSettings,
  getSanitizedInfraServices,
  parseInfraServices,
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
})
