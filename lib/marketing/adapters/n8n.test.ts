import { afterEach, describe, expect, it, vi } from 'vitest'
import { createN8nPublisher } from './n8n'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createN8nPublisher', () => {
  it('throws when N8N_PUBLISH_WEBHOOK_URL missing', () => {
    expect(() => createN8nPublisher({})).toThrow(/N8N_PUBLISH_WEBHOOK_URL/)
  })

  it('throws when URL is not allowed (SSRF)', () => {
    expect(() =>
      createN8nPublisher({ N8N_PUBLISH_WEBHOOK_URL: 'http://127.0.0.1/webhook' }),
    ).toThrow(/non autorisée/)
  })

  it('publishes successfully and returns externalId from executionId', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ executionId: 'exec-123', url: 'https://n8n.example/run/exec-123' }),
    } as unknown as Response)

    const publisher = createN8nPublisher({
      N8N_PUBLISH_WEBHOOK_URL: 'https://n8n.example.com/webhook/publish',
    })
    const result = await publisher.publish({
      channel: 'twitter',
      content: 'hello world',
      ventureId: 'v-1',
      metadata: { foo: 'bar' },
    })

    expect(result.externalId).toBe('exec-123')
    expect(result.metadata?.adapter).toBe('n8n')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://n8n.example.com/webhook/publish')
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(init?.body as string)
    expect(body).toEqual({
      venture_id: 'v-1',
      channel: 'twitter',
      content: 'hello world',
      metadata: { foo: 'bar' },
    })
  })

  it('rejects when response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'oops',
    } as unknown as Response)

    const publisher = createN8nPublisher({
      N8N_PUBLISH_WEBHOOK_URL: 'https://n8n.example.com/webhook/publish',
    })

    await expect(
      publisher.publish({ channel: 'twitter', content: 'x', ventureId: 'v-1' }),
    ).rejects.toThrow(/500/)
  })

  it('sends X-Kenomi-Token header when token provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ executionId: 'exec-1' }),
    } as unknown as Response)

    const publisher = createN8nPublisher({
      N8N_PUBLISH_WEBHOOK_URL: 'https://n8n.example.com/webhook/publish',
      N8N_PUBLISH_TOKEN: 'super-secret',
    })
    await publisher.publish({ channel: 'email', content: 'x', ventureId: 'v-1' })

    const [, init] = fetchSpy.mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers['X-Kenomi-Token']).toBe('super-secret')
  })
})
