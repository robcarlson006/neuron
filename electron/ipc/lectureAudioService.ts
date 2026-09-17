import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import {
  createLecture,
  getLectureById,
  listLecturesBySubject,
  updateLectureStatus,
  deleteLecture as dbDeleteLecture,
  type CascadeDB
} from '../../src/lib/db'
import type { Lecture } from '../../src/types'

export interface ActiveRecordingSession {
  sessionId: string
  lectureId: number
  filePath: string
  writeStream: fs.WriteStream
  bytesWritten: number
  startTime: number
  subjectId: number
  title: string
}

class LectureAudioServiceManager {
  private db: CascadeDB | null = null
  private storageDir: string | null = null
  private activeSessions = new Map<string, ActiveRecordingSession>()

  public init(database: CascadeDB, customStorageDir?: string): void {
    this.db = database
    this.storageDir = customStorageDir || this.resolveDefaultStorageDir()
    this.ensureStorageDir()
  }

  private resolveDefaultStorageDir(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron')
      if (app && typeof app.getPath === 'function') {
        return path.join(app.getPath('userData'), 'recordings')
      }
    } catch {
      // fallback
    }
    return path.join(process.cwd(), 'recordings')
  }

  private ensureStorageDir(): void {
    if (!this.storageDir) return
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true })
    }
  }

  public startRecording(
    subjectId: number,
    title?: string
  ): { sessionId: string; lectureId: number; audioPath: string } {
    if (!this.db) throw new Error('Database not initialized in LectureAudioService')
    this.ensureStorageDir()

    const sessionId = uuidv4()
    const lectureTitle =
      title?.trim() ||
      `Lecture - ${new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })}`

    const filename = `lecture_${subjectId}_${Date.now()}_${sessionId.slice(0, 8)}.webm`
    const filePath = path.join(this.storageDir!, filename)

    // Create empty file & stream
    fs.writeFileSync(filePath, Buffer.alloc(0))
    const writeStream = fs.createWriteStream(filePath, { flags: 'a' })
    writeStream.on('error', (err) => {
      console.error(`Audio writeStream error for session ${sessionId}:`, err)
    })

    const lecture = createLecture(this.db, {
      subject_id: subjectId,
      title: lectureTitle,
      audio_path: filePath,
      audio_mime_type: 'audio/webm',
      duration_seconds: 0,
      file_size_bytes: 0,
      status: 'recording'
    })

    const session: ActiveRecordingSession = {
      sessionId,
      lectureId: lecture.id,
      filePath,
      writeStream,
      bytesWritten: 0,
      startTime: Date.now(),
      subjectId,
      title: lectureTitle
    }

    this.activeSessions.set(sessionId, session)

    return {
      sessionId,
      lectureId: lecture.id,
      audioPath: filePath
    }
  }

  public appendChunk(sessionId: string, chunk: Buffer | ArrayBuffer): void {
    const session = this.activeSessions.get(sessionId)
    if (!session) {
      throw new Error(`Active recording session not found: ${sessionId}`)
    }

    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    session.writeStream.write(buffer)
    session.bytesWritten += buffer.length
  }

  public async finalizeRecording(
    sessionId: string,
    durationSeconds: number
  ): Promise<{ lectureId: number; audioPath: string; fileSizeBytes: number }> {
    const session = this.activeSessions.get(sessionId)
    if (!session) {
      throw new Error(`Active recording session not found: ${sessionId}`)
    }

    await new Promise<void>((resolve, reject) => {
      session.writeStream.end(() => resolve())
      session.writeStream.on('error', reject)
    })

    let fileSizeBytes = session.bytesWritten
    try {
      const stat = fs.statSync(session.filePath)
      fileSizeBytes = stat.size
    } catch {
      // use accumulated bytes
    }

    if (this.db) {
      updateLectureStatus(this.db, session.lectureId, 'recorded', {
        duration_seconds: Math.max(1, Math.round(durationSeconds)),
        file_size_bytes: fileSizeBytes
      })
    }

    this.activeSessions.delete(sessionId)

    return {
      lectureId: session.lectureId,
      audioPath: session.filePath,
      fileSizeBytes
    }
  }

  public async abortRecording(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId)
    if (!session) return

    await new Promise<void>((resolve) => {
      session.writeStream.end(() => resolve())
    })

    try {
      if (fs.existsSync(session.filePath)) {
        fs.unlinkSync(session.filePath)
      }
    } catch {
      // ignore
    }

    if (this.db) {
      dbDeleteLecture(this.db, session.lectureId)
    }

    this.activeSessions.delete(sessionId)
  }

  public getLecture(lectureId: number): Lecture | null {
    if (!this.db) return null
    return getLectureById(this.db, lectureId)
  }

  public listLectures(subjectId: number): Lecture[] {
    if (!this.db) return []
    return listLecturesBySubject(this.db, subjectId)
  }

  public async deleteLecture(lectureId: number, deleteAudioFile = true): Promise<boolean> {
    if (!this.db) return false
    const lecture = getLectureById(this.db, lectureId)
    if (!lecture) return false

    if (deleteAudioFile && lecture.audio_path) {
      try {
        if (fs.existsSync(lecture.audio_path)) {
          fs.unlinkSync(lecture.audio_path)
        }
      } catch {
        // ignore
      }
    }

    dbDeleteLecture(this.db, lectureId)
    return true
  }

  public getSession(sessionId: string): ActiveRecordingSession | undefined {
    return this.activeSessions.get(sessionId)
  }
}

export const LectureAudioService = new LectureAudioServiceManager()
