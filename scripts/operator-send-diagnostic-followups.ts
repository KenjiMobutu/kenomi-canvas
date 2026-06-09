import { createClient } from '@supabase/supabase-js'
import { processDueProspectFollowUps } from '@/lib/prospect/scheduled-follow-ups'
import { resolveHumanApproval } from '@/lib/autonomy/approval-executor'

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} missing`)
  return value
}

async function main() {
  const supabase = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  )
  const userId = requiredEnv('TARGET_USER_ID')
  const cutoff = process.env.FOLLOWUP_COHORT_CUTOFF?.trim() || '2026-06-08T19:00:00.000Z'
  const nowIso = new Date().toISOString()

  const { data: prospects, error: prospectsError } = await supabase
    .from('prospects')
    .select('id, company_name, contact_email, status, pipeline_status, created_at')
    .eq('user_id', userId)
    .eq('status', 'sent')
    .gte('created_at', cutoff)
    .not('contact_email', 'is', null)
    .order('created_at', { ascending: true })

  if (prospectsError) throw prospectsError

  const prospectIds = (prospects ?? []).map((row) => row.id)
  if (!prospectIds.length) {
    console.log(JSON.stringify({ updated: 0, generated: 0, approved: 0, sent: 0 }, null, 2))
    return
  }

  const { error: updateError } = await supabase
    .from('prospects')
    .update({ next_followup_at: new Date(Date.now() - 60_000).toISOString() })
    .in('id', prospectIds)

  if (updateError) throw updateError

  const generated = await processDueProspectFollowUps({
    supabase: supabase as unknown as any,
    userId,
    nowIso,
  })

  const { data: approvals, error: approvalsError } = await supabase
    .from('human_approvals')
    .select('id, action_id, status, created_at, autonomy_actions!inner(id, action_type, input)')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('autonomy_actions.action_type', 'send_follow_up')
    .order('created_at', { ascending: false })

  if (approvalsError) throw approvalsError

  let approved = 0
  for (const approval of approvals ?? []) {
    const action = Array.isArray((approval as any).autonomy_actions)
      ? (approval as any).autonomy_actions[0]
      : (approval as any).autonomy_actions
    const prospectId = action?.input?.prospect_id
    if (!prospectIds.includes(prospectId)) continue

    await resolveHumanApproval({
      supabase: supabase as unknown as any,
      userId,
      approvalId: approval.id,
      decision: 'approved',
    })
    approved += 1
  }

  const { data: sentDrafts, error: draftsError } = await supabase
    .from('campaign_drafts')
    .select('id, status, metadata, created_at')
    .gte('created_at', cutoff)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(20)

  if (draftsError) throw draftsError

  const followUps = (sentDrafts ?? []).filter(
    (row: any) => row.metadata?.outreachKind && row.metadata?.provider === 'smtp'
  )

  console.log(
    JSON.stringify(
      {
        updated: prospectIds.length,
        generated,
        approved,
        followUpsSent: followUps.length,
        followUps: followUps.slice(0, 12).map((row: any) => ({
          id: row.id,
          to: row.metadata?.to,
          outreachKind: row.metadata?.outreachKind,
          deliveryStatus: row.metadata?.delivery_status,
        })),
      },
      null,
      2
    )
  )
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
