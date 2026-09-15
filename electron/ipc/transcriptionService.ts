import fs from 'fs'
import path from 'path'
import { getApiKey } from './aiConfigStore'
import { LocalWhisperService } from './localWhisperService'

export interface TranscriptionSegment {
  start: number
  end: number
  text: string
}

export interface TranscriptionResult {
  text: string
  timestampedText: string
  durationSeconds: number
  segments?: TranscriptionSegment[]
}

class TranscriptionServiceManager {
  /** Format seconds (e.g. 75 -> "01:15", 3675 -> "01:01:15") */
  public formatSeconds(seconds: number): string {
    const totalSecs = Math.max(0, Math.floor(seconds))
    const hrs = Math.floor(totalSecs / 3600)
    const mins = Math.floor((totalSecs % 3600) / 60)
    const secs = totalSecs % 60

    const mm = String(mins).padStart(2, '0')
    const ss = String(secs).padStart(2, '0')

    if (hrs > 0) {
      const hh = String(hrs).padStart(2, '0')
      return `${hh}:${mm}:${ss}`
    }
    return `${mm}:${ss}`
  }

  /**
   * Turn raw segments into readable timestamped text blocks:
   * e.g. [00:00] Welcome to the lecture...
   * Group short consecutive phrases into cohesive 15-30 second paragraphs.
   */
  public formatSegmentsToTimestampedText(
    segments: TranscriptionSegment[],
    fallbackText = ''
  ): string {
    if (!segments || segments.length === 0) {
      return fallbackText
    }

    const lines: string[] = []
    let currentParagraph: string[] = []
    let paragraphStartTime = segments[0].start

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const text = seg.text.trim()
      if (!text) continue

      if (currentParagraph.length === 0) {
        paragraphStartTime = seg.start
      }

      currentParagraph.push(text)

      // Break paragraph if time gap exceeds 25 seconds or reaches end
      const nextSeg = segments[i + 1]
      const shouldBreak =
        !nextSeg ||
        nextSeg.start - paragraphStartTime >= 25 ||
        text.endsWith('.') ||
        text.endsWith('?') ||
        text.endsWith('!')

      if (shouldBreak && currentParagraph.length > 0) {
        const timeTag = `[${this.formatSeconds(paragraphStartTime)}]`
        lines.push(`${timeTag} ${currentParagraph.join(' ')}`)
        currentParagraph = []
      }
    }

    if (currentParagraph.length > 0) {
      const timeTag = `[${this.formatSeconds(paragraphStartTime)}]`
      lines.push(`${timeTag} ${currentParagraph.join(' ')}`)
    }

    return lines.join('\n\n')
  }

  /**
   * Transcribe via OpenAI-compatible endpoints (Groq Whisper, OpenAI Whisper, Local Whisper API)
   */
  public async transcribeWithOpenAICompatible(options: {
    audioPath: string
    apiKey: string
    baseUrl?: string
    model?: string
    audioBuffer?: Buffer
  }): Promise<TranscriptionResult> {
    const baseUrl = (options.baseUrl || 'https://api.groq.com/openai').replace(/\/+$/, '')
    const url = baseUrl.endsWith('/v1')
      ? `${baseUrl}/audio/transcriptions`
      : `${baseUrl}/v1/audio/transcriptions`

    const buffer = options.audioBuffer || (await fs.promises.readFile(options.audioPath))
    const filename = path.basename(options.audioPath) || 'lecture.webm'

    const formData = new FormData()
    const blob = new Blob([new Uint8Array(buffer)], { type: 'audio/webm' })
    formData.append('file', blob, filename)
    formData.append('model', options.model || 'whisper-large-v3-turbo')
    formData.append('response_format', 'verbose_json')

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`
      },
      body: formData
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Transcription API error (${response.status}): ${errorText.substring(0, 400)}`)
    }

    const data = await response.json()
    const rawText = (data.text || '').trim()
    const segments: TranscriptionSegment[] = (data.segments || []).map((s: any) => ({
      start: Number(s.start || 0),
      end: Number(s.end || 0),
      text: String(s.text || '')
    }))

    const durationSeconds = Math.round(Number(data.duration || (segments.length > 0 ? segments[segments.length - 1].end : 0)))
    const timestampedText = this.formatSegmentsToTimestampedText(segments, rawText)

    return {
      text: rawText,
      timestampedText,
      durationSeconds,
      segments
    }
  }

  /**
   * Transcribe using Google Gemini audio API
   */
  public async transcribeWithGemini(options: {
    audioPath: string
    apiKey: string
    model?: string
  }): Promise<TranscriptionResult> {
    const buffer = await fs.promises.readFile(options.audioPath)
    const base64Audio = buffer.toString('base64')
    const model = options.model || 'gemini-3.6-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${options.apiKey}`

    const prompt =
      'Provide an accurate, detailed verbatim transcription of this lecture audio. ' +
      'Format the transcription with timestamps at roughly 1-to-2 minute intervals or major topic shifts ' +
      'in the format [MM:SS] or [HH:MM:SS] at the start of each paragraph. Output only the timestamped transcript.'

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: 'audio/webm',
                  data: base64Audio
                }
              }
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Gemini Audio error (${response.status}): ${err.substring(0, 300)}`)
    }

    const data = await response.json()
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()

    return {
      text,
      timestampedText: text,
      durationSeconds: 0
    }
  }

  /**
   * Transcribe using local on-device Whisper model
   */
  public async transcribeWithLocalWhisper(audioPath: string): Promise<TranscriptionResult> {
    const res = await LocalWhisperService.transcribeAudio(audioPath)
    return {
      text: res.text,
      timestampedText: res.timestampedText,
      durationSeconds: res.durationSeconds,
      segments: res.segments
    }
  }

  /**
   * Test connection / credentials for a given transcription provider
   */
  public async testConnection(params: {
    provider: string
    apiKey?: string
  }): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const startTime = Date.now()
    const provider = params.provider.toLowerCase()

    try {
      if (provider === 'local') {
        const models = LocalWhisperService.listModels()
        const readyModel = models.find((m) => m.status === 'ready')
        const binary = LocalWhisperService.findWhisperBinary()

        if (!readyModel) {
          return {
            success: false,
            message: 'No local Whisper model downloaded yet. Please download Whisper Base or Tiny.',
            latencyMs: Date.now() - startTime
          }
        }
        if (!binary) {
          return {
            success: false,
            message: `Model ready (${readyModel.name}), but whisper-cli was not found in PATH or local-ai/bin.`,
            latencyMs: Date.now() - startTime
          }
        }
        return {
          success: true,
          message: `Local engine ready (${readyModel.name}, binary: ${path.basename(binary)})`,
          latencyMs: Date.now() - startTime
        }
      }

      if (provider === 'groq') {
        const key = params.apiKey || this.readMeta('transcription_groq_key') || getApiKey()
        if (!key) throw new Error('No Groq API key provided')

        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${key}` }
        })
        if (!res.ok) {
          const err = await res.text()
          return {
            success: false,
            message: `Groq error (${res.status}): ${err.substring(0, 200)}`,
            latencyMs: Date.now() - startTime
          }
        }
        return {
          success: true,
          message: 'Groq Whisper API is ready and connected',
          latencyMs: Date.now() - startTime
        }
      }

      if (provider === 'openai') {
        const key = params.apiKey || this.readMeta('transcription_openai_key') || getApiKey()
        if (!key) throw new Error('No OpenAI API key provided')

        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` }
        })
        if (!res.ok) {
          const err = await res.text()
          let msg = `OpenAI error (${res.status}): ${err.substring(0, 200)}`
          if (res.status === 429) {
            msg = 'OpenAI quota exceeded (429): No credits remaining in your OpenAI account.'
          }
          return {
            success: false,
            message: msg,
            latencyMs: Date.now() - startTime
          }
        }
        return {
          success: true,
          message: 'OpenAI Whisper API is ready and connected',
          latencyMs: Date.now() - startTime
        }
      }

      if (provider === 'gemini') {
        const key = params.apiKey || this.readMeta('transcription_gemini_key') || getApiKey()
        if (!key) throw new Error('No Google Gemini API key provided')

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping' }] }] })
          }
        )
        if (!res.ok) {
          const err = await res.text()
          return {
            success: false,
            message: `Gemini error (${res.status}): ${err.substring(0, 200)}`,
            latencyMs: Date.now() - startTime
          }
        }
        return {
          success: true,
          message: 'Google Gemini API is ready and connected',
          latencyMs: Date.now() - startTime
        }
      }

      throw new Error(`Unknown provider: ${provider}`)
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Connection test failed',
        latencyMs: Date.now() - startTime
      }
    }
  }

  private db: any = null

  public setDatabase(database: any): void {
    this.db = database
  }

  private readMeta(key: string): string | null {
    if (!this.db) return null
    try {
      const row = this.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
        | { value: string }
        | undefined
      return row?.value || null
    } catch {
      return null
    }
  }

  /**
   * High-level transcribe dispatcher: selects provider, checks keys, falls back.
   */
  public async transcribe(
    audioPath: string,
    options?: { provider?: string; apiKey?: string }
  ): Promise<TranscriptionResult> {
    const chosenProvider = options?.provider || this.readMeta('transcription_provider') || 'auto'
    const groqKey = options?.apiKey || this.readMeta('transcription_groq_key') || (getApiKey()?.startsWith('gsk_') ? getApiKey() : '')
    const openaiKey = options?.apiKey || this.readMeta('transcription_openai_key') || (getApiKey()?.startsWith('sk-') ? getApiKey() : '')
    const geminiKey = options?.apiKey || this.readMeta('transcription_gemini_key') || (getApiKey()?.startsWith('AIza') || getApiKey()?.startsWith('AQ.') ? getApiKey() : '')

    if (chosenProvider === 'local') {
      return this.transcribeWithLocalWhisper(audioPath)
    }

    if (chosenProvider === 'gemini') {
      if (!geminiKey) throw new Error('Google Gemini API key is not configured in Settings.')
      return this.transcribeWithGemini({ audioPath, apiKey: geminiKey })
    }

    if (chosenProvider === 'openai') {
      if (!openaiKey) throw new Error('OpenAI API key is not configured in Settings.')
      try {
        return await this.transcribeWithOpenAICompatible({
          audioPath,
          apiKey: openaiKey,
          baseUrl: 'https://api.openai.com',
          model: 'whisper-1'
        })
      } catch (err: any) {
        if (err.message?.includes('credit_balance_exhausted') || err.message?.includes('429')) {
          throw new Error('OpenAI API quota exceeded (0 credits remaining). Please add credits to your OpenAI account or switch to Groq / Local Whisper in Settings.')
        }
        throw err
      }
    }

    if (chosenProvider === 'groq') {
      if (!groqKey) throw new Error('Groq API key is not configured in Settings.')
      return this.transcribeWithOpenAICompatible({
        audioPath,
        apiKey: groqKey,
        baseUrl: 'https://api.groq.com/openai',
        model: 'whisper-large-v3-turbo'
      })
    }

    // Auto mode: try configured providers in order with automatic fallback
    const errors: string[] = []

    // 1. Try Groq (Fastest + reliable)
    if (groqKey) {
      try {
        return await this.transcribeWithOpenAICompatible({
          audioPath,
          apiKey: groqKey,
          baseUrl: 'https://api.groq.com/openai',
          model: 'whisper-large-v3-turbo'
        })
      } catch (err: any) {
        errors.push(`Groq failed: ${err.message}`)
      }
    }

    // 2. Try Gemini
    if (geminiKey) {
      try {
        return await this.transcribeWithGemini({ audioPath, apiKey: geminiKey })
      } catch (err: any) {
        errors.push(`Gemini failed: ${err.message}`)
      }
    }

    // 3. Try OpenAI
    if (openaiKey) {
      try {
        return await this.transcribeWithOpenAICompatible({
          audioPath,
          apiKey: openaiKey,
          baseUrl: 'https://api.openai.com',
          model: 'whisper-1'
        })
      } catch (err: any) {
        errors.push(`OpenAI failed: ${err.message}`)
      }
    }

    // 4. Try Local Whisper
    const readyModel = LocalWhisperService.listModels().find((m) => m.status === 'ready')
    if (readyModel) {
      try {
        return await this.transcribeWithLocalWhisper(audioPath)
      } catch (err: any) {
        errors.push(`Local Whisper failed: ${err.message}`)
      }
    }

    if (errors.length > 0) {
      throw new Error(`Transcription failed:\n${errors.join('\n')}`)
    }

    throw new Error('No transcription provider configured. Please add a Groq, OpenAI, or Gemini key, or download Local Whisper in Settings.')
  }
}

export const TranscriptionService = new TranscriptionServiceManager()
