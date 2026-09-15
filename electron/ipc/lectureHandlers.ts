import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { LectureAudioService } from './lectureAudioService'
import type { CascadeDB } from '../../src/lib/db'
import type { Lecture } from '../../src/types'
import { LocalWhisperService } from './localWhisperService'
import { TranscriptionService } from './transcriptionService'

export function setLectureDatabase(database: Database.Database | CascadeDB): void {
  LectureAudioService.init(database)
}

export function registerLectureHandlers(): void {
  ipcMain.handle(
    'lecture:startRecording',
    async (
      _event,
      subjectId: number,
      title?: string
    ): Promise<{ sessionId: string; lectureId: number; audioPath: string }> => {
      return LectureAudioService.startRecording(subjectId, title)
    }
  )

  ipcMain.handle(
    'lecture:writeChunk',
    async (_event, sessionId: string, chunk: ArrayBuffer | Buffer): Promise<boolean> => {
      try {
        LectureAudioService.appendChunk(sessionId, chunk)
        return true
      } catch (err) {
        console.error('Failed to write audio chunk:', err)
        return false
      }
    }
  )

  ipcMain.handle(
    'lecture:stopRecording',
    async (
      _event,
      sessionId: string,
      durationSeconds: number
    ): Promise<{ lectureId: number; audioPath: string; fileSizeBytes: number }> => {
      const result = await LectureAudioService.finalizeRecording(sessionId, durationSeconds)
      // Trigger background processing if handler registered
      if (onRecordingFinalized) {
        onRecordingFinalized(result.lectureId).catch((err) => {
          console.error('Error starting background transcription for lecture:', err)
        })
      }
      return result
    }
  )

  ipcMain.handle('lecture:abortRecording', async (_event, sessionId: string): Promise<boolean> => {
    try {
      await LectureAudioService.abortRecording(sessionId)
      return true
    } catch (err) {
      console.error('Failed to abort recording:', err)
      return false
    }
  })

  ipcMain.handle('lecture:list', async (_event, subjectId: number): Promise<Lecture[]> => {
    return LectureAudioService.listLectures(subjectId)
  })

  ipcMain.handle('lecture:get', async (_event, lectureId: number): Promise<Lecture | null> => {
    return LectureAudioService.getLecture(lectureId)
  })

  ipcMain.handle(
    'lecture:delete',
    async (_event, lectureId: number, deleteAudioFile = true): Promise<boolean> => {
      return LectureAudioService.deleteLecture(lectureId, deleteAudioFile)
    }
  )

  ipcMain.handle('lecture:getAudioUrl', async (_event, audioPath: string): Promise<string> => {
    if (!audioPath) return ''
    return `neuron-audio://${encodeURIComponent(audioPath)}`
  })

  ipcMain.handle('lecture:retryTranscription', async (_event, lectureId: number): Promise<boolean> => {
    if (onRecordingFinalized) {
      onRecordingFinalized(lectureId).catch((err) => {
        console.error('Error retrying transcription for lecture:', err)
      })
      return true
    }
    return false
  })

  ipcMain.handle(
    'lecture:testTranscriptionConnection',
    async (_event, params: { provider: string; apiKey?: string }) => {
      return TranscriptionService.testConnection(params)
    }
  )

  // ── Local Whisper Models ──
  ipcMain.handle('whisper:listModels', async () => {
    return LocalWhisperService.listModels()
  })

  ipcMain.handle('whisper:downloadModel', async (_event, modelId: string) => {
    return LocalWhisperService.downloadModel(modelId)
  })

  ipcMain.handle('whisper:cancelDownload', async (_event, modelId: string) => {
    return LocalWhisperService.cancelDownload(modelId)
  })

  ipcMain.handle('whisper:deleteModel', async (_event, modelId: string) => {
    return LocalWhisperService.deleteModel(modelId)
  })

  ipcMain.handle('whisper:getModelStatus', async (_event, modelId: string) => {
    return LocalWhisperService.getModelStatus(modelId)
  })

  ipcMain.handle('whisper:findBinary', async () => {
    return LocalWhisperService.findWhisperBinary()
  })
}

type RecordingFinalizedCallback = (lectureId: number) => Promise<void>
let onRecordingFinalized: RecordingFinalizedCallback | null = null

export function setOnRecordingFinalized(cb: RecordingFinalizedCallback): void {
  onRecordingFinalized = cb
}
