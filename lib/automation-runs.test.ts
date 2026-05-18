import { describe, it, expect } from 'vitest'
import { buildRunResult } from './automation-run-status'

describe('buildRunResult', () => {
  it('succès sans webhook', () => {
    const r = buildRunResult({ webhookUrl: null, fetchError: null, fetchStatus: null })
    expect(r.status).toBe('success')
    expect(r.httpStatus).toBeNull()
    expect(r.errorMessage).toBeNull()
  })

  it('succès avec webhook 200', () => {
    const r = buildRunResult({
      webhookUrl: 'https://n8n.example.com/hook/1',
      fetchError: null,
      fetchStatus: 200,
    })
    expect(r.status).toBe('success')
    expect(r.httpStatus).toBe(200)
  })

  it('erreur avec webhook 500', () => {
    const r = buildRunResult({
      webhookUrl: 'https://n8n.example.com/hook/1',
      fetchError: null,
      fetchStatus: 500,
    })
    expect(r.status).toBe('error')
    expect(r.httpStatus).toBe(500)
    expect(r.errorMessage).toBe('HTTP 500')
  })

  it('erreur avec webhook 404', () => {
    const r = buildRunResult({
      webhookUrl: 'https://n8n.example.com/hook/1',
      fetchError: null,
      fetchStatus: 404,
    })
    expect(r.status).toBe('error')
    expect(r.errorMessage).toBe('HTTP 404')
  })

  it('timeout si fetchError.name === TimeoutError', () => {
    const err = new Error('signal timed out')
    err.name = 'TimeoutError'
    const r = buildRunResult({
      webhookUrl: 'https://n8n.example.com/hook/1',
      fetchError: err,
      fetchStatus: null,
    })
    expect(r.status).toBe('timeout')
    expect(r.errorMessage).toBe('Webhook timeout (8s)')
  })

  it('erreur si fetch rejette pour autre raison', () => {
    const err = new Error('ECONNREFUSED')
    const r = buildRunResult({
      webhookUrl: 'https://n8n.example.com/hook/1',
      fetchError: err,
      fetchStatus: null,
    })
    expect(r.status).toBe('error')
    expect(r.errorMessage).toBe('Webhook injoignable')
  })
})
