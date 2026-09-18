import {
  isMaskedKey,
  sanitizeApiKey,
  setAIDatabase,
  getStoredKey,
  getMultiKeyVault,
  saveMultiKeyVault,
  readMeta,
  writeMeta
} from '../../electron/ipc/aiConfigStore'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function createDbAdapter(): any {
  const syncDb = new DatabaseSync(':memory:')
  syncDb.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  return {
    prepare(sql: string) {
      const stmt = syncDb.prepare(sql)
      return {
        run(...params: any[]) {
          const res = stmt.run(...params)
          return { lastInsertRowid: res.lastInsertRowid }
        },
        get(...params: any[]) {
          return stmt.get(...params)
        },
        all(...params: any[]) {
          return stmt.all(...params)
        }
      }
    },
    exec(sql: string) {
      return syncDb.exec(sql)
    },
    close() {
      return syncDb.close()
    }
  }
}

// Mock safeStorage from electron
const mockSafeStorage = {
  isEncryptionAvailable: jest.fn(() => true),
  encryptString: jest.fn((str: string) => Buffer.from(`enc_${str}`)),
  decryptString: jest.fn((buf: Buffer) => {
    const s = buf.toString()
    if (s.startsWith('enc_')) return s.replace('enc_', '')
    return s
  })
}

jest.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => mockSafeStorage.isEncryptionAvailable(),
    encryptString: (str: string) => mockSafeStorage.encryptString(str),
    decryptString: (buf: Buffer) => mockSafeStorage.decryptString(buf)
  }
}))

describe('Multi-Key Vault & Feature Routing', () => {
  let db: any

  beforeEach(() => {
    db = createDbAdapter()
    setAIDatabase(db)
  })

  test('initially returns empty vault with default visionProvider', () => {
    const vault = getMultiKeyVault()
    expect(vault.hasGeminiKey).toBe(false)
    expect(vault.hasOpenaiKey).toBe(false)
    expect(vault.hasDeepseekKey).toBe(false)
    expect(vault.hasGroqKey).toBe(false)
    expect(vault.visionProvider).toBe('gemini')
    expect(vault.visionModel).toBe('gemini-2.0-flash')
  })

  test('saves and retrieves distinct keys for each provider without collisions', () => {
    saveMultiKeyVault({
      geminiKey: 'AIzaSyA1B2C3D4E5F6G7H8I9J0',
      openaiKey: 'sk-proj-1234567890abcdefghijklmn',
      deepseekKey: 'sk-deepseek-abcdef1234567890',
      groqKey: 'gsk_groqkey1234567890abcdef'
    })

    // Raw stored keys
    expect(getStoredKey('gemini')).toBe('AIzaSyA1B2C3D4E5F6G7H8I9J0')
    expect(getStoredKey('openai')).toBe('sk-proj-1234567890abcdefghijklmn')
    expect(getStoredKey('deepseek')).toBe('sk-deepseek-abcdef1234567890')
    expect(getStoredKey('groq')).toBe('gsk_groqkey1234567890abcdef')

    // Vault view should mask keys and report hasKey: true
    const vault = getMultiKeyVault()
    expect(vault.hasGeminiKey).toBe(true)
    expect(vault.hasOpenaiKey).toBe(true)
    expect(vault.hasDeepseekKey).toBe(true)
    expect(vault.hasGroqKey).toBe(true)

    expect(isMaskedKey(vault.geminiKey)).toBe(true)
    expect(isMaskedKey(vault.openaiKey)).toBe(true)
    expect(isMaskedKey(vault.deepseekKey)).toBe(true)
    expect(isMaskedKey(vault.groqKey)).toBe(true)
  })

  test('persists vision_provider and vision_model routing preferences', () => {
    saveMultiKeyVault({
      visionProvider: 'gemini',
      visionModel: 'gemini-2.5-pro'
    })

    let vault = getMultiKeyVault()
    expect(vault.visionProvider).toBe('gemini')
    expect(vault.visionModel).toBe('gemini-2.5-pro')

    saveMultiKeyVault({
      visionProvider: 'openai',
      visionModel: 'gpt-4o'
    })

    vault = getMultiKeyVault()
    expect(vault.visionProvider).toBe('openai')
    expect(vault.visionModel).toBe('gpt-4o')
  })

  test('keeps lecture transcription keys synchronized with vault keys', () => {
    saveMultiKeyVault({
      geminiKey: 'AIzaSySyncTest12345',
      groqKey: 'gsk_groqSyncTest67890'
    })

    expect(readMeta('transcription_gemini_key')).toBe('AIzaSySyncTest12345')
    expect(readMeta('transcription_groq_key')).toBe('gsk_groqSyncTest67890')
  })

  test('does not overwrite stored keys if incoming update contains masked key', () => {
    saveMultiKeyVault({
      geminiKey: 'AIzaSyOriginalKey123'
    })

    expect(getStoredKey('gemini')).toBe('AIzaSyOriginalKey123')

    // Simulate form submit with masked key
    saveMultiKeyVault({
      geminiKey: 'AIzaSyO...y123'
    })

    // Original key should remain intact
    expect(getStoredKey('gemini')).toBe('AIzaSyOriginalKey123')
  })

  test('allows explicitly clearing an API key with empty string', () => {
    saveMultiKeyVault({
      geminiKey: 'AIzaSyToClear123'
    })
    expect(getStoredKey('gemini')).toBe('AIzaSyToClear123')

    saveMultiKeyVault({
      geminiKey: ''
    })
    expect(getStoredKey('gemini')).toBe('')
    expect(getMultiKeyVault().hasGeminiKey).toBe(false)
  })
})
