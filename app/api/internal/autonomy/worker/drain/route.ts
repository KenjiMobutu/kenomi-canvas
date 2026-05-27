import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { processQueuedAutonomyJobs, type AutonomyJobRunnerSupabase } from '@/lib/autonomy/job-runner'
import { runAgentStep, type RunAgentStepSupabase } from '@/lib/autonomy/run-agent-step'
import {
  markBusinessScheduleCompleted,
  type BusinessScheduleKey,
  type BusinessScheduleSupabase,
} from '@/lib/autonomy/scheduler'
import { processDueProspectFollowUps } from '@/lib/prospect/scheduled-follow-ups'
import { supabaseAdmin } from '@/lib/supabase-admin'

const workerDrainSchema = z.object({
  worker_id: z.string().trim().min(1),
  limit: z.number().int().min(1).max(10).optional(),
  allowed_job_kinds: z.array(z.string().trim().min(1)).min(1).max(10).optional(),
})

function isWorkerAuthorized(request: NextRequest): boolean {
  const secret = process.env.AUTONOMY_WORKER_SECRET
  if (!secret) return false
  return request.headers.get('x-autonomy-worker-token') === secret
}

export async function POST(request: NextRequest) {
  if (!isWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized worker' }, { status: 401 })
  }

  const parsed = workerDrainSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload worker invalide' }, { status: 400 })
  }

  const processed = await processQueuedAutonomyJobs({
    supabase: supabaseAdmin as unknown as AutonomyJobRunnerSupabase,
    now: new Date(),
    limit: parsed.data.limit ?? 1,
    workerId: parsed.data.worker_id,
    allowedJobKinds: parsed.data.allowed_job_kinds ?? ['run_agent', 'follow_up_scan'],
    runAgentStep: (input) =>
      runAgentStep({
        supabase: input.supabase as RunAgentStepSupabase,
        userId: input.userId,
        agentId: input.agentId,
        ventureId: input.ventureId,
        prompt: input.prompt,
      }),
    runFollowUpScan: ({ supabase, userId, nowIso }) =>
      processDueProspectFollowUps({
        supabase: supabase as Parameters<typeof processDueProspectFollowUps>[0]['supabase'],
        userId,
        nowIso,
      }),
    onJobCompleted: async ({ supabase, job, now }) => {
      const scheduleKey = job.payload?.scheduleKey
      if (
        scheduleKey === 'scout' ||
        scheduleKey === 'prospect' ||
        scheduleKey === 'follow_ups' ||
        scheduleKey === 'devops'
      ) {
        await markBusinessScheduleCompleted({
          supabase: supabase as unknown as BusinessScheduleSupabase,
          userId: job.user_id,
          scheduleKey: scheduleKey as BusinessScheduleKey,
          now,
        })
      }
    },
  })

  return NextResponse.json({
    ok: true,
    mode: 'worker',
    workerId: parsed.data.worker_id,
    processed: processed.map((item) => ({
      jobId: item.job.id,
      status: item.job.status,
      result: item.result,
    })),
  })
}
