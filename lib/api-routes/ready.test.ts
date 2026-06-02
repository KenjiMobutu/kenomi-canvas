import { describe, it, expect } from 'vitest'

import { GET } from '@/app/api/ready/route'

describe('GET /api/ready', () => {
  it('returns 200 readiness payload without external dependency checks', async () => {
    process.env.SOURCE_COMMIT = 'abc123456789'
    process.env.NODE_ENV = 'production'

    const res = await GET()
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toMatchObject({
      status: 'ready',
      runtime: {
        sourceCommit: 'abc123456789',
        nodeEnv: 'production',
      },
      timestamp: expect.any(String),
    })
  })
})
