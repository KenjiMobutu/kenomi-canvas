'use client'
import { useCallback, useRef } from 'react'

export interface StreamChatOptions {
  onToken: (token: string, fullContent: string) => void
  onDone: () => void
  onError: (message: string) => void
}

export function useStreamChat({ onToken, onDone, onError }: StreamChatOptions) {
  const abortRef = useRef<AbortController | null>(null)

  const streamChat = useCallback(
    async (conversationId: string, message: string, agentId?: string) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      let full = ''
      let aborted = false

      try {
        const res = await fetch('/api/studio/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, message, agentId }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          onError('Erreur chat')
          onDone()
          return
        }

        const reader = res.body.getReader()
        const dec = new TextDecoder()

        let streamDone = false
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = dec.decode(value, { stream: true })
          for (const line of chunk.split('\n')) {
            const t = line.trim()
            if (!t.startsWith('data: ')) continue
            const raw = t.slice(6)
            if (raw === '[DONE]') {
              streamDone = true
              break
            }
            try {
              const token = JSON.parse(raw) as string
              full += token
              onToken(token, full)
            } catch {
              // ligne non-JSON — ignorer
            }
          }
          if (streamDone) break
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          aborted = true
        } else {
          onError((e as Error).message)
        }
      }

      if (!aborted) onDone()
    },
    [onToken, onDone, onError]
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { streamChat, abort }
}
