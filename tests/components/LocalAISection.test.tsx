import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import LocalAISection from '../../src/components/LocalAISection'
import type { LocalModelInfo } from '../../src/types'

describe('LocalAISection Component', () => {
  const sampleModels: LocalModelInfo[] = [
    {
      id: 'qwen-2.5-1.5b',
      name: 'Qwen 2.5 1.5B Instruct',
      description: 'Ultra-lightweight model.',
      filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
      downloadUrl: 'https://huggingface.co/sample/1.5b.gguf',
      sizeBytes: 1100000000,
      sizeDisplay: '1.1 GB',
      ramRequirementDisplay: '~1.6 GB RAM',
      status: 'not_downloaded',
      isRecommended: false
    },
    {
      id: 'qwen-2.5-3b',
      name: 'Qwen 2.5 3B Instruct',
      description: 'Balanced speed & high accuracy.',
      filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
      downloadUrl: 'https://huggingface.co/sample/3b.gguf',
      sizeBytes: 2200000000,
      sizeDisplay: '2.2 GB',
      ramRequirementDisplay: '~2.8 GB RAM',
      status: 'not_downloaded',
      isRecommended: true
    },
    {
      id: 'qwen-2.5-7b',
      name: 'Qwen 2.5 7B Instruct',
      description: 'Highest reasoning and card generation quality.',
      filename: 'qwen2.5-7b-instruct-q4_k_m.gguf',
      downloadUrl: 'https://huggingface.co/sample/7b.gguf',
      sizeBytes: 4700000000,
      sizeDisplay: '4.7 GB',
      ramRequirementDisplay: '~5.5 GB RAM',
      status: 'ready',
      isRecommended: false
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    window.electronAPI.listLocalModels = jest.fn().mockResolvedValue(sampleModels)
    window.electronAPI.getHardwareProfile = jest.fn().mockResolvedValue({
      totalMemoryGb: 8.0,
      freeMemoryGb: 4.2,
      cpuModel: 'Apple M2',
      cpuCores: 8,
      arch: 'arm64',
      platform: 'darwin',
      tier: 'balanced',
      recommendedModelId: 'qwen-2.5-3b',
      tierReason: 'System has 8–12 GB RAM. Qwen 2.5 3B delivers high reasoning & JSON accuracy.'
    })
  })

  it('renders hardware profile with memory, CPU, and recommendation tier', async () => {
    render(<LocalAISection />)

    await waitFor(() => {
      expect(screen.getByText(/Local AI & Hardware Specs/i)).toBeInTheDocument()
      expect(screen.getByText(/8 GB \(4.2 GB free\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Apple M2 \(8 cores\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Balanced Tier/i)).toBeInTheDocument()
      expect(screen.getByText(/Qwen 2.5 3B \(Balanced\)/i)).toBeInTheDocument()
    })
  })

  it('renders model list with file sizes and does NOT trigger downloads automatically', async () => {
    render(<LocalAISection />)

    await waitFor(() => {
      expect(screen.getByText('Qwen 2.5 1.5B Instruct')).toBeInTheDocument()
      expect(screen.getByText('Qwen 2.5 3B Instruct')).toBeInTheDocument()
      expect(screen.getByText('Qwen 2.5 7B Instruct')).toBeInTheDocument()
    })

    // Assert that NO download was triggered on mount
    expect(window.electronAPI.downloadLocalModel).not.toHaveBeenCalled()

    // Assert download buttons exist with their sizes
    expect(screen.getByRole('button', { name: /Download \(1\.1 GB\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download \(2\.2 GB\)/i })).toBeInTheDocument()

    // Downloaded model shows Use Model
    expect(screen.getByRole('button', { name: /Use Model/i })).toBeInTheDocument()
  })

  it('triggers download ONLY when user explicitly clicks the Download button', async () => {
    render(<LocalAISection />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download \(2\.2 GB\)/i })).toBeInTheDocument()
    })

    const downloadButton = screen.getByRole('button', { name: /Download \(2\.2 GB\)/i })
    fireEvent.click(downloadButton)

    expect(window.electronAPI.downloadLocalModel).toHaveBeenCalledTimes(1)
    expect(window.electronAPI.downloadLocalModel).toHaveBeenCalledWith('qwen-2.5-3b')
  })

  it('triggers model selection when clicking Use Model on a ready model', async () => {
    const onSelectModel = jest.fn()
    window.electronAPI.startLocalEngine = jest.fn().mockResolvedValue({ success: true, port: 8080 })

    render(<LocalAISection onSelectModel={onSelectModel} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Use Model/i })).toBeInTheDocument()
    })

    const useButton = screen.getByRole('button', { name: /Use Model/i })
    fireEvent.click(useButton)

    await waitFor(() => {
      expect(window.electronAPI.startLocalEngine).toHaveBeenCalledWith('qwen-2.5-7b')
      expect(onSelectModel).toHaveBeenCalledWith('http://127.0.0.1:8080', 'Qwen 2.5 7B Instruct')
    })
  })
})
