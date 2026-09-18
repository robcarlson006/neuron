import { safeStorage } from 'electron'
import Database from 'better-sqlite3'

const DEFAULT_PROVIDER = 'openai-compatible'
const DEFAULT_BASE_URL = 'https://api.deepseek.com'
// DeepSeek retired `deepseek-chat` / `deepseek-reasoner`. Their current lineup is
// `deepseek-flash` (fast, cheap) and `deepseek-v4-pro` (deeper reasoning).
// Requests to the retired names hang indefinitely (no response), which broke
// tutor mode and the "Test Connection" button.
export const DEFAULT_MODEL = 'deepseek-flash'
const API_KEY_META_KEY = 'ai_api_key_encrypted'

// Historical DeepSeek model names that no longer resolve to a live backend.
// We transparently remap them to the current default so existing user configs
// keep working after the provider-side rename (requests to these names hang
// instead of erroring). Users can still select `deepseek-v4-pro` explicitly.
const DEPRECATED_MODELS: Record<string, string> = {
  'deepseek-chat': DEFAULT_MODEL,
  'deepseek-reasoner': DEFAULT_MODEL,
  'deepseek-coder': DEFAULT_MODEL,
  'deepseek-v2': DEFAULT_MODEL,
  'deepseek-v3': DEFAULT_MODEL,
  'deepseek-r1': DEFAULT_MODEL
}

/** Map a stored model name to a currently-supported one, leaving others untouched. */
export function normalizeModelName(model?: string | null): string {
  if (!model) return DEFAULT_MODEL
  const key = model.trim().toLowerCase()
  return DEPRECATED_MODELS[key] || model.trim() || DEFAULT_MODEL
}

interface AIConfig {
  provider: string
  baseUrl: string
  model: string
}

let db: Database.Database

export function setAIDatabase(database: Database.Database): void {
  db = database
  loadApiKey()
}

export function normalizeBaseUrl(url?: string): string {
  if (!url) return ''
  return url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
}

export function isLocalEndpoint(baseUrl?: string): boolean {
  if (!baseUrl) return false
  const lower = baseUrl.toLowerCase().trim()
  return (
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('0.0.0.0') ||
    lower.includes('::1') ||
    lower.includes('.local:') ||
    lower.endsWith('.local')
  )
}

export function sanitizeApiKey(key?: string | null): string {
  if (!key) return ''
  let cleaned = key.trim()
  // Strip surrounding quotes
  cleaned = cleaned.replace(/^["'`]|["'`]$/g, '').trim()
  // Strip Bearer prefix
  cleaned = cleaned.replace(/^Bearer\s+/i, '').trim()
  // Strip any remaining surrounding quotes
  cleaned = cleaned.replace(/^["'`]|["'`]$/g, '').trim()
  return cleaned
}

export function isMaskedKey(key?: string | null): boolean {
  if (!key) return false
  const trimmed = key.trim()
  return (
    trimmed.includes('...') ||
    trimmed.includes('****') ||
    trimmed.includes('••••') ||
    /^\*+/.test(trimmed) ||
    /^[a-zA-Z0-9_\-]{1,8}\.{3,}[a-zA-Z0-9_\-]{1,4}$/.test(trimmed)
  )
}

let encryptedApiKey: Buffer | null = null
let cachedApiKey: string | null = null

function recoverApiKeyFromFallback(): string | null {
  if (!db || !safeStorage.isEncryptionAvailable()) return null
  try {
    const fallbackRow = db.prepare("SELECT value FROM app_meta WHERE key = 'deepseek_encrypted_key'").get() as
      | { value: string }
      | undefined
    if (fallbackRow?.value) {
      const val = fallbackRow.value.trim()
      const buffersToTry: Buffer[] = []
      if (/^[0-9a-fA-F]+$/.test(val) && val.length % 2 === 0) {
        buffersToTry.push(Buffer.from(val, 'hex'))
      }
      buffersToTry.push(Buffer.from(val, 'base64'))

      for (const buf of buffersToTry) {
        try {
          const decrypted = safeStorage.decryptString(buf)
          if (decrypted && !isMaskedKey(decrypted)) {
            cachedApiKey = decrypted
            encryptedApiKey = buf
            // Self-heal: repair the canonical ai_api_key_encrypted in app_meta
            try {
              db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(
                API_KEY_META_KEY,
                buf.toString('base64')
              )
            } catch {
              // ignore
            }
            return decrypted
          }
        } catch {
          // continue
        }
      }
    }
  } catch {
    // ignore
  }
  return null
}

export function getApiKey(): string {
  if (cachedApiKey && !isMaskedKey(cachedApiKey)) return cachedApiKey

  if (encryptedApiKey && safeStorage.isEncryptionAvailable()) {
    try {
      const decrypted = safeStorage.decryptString(encryptedApiKey)
      if (decrypted && !isMaskedKey(decrypted)) {
        cachedApiKey = decrypted
        return cachedApiKey
      }
    } catch {
      // fall through
    }
  }

  // Check fallback storage if safeStorage unavailable
  if (db) {
    try {
      const fallbackPlain = db.prepare("SELECT value FROM app_meta WHERE key = 'ai_api_key_plain_fallback'").get() as
        | { value: string }
        | undefined
      if (fallbackPlain?.value) {
        const decoded = Buffer.from(fallbackPlain.value, 'base64').toString('utf-8')
        if (decoded && !isMaskedKey(decoded)) {
          cachedApiKey = decoded
          return cachedApiKey
        }
      }
    } catch {
      // ignore
    }
  }

  // Attempt recovery if key is missing or corrupted by a masked placeholder
  const recovered = recoverApiKeyFromFallback()
  if (recovered) return recovered

  // If the configured base URL is a local endpoint and no user key was set,
  // return a default dummy key so local model runners (Ollama, LM Studio) work out of the box.
  const currentBaseUrl = readMeta('ai_base_url')
  if (isLocalEndpoint(currentBaseUrl || '')) {
    return 'ollama'
  }

  return ''
}

export function saveApiKey(key: string): void {
  const sanitized = sanitizeApiKey(key)
  if (!sanitized || isMaskedKey(sanitized)) {
    return
  }
  cachedApiKey = sanitized

  if (db) {
    // 1. Always store base64 fallback in SQLite app_meta so key survives across binary updates or Keychain resets
    try {
      const encoded = Buffer.from(sanitized).toString('base64')
      db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(
        'ai_api_key_plain_fallback',
        encoded
      )
    } catch (err) {
      console.error('Failed to save plain fallback API key:', err)
    }
  }

  // 2. Also encrypt via safeStorage when available
  if (safeStorage.isEncryptionAvailable()) {
    try {
      encryptedApiKey = safeStorage.encryptString(sanitized)
      if (db) {
        db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(
          API_KEY_META_KEY,
          encryptedApiKey.toString('base64')
        )
      }
    } catch (err) {
      console.error('safeStorage encryption failed, relying on fallback storage:', err)
    }
  }
}

function loadApiKey(): void {
  if (!db) return
  try {
    const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(API_KEY_META_KEY) as
      | { value: string }
      | undefined
    if (row?.value && safeStorage.isEncryptionAvailable()) {
      const buf = Buffer.from(row.value, 'base64')
      try {
        const decrypted = safeStorage.decryptString(buf)
        if (decrypted && !isMaskedKey(decrypted)) {
          encryptedApiKey = buf
          cachedApiKey = decrypted
          return
        }
      } catch {
        // fall through to fallback storage
      }
    }

    // Check persistent fallback storage
    const fallbackPlain = db.prepare("SELECT value FROM app_meta WHERE key = 'ai_api_key_plain_fallback'").get() as
      | { value: string }
      | undefined
    if (fallbackPlain?.value) {
      try {
        const decoded = Buffer.from(fallbackPlain.value, 'base64').toString('utf-8')
        if (decoded && !isMaskedKey(decoded)) {
          cachedApiKey = decoded
          // Re-encrypt to safeStorage if available
          if (safeStorage.isEncryptionAvailable()) {
            try {
              encryptedApiKey = safeStorage.encryptString(decoded)
              db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(
                API_KEY_META_KEY,
                encryptedApiKey.toString('base64')
              )
            } catch {
              // ignore
            }
          }
          return
        }
      } catch {
        // ignore
      }
    }

    // Attempt recovery from legacy fallback if row missing or corrupted
    recoverApiKeyFromFallback()
  } catch {
    // silently fail if table doesn't exist or decryption fails
  }
}

// ── Config (app_meta SQLite table) ─────────────────────────────────────────────

export function getAIConfig(): AIConfig {
  if (!db) return { provider: DEFAULT_PROVIDER, baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL }

  const provider = readMeta('ai_provider') || DEFAULT_PROVIDER
  const baseUrl = readMeta('ai_base_url') || DEFAULT_BASE_URL
  const rawModel = readMeta('ai_model') || DEFAULT_MODEL
  const model = normalizeModelName(rawModel)

  // Self-heal: persist the corrected model so Settings shows a valid value and
  // we don't re-normalize on every request.
  if (model !== rawModel) {
    writeMeta('ai_model', model)
  }

  return { provider, baseUrl, model }
}

export function saveAIConfig(config: AIConfig): void {
  if (!db) return

  writeMeta('ai_provider', config.provider)
  writeMeta('ai_base_url', config.baseUrl)
  writeMeta('ai_model', config.model)
}

// ── Test connection ────────────────────────────────────────────────────────────

const TEST_CONNECTION_TIMEOUT_MS = 30_000

export async function testAIConnection(config: {
  provider: string
  baseUrl: string
  model: string
  apiKey: string
}): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const startTime = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TEST_CONNECTION_TIMEOUT_MS)

  try {
    if (config.provider === 'gemini') {
      // Gemini API
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
          contents: [{ parts: [{ text: 'Say "OK" in one word.' }] }]
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        return {
          success: false,
          message: `Gemini API error (${response.status}): ${errorText.substring(0, 200)}`,
          latencyMs: Date.now() - startTime
        }
      }

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      return { success: true, message: text.trim(), latencyMs: Date.now() - startTime }
    }

    // OpenAI-compatible API
    const baseUrl = normalizeBaseUrl(config.baseUrl || DEFAULT_BASE_URL)
    const model = config.model || DEFAULT_MODEL
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
        messages: [{ role: 'user', content: 'Say "OK" in one word.' }]
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        message: `API error (${response.status}): ${errorText.substring(0, 200)}`,
        latencyMs: Date.now() - startTime
      }
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''
    return { success: true, message: text.trim(), latencyMs: Date.now() - startTime }
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        success: false,
        message: 'Connection timed out. Please check your network and try again.',
        latencyMs: Date.now() - startTime
      }
    }
    if (isLocalEndpoint(config.baseUrl)) {
      return {
        success: false,
        message: `Could not connect to local AI server at ${config.baseUrl}. Make sure your local model runner is active (e.g. run "ollama run ${config.model || 'qwen2.5:3b'}" in Terminal).`,
        latencyMs: Date.now() - startTime
      }
    }
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - startTime
    }
  } finally {
    clearTimeout(timer)
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function readMeta(key: string): string | null {
  try {
    if (!db) return null
    const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value || null
  } catch {
    return null
  }
}

export function writeMeta(key: string, value: string): void {
  try {
    if (!db) return
    db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(key, value)
  } catch {
    // silently fail if table doesn't exist
  }
}

// ── Multi-Key Vault ────────────────────────────────────────────────────────────

export interface MultiKeyVault {
  geminiKey?: string
  openaiKey?: string
  deepseekKey?: string
  groqKey?: string
  visionProvider?: 'gemini' | 'openai' | 'local' | 'auto'
  visionModel?: string
  hasGeminiKey?: boolean
  hasOpenaiKey?: boolean
  hasDeepseekKey?: boolean
  hasGroqKey?: boolean
}

export function maskKey(key?: string | null): string {
  if (!key) return ''
  const trimmed = key.trim()
  if (trimmed.length <= 8) return '••••••••••••'
  return trimmed.substring(0, 6) + '••••••••' + trimmed.substring(trimmed.length - 4)
}

export function getStoredKey(providerName: 'gemini' | 'openai' | 'deepseek' | 'groq'): string {
  if (!db) return ''

  // Provider specific meta key
  const specificKey = readMeta(`api_key_${providerName}`)
  if (specificKey && !isMaskedKey(specificKey)) return specificKey

  // Cross-reference transcription keys
  if (providerName === 'gemini') {
    const tKey = readMeta('transcription_gemini_key')
    if (tKey && !isMaskedKey(tKey)) return tKey
  }
  if (providerName === 'openai') {
    const tKey = readMeta('transcription_openai_key')
    if (tKey && !isMaskedKey(tKey)) return tKey
  }
  if (providerName === 'groq') {
    const tKey = readMeta('transcription_groq_key')
    if (tKey && !isMaskedKey(tKey)) return tKey
  }

  // Cross-reference main AI key if it matches format
  const mainKey = getApiKey()
  if (mainKey && !isMaskedKey(mainKey)) {
    if (providerName === 'gemini' && (mainKey.startsWith('AIza') || mainKey.startsWith('AQ.'))) return mainKey
    if (providerName === 'openai' && mainKey.startsWith('sk-proj-')) return mainKey
    if (providerName === 'deepseek' && mainKey.startsWith('sk-') && !mainKey.startsWith('sk-proj-')) {
      const cfg = getAIConfig()
      if (cfg.baseUrl?.includes('deepseek.com') || cfg.provider === 'openai-compatible') return mainKey
    }
    if (providerName === 'groq' && mainKey.startsWith('gsk_')) return mainKey
  }

  return ''
}

export function getMultiKeyVault(): MultiKeyVault {
  const gemini = getStoredKey('gemini')
  const openai = getStoredKey('openai')
  const deepseek = getStoredKey('deepseek')
  const groq = getStoredKey('groq')

  const visionProvider = (readMeta('vision_provider') as 'gemini' | 'openai' | 'local' | 'auto') || 'gemini'
  const visionModel = readMeta('vision_model') || 'gemini-2.0-flash'

  return {
    geminiKey: maskKey(gemini),
    openaiKey: maskKey(openai),
    deepseekKey: maskKey(deepseek),
    groqKey: maskKey(groq),
    hasGeminiKey: Boolean(gemini),
    hasOpenaiKey: Boolean(openai),
    hasDeepseekKey: Boolean(deepseek),
    hasGroqKey: Boolean(groq),
    visionProvider,
    visionModel
  }
}

export function saveMultiKeyVault(updates: {
  geminiKey?: string
  openaiKey?: string
  deepseekKey?: string
  groqKey?: string
  visionProvider?: 'gemini' | 'openai' | 'local' | 'auto'
  visionModel?: string
}): void {
  if (!db) return

  if (updates.geminiKey !== undefined) {
    const clean = sanitizeApiKey(updates.geminiKey)
    if (clean && !isMaskedKey(clean)) {
      writeMeta('api_key_gemini', clean)
      writeMeta('transcription_gemini_key', clean)
    } else if (clean === '') {
      writeMeta('api_key_gemini', '')
      writeMeta('transcription_gemini_key', '')
    }
  }

  if (updates.openaiKey !== undefined) {
    const clean = sanitizeApiKey(updates.openaiKey)
    if (clean && !isMaskedKey(clean)) {
      writeMeta('api_key_openai', clean)
      writeMeta('transcription_openai_key', clean)
    } else if (clean === '') {
      writeMeta('api_key_openai', '')
      writeMeta('transcription_openai_key', '')
    }
  }

  if (updates.deepseekKey !== undefined) {
    const clean = sanitizeApiKey(updates.deepseekKey)
    if (clean && !isMaskedKey(clean)) {
      writeMeta('api_key_deepseek', clean)
      // If user's main provider is DeepSeek, update main key as well
      const cfg = getAIConfig()
      if (cfg.provider === 'openai-compatible' || cfg.baseUrl?.includes('deepseek')) {
        saveApiKey(clean)
      }
    } else if (clean === '') {
      writeMeta('api_key_deepseek', '')
    }
  }

  if (updates.groqKey !== undefined) {
    const clean = sanitizeApiKey(updates.groqKey)
    if (clean && !isMaskedKey(clean)) {
      writeMeta('api_key_groq', clean)
      writeMeta('transcription_groq_key', clean)
    } else if (clean === '') {
      writeMeta('api_key_groq', '')
      writeMeta('transcription_groq_key', '')
    }
  }

  if (updates.visionProvider) {
    writeMeta('vision_provider', updates.visionProvider)
  }

  if (updates.visionModel) {
    writeMeta('vision_model', updates.visionModel.trim())
  }
}
