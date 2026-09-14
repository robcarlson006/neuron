import {
  isMaskedKey,
  sanitizeApiKey,
  saveApiKey,
  getApiKey,
  setAIDatabase
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

describe('API Key Protection & Recovery', () => {
  let db: any

  beforeEach(() => {
    db = createDbAdapter()
    setAIDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('isMaskedKey', () => {
    it('detects masked keys with ellipses', () => {
      expect(isMaskedKey('sk-12345...3bee')).toBe(true)
      expect(isMaskedKey('sk-ant...xyz')).toBe(true)
      expect(isMaskedKey('abc...def')).toBe(true)
    })

    it('detects masked keys with asterisks or bullets', () => {
      expect(isMaskedKey('****3bee')).toBe(true)
      expect(isMaskedKey('••••••••••••••••')).toBe(true)
      expect(isMaskedKey('sk-****1234')).toBe(true)
    })

    it('returns false for real valid API keys', () => {
      expect(isMaskedKey('sk-abcdef1234567890abcdef1234567890')).toBe(false)
      expect(isMaskedKey('gsk_1234567890abcdefghijklmnopqrstuvwxyz')).toBe(false)
      expect(isMaskedKey('ollama')).toBe(false)
    })

    it('returns false for empty or falsy inputs', () => {
      expect(isMaskedKey('')).toBe(false)
      expect(isMaskedKey(null as unknown as string)).toBe(false)
      expect(isMaskedKey(undefined as unknown as string)).toBe(false)
    })
  })

  describe('sanitizeApiKey', () => {
    it('strips surrounding single and double quotes', () => {
      expect(sanitizeApiKey('"sk-my-api-key-12345"')).toBe('sk-my-api-key-12345')
      expect(sanitizeApiKey("'sk-my-api-key-12345'")).toBe('sk-my-api-key-12345')
      expect(sanitizeApiKey('`sk-my-api-key-12345`')).toBe('sk-my-api-key-12345')
    })

    it('strips Bearer prefix and whitespace', () => {
      expect(sanitizeApiKey('Bearer sk-my-api-key-12345')).toBe('sk-my-api-key-12345')
      expect(sanitizeApiKey('  Bearer   sk-my-api-key-12345  ')).toBe('sk-my-api-key-12345')
      expect(sanitizeApiKey('bearer sk-my-api-key-12345')).toBe('sk-my-api-key-12345')
    })

    it('handles falsy or empty values gracefully', () => {
      expect(sanitizeApiKey('')).toBe('')
      expect(sanitizeApiKey(null)).toBe('')
      expect(sanitizeApiKey(undefined)).toBe('')
    })
  })

  describe('saveApiKey protection', () => {
    it('saves a valid key to memory and db', () => {
      saveApiKey('sk-real-valid-api-key-12345')
      expect(getApiKey()).toBe('sk-real-valid-api-key-12345')

      const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get('ai_api_key_encrypted') as { value: string }
      expect(row).toBeDefined()
    })

    it('refuses to overwrite a valid key with a masked key', () => {
      saveApiKey('sk-original-key-1234567890')
      expect(getApiKey()).toBe('sk-original-key-1234567890')

      // Attempt to save masked key
      saveApiKey('sk-orig...7890')

      // Key must remain unchanged
      expect(getApiKey()).toBe('sk-original-key-1234567890')
    })

    it('deletes legacy deepseek_encrypted_key when a new key is saved', () => {
      db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('deepseek_encrypted_key', 'old_zombie_key')
      saveApiKey('sk-brand-new-key-123456789')

      const legacyRow = db.prepare('SELECT value FROM app_meta WHERE key = ?').get('deepseek_encrypted_key')
      expect(legacyRow).toBeUndefined()
    })
  })

  describe('getApiKey self-healing recovery', () => {
    it('recovers valid key from deepseek_encrypted_key if ai_api_key_encrypted was corrupted by a masked string', () => {
      // Suppose ai_api_key_encrypted contains an encrypted masked key
      const maskedEnc = Buffer.from('enc_sk-12345...3bee').toString('base64')
      db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('ai_api_key_encrypted', maskedEnc)

      // And deepseek_encrypted_key contains the original valid encrypted key
      const validEnc = Buffer.from('enc_sk-actual-deepseek-secret-key-3bee').toString('base64')
      db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('deepseek_encrypted_key', validEnc)

      // Re-init db
      setAIDatabase(db)

      const recovered = getApiKey()
      expect(recovered).toBe('sk-actual-deepseek-secret-key-3bee')

      // It should also repair ai_api_key_encrypted in the database
      const repairedRow = db.prepare('SELECT value FROM app_meta WHERE key = ?').get('ai_api_key_encrypted') as { value: string }
      expect(repairedRow.value).toBe(validEnc)
    })

    it('recovers valid key when deepseek_encrypted_key is hex-encoded', () => {
      // Suppose ai_api_key_encrypted contains a masked key
      const maskedEnc = Buffer.from('enc_sk-12345...3bee').toString('base64')
      db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('ai_api_key_encrypted', maskedEnc)

      // deepseek_encrypted_key in hex
      const validEncBuf = Buffer.from('enc_sk-hex-recovered-key')
      const hexVal = validEncBuf.toString('hex')
      db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('deepseek_encrypted_key', hexVal)

      setAIDatabase(db)

      const recovered = getApiKey()
      expect(recovered).toBe('sk-hex-recovered-key')
    })
  })
})
