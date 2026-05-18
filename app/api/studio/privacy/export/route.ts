import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import { collectPrivacyQueryErrors, redactPrivacyExport } from '@/lib/privacy-export'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const results = {
    settings: await supabase
      .from('user_settings')
      .select('openai_api_key, claude_api_key, stripe_secret_key, stripe_webhook_secret, ollama_base_url, ollama_model, n8n_base_url, created_at, updated_at')
      .eq('user_id', user!.id)
      .maybeSingle(),
    ventures: await supabase
      .from('ventures')
      .select('id, name, niche, stage, score, mrr, cac, conversion, next_action, insight, created_at')
      .eq('user_id', user!.id),
    conversations: await supabase
      .from('conversations')
      .select('id, title, agent_id, created_at, updated_at')
      .eq('user_id', user!.id),
    messages: await supabase
      .from('messages')
      .select('id, conversation_id, role, content, created_at')
      .eq('user_id', user!.id),
    documents: await supabase
      .from('documents')
      .select('id, name, mime_type, size_bytes, created_at')
      .eq('user_id', user!.id),
    automations: await supabase
      .from('automation_workflows')
      .select('id, name, trigger_type, enabled, run_count, last_run_at, created_at')
      .eq('user_id', user!.id),
    automation_runs: await supabase
      .from('automation_runs')
      .select('id, workflow_id, status, http_status, duration_ms, triggered_at')
      .eq('user_id', user!.id),
    agent_runs: await supabase
      .from('agent_runs')
      .select('id, agent_id, model, duration_ms, created_at')
      .eq('user_id', user!.id),
    agent_events: await supabase
      .from('agent_events')
      .select('id, agent_id, event_type, severity, metadata, created_at')
      .eq('user_id', user!.id),
  }

  const errors = collectPrivacyQueryErrors(results)

  return NextResponse.json(redactPrivacyExport({
    exported_at: new Date().toISOString(),
    user: { id: user!.id, email: user!.email },
    export_errors: errors,
    settings: results.settings.data,
    ventures: results.ventures.data ?? [],
    conversations: results.conversations.data ?? [],
    messages: results.messages.data ?? [],
    documents: results.documents.data ?? [],
    automations: results.automations.data ?? [],
    automation_runs: results.automation_runs.data ?? [],
    agent_runs: results.agent_runs.data ?? [],
    agent_events: results.agent_events.data ?? [],
  }))
}
