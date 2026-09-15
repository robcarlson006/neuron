import { normalizeBaseUrl, isLocalEndpoint, normalizeModelName, DEFAULT_MODEL } from '../../electron/ipc/aiConfigStore'

describe('Local AI Configuration Helpers', () => {
  describe('normalizeBaseUrl', () => {
    it('handles standard URLs without changes', () => {
      expect(normalizeBaseUrl('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434')
      expect(normalizeBaseUrl('https://api.deepseek.com')).toBe('https://api.deepseek.com')
    })

    it('strips trailing slashes', () => {
      expect(normalizeBaseUrl('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434')
      expect(normalizeBaseUrl('http://localhost:11434///')).toBe('http://localhost:11434')
    })

    it('strips redundant /v1 suffix to avoid /v1/v1/chat/completions', () => {
      expect(normalizeBaseUrl('http://127.0.0.1:11434/v1')).toBe('http://127.0.0.1:11434')
      expect(normalizeBaseUrl('http://localhost:11434/v1/')).toBe('http://localhost:11434')
      expect(normalizeBaseUrl('https://api.deepseek.com/v1')).toBe('https://api.deepseek.com')
    })

    it('handles empty or undefined inputs gracefully', () => {
      expect(normalizeBaseUrl('')).toBe('')
      expect(normalizeBaseUrl(undefined)).toBe('')
    })
  })

  describe('normalizeModelName', () => {
    it('defaults to the current DeepSeek model when no model is provided', () => {
      expect(DEFAULT_MODEL).toBe('deepseek-flash')
      expect(normalizeModelName()).toBe('deepseek-flash')
      expect(normalizeModelName('')).toBe('deepseek-flash')
      expect(normalizeModelName(null)).toBe('deepseek-flash')
    })

    it('remaps retired DeepSeek model names to the current default', () => {
      expect(normalizeModelName('deepseek-chat')).toBe('deepseek-flash')
      expect(normalizeModelName('deepseek-reasoner')).toBe('deepseek-flash')
      expect(normalizeModelName('deepseek-coder')).toBe('deepseek-flash')
      expect(normalizeModelName('deepseek-r1')).toBe('deepseek-flash')
    })

    it('is case- and whitespace-insensitive', () => {
      expect(normalizeModelName('  DEEPSEEK-CHAT  ')).toBe('deepseek-flash')
    })

    it('leaves non-DeepSeek models untouched', () => {
      expect(normalizeModelName('gpt-4o-mini')).toBe('gpt-4o-mini')
      expect(normalizeModelName('qwen2.5:3b')).toBe('qwen2.5:3b')
      expect(normalizeModelName('gemini-2.0-flash')).toBe('gemini-2.0-flash')
      expect(normalizeModelName('deepseek-v4-pro')).toBe('deepseek-v4-pro')
      expect(normalizeModelName('deepseek-flash')).toBe('deepseek-flash')
    })
  })

  describe('isLocalEndpoint', () => {
    it('recognizes localhost and loopback IPv4/IPv6 endpoints', () => {
      expect(isLocalEndpoint('http://localhost:11434')).toBe(true)
      expect(isLocalEndpoint('http://127.0.0.1:11434')).toBe(true)
      expect(isLocalEndpoint('http://0.0.0.0:8000')).toBe(true)
      expect(isLocalEndpoint('http://[::1]:11434')).toBe(true)
      expect(isLocalEndpoint('http://macbook.local:1234')).toBe(true)
    })

    it('returns false for external cloud providers', () => {
      expect(isLocalEndpoint('https://api.deepseek.com')).toBe(false)
      expect(isLocalEndpoint('https://api.openai.com')).toBe(false)
      expect(isLocalEndpoint('https://generativelanguage.googleapis.com')).toBe(false)
    })

    it('returns false for empty or undefined input', () => {
      expect(isLocalEndpoint('')).toBe(false)
      expect(isLocalEndpoint(undefined)).toBe(false)
    })
  })
})
