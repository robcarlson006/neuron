import { normalizeBaseUrl, isLocalEndpoint } from '../../electron/ipc/aiConfigStore'

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
