import { llmChat, type LLMConfig, type LLMMessage, type LLMResponse } from '@/lib/llm-client'
import { buildHermesOperatorPrompt } from '@/lib/hermes-operator/prompt'
import type { HermesOperatorContextSnapshot, HermesOperatorMode } from '@/lib/hermes-operator/types'

export type HermesOperatorRecommendation = {
  kind: string
  priority: number
  title: string
  detail: string
  actionType: string | null
  riskLevel: string | null
  source: Record<string, unknown>
  payload: Record<string, unknown>
}

export type HermesOperatorAlert = {
  severity: 'info' | 'warn' | 'critical'
  category: string
  dedupeKey: string
  headline: string
  detail: string
  channel: 'studio'
  payload: Record<string, unknown>
}

export type HermesOperatorEngineResult = {
  summary: string
  recommendations: HermesOperatorRecommendation[]
  alerts: HermesOperatorAlert[]
  provider: LLMResponse['provider']
  model: string
  fallbackTriggered: boolean
}

type HermesOperatorLlm = (
  messages: LLMMessage[],
  config: LLMConfig
) => Promise<LLMResponse>

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeSeverity(value: unknown): HermesOperatorAlert['severity'] {
  return value === 'warn' || value === 'critical' ? value : 'info'
}

function parseEngineOutput(content: string): {
  summary: string
  recommendations: HermesOperatorRecommendation[]
  alerts: HermesOperatorAlert[]
} {
  const parsed = JSON.parse(content) as Record<string, unknown>
  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
        .map((item) => {
          const row = readRecord(item)
          return {
            kind: readString(row.kind),
            priority: typeof row.priority === 'number' ? row.priority : 0,
            title: readString(row.title),
            detail: readString(row.detail),
            actionType: readString(row.action_type) || null,
            riskLevel: readString(row.risk_level) || null,
            source: readRecord(row.source),
            payload: readRecord(row.payload),
          }
        })
        .filter((item) => item.kind && item.title && item.detail)
        .slice(0, 5)
    : []

  const alerts = Array.isArray(parsed.alerts)
    ? parsed.alerts
        .map((item) => {
          const row = readRecord(item)
          return {
            severity: normalizeSeverity(row.severity),
            category: readString(row.category),
            dedupeKey: readString(row.dedupe_key),
            headline: readString(row.headline),
            detail: readString(row.detail),
            channel: 'studio' as const,
            payload: readRecord(row.payload),
          }
        })
        .filter((item) => item.category && item.dedupeKey && item.headline && item.detail)
        .slice(0, 5)
    : []

  return {
    summary: readString(parsed.summary, 'No operator summary returned.'),
    recommendations,
    alerts,
  }
}

export async function runHermesOperatorEngine(input: {
  context: HermesOperatorContextSnapshot
  mode: HermesOperatorMode
  llm?: HermesOperatorLlm
}): Promise<HermesOperatorEngineResult> {
  const llm = input.llm ?? llmChat
  const llmResult = await llm(
    [{ role: 'user', content: buildHermesOperatorPrompt({ context: input.context, mode: input.mode }) }],
    {
      model: process.env.HERMES_DEFAULT_MODEL ?? 'hermes3:8b',
      system: 'Return strict JSON only.',
      temperature: 0.1,
      max_tokens: 1200,
    }
  )

  const parsed = parseEngineOutput(llmResult.content)
  return {
    ...parsed,
    provider: llmResult.provider,
    model: llmResult.model,
    fallbackTriggered: llmResult.fallback_triggered,
  }
}
