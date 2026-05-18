import { register } from '@/lib/metrics/prometheus'

export async function GET(req: Request): Promise<Response> {
  const token = process.env.METRICS_TOKEN
  if (token) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${token}`) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const metrics = await register.metrics()
  return new Response(metrics, {
    headers: { 'Content-Type': register.contentType },
  })
}
