import type { BrowserWindow } from 'electron'
import {
  getLectureById,
  updateLectureStatus,
  type CascadeDB
} from '../../src/lib/db'
import { buildLectureNotesPrompt } from '../../src/lib/promptBuilders'
import { getAIConfig, getApiKey, normalizeBaseUrl, isLocalEndpoint } from './aiConfigStore'
import { TranscriptionService, type TranscriptionResult } from './transcriptionService'

interface LectureNotesServiceOptions {
  generateNotesFn?: (prompt: string) => Promise<string>
  transcribeFn?: (audioPath: string) => Promise<TranscriptionResult>
}

class LectureNotesServiceManager {
  private db: CascadeDB | null = null
  private getWindow: (() => BrowserWindow | null) | null = null
  private customGenerateNotesFn?: (prompt: string) => Promise<string>
  private customTranscribeFn?: (audioPath: string) => Promise<TranscriptionResult>

  public init(database: CascadeDB, options?: LectureNotesServiceOptions): void {
    this.db = database
    if (options?.generateNotesFn) this.customGenerateNotesFn = options.generateNotesFn
    if (options?.transcribeFn) this.customTranscribeFn = options.transcribeFn
  }

  public setWindowGetter(getter: () => BrowserWindow | null): void {
    this.getWindow = getter
  }

  private emitStatus(data: { lectureId: number; status: string; materialId?: number; error?: string }): void {
    const win = this.getWindow ? this.getWindow() : null
    if (win && !win.isDestroyed()) {
      win.webContents.send('lecture:status-update', data)
    }
  }

  private async callAIForMarkdown(prompt: string): Promise<string> {
    if (this.customGenerateNotesFn) {
      return this.customGenerateNotesFn(prompt)
    }

    const config = getAIConfig()
    const apiKey = getApiKey()

    if (config.provider === 'gemini') {
      const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com'
      const model = config.model || 'gemini-2.0-flash'
      const url = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${model}:generateContent`

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Gemini note generation error (${res.status}): ${err.substring(0, 300)}`)
      }

      const data = await res.json()
      return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
    }

    // OpenAI-compatible
    const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.deepseek.com')
    const model = config.model || 'deepseek-chat'
    const url = `${baseUrl}/v1/chat/completions`
    const isLocal = isLocalEndpoint(baseUrl)
    const authKey = apiKey || (isLocal ? 'ollama' : '')

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (authKey) headers['Authorization'] = `Bearer ${authKey}`

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`AI note generation error (${res.status}): ${err.substring(0, 300)}`)
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    return content.trim()
  }

  public async processLecture(lectureId: number): Promise<{ success: boolean; materialId?: number; error?: string }> {
    if (!this.db) {
      return { success: false, error: 'Database not initialized' }
    }

    const lecture = getLectureById(this.db, lectureId)
    if (!lecture) {
      return { success: false, error: 'Lecture not found' }
    }

    try {
      // Step 1: Update status to transcribing
      updateLectureStatus(this.db, lectureId, 'transcribing')
      this.emitStatus({ lectureId, status: 'transcribing' })

      // Step 2: Transcribe if not already transcribed
      let rawTranscript = lecture.raw_transcript
      if (!rawTranscript) {
        const transcribePromise = this.customTranscribeFn
          ? this.customTranscribeFn(lecture.audio_path)
          : TranscriptionService.transcribe(lecture.audio_path)
        const transcription = await transcribePromise
        rawTranscript = transcription.timestampedText || transcription.text
        updateLectureStatus(this.db, lectureId, 'transcribing', {
          raw_transcript: rawTranscript,
          duration_seconds: transcription.durationSeconds || lecture.duration_seconds
        })
      }

      // Step 3: Fetch subject name
      const subjectRow = this.db
        .prepare('SELECT name FROM subjects WHERE id = ?')
        .all(lecture.subject_id) as Array<{ name: string }>
      const subjectName = subjectRow.length > 0 ? subjectRow[0].name : 'Class'

      // Step 4: Synthesize structured Markdown notes
      const prompt = buildLectureNotesPrompt(rawTranscript, subjectName, lecture.title)
      let markdown = await this.callAIForMarkdown(prompt)

      // Strip outer markdown code block if LLM added them
      if (markdown.startsWith('```markdown')) {
        markdown = markdown.replace(/^```markdown\s*/, '').replace(/```\s*$/, '')
      } else if (markdown.startsWith('```md')) {
        markdown = markdown.replace(/^```md\s*/, '').replace(/```\s*$/, '')
      } else if (markdown.startsWith('```') && markdown.endsWith('```')) {
        markdown = markdown.replace(/^```\s*/, '').replace(/```\s*$/, '')
      }

      // Step 5: Insert into materials table
      const filename = `Lecture - ${lecture.title}.md`
      const contentBuffer = Buffer.from(markdown, 'utf-8')
      const insertStmt = this.db.prepare(`
        INSERT INTO materials (subject_id, filename, file_type, content_text, file_size)
        VALUES (?, ?, 'md', ?, ?)
      `)
      const matInfo = insertStmt.run(
        lecture.subject_id,
        filename,
        markdown,
        contentBuffer.length
      ) as { lastInsertRowid: number | bigint }
      const materialId = Number(matInfo.lastInsertRowid)

      // Step 6: Update lecture row with materialId and 'ready'
      updateLectureStatus(this.db, lectureId, 'ready', {
        material_id: materialId,
        raw_transcript: rawTranscript
      })
      this.emitStatus({ lectureId, status: 'ready', materialId })

      return { success: true, materialId }
    } catch (err: any) {
      console.error(`Error processing lecture ${lectureId}:`, err)
      const errorMessage = err?.message || 'Failed to process lecture'
      updateLectureStatus(this.db, lectureId, 'failed', { error_message: errorMessage })
      this.emitStatus({ lectureId, status: 'failed', error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }
}

export const LectureNotesService = new LectureNotesServiceManager()
