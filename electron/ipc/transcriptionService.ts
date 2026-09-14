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
  }): Promise<TranscriptionResult> {
    const buffer = await fs.promises.readFile(options.audioPath)
    const base64Audio = buffer.toString('base64')
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${options.apiKey}`

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
   * High-level transcribe dispatcher: selects provider, checks keys, falls back.
   */
  public async transcribe(
    audioPath: string,
    options?: { provider?: string; apiKey?: string }
  ): Promise<TranscriptionResult> {
    const provider = options?.provider || 'groq'
    const apiKey = options?.apiKey || getApiKey()

    if (provider === 'local') {
      const readyModel = LocalWhisperService.listModels().find((m) => m.status === 'ready')
      if (!readyModel) {
        throw new Error(
          'Local Whisper model is not downloaded yet. Please download a model in Settings or switch to cloud transcription.'
        )
      }
      // If local whisper runner is available, call it; otherwise prompt user
      throw new Error('Local on-device transcription engine is being initialized.')
    }

    if (provider === 'gemini') {
      if (!apiKey) throw new Error('Google Gemini API key is not configured in Settings.')
      return this.transcribeWithGemini({ audioPath, apiKey })
    }

    if (provider === 'openai') {
      if (!apiKey) throw new Error('OpenAI API key is not configured in Settings.')
      return this.transcribeWithOpenAICompatible({
        audioPath,
        apiKey,
        baseUrl: 'https://api.openai.com',
        model: 'whisper-1'
      })
    }

    // Default: Groq Whisper (ultra-fast & low cost)
    // If user provided a Groq key or general key
    const groqKey = apiKey
    if (!groqKey) {
      throw new Error('Transcription API key not found. Please add a Groq, OpenAI, or Gemini key in Settings.')
    }

    return this.transcribeWithOpenAICompatible({
      audioPath,
      apiKey: groqKey,
      baseUrl: 'https://api.groq.com/openai',
      model: 'whisper-large-v3-turbo'
    })
  }
}

export const TranscriptionService = new TranscriptionServiceManager()
