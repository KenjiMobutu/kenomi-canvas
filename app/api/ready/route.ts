export async function GET() {
  return Response.json(
    {
      status: 'ready',
      runtime: {
        sourceCommit: process.env.SOURCE_COMMIT ?? 'unknown',
        nodeEnv: process.env.NODE_ENV ?? 'unknown',
      },
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  )
}
