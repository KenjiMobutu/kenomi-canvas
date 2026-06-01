import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const anthropicCreateMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = {
      create: anthropicCreateMock,
    }
  },
}))

async function loadLlmClient() {
  vi.resetModules()
  return import('./llm-client')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('computeCostUsd', () => {
  it('calcule le coût Claude Sonnet (1000 input + 500 output)', async () => {
    const { computeCostUsd } = await loadLlmClient()
    expect(
      computeCostUsd('claude-sonnet-4-6', {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
      })
    ).toBeCloseTo(0.0105, 6)
  })

  it('calcule le coût Haiku', async () => {
    const { computeCostUsd } = await loadLlmClient()
    expect(
      computeCostUsd('claude-haiku-4-5-20251001', {
        prompt_tokens: 2000,
        completion_tokens: 1000,
        total_tokens: 3000,
      })
    ).toBeCloseTo(0.0056, 6)
  })

  it('retourne 0 pour Ollama local', async () => {
    const { computeCostUsd } = await loadLlmClient()
    expect(
      computeCostUsd('qwen3:8b', {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
      })
    ).toBe(0)
  })

  it('retourne 0 pour un modèle inconnu (fail-safe)', async () => {
    const { computeCostUsd } = await loadLlmClient()
    expect(
      computeCostUsd('gpt-99', {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      })
    ).toBe(0)
  })

  it('accepte zéro tokens sans diviser par zéro', async () => {
    const { computeCostUsd } = await loadLlmClient()
    expect(
      computeCostUsd('claude-sonnet-4-6', {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      })
    ).toBe(0)
  })
})

describe('checkOllamaHealth', () => {
  it('uses the configured Ollama base URL for health checks', async () => {
    const { checkOllamaHealth } = await loadLlmClient()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await expect(checkOllamaHealth('http://settings-ollama.local:11434')).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://settings-ollama.local:11434/api/tags',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })
})

describe('llmChat', () => {
  beforeEach(() => {
    anthropicCreateMock.mockReset()
  })

  it('routes Hermes-family models through Hermes Agent when configured', async () => {
    vi.stubEnv('HERMES_AGENT_URL', 'https://hermes-api.kenomi.eu')
    vi.stubEnv('HERMES_AGENT_API_KEY', 'secret-hermes')
    const { llmChat } = await loadLlmClient()

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Prospect qualifié.' } }],
        usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmChat([{ role: 'user', content: 'Analyse ce prospect.' }], {
      model: 'hermes3:8b',
      system: 'Tu es Hermes.',
      temperature: 0.2,
      max_tokens: 400,
    })

    expect(result).toMatchObject({
      content: 'Prospect qualifié.',
      provider: 'hermes',
      model: 'hermes3:8b',
      fallback_triggered: false,
      usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hermes-api.kenomi.eu/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-hermes',
        }),
        body: JSON.stringify({
          model: 'hermes-agent',
          messages: [
            { role: 'system', content: 'Tu es Hermes.' },
            { role: 'user', content: 'Analyse ce prospect.' },
          ],
          stream: false,
          temperature: 0.2,
          max_tokens: 400,
        }),
      })
    )
  })

  it('falls back to Claude if Hermes Agent and local Ollama are unavailable', async () => {
    vi.stubEnv('HERMES_AGENT_URL', 'https://hermes-api.kenomi.eu')
    const { llmChat } = await loadLlmClient()

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          text: async () => 'bad gateway',
        })
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    )
    anthropicCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: 'Fallback Claude.' }],
      usage: { input_tokens: 11, output_tokens: 7 },
    })

    const result = await llmChat([{ role: 'user', content: 'Continue.' }], {
      model: 'hermes3:8b',
      system: 'Tu es Hermes.',
    })

    expect(result).toMatchObject({
      content: 'Fallback Claude.',
      provider: 'claude',
      model: 'claude-sonnet-4-5',
      fallback_triggered: true,
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    })
  })

  it('falls back from Hermes Agent to local Ollama before Claude', async () => {
    vi.stubEnv('HERMES_AGENT_URL', 'https://hermes-api.kenomi.eu')
    vi.stubEnv('OLLAMA_BASE_URL', 'http://192.168.0.14:11434')
    const { llmChat } = await loadLlmClient()

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => 'bad gateway',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { content: 'Fallback Ollama.' },
          prompt_eval_count: 9,
          eval_count: 5,
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmChat([{ role: 'user', content: 'Continue.' }], {
      model: 'hermes3:8b',
      system: 'Tu es Hermes.',
    })

    expect(result).toMatchObject({
      content: 'Fallback Ollama.',
      provider: 'ollama',
      model: 'qwen3:8b',
      fallback_triggered: true,
      usage: { prompt_tokens: 9, completion_tokens: 5, total_tokens: 14 },
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://192.168.0.14:11434/api/chat',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('surfaces all three providers when Hermes, Ollama and Claude are unavailable', async () => {
    vi.stubEnv('HERMES_AGENT_URL', 'https://hermes-api.kenomi.eu')
    const { llmChat } = await loadLlmClient()

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 504,
          text: async () => 'timeout',
        })
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    )
    anthropicCreateMock.mockRejectedValueOnce(new Error('missing API key'))

    await expect(
      llmChat([{ role: 'user', content: 'Continue.' }], {
        model: 'hermes3:8b',
      })
    ).rejects.toThrow(
      'LLM indisponible — Hermes: Hermes Agent HTTP 504: timeout | Ollama: connect ECONNREFUSED | Claude: missing API key'
    )
  })

  it('falls back from Ollama to Hermes before Claude when a qwen model times out', async () => {
    vi.stubEnv('HERMES_AGENT_URL', 'https://hermes-api.kenomi.eu')
    vi.stubEnv('HERMES_DEFAULT_MODEL', 'hermes3:8b')
    const { llmChat } = await loadLlmClient()

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('This operation was aborted'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hermes rescued the run.' } }],
          usage: { prompt_tokens: 33, completion_tokens: 12, total_tokens: 45 },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmChat([{ role: 'user', content: 'Find a prospect.' }], {
      model: 'qwen3:8b',
    })

    expect(result).toMatchObject({
      content: 'Hermes rescued the run.',
      provider: 'hermes',
      model: 'hermes3:8b',
      fallback_triggered: true,
      usage: { prompt_tokens: 33, completion_tokens: 12, total_tokens: 45 },
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://hermes-api.kenomi.eu/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
