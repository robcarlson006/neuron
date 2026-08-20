import { ipcMain } from 'electron'
import {
  buildCardGenerationPrompt,
  buildEvaluationPrompt,
  parseCardGenerationResponse,
  parseEvaluationResponse
} from '../../src/lib/promptBuilders'
import { getApiKey, getAIConfig, saveAIConfig, saveApiKey, testAIConnection } from './aiConfigStore'

/** Default request timeout. Card generation/evaluation can be slow, so be generous. */
const DEFAULT_TIMEOUT_MS = 120_000
/** Streaming tutor responses can legitimately run longer. */
const STREAM_TIMEOUT_MS = 300_000

/**
 * Call an AI provider with a prompt using raw fetch (no SDK imports).
 * Supports both OpenAI-compatible (DeepSeek) and legacy Gemini APIs.
 * The request is bounded by an AbortController so a hung provider never
 * leaves the UI stuck indefinitely.
 */
async function callAI(
  prompt: string,
  config: { provider: string; baseUrl: string; model: string; apiKey: string }
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    if (config.provider === 'gemini') {
      // Legacy Gemini API
      const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com'
      const model = config.model || 'gemini-2.0-flash'
      const url = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${model}:generateContent`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gemini API error (${response.status}): ${errorText.substring(0, 500)}`)
      }

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (typeof text !== 'string') {
        throw new Error('Gemini API returned unexpected response structure')
      }
      return text
    }

    // OpenAI-compatible API (DeepSeek, OpenAI, etc.)
    const baseUrl = config.baseUrl || 'https://api.deepseek.com'
    const model = config.model || 'deepseek-chat'
    const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        // Structured output: the prompts instruct JSON, and DeepSeek honours
        // json_object mode to reduce the chance of stray prose breaking parsing.
        response_format: { type: 'json_object' },
        temperature: 0.3
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`AI API error (${response.status}): ${errorText.substring(0, 500)}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new Error('AI API returned unexpected response structure')
    }
    return text
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error('AI request timed out. Please check your connection and try again.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Register all AI-related IPC handlers.
 * Replaces the old geminiHandlers registration.
 */
export function registerAIHandlers(): void {
  // ── Generate cards ──────────────────────────────────────────────────────────

  ipcMain.handle(
    'ai:generateCards',
    async (_event, text: string, minCards: number = 10, minQuestions: number = 5) => {
      const config = getAIConfig()
      const apiKey = getApiKey()
      if (!apiKey) {
        throw new Error('AI API key not configured. Go to Settings to configure your AI provider.')
      }

      const prompt = buildCardGenerationPrompt(text, minCards, minQuestions)
      const responseText = await callAI(prompt, { ...config, apiKey })
      return parseCardGenerationResponse(responseText)
    }
  )

  // ── Evaluate answer ─────────────────────────────────────────────────────────

  ipcMain.handle(
    'ai:evaluateAnswer',
    async (_event, question: string, modelAnswer: string, studentAnswer: string) => {
      const config = getAIConfig()
      const apiKey = getApiKey()
      if (!apiKey) {
        throw new Error('AI API key not configured. Go to Settings to configure your AI provider.')
      }

      const prompt = buildEvaluationPrompt(question, modelAnswer, studentAnswer)
      const responseText = await callAI(prompt, { ...config, apiKey })
      return parseEvaluationResponse(responseText)
    }
  )

  // ── Get AI config ───────────────────────────────────────────────────────────

  ipcMain.handle('ai:getConfig', () => {
    const config = getAIConfig()
    const apiKey = getApiKey()

    // Mask the API key for display (same masking as old gemini:getApiKey)
    let maskedKey = apiKey || ''
    if (maskedKey.length > 8) {
      maskedKey = maskedKey.substring(0, 8) + '...' + maskedKey.substring(maskedKey.length - 4)
    }

    return {
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: maskedKey
    }
  })

  // ── Save AI config ──────────────────────────────────────────────────────────

  ipcMain.handle(
    'ai:saveConfig',
    (
      _event,
      config: {
        provider: string
        baseUrl: string
        model: string
        apiKey: string
      }
    ) => {
      saveAIConfig({ provider: config.provider, baseUrl: config.baseUrl, model: config.model })
      if (config.apiKey && config.apiKey.trim().length > 0) {
        saveApiKey(config.apiKey.trim())
      }
      return { success: true }
    }
  )

  // ── Test AI connection ──────────────────────────────────────────────────────

  ipcMain.handle('ai:testConnection', async () => {
    const config = getAIConfig()
    const apiKey = getApiKey()
    if (!apiKey) {
      return { success: false, message: 'No API key configured. Save your API key first.' }
    }

    return testAIConnection({ ...config, apiKey })
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// STREAMING API — async generator for SSE streams (OpenAI-compatible only)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Stream an AI response token-by-token via Server-Sent Events.
 * Only supports OpenAI-compatible providers (DeepSeek, OpenAI, etc.).
 * Returns an AsyncGenerator that yields content strings as they arrive.
 */
export async function* streamAI(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  config: { provider: string; baseUrl: string; model: string; apiKey: string },
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  // Only supports OpenAI-compatible format for streaming
  const baseUrl = config.baseUrl || 'https://api.deepseek.com'
  const model = config.model || 'deepseek-chat'
  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`

  // Fallback timeout so a hung connection is aborted even when the caller
  // does not supply its own cancellation signal.
  let effectiveSignal = signal
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined
  if (!effectiveSignal) {
    const controller = new AbortController()
    fallbackTimer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS)
    effectiveSignal = controller.signal
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: 4096,
      temperature: 0.7
    }),
    signal: effectiveSignal
  })

  if (fallbackTimer) clearTimeout(fallbackTimer)

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(`AI API error ${response.status}: ${errorBody || response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body stream available')

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue

        try {
          const json = JSON.parse(trimmed.slice(6))
          const content = json.choices?.[0]?.delta?.content
          if (content) yield content
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Non-streaming call to an AI provider using a messages array.
 * Supports OpenAI-compatible providers only.
 * Optionally accepts a response_format parameter (e.g. { type: 'json_object' }).
 */
export async function callAIMessages(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  config: { provider: string; baseUrl: string; model: string; apiKey: string },
  responseFormat?: { type: 'json_object' | 'text' }
): Promise<string> {
  const baseUrl = config.baseUrl || 'https://api.deepseek.com'
  const model = config.model || 'deepseek-chat'
  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: 4096,
      temperature: 0.7
    }
    if (responseFormat) {
      body.response_format = responseFormat
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      throw new Error(`AI API error ${response.status}: ${errorBody || response.statusText}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error('AI request timed out. Please try again.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
