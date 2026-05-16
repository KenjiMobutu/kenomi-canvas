export type RunStatus = 'success' | 'error' | 'timeout'

export interface RunResult {
  status: RunStatus
  httpStatus: number | null
  errorMessage: string | null
}

export function buildRunResult(opts: {
  webhookUrl: string | null
  fetchError: Error | null
  fetchStatus: number | null
}): RunResult {
  const { webhookUrl, fetchError, fetchStatus } = opts

  if (!webhookUrl) {
    return { status: 'success', httpStatus: null, errorMessage: null }
  }

  if (fetchError) {
    const isTimeout = fetchError.name === 'TimeoutError'
    return {
      status: isTimeout ? 'timeout' : 'error',
      httpStatus: null,
      errorMessage: isTimeout ? 'Webhook timeout (8s)' : 'Webhook injoignable',
    }
  }

  if (fetchStatus !== null && fetchStatus >= 400) {
    return {
      status: 'error',
      httpStatus: fetchStatus,
      errorMessage: `HTTP ${fetchStatus}`,
    }
  }

  return { status: 'success', httpStatus: fetchStatus, errorMessage: null }
}
