import { TranscriptionService } from '../../electron/ipc/transcriptionService'

describe('TranscriptionService', () => {
  const mockAudioPath = '/mock/path/to/lecture.webm'

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('formats segments with timestamps into clean transcript', () => {
    const rawSegments = [
      { start: 0, end: 15.5, text: ' Welcome to Neuroscience 101.' },
      { start: 16.0, end: 45.2, text: ' Today we are discussing action potentials.' },
      { start: 3670.0, end: 3705.0, text: ' Let us wrap up the lecture.' }
    ]

    const formatted = TranscriptionService.formatSegmentsToTimestampedText(rawSegments)
    expect(formatted).toContain('[00:00] Welcome to Neuroscience 101.')
    expect(formatted).toContain('[00:16] Today we are discussing action potentials.')
    expect(formatted).toContain('[01:01:10] Let us wrap up the lecture.')
  })

  test('formats plain text if no segments provided', () => {
    const text = 'This is a simple raw transcript without segments.'
    const result = TranscriptionService.formatSegmentsToTimestampedText([], text)
    expect(result).toBe(text)
  })

  test('converts seconds to timestamp correctly', () => {
    expect(TranscriptionService.formatSeconds(0)).toBe('00:00')
    expect(TranscriptionService.formatSeconds(65)).toBe('01:05')
    expect(TranscriptionService.formatSeconds(3665)).toBe('01:01:05')
  })

  test('transcribes audio using Groq Whisper API mock', async () => {
    const mockResponse = {
      text: 'Good morning everyone. Today we discuss synaptic transmission.',
      segments: [
        { start: 0, end: 10, text: ' Good morning everyone.' },
        { start: 10, end: 25, text: ' Today we discuss synaptic transmission.' }
      ]
    }

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    } as any)

    const result = await TranscriptionService.transcribeWithOpenAICompatible({
      audioPath: mockAudioPath,
      apiKey: 'gsk_mock_key_12345',
      baseUrl: 'https://api.groq.com/openai',
      model: 'whisper-large-v3-turbo',
      audioBuffer: Buffer.from('mock audio bytes')
    })

    expect(result.text).toContain('Good morning everyone')
    expect(result.timestampedText).toContain('[00:00] Good morning everyone.')
    expect(result.timestampedText).toContain('[00:10] Today we discuss synaptic transmission.')
  })

  test('handles API errors gracefully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid API Key'
    } as any)

    await expect(
      TranscriptionService.transcribeWithOpenAICompatible({
        audioPath: mockAudioPath,
        apiKey: 'invalid_key',
        baseUrl: 'https://api.groq.com/openai',
        model: 'whisper-large-v3-turbo',
        audioBuffer: Buffer.from('mock audio bytes')
      })
    ).rejects.toThrow('Transcription API error (401)')
  })
})
