import { describe, it, expect } from 'vitest'
import { apiError, apiOk } from './api-response'

describe('apiError', () => {
  it('retourne le bon status HTTP', async () => {
    const res = apiError('Not found', 404)
    expect(res.status).toBe(404)
  })

  it('retourne un body JSON avec le champ error', async () => {
    const res = apiError('Unauthorized', 401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('retourne le Content-Type application/json', () => {
    const res = apiError('Bad request', 400)
    expect(res.headers.get('content-type')).toContain('application/json')
  })
})

describe('apiOk', () => {
  it('retourne 200 par défaut', async () => {
    const res = apiOk({ ok: true })
    expect(res.status).toBe(200)
  })

  it('retourne le body JSON passé', async () => {
    const res = apiOk({ items: [1, 2, 3] })
    const body = await res.json()
    expect(body).toEqual({ items: [1, 2, 3] })
  })

  it('accepte un status personnalisé', async () => {
    const res = apiOk({ created: true }, 201)
    expect(res.status).toBe(201)
  })
})
