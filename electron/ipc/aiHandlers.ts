import { ipcMain } from 'electron'
import {
  buildCardGenerationPrompt,
  buildEvaluationPrompt,
  buildFormatMathEquationsPrompt,
  parseCardGenerationResponse,
  parseEvaluationResponse
} from '../../src/lib/promptBuilders'
import {
  getApiKey,
  getAIConfig,
  saveAIConfig,
  saveApiKey,
  testAIConnection,
  normalizeBaseUrl,
  isLocalEndpoint,
  isMaskedKey,
  sanitizeApiKey,
  DEFAULT_MODEL,
  getMultiKeyVault,
  saveMultiKeyVault,
  getStoredKey
} from './aiConfigStore'

/** Default request timeout. Card generation/evaluation can be slow, so be generous. */
const DEFAULT_TIMEOUT_MS = 120_000
/** Initial connection timeout for streaming. DeepSeek can take 15–40 s on first token. */
const CONNECT_TIMEOUT_MS = 120_000

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

    // OpenAI-compatible API (DeepSeek, OpenAI, Ollama, etc.)
    const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.deepseek.com')
    let model = config.model || DEFAULT_MODEL
    if (baseUrl.includes('deepseek.com') && (model === 'deepseek-flash' || !model)) {
      model = 'deepseek-chat'
    }
    const url = `${baseUrl}/v1/chat/completions`
    const isLocal = isLocalEndpoint(baseUrl)
    const authKey = config.apiKey || (isLocal ? 'ollama' : '')

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (authKey) {
      headers['Authorization'] = `Bearer ${authKey}`
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
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
    if (isLocalEndpoint(config.baseUrl)) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed')) {
        throw new Error(
          `Could not connect to local AI server at ${config.baseUrl}. Make sure your local model runner is active (e.g. run "ollama run ${config.model || 'qwen2.5:3b'}" in Terminal).`
        )
      }
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

  // ── Format math / LaTeX in text ─────────────────────────────────────────────

  ipcMain.handle('ai:formatMathEquations', async (_event, text: string) => {
    if (!text || !text.trim()) {
      return { success: true, text: '' }
    }
    const config = getAIConfig()
    const apiKey = getApiKey()
    const isLocal = isLocalEndpoint(config.baseUrl)
    if (!apiKey && !isLocal) {
      return { success: false, error: 'AI API key not configured. Go to Settings to configure your AI provider.' }
    }

    try {
      const prompt = buildFormatMathEquationsPrompt(text)
      let formattedText: string
      if (config.provider === 'gemini') {
        formattedText = await callAI(prompt, { ...config, apiKey })
      } else {
        formattedText = await callAIMessages(
          [{ role: 'user', content: prompt }],
          { ...config, apiKey }
        )
      }

      // Strip accidental wrapping markdown code fences
      let cleaned = (formattedText || '').trim()
      if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
        const lines = cleaned.split('\n')
        if (lines.length >= 2) {
          cleaned = lines.slice(1, -1).join('\n').trim()
        }
      }

      return { success: true, text: cleaned }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to format math equations'
      }
    }
  })

  // ── Get AI config ───────────────────────────────────────────────────────────

  ipcMain.handle('ai:getConfig', () => {
    const config = getAIConfig()
    const apiKey = getApiKey()
    const hasKey = Boolean(apiKey && apiKey.length > 0 && apiKey !== 'ollama' && !isMaskedKey(apiKey))

    // Mask the API key for display (same masking as old gemini:getApiKey)
    let maskedKey = apiKey || ''
    if (isLocalEndpoint(config.baseUrl) && maskedKey === 'ollama') {
      maskedKey = ''
    } else if (maskedKey.length > 8) {
      maskedKey = maskedKey.substring(0, 8) + '...' + maskedKey.substring(maskedKey.length - 4)
    }

    return {
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: maskedKey,
      hasApiKey: hasKey
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
        apiKey?: string
      }
    ) => {
      saveAIConfig({ provider: config.provider, baseUrl: config.baseUrl, model: config.model })
      const sanitized = sanitizeApiKey(config.apiKey)
      if (sanitized && !isMaskedKey(sanitized)) {
        saveApiKey(sanitized)
      }
      return { success: true }
    }
  )

  // ── Test AI connection ──────────────────────────────────────────────────────

  ipcMain.handle(
    'ai:testConnection',
    async (
      _event,
      overrideConfig?: {
        provider?: string
        baseUrl?: string
        model?: string
        apiKey?: string
      }
    ) => {
      const savedConfig = getAIConfig()
      const savedApiKey = getApiKey()
      const provider = overrideConfig?.provider || savedConfig.provider
      const baseUrl = overrideConfig?.baseUrl || savedConfig.baseUrl
      const model = overrideConfig?.model || savedConfig.model
      const isLocal = isLocalEndpoint(baseUrl)

      const sanitizedOverride = sanitizeApiKey(overrideConfig?.apiKey)
      let apiKey = sanitizedOverride
      if (!apiKey || isMaskedKey(apiKey)) {
        apiKey = savedApiKey
      }

      if (!apiKey && !isLocal) {
        return { success: false, message: 'No API key configured. Save your API key first.' }
      }

      const result = await testAIConnection({
        provider,
        baseUrl,
        model,
        apiKey: apiKey || (isLocal ? 'ollama' : '')
      })

      // If the user entered an explicit valid key and the connection test succeeds, auto-save it!
      if (result.success && sanitizedOverride && !isMaskedKey(sanitizedOverride)) {
        saveAIConfig({ provider, baseUrl, model })
        saveApiKey(sanitizedOverride)
      }

      return result
    }
  )

  // ── Multi-Key Vault ──────────────────────────────────────────────────────────

  ipcMain.handle('ai:getMultiKeyVault', async () => {
    return getMultiKeyVault()
  })

  ipcMain.handle('ai:saveMultiKeyVault', async (_event, updates: Parameters<typeof saveMultiKeyVault>[0]) => {
    saveMultiKeyVault(updates)
    return { success: true }
  })

  ipcMain.handle(
    'ai:testSingleKey',
    async (_event, provider: 'gemini' | 'openai' | 'deepseek' | 'groq', keyVal?: string) => {
      const keyToTest = keyVal && !isMaskedKey(keyVal) ? sanitizeApiKey(keyVal) : getStoredKey(provider)
      if (!keyToTest) {
        return { success: false, message: 'No API key provided to test.' }
      }

      if (provider === 'gemini') {
        return testAIConnection({
          provider: 'gemini',
          baseUrl: 'https://generativelanguage.googleapis.com',
          model: 'gemini-2.0-flash',
          apiKey: keyToTest
        })
      }

      if (provider === 'openai') {
        return testAIConnection({
          provider: 'openai',
          baseUrl: 'https://api.openai.com',
          model: 'gpt-4o-mini',
          apiKey: keyToTest
        })
      }

      if (provider === 'deepseek') {
        return testAIConnection({
          provider: 'openai-compatible',
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-flash',
          apiKey: keyToTest
        })
      }

      if (provider === 'groq') {
        return testAIConnection({
          provider: 'openai-compatible',
          baseUrl: 'https://api.groq.com/openai',
          model: 'llama-3.3-70b-versatile',
          apiKey: keyToTest
        })
      }

      return { success: false, message: 'Unknown provider' }
    }
  )
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
  // Support Gemini provider
  if (config.provider === 'gemini') {
    const prompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    const fullText = await callAI(prompt, config)
    const chunks = fullText.match(/.{1,40}(\s+|$)/gs) || [fullText]
    for (const chunk of chunks) {
      yield chunk
    }
    return
  }

  // OpenAI-compatible format
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.deepseek.com')
  let model = config.model || DEFAULT_MODEL
  if (baseUrl.includes('deepseek.com') && (model === 'deepseek-flash' || !model)) {
    model = 'deepseek-chat'
  }
  const url = `${baseUrl}/v1/chat/completions`
  const isLocal = isLocalEndpoint(baseUrl)
  const authKey = config.apiKey || (isLocal ? 'ollama' : '')

  // Bound initial connect time to 45 seconds so hangs are caught quickly
  const connectController = new AbortController()
  let connectTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    connectController.abort()
  }, CONNECT_TIMEOUT_MS)

  const onCallerAbort = (): void => connectController.abort()
  if (signal) {
    signal.addEventListener('abort', onCallerAbort)
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream'
  }
  if (authKey) {
    headers['Authorization'] = `Bearer ${authKey}`
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: 4096,
        temperature: 0.7
      }),
      signal: connectController.signal
    })
  } catch (fetchErr) {
    if (connectController.signal.aborted) {
      if (signal?.aborted) {
        throw new Error('AI request was cancelled.')
      }
      throw new Error(`AI request timed out while connecting to ${baseUrl}. Check your connection or provider settings.`)
    }
    throw fetchErr
  } finally {
    if (connectTimer) {
      clearTimeout(connectTimer)
      connectTimer = undefined
    }
    if (signal) {
      signal.removeEventListener('abort', onCallerAbort)
    }
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    if (response.status === 401) {
      throw new Error(`Authentication failed (401). Your API key is invalid or expired. Please update your API key in Settings.`)
    }
    if (response.status === 429) {
      throw new Error(`Rate limit or quota exceeded (429). Please check your account balance or try again shortly.`)
    }
    throw new Error(`AI API error ${response.status}: ${errorBody.substring(0, 200) || response.statusText}`)
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
 * Supports both OpenAI-compatible providers (DeepSeek, OpenAI, Ollama) and Google Gemini.
 * Optionally accepts a response_format parameter (e.g. { type: 'json_object' }).
 */
export async function callAIMessages(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  config: { provider: string; baseUrl: string; model: string; apiKey: string },
  responseFormat?: { type: 'json_object' | 'text' }
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    if (config.provider === 'gemini') {
      const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com'
      const model = config.model || 'gemini-2.0-flash'
      const url = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`

      // Extract system instructions if present
      const systemMessages = messages.filter(m => m.role === 'system')
      const chatMessages = messages.filter(m => m.role !== 'system')

      // Consolidate consecutive turns with the same role for Gemini alternating turns requirement
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []
      for (const m of chatMessages) {
        const geminiRole = m.role === 'assistant' ? 'model' : 'user'
        const lastContent = contents[contents.length - 1]
        if (lastContent && lastContent.role === geminiRole) {
          lastContent.parts[0].text += `\n\n${m.content}`
        } else {
          contents.push({
            role: geminiRole,
            parts: [{ text: m.content }]
          })
        }
      }

      // If all messages were system messages, create at least one user turn
      if (contents.length === 0 && systemMessages.length > 0) {
        contents.push({
          role: 'user',
          parts: [{ text: systemMessages.map(m => m.content).join('\n\n') }]
        })
      }

      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192
        }
      }

      if (systemMessages.length > 0 && contents.length > 0 && contents[0].parts[0].text !== systemMessages.map(m => m.content).join('\n\n')) {
        body.systemInstruction = {
          parts: [{ text: systemMessages.map(m => m.content).join('\n\n') }]
        }
      }

      if (responseFormat?.type === 'json_object') {
        (body.generationConfig as Record<string, unknown>).responseMimeType = 'application/json'
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.apiKey
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gemini API error (${response.status}): ${errorText.substring(0, 500)}`)
      }

      const data = await response.json()
      const candidate = data.candidates?.[0]
      if (!candidate) {
        if (data.promptFeedback?.blockReason) {
          throw new Error(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`)
        }
        throw new Error('Gemini API returned no candidates')
      }

      const text = candidate.content?.parts?.[0]?.text
      if (typeof text !== 'string') {
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
          throw new Error(`Gemini generation ended with status: ${candidate.finishReason}`)
        }
        throw new Error('Gemini API returned unexpected response structure')
      }
      return text
    }

    const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.deepseek.com')
    let model = config.model || DEFAULT_MODEL
    if (baseUrl.includes('deepseek.com') && (model === 'deepseek-flash' || !model)) {
      model = 'deepseek-chat'
    }
    const url = `${baseUrl}/v1/chat/completions`
    const isLocal = isLocalEndpoint(baseUrl)
    const authKey = config.apiKey || (isLocal ? 'ollama' : '')

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: 8192,
      temperature: 0.7
    }
    if (responseFormat) {
      body.response_format = responseFormat
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (authKey) {
      headers['Authorization'] = `Bearer ${authKey}`
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
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
    if (isLocalEndpoint(config.baseUrl)) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed')) {
        throw new Error(
          `Could not connect to local AI server at ${config.baseUrl}. Make sure your local model runner is active (e.g. run "ollama run ${config.model || 'qwen2.5:3b'}" in Terminal).`
        )
      }
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
