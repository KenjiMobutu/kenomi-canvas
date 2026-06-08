/**
 * lib/llm-client.ts
 * Client LLM unifié — Ollama (primaire) → Claude API (fallback)
 *
 * Comportement :
 *  1. Tente Ollama sur 192.168.0.14:11434
 *  2. Si timeout (30s) ou erreur réseau → bascule sur Claude API
 *  3. Log le fallback pour monitoring
 */

import Anthropic from '@anthropic-ai/sdk'
import { logWarn } from './logger'
import { getModelFamily, HERMES_MODELS } from './model-families'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LLMMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type LLMConfig = {
  model?: string
  temperature?: number
  max_tokens?: number
  system?: string
  timeout_ms?: number
}

export type LLMUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export type LLMResponse = {
  content: string
  provider: 'hermes' | 'ollama' | 'claude'
  model: string
  fallback_triggered: boolean
  usage?: LLMUsage
}

const PRICING_PER_1K_TOKENS_USD: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5': { input: 0.003, output: 0.015 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5-20251001': { input: 0.0008, output: 0.004 },
  'qwen3:8b': { input: 0, output: 0 },
  'qwen3:14b': { input: 0, output: 0 },
  'llama3.1:8b': { input: 0, output: 0 },
  'mistral:7b': { input: 0, output: 0 },
  'codestral:latest': { input: 0, output: 0 },
}

for (const model of HERMES_MODELS) {
  PRICING_PER_1K_TOKENS_USD[model] = { input: 0, output: 0 }
}

export function computeCostUsd(model: string, usage: LLMUsage): number {
  const p = PRICING_PER_1K_TOKENS_USD[model]
  if (!p) return 0
  return (usage.prompt_tokens * p.input + usage.completion_tokens * p.output) / 1000
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://192.168.0.14:11434'
const OLLAMA_DEFAULT_MODEL = process.env.OLLAMA_DEFAULT_MODEL ?? 'qwen3:8b'
const HERMES_AGENT_BASE_URL = (process.env.HERMES_AGENT_URL ?? '').replace(/\/+$/, '')
const HERMES_AGENT_API_KEY = process.env.HERMES_AGENT_API_KEY ?? ''
const HERMES_DEFAULT_MODEL = process.env.HERMES_DEFAULT_MODEL ?? 'hermes3:8b'
const CLAUDE_FALLBACK_MODEL = process.env.CLAUDE_FALLBACK_MODEL ?? 'claude-sonnet-4-5'
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS ?? '30000', 10)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildOllamaMessages(messages: LLMMessage[], system?: string): LLMMessage[] {
  if (!system) return messages
  return [{ role: 'user', content: `[System: ${system}]` }, ...messages]
}

function buildHermesMessages(messages: LLMMessage[], system?: string): LLMMessage[] {
  if (!system) return messages
  return [{ role: 'system', content: system }, ...messages]
}

function ollamaTagsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return trimmed.endsWith('/api/tags') ? trimmed : `${trimmed}/api/tags`
}

function isMissingOllamaModelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Ollama HTTP 404') && message.toLowerCase().includes('not found')
}

function pickAvailableOllamaModel(requestedModel: string, availableModels: string[]): string | null {
  const unique = Array.from(new Set(availableModels.filter((model) => model.trim().length > 0)))
  if (unique.length === 0) return null

  const requestedFamily = requestedModel.split(':')[0]?.trim().toLowerCase() ?? ''
  const preferredCandidates = [
    `${requestedFamily}:14b`,
    `${requestedFamily}:8b`,
    `${requestedFamily}:4b`,
    'qwen3:14b',
    'qwen3:8b',
    'qwen3:4b',
    'hermes3:8b',
    'hermes3:latest',
  ].filter((candidate) => candidate !== requestedModel)

  for (const candidate of preferredCandidates) {
    if (unique.includes(candidate)) return candidate
  }

  return unique.find((model) => model !== requestedModel) ?? null
}

async function readAvailableOllamaModels(baseUrl = OLLAMA_BASE_URL): Promise<string[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)

  try {
    const res = await fetch(ollamaTagsUrl(baseUrl), {
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Ollama tags HTTP ${res.status}: ${await res.text()}`)
    }

    const data = (await res.json()) as { models?: Array<{ name?: string | null }> }
    return Array.isArray(data.models)
      ? data.models
          .map((entry) => (typeof entry?.name === 'string' ? entry.name : ''))
          .filter((name) => name.length > 0)
      : []
  } finally {
    clearTimeout(timer)
  }
}

async function callOllamaResilient(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<{ content: string; usage?: LLMUsage; model: string; fallbackTriggered: boolean }> {
  const requestedModel = config.model ?? OLLAMA_DEFAULT_MODEL

  try {
    const result = await callOllama(messages, config)
    return {
      ...result,
      model: requestedModel,
      fallbackTriggered: false,
    }
  } catch (error) {
    if (!isMissingOllamaModelError(error)) throw error

    const availableModels = await readAvailableOllamaModels()
    const fallbackModel = pickAvailableOllamaModel(requestedModel, availableModels)
    if (!fallbackModel) throw error

    const result = await callOllama(messages, { ...config, model: fallbackModel })
    return {
      ...result,
      model: fallbackModel,
      fallbackTriggered: true,
    }
  }
}

async function callOllama(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<{ content: string; usage?: LLMUsage }> {
  const model = config.model ?? OLLAMA_DEFAULT_MODEL
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeout_ms ?? OLLAMA_TIMEOUT_MS)

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: buildOllamaMessages(messages, config.system),
        stream: false,
        think: false,
        options: {
          temperature: config.temperature ?? 0.7,
          num_predict: config.max_tokens ?? 2048,
        },
      }),
    })

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`)
    }

    const data = await res.json()
    const content = data?.message?.content

    if (!content || typeof content !== 'string') {
      throw new Error('Ollama: réponse vide ou malformée')
    }

    const promptTokens =
      typeof data?.prompt_eval_count === 'number' ? data.prompt_eval_count : undefined
    const completionTokens = typeof data?.eval_count === 'number' ? data.eval_count : undefined
    const usage =
      promptTokens !== undefined && completionTokens !== undefined
        ? {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          }
        : undefined

    return { content, usage }
  } finally {
    clearTimeout(timer)
  }
}

async function callHermesAgent(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<{ content: string; usage?: LLMUsage }> {
  if (!HERMES_AGENT_BASE_URL) {
    throw new Error('Hermes Agent URL missing')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeout_ms ?? OLLAMA_TIMEOUT_MS)

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (HERMES_AGENT_API_KEY) {
      headers.Authorization = `Bearer ${HERMES_AGENT_API_KEY}`
    }

    const res = await fetch(`${HERMES_AGENT_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: 'hermes-agent',
        messages: buildHermesMessages(messages, config.system),
        stream: false,
        temperature: config.temperature ?? 0.7,
        max_tokens: config.max_tokens ?? 2048,
      }),
    })

    if (!res.ok) {
      throw new Error(`Hermes Agent HTTP ${res.status}: ${await res.text()}`)
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content

    if (!content || typeof content !== 'string') {
      throw new Error('Hermes Agent: réponse vide ou malformée')
    }

    const promptTokens = typeof data?.usage?.prompt_tokens === 'number' ? data.usage.prompt_tokens : undefined
    const completionTokens =
      typeof data?.usage?.completion_tokens === 'number' ? data.usage.completion_tokens : undefined
    const usage =
      promptTokens !== undefined && completionTokens !== undefined
        ? {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens:
              typeof data?.usage?.total_tokens === 'number'
                ? data.usage.total_tokens
                : promptTokens + completionTokens,
          }
        : undefined

    return { content, usage }
  } finally {
    clearTimeout(timer)
  }
}

async function callClaude(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<{ content: string; usage?: LLMUsage }> {
  const client = new Anthropic()
  const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }> = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }))

  const response = await client.messages.create({
    model: CLAUDE_FALLBACK_MODEL,
    max_tokens: config.max_tokens ?? 2048,
    system: config.system,
    messages: anthropicMessages,
  })

  const block = response.content[0]
  if (block.type !== 'text') {
    throw new Error('Claude: bloc de contenu inattendu')
  }

  const usage = response.usage
    ? {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      }
    : undefined

  return { content: block.text, usage }
}

// ─── Vérification santé Ollama ────────────────────────────────────────────────

export async function checkOllamaHealth(baseUrl = OLLAMA_BASE_URL): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(ollamaTagsUrl(baseUrl), {
      signal: controller.signal,
    })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

// ─── Client principal ─────────────────────────────────────────────────────────

export async function llmChat(
  messages: LLMMessage[],
  config: LLMConfig = {}
): Promise<LLMResponse> {
  const model = config.model ?? OLLAMA_DEFAULT_MODEL
  const modelFamily = getModelFamily(model)
  const useHermesAgent = modelFamily === 'hermes' && Boolean(HERMES_AGENT_BASE_URL)

  try {
    if (useHermesAgent) {
      const result = await callHermesAgent(messages, config)
      return {
        content: result.content,
        provider: 'hermes' as const,
        model,
        fallback_triggered: false,
        usage: result.usage,
      }
    }

    const result = await callOllamaResilient(messages, config)
    return {
      content: result.content,
      provider: 'ollama' as const,
      model: result.model,
      fallback_triggered: result.fallbackTriggered,
      usage: result.usage,
    }
  } catch (primaryError) {
    const reason = primaryError instanceof Error ? primaryError.message : String(primaryError)

    logWarn('llm.fallback', 'Primary LLM unavailable, trying fallback chain', {
      event: 'llm_fallback_triggered',
      reason,
      primary_provider: useHermesAgent ? 'hermes' : 'ollama',
      primary_url: useHermesAgent ? HERMES_AGENT_BASE_URL : OLLAMA_BASE_URL,
      fallback_model: CLAUDE_FALLBACK_MODEL,
      model_family: modelFamily,
    })

    if (useHermesAgent) {
      try {
        const ollamaResult = await callOllamaResilient(messages, {
          ...config,
          model: OLLAMA_DEFAULT_MODEL,
        })
        return {
          content: ollamaResult.content,
          provider: 'ollama',
          model: ollamaResult.model,
          fallback_triggered: true,
          usage: ollamaResult.usage,
        }
      } catch (ollamaError) {
        const ollamaReason = ollamaError instanceof Error ? ollamaError.message : String(ollamaError)

        try {
          const result = await callClaude(messages, config)
          return {
            content: result.content,
            provider: 'claude',
            model: CLAUDE_FALLBACK_MODEL,
            fallback_triggered: true,
            usage: result.usage,
          }
        } catch (claudeError) {
          const claudeReason =
            claudeError instanceof Error ? claudeError.message : String(claudeError)
          throw new Error(
            `LLM indisponible — Hermes: ${reason} | Ollama: ${ollamaReason} | Claude: ${claudeReason}`
          )
        }
      }
    }

    if (!useHermesAgent && HERMES_AGENT_BASE_URL) {
      try {
        const hermesResult = await callHermesAgent(messages, config)
        return {
          content: hermesResult.content,
          provider: 'hermes',
          model: HERMES_DEFAULT_MODEL,
          fallback_triggered: true,
          usage: hermesResult.usage,
        }
      } catch (hermesError) {
        const hermesReason = hermesError instanceof Error ? hermesError.message : String(hermesError)

        try {
          const result = await callClaude(messages, config)
          return {
            content: result.content,
            provider: 'claude',
            model: CLAUDE_FALLBACK_MODEL,
            fallback_triggered: true,
            usage: result.usage,
          }
        } catch (claudeError) {
          const claudeReason =
            claudeError instanceof Error ? claudeError.message : String(claudeError)
          throw new Error(
            `LLM indisponible — Ollama: ${reason} | Hermes: ${hermesReason} | Claude: ${claudeReason}`
          )
        }
      }
    }

    try {
      const result = await callClaude(messages, config)
      return {
        content: result.content,
        provider: 'claude',
        model: CLAUDE_FALLBACK_MODEL,
        fallback_triggered: true,
        usage: result.usage,
      }
    } catch (claudeError) {
      const claudeReason = claudeError instanceof Error ? claudeError.message : String(claudeError)
      throw new Error(`LLM indisponible — Ollama: ${reason} | Claude: ${claudeReason}`)
    }
  }
}
