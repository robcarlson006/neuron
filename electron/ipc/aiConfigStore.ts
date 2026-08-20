import { safeStorage } from 'electron'
import Database from 'better-sqlite3'

const DEFAULT_PROVIDER = 'openai-compatible'
const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'

interface AIConfig {
  provider: string
  baseUrl: string
  model: string
}

let db: Database.Database

export function setAIDatabase(database: Database.Database): void {
  db = database
}

// ── API Key (safeStorage) ──────────────────────────────────────────────────────

let encryptedApiKey: Buffer | null = null
let cachedApiKey: string | null = null

export function getApiKey(): string {
  if (cachedApiKey) return cachedApiKey

  if (encryptedApiKey && safeStorage.isEncryptionAvailable()) {
    try {
      cachedApiKey = safeStorage.decryptString(encryptedApiKey)
      return cachedApiKey
    } catch {
      // fall through
    }
  }

  return ''
}

export function saveApiKey(key: string): void {
  cachedApiKey = key
  if (safeStorage.isEncryptionAvailable()) {
    encryptedApiKey = safeStorage.encryptString(key)
  }
}

// ── Config (app_meta SQLite table) ─────────────────────────────────────────────

export function getAIConfig(): AIConfig {
  if (!db) return { provider: DEFAULT_PROVIDER, baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL }

  const provider = readMeta('ai_provider') || DEFAULT_PROVIDER
  const baseUrl = readMeta('ai_base_url') || DEFAULT_BASE_URL
  const model = readMeta('ai_model') || DEFAULT_MODEL

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
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL
    const model = config.model || DEFAULT_MODEL
    const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
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

function readMeta(key: string): string | null {
  try {
    const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value || null
  } catch {
    return null
  }
}

function writeMeta(key: string, value: string): void {
  try {
    db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(key, value)
  } catch {
    // silently fail if table doesn't exist
  }
}
