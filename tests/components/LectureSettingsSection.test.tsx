import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import LectureSettingsSection from '../../src/components/LectureSettingsSection'

describe('LectureSettingsSection Component', () => {
  const sampleWhisperModels = [
    {
      id: 'whisper-tiny-en',
      name: 'Whisper Tiny (English)',
      description: 'Ultra-fast speech model (~75 MB).',
      filename: 'ggml-tiny.en.bin',
      sizeBytes: 77700000,
      sizeDisplay: '~75 MB',
      status: 'not_downloaded' as const
    },
    {
      id: 'whisper-base-en',
      name: 'Whisper Base (English)',
      description: 'Higher accuracy speech model (~145 MB).',
      filename: 'ggml-base.en.bin',
      sizeBytes: 148000000,
      sizeDisplay: '~145 MB',
      status: 'ready' as const,
      localPath: '/mock/path/ggml-base.en.bin'
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    ;(window as any).electronAPI = {
      ...(window as any).electronAPI,
      getMeta: jest.fn().mockImplementation((key: string) => {
        if (key === 'transcription_provider') return Promise.resolve('auto')
        if (key === 'transcription_groq_key') return Promise.resolve('gsk_test123')
        if (key === 'transcription_openai_key') return Promise.resolve('')
        if (key === 'transcription_gemini_key') return Promise.resolve('')
        return Promise.resolve(null)
      }),
      setMeta: jest.fn().mockResolvedValue({ success: true }),
      listWhisperModels: jest.fn().mockResolvedValue(sampleWhisperModels),
      downloadWhisperModel: jest.fn().mockResolvedValue({ success: true }),
      cancelWhisperDownload: jest.fn().mockResolvedValue(true),
      deleteWhisperModel: jest.fn().mockResolvedValue(true),
      onWhisperDownloadProgress: jest.fn().mockReturnValue(() => {}),
      openExternal: jest.fn().mockResolvedValue(undefined),
      openReleasePage: jest.fn().mockResolvedValue(undefined)
    }
  })

  it('renders title, provider select, and microphone section', async () => {
    render(<LectureSettingsSection />)

    expect(screen.getByText(/Lecture Recording & Transcription/i)).toBeInTheDocument()
    expect(screen.getByText(/Default Microphone Input/i)).toBeInTheDocument()
    expect(screen.getByText(/Transcription Engine Preference/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByDisplayValue(/Auto \(Fastest available/i)).toBeInTheDocument()
    })
  })

  it('loads and saves transcription keys and preference', async () => {
    render(<LectureSettingsSection />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('gsk_test123')).toBeInTheDocument()
    })

    const saveBtn = screen.getByRole('button', { name: /Save Keys & Preference/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect((window as any).electronAPI.setMeta).toHaveBeenCalledWith('transcription_provider', 'auto')
      expect((window as any).electronAPI.setMeta).toHaveBeenCalledWith('transcription_groq_key', 'gsk_test123')
      expect(screen.getByText(/✓ Settings saved/i)).toBeInTheDocument()
    })
  })

  it('renders local Whisper models and triggers download', async () => {
    render(<LectureSettingsSection />)

    await waitFor(() => {
      expect(screen.getByText(/Whisper Tiny \(English\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Whisper Base \(English\)/i)).toBeInTheDocument()
    })

    // Whisper Base is ready
    expect(screen.getByText(/Ready for offline use/i)).toBeInTheDocument()

    // Whisper Tiny has a download button
    const downloadBtn = screen.getByRole('button', { name: /Download \(~75 MB\)/i })
    expect(downloadBtn).toBeInTheDocument()

    fireEvent.click(downloadBtn)
    expect((window as any).electronAPI.downloadWhisperModel).toHaveBeenCalledWith('whisper-tiny-en')
  })
})
