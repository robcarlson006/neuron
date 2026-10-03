import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HashRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import Settings from '../../src/pages/Settings'
import { useAppStore } from '../../src/store/appStore'

function installSettingsApi(): void {
  ;(window as any).electronAPI = {
    ...(window as any).electronAPI,
    getVersion: jest.fn().mockResolvedValue('test-version'),
    onDownloadProgress: jest.fn().mockReturnValue(() => {}),
    getMultiKeyVault: jest.fn().mockResolvedValue(null),
    getMeta: jest.fn().mockResolvedValue(null),
    setMeta: jest.fn().mockResolvedValue({ success: true }),
    getAIConfig: jest.fn().mockResolvedValue({ provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:8080', model: 'test-model' }),
    getHardwareProfile: jest.fn().mockResolvedValue({ totalMemoryGb: 8, freeMemoryGb: 4, cpuModel: 'Test CPU', cpuCores: 8, arch: 'arm64', platform: 'darwin', tier: 'balanced', recommendedModelId: 'test-model', tierReason: 'test' }),
    listLocalModels: jest.fn().mockResolvedValue([]),
    getLocalEngineStatus: jest.fn().mockResolvedValue({ isRunning: false }),
    onLocalDownloadProgress: jest.fn().mockReturnValue(() => {}),
    listWhisperModels: jest.fn().mockResolvedValue([]),
    onWhisperDownloadProgress: jest.fn().mockReturnValue(() => {}),
    getLectureSettings: jest.fn().mockResolvedValue({}),
    saveLectureSettings: jest.fn().mockResolvedValue({ success: true }),
    testAIConnection: jest.fn().mockResolvedValue({ success: true, message: 'Connected' }),
    saveAIConfig: jest.fn().mockResolvedValue({ success: true }),
    saveMultiKeyVault: jest.fn().mockResolvedValue({ success: true }),
    testSingleKey: jest.fn().mockResolvedValue({ success: true, message: 'Connected' }),
    openExternal: jest.fn(),
    openReleasePage: jest.fn()
  }
}

function renderSettings(router: React.ReactElement): ReturnType<typeof render> {
  useAppStore.setState({ user: { id: 1, name: 'Test User', created_at: new Date().toISOString() } })
  installSettingsApi()
  return render(router)
}

describe('Settings navigation and controls', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.location.hash = '#/settings'
    window.HTMLElement.prototype.scrollIntoView = jest.fn()
  })

  afterEach(() => {
    useAppStore.setState({ user: null })
  })

  it('scrolls to every Settings tab without changing the HashRouter route', async () => {
    renderSettings(
      <HashRouter>
        <Routes>
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </HashRouter>
    )

    const routeBefore = window.location.hash
    const tabs = ['profile', 'calendar', 'study', 'timers', 'ai', 'lecture', 'data', 'help', 'updates']
    for (const tab of tabs) {
      const target = document.getElementById(`settings-${tab}`)
      expect(target).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${tab === 'ai' ? 'AI' : tab}$`, 'i') , hidden: true }))
      expect(target?.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
      expect(window.location.hash).toBe(routeBefore)
    }
  })

  it('scrolls to a Settings section from a query deep link', async () => {
    renderSettings(
      <MemoryRouter initialEntries={['/settings?section=ai']}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(document.getElementById('settings-ai')?.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    })
  })

  it('surfaces async Settings failures instead of failing silently', async () => {
    renderSettings(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    )
    ;(window as any).electronAPI.setMeta = jest.fn().mockRejectedValue(new Error('settings write failed'))

    fireEvent.click(screen.getByRole('button', { name: /save algorithm settings/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('settings write failed'))
  })

  it('restores an update download after leaving and returning to Settings', async () => {
    ;(window as any).electronAPI.getUpdateState = jest.fn().mockResolvedValue({
      status: 'downloading',
      version: '5.0.2',
      downloadUrl: 'https://example.test/Neuron-5.0.2-arm64.dmg',
      releaseUrl: 'https://example.test/releases/5.0.2',
      progress: 42,
      filePath: ''
    })

    const { unmount } = renderSettings(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Downloading v5.0.2…')).toBeInTheDocument())
    expect(screen.getByText('42%')).toBeInTheDocument()

    unmount()
    renderSettings(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Downloading v5.0.2…')).toBeInTheDocument())
    expect(screen.getByText('42%')).toBeInTheDocument()
  })
})
