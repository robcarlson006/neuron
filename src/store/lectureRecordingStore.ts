import { create } from 'zustand'

export interface LectureRecordingState {
  isRecording: boolean
  isPaused: boolean
  sessionId: string | null
  lectureId: number | null
  subjectId: number | null
  subjectName: string | null
  lectureTitle: string
  elapsedSeconds: number
  selectedDeviceId: string
  audioLevel: number
  error: string | null

  // Actions
  setSelectedDeviceId: (id: string) => void
  startRecording: (subjectId: number, subjectName: string, title?: string) => Promise<boolean>
  pauseRecording: () => void
  resumeRecording: () => void
  stopRecording: () => Promise<{ lectureId: number } | null>
  cancelRecording: () => Promise<void>
  clearError: () => void
}

let activeMediaStream: MediaStream | null = null
let activeMediaRecorder: MediaRecorder | null = null
let timerInterval: ReturnType<typeof setInterval> | null = null
let audioContext: AudioContext | null = null
let analyserNode: AnalyserNode | null = null
let animFrameId: number | null = null
const pendingChunkPromises = new Set<Promise<any>>()

function cleanupAudioNodesAndStream(): void {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
  if (animFrameId) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }
  if (activeMediaStream) {
    activeMediaStream.getTracks().forEach((track) => track.stop())
    activeMediaStream = null
  }
  if (audioContext && audioContext.state !== 'closed') {
    try {
      audioContext.close()
    } catch {
      // ignore
    }
    audioContext = null
  }
  analyserNode = null
}

async function gracefulStopRecorder(): Promise<void> {
  if (activeMediaRecorder && activeMediaRecorder.state !== 'inactive') {
    await new Promise<void>((resolve) => {
      const recorder = activeMediaRecorder!
      recorder.onstop = () => resolve()
      try {
        recorder.stop()
      } catch {
        resolve()
      }
    })
  }
  activeMediaRecorder = null
  // Wait for all in-flight chunk sends to finish
  if (pendingChunkPromises.size > 0) {
    await Promise.all(Array.from(pendingChunkPromises))
  }
}

function cleanupAudioPipeline(): void {
  if (activeMediaRecorder && activeMediaRecorder.state !== 'inactive') {
    try {
      activeMediaRecorder.stop()
    } catch {
      // ignore
    }
  }
  activeMediaRecorder = null
  cleanupAudioNodesAndStream()
}

export const useLectureRecordingStore = create<LectureRecordingState>((set, get) => ({
  isRecording: false,
  isPaused: false,
  sessionId: null,
  lectureId: null,
  subjectId: null,
  subjectName: null,
  lectureTitle: '',
  elapsedSeconds: 0,
  selectedDeviceId: typeof localStorage !== 'undefined' ? localStorage.getItem('neuron_preferred_mic') || 'default' : 'default',
  audioLevel: 0,
  error: null,

  setSelectedDeviceId: (id: string) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('neuron_preferred_mic', id)
    }
    set({ selectedDeviceId: id })
  },

  startRecording: async (subjectId: number, subjectName: string, title?: string) => {
    cleanupAudioPipeline()
    set({ error: null })

    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available')
      }

      // Step 1: Start session in main process
      const startResult = await window.electronAPI.startLectureRecording(subjectId, title)
      const sessionId = startResult.sessionId
      const lectureId = startResult.lectureId

      // Step 2: Request microphone stream
      const deviceId = get().selectedDeviceId
      const constraints: MediaStreamConstraints = {
        audio:
          deviceId && deviceId !== 'default'
            ? { deviceId: { exact: deviceId } }
            : true,
        video: false
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (micErr: any) {
        // Fallback to default audio if specific device not available
        if (deviceId && deviceId !== 'default') {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        } else {
          throw micErr
        }
      }

      activeMediaStream = stream

      // Step 3: Audio level analysis for visual feedback
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (AudioCtx) {
          audioContext = new AudioCtx()
          const source = audioContext.createMediaStreamSource(stream)
          analyserNode = audioContext.createAnalyser()
          analyserNode.fftSize = 256
          source.connect(analyserNode)

          const dataArray = new Uint8Array(analyserNode.frequencyBinCount)
          const checkLevel = (): void => {
            if (!analyserNode) return
            analyserNode.getByteFrequencyData(dataArray)
            let sum = 0
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i]
            }
            const avg = sum / dataArray.length
            const levelPct = Math.min(100, Math.round((avg / 128) * 100))
            set({ audioLevel: levelPct })
            animFrameId = requestAnimationFrame(checkLevel)
          }
          checkLevel()
        }
      } catch {
        // audio analyzer is optional
      }

      // Step 4: Setup MediaRecorder with 15-second slices
      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''
      }

      const recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: 32000
      }
      if (mimeType) {
        recorderOptions.mimeType = mimeType
      }

      const recorder = new MediaRecorder(stream, recorderOptions)
      activeMediaRecorder = recorder

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          const chunkPromise = (async () => {
            try {
              const buffer = await event.data.arrayBuffer()
              if (window.electronAPI) {
                await window.electronAPI.sendLectureAudioChunk(sessionId, buffer)
              }
            } catch (err) {
              console.error('Error sending audio chunk:', err)
            }
          })()
          pendingChunkPromises.add(chunkPromise)
          chunkPromise.finally(() => pendingChunkPromises.delete(chunkPromise))
        }
      }

      // Stream chunks to disk every 15 seconds
      recorder.start(15000)

      // Step 5: Start seconds timer
      timerInterval = setInterval(() => {
        const state = get()
        if (state.isRecording && !state.isPaused) {
          set({ elapsedSeconds: state.elapsedSeconds + 1 })
        }
      }, 1000)

      set({
        isRecording: true,
        isPaused: false,
        sessionId,
        lectureId,
        subjectId,
        subjectName,
        lectureTitle: title?.trim() || `Lecture - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        elapsedSeconds: 0
      })

      return true
    } catch (err: any) {
      cleanupAudioPipeline()
      const msg = err?.message || 'Failed to start lecture recording'
      set({ error: msg, isRecording: false })
      return false
    }
  },

  pauseRecording: () => {
    if (activeMediaRecorder && activeMediaRecorder.state === 'recording') {
      try {
        activeMediaRecorder.pause()
      } catch {
        // ignore
      }
    }
    set({ isPaused: true })
  },

  resumeRecording: () => {
    if (activeMediaRecorder && activeMediaRecorder.state === 'paused') {
      try {
        activeMediaRecorder.resume()
      } catch {
        // ignore
      }
    }
    set({ isPaused: false })
  },

  stopRecording: async () => {
    const { sessionId, elapsedSeconds } = get()
    if (!sessionId) return null

    try {
      await gracefulStopRecorder()
      cleanupAudioNodesAndStream()

      let result: { lectureId: number } | null = null
      if (window.electronAPI) {
        result = await window.electronAPI.stopLectureRecording(sessionId, elapsedSeconds)
      }

      set({
        isRecording: false,
        isPaused: false,
        sessionId: null,
        lectureId: null,
        subjectId: null,
        subjectName: null,
        elapsedSeconds: 0,
        audioLevel: 0
      })

      return result
    } catch (err: any) {
      console.error('Error stopping recording:', err)
      set({ error: err?.message || 'Failed to finalize lecture recording' })
      return null
    }
  },

  cancelRecording: async () => {
    const { sessionId } = get()
    cleanupAudioPipeline()

    if (sessionId && window.electronAPI) {
      try {
        await window.electronAPI.abortLectureRecording(sessionId)
      } catch {
        // ignore
      }
    }

    set({
      isRecording: false,
      isPaused: false,
      sessionId: null,
      lectureId: null,
      subjectId: null,
      subjectName: null,
      elapsedSeconds: 0,
      audioLevel: 0
    })
  },

  clearError: () => set({ error: null })
}))
