import { describe, expect, it } from 'vitest'
import { getSanitizedInfraServices, parseInfraServices } from './infra-config'

describe('infra config', () => {
  it('redacts internal URLs from sanitized service metadata', () => {
    const services = parseInfraServices([
      { id: 'ollama', label: 'Ollama', endpoint: 'http://192.168.0.14:11434', role: 'LLM', healthKey: 'ollama' },
    ])

    expect(getSanitizedInfraServices(services)).toEqual([
      { id: 'ollama', label: 'Ollama', role: 'LLM', healthKey: 'ollama', endpointLabel: 'private' },
    ])
  })

  it('keeps public host labels without protocol or path', () => {
    const services = parseInfraServices([
      { id: 'n8n', label: 'n8n', endpoint: 'https://n8n.kenomi.eu/healthz', role: 'Automation', healthKey: 'n8n' },
    ])

    expect(getSanitizedInfraServices(services)[0].endpointLabel).toBe('n8n.kenomi.eu')
  })
})
