import React, { useEffect, useState, useRef } from 'react'
import { useLectureRecordingStore } from '../../store/lectureRecordingStore'

interface AudioDeviceSelectorProps {
  compact?: boolean
  showMeter?: boolean
  className?: string
}

export default function AudioDeviceSelector({
  compact = false,
  showMeter = true,
  className = ''
}: AudioDeviceSelectorProps): React.JSX.Element {
  const { selectedDeviceId, setSelectedDeviceId, isRecording, audioLevel } = useLectureRecordingStore()
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [previewLevel, setPreviewLevel] = useState(0)
  const previewStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const animFrameRef = useRef<number | null>(null)

  const loadDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return
      // Request temporary permission to read device labels if needed
      const devList = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devList.filter((d) => d.kind === 'audioinput')
      setDevices(audioInputs)
    } catch (err) {
      console.error('Failed to list audio devices:', err)
    }
  }

  useEffect(() => {
    loadDevices()
    navigator.mediaDevices?.addEventListener('devicechange', loadDevices)
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', loadDevices)
    }
  }, [])

  // If not actively recording, run a lightweight preview level meter so user can see mic working
  useEffect(() => {
    if (isRecording || !showMeter) {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop())
        previewStreamRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
      return
    }

    let isMounted = true

    const startPreviewMeter = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          audio: selectedDeviceId && selectedDeviceId !== 'default' ? { deviceId: { exact: selectedDeviceId } } : true,
          video: false
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        previewStreamRef.current = stream
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (AudioCtx) {
          const ctx = new AudioCtx()
          audioContextRef.current = ctx
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 128
          source.connect(analyser)

          const data = new Uint8Array(analyser.frequencyBinCount)
          const update = () => {
            if (!isMounted) return
            analyser.getByteFrequencyData(data)
            let sum = 0
            for (let i = 0; i < data.length; i++) sum += data[i]
            const avg = sum / data.length
            setPreviewLevel(Math.min(100, Math.round((avg / 128) * 100)))
            animFrameRef.current = requestAnimationFrame(update)
          }
          update()
        }
      } catch {
        // mic preview optional
      }
    }

    startPreviewMeter()

    return () => {
      isMounted = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop())
        previewStreamRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }
    }
  }, [selectedDeviceId, isRecording, showMeter])

  const currentLevel = isRecording ? audioLevel : previewLevel

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex-1 min-w-[180px]">
        <select
          value={selectedDeviceId}
          disabled={isRecording}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
          className={`w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium focus:ring-2 focus:ring-violet-500 focus:outline-none transition-colors appearance-none pr-7 truncate disabled:opacity-60 ${
            compact ? 'py-1 pl-2.5' : 'py-1.5 pl-3'
          }`}
          title="Select Microphone Input"
        >
          <option value="default">Default System Microphone</option>
          {devices.map((device, idx) => (
            <option key={device.deviceId || idx} value={device.deviceId}>
              {device.label || `Microphone ${idx + 1}`}
            </option>
          ))}
        </select>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {showMeter && (
        <div
          className="w-12 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0 flex items-center p-0.5"
          title={`Input Level: ${currentLevel}%`}
        >
          <div
            className={`h-full rounded-full transition-all duration-75 ${
              currentLevel > 75
                ? 'bg-rose-500'
                : currentLevel > 25
                ? 'bg-emerald-500'
                : 'bg-slate-400 dark:bg-slate-500'
            }`}
            style={{ width: `${Math.max(8, currentLevel)}%` }}
          />
        </div>
      )}
    </div>
  )
}
