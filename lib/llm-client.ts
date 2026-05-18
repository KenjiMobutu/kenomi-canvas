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

// ─── Types ────────────────────────────────────────────────────────────────────

export type LLMMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type LLMConfig = {
  model?: string
  temperature?: number
  max_tokens?: number
  system?: string
  timeout_ms?: number
}

export type LLMResponse = {
  content: string
  provider: 'ollama' | 'claude'
  model: string
  fallback_triggered: boolean
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://192.168.0.14:11434'
const OLLAMA_DEFAULT_MODEL = process.env.OLLAMA_DEFAULT_MODEL ?? 'qwen3:8b'
const CLAUDE_FALLBACK_MODEL = process.env.CLAUDE_FALLBACK_MODEL ?? 'claude-sonnet-4-5'
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS ?? '30000', 10)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildOllamaMessages(messages: LLMMessage[], system?: string): LLMMessage[] {
  if (!system) return messages
  return [{ role: 'user', content: `[System: ${system}]` }, ...messages]
}

async function callOllama(messages: LLMMessage[], config: LLMConfig): Promise<string> {
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

    return content
  } finally {
    clearTimeout(timer)
  }
}

async function callClaude(messages: LLMMessage[], config: LLMConfig): Promise<string> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: CLAUDE_FALLBACK_MODEL,
    max_tokens: config.max_tokens ?? 2048,
    system: config.system,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  })

  const block = response.content[0]
  if (block.type !== 'text') {
    throw new Error('Claude: bloc de contenu inattendu')
  }

  return block.text
}

// ─── Vérification santé Ollama ────────────────────────────────────────────────

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
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

  // Tentative Ollama
  try {
    const content = await callOllama(messages, config)
    return {
      content,
      provider: 'ollama',
      model,
      fallback_triggered: false,
    }
  } catch (ollamaError) {
    const reason = ollamaError instanceof Error ? ollamaError.message : String(ollamaError)

    // Log structuré pour monitoring
    console.warn(
      JSON.stringify({
        event: 'llm_fallback_triggered',
        reason,
        ollama_url: OLLAMA_BASE_URL,
        fallback_model: CLAUDE_FALLBACK_MODEL,
        timestamp: new Date().toISOString(),
      })
    )

    // Fallback Claude API
    try {
      const content = await callClaude(messages, config)
      return {
        content,
        provider: 'claude',
        model: CLAUDE_FALLBACK_MODEL,
        fallback_triggered: true,
      }
    } catch (claudeError) {
      const claudeReason = claudeError instanceof Error ? claudeError.message : String(claudeError)
      throw new Error(`LLM indisponible — Ollama: ${reason} | Claude: ${claudeReason}`)
    }
  }
}
