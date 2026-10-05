import { callAIMessages } from '../../electron/ipc/aiHandlers'

describe('AI provider routing for document learning', () => {
  const fetchMock = jest.fn()
  const nativeFetch = global.fetch

  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"cards":[]}' } }] })
    })
  })

  it('preserves the configured DeepSeek flash model', async () => {
    await callAIMessages(
      [{ role: 'user', content: 'Create one card.' }],
      { provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'deepseek-test' },
      { type: 'json_object' }
    )

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(request.body))
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(body.model).toBe('deepseek-flash')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect((request.headers as Record<string, string>).Authorization).toBe('Bearer deepseek-test')
  })

  it('uses the local runner fallback key without requiring a cloud API key', async () => {
    await callAIMessages(
      [{ role: 'user', content: 'Create one card locally.' }],
      { provider: 'openai-compatible', baseUrl: 'http://localhost:11434/v1/', model: 'qwen2.5:3b', apiKey: '' }
    )

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    expect((request.headers as Record<string, string>).Authorization).toBe('Bearer ollama')
  })

  it('completes the local OpenAI-compatible response contract without a cloud credential', async () => {
    const requests: Array<{ url: string; request: RequestInit }> = []
    global.fetch = (async (url: string, request: RequestInit) => {
      requests.push({ url, request })
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"cards":[{"front":"Local","back":"Runner"}]}' } }] })
      }
    }) as unknown as typeof fetch

    try {
      const result = await callAIMessages(
        [{ role: 'user', content: 'Create one local card.' }],
        { provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:11434/v1/', model: 'qwen2.5:3b', apiKey: '' },
        { type: 'json_object' }
      )
      expect(JSON.parse(result)).toEqual({ cards: [{ front: 'Local', back: 'Runner' }] })
      expect(requests).toHaveLength(1)
      expect(requests[0].url).toBe('http://127.0.0.1:11434/v1/chat/completions')
      expect((requests[0].request.headers as Record<string, string>).Authorization).toBe('Bearer ollama')
      expect(JSON.parse(String(requests[0].request.body))).toEqual(expect.objectContaining({
        model: 'qwen2.5:3b',
        response_format: { type: 'json_object' }
      }))
    } finally {
      global.fetch = nativeFetch
    }
  })
})
