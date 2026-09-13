import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import UnifiedSubjectDetail from '../../src/pages/UnifiedSubjectDetail'
import { useAppStore } from '../../src/store/appStore'
import type { Subject, Material, FolderSyncEvent } from '../../src/types'

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
  useParams: () => ({ id: '1' })
}))

// Mock PomodoroWidget and CurriculumView to keep test focused
jest.mock('../../src/components/PomodoroWidget', () => () => <div data-testid="pomodoro-widget" />)
jest.mock('../../src/components/classes/CurriculumView', () => () => <div data-testid="curriculum-view" />)
jest.mock('../../src/components/CardBrowser', () => () => <div data-testid="card-browser" />)

describe('UnifiedSubjectDetail — Linked Folder & Live Sync', () => {
  const mockUser = { id: 1, name: 'Test User', created_at: new Date().toISOString() }

  const baseSubject: Subject = {
    id: 1,
    user_id: 1,
    name: 'Biology 101',
    status: 'active',
    subject_type: 'class',
    created_at: new Date().toISOString()
  }

  const mockMaterials: Material[] = [
    {
      id: 10,
      subject_id: 1,
      filename: 'lecture1.pdf',
      relative_path: 'Week 1/lecture1.pdf',
      file_type: 'pdf',
      content_text: 'Intro to biology',
      uploaded_at: new Date().toISOString()
    },
    {
      id: 11,
      subject_id: 1,
      filename: 'syllabus.pdf',
      relative_path: 'syllabus.pdf',
      file_type: 'pdf',
      content_text: 'Course syllabus',
      uploaded_at: new Date().toISOString()
    }
  ]

  let folderSyncCallback: ((event: FolderSyncEvent) => void) | null = null

  beforeEach(() => {
    jest.clearAllMocks()
    folderSyncCallback = null

    // Window electronAPI mocks
    window.electronAPI.getCards = jest.fn().mockResolvedValue([])
    window.electronAPI.getDeadlines = jest.fn().mockResolvedValue([])
    window.electronAPI.getFolders = jest.fn().mockResolvedValue([])
    window.electronAPI.getMaterials = jest.fn().mockResolvedValue(mockMaterials)
    window.electronAPI.syllabusListModules = jest.fn().mockResolvedValue([])
    window.electronAPI.getConceptMastery = jest.fn().mockResolvedValue([])
    window.electronAPI.selectFolderDialog = jest.fn().mockResolvedValue('/Users/test/Documents/Bio101')
    window.electronAPI.linkFolderToClass = jest.fn().mockResolvedValue({
      success: true,
      addedCount: 2,
      updatedCount: 0
    })
    window.electronAPI.unlinkFolderFromClass = jest.fn().mockResolvedValue({ success: true })
    window.electronAPI.syncClassFolder = jest.fn().mockResolvedValue({
      success: true,
      addedCount: 1,
      updatedCount: 0
    })
    window.electronAPI.openFolder = jest.fn().mockResolvedValue(undefined)
    window.electronAPI.onFolderSync = jest.fn().mockImplementation((cb: (event: FolderSyncEvent) => void) => {
      folderSyncCallback = cb
      return jest.fn()
    })

    // Store state
    useAppStore.setState({
      user: mockUser,
      subjects: [baseSubject]
    })
  })

  it('renders "Link Folder" button when subject has no linked folder and clicking links a folder', async () => {
    render(<UnifiedSubjectDetail />)

    // Switch to Materials tab
    const materialsTab = await screen.findByRole('button', { name: /^Materials/i })
    fireEvent.click(materialsTab)

    // "Link Folder" button should be visible
    const linkButton = await screen.findByRole('button', { name: /Link Folder/i })
    expect(linkButton).toBeInTheDocument()

    // Clicking it triggers selectFolderDialog and linkFolderToClass
    fireEvent.click(linkButton)

    await waitFor(() => {
      expect(window.electronAPI.selectFolderDialog).toHaveBeenCalledTimes(1)
      expect(window.electronAPI.linkFolderToClass).toHaveBeenCalledWith(1, '/Users/test/Documents/Bio101')
    })
  })

  it('renders Linked Folder Bar when linked_folder_path is present', async () => {
    const linkedSubject: Subject = {
      ...baseSubject,
      linked_folder_path: '/Users/test/Documents/Bio101',
      folder_sync_status: 'idle',
      folder_last_synced_at: new Date().toISOString()
    }
    useAppStore.setState({
      subjects: [linkedSubject]
    })

    render(<UnifiedSubjectDetail />)

    // Switch to Materials tab
    const materialsTab = await screen.findByRole('button', { name: /^Materials/i })
    fireEvent.click(materialsTab)

    // Folder base name should be displayed
    expect(await screen.findByText('Bio101')).toBeInTheDocument()

    // Status badge "Watching"
    expect(screen.getByText(/Watching/i)).toBeInTheDocument()

    // Action buttons
    expect(screen.getByRole('button', { name: /Sync Now/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open in Finder/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unlink/i })).toBeInTheDocument()

    // "Link Folder" button should NOT be rendered
    expect(screen.queryByRole('button', { name: /Link Folder/i })).not.toBeInTheDocument()
  })

  it('calls syncClassFolder when "Sync Now" is clicked', async () => {
    const linkedSubject: Subject = {
      ...baseSubject,
      linked_folder_path: '/Users/test/Documents/Bio101',
      folder_sync_status: 'idle',
      folder_last_synced_at: new Date().toISOString()
    }
    useAppStore.setState({
      subjects: [linkedSubject]
    })

    render(<UnifiedSubjectDetail />)

    const materialsTab = await screen.findByRole('button', { name: /^Materials/i })
    fireEvent.click(materialsTab)

    const syncBtn = await screen.findByRole('button', { name: /Sync Now/i })
    fireEvent.click(syncBtn)

    await waitFor(() => {
      expect(window.electronAPI.syncClassFolder).toHaveBeenCalledWith(1)
    })
  })

  it('calls openFolder when "Open in Finder" is clicked', async () => {
    const linkedSubject: Subject = {
      ...baseSubject,
      linked_folder_path: '/Users/test/Documents/Bio101',
      folder_sync_status: 'idle',
      folder_last_synced_at: new Date().toISOString()
    }
    useAppStore.setState({
      subjects: [linkedSubject]
    })

    render(<UnifiedSubjectDetail />)

    const materialsTab = await screen.findByRole('button', { name: /^Materials/i })
    fireEvent.click(materialsTab)

    const openBtn = await screen.findByRole('button', { name: /Open in Finder/i })
    fireEvent.click(openBtn)

    await waitFor(() => {
      expect(window.electronAPI.openFolder).toHaveBeenCalledWith('/Users/test/Documents/Bio101')
    })
  })

  it('calls unlinkFolderFromClass after user confirms Unlink', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true)

    const linkedSubject: Subject = {
      ...baseSubject,
      linked_folder_path: '/Users/test/Documents/Bio101',
      folder_sync_status: 'idle',
      folder_last_synced_at: new Date().toISOString()
    }
    useAppStore.setState({
      subjects: [linkedSubject]
    })

    render(<UnifiedSubjectDetail />)

    const materialsTab = await screen.findByRole('button', { name: /^Materials/i })
    fireEvent.click(materialsTab)

    const unlinkBtn = await screen.findByRole('button', { name: /Unlink/i })
    fireEvent.click(unlinkBtn)

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled()
      expect(window.electronAPI.unlinkFolderFromClass).toHaveBeenCalledWith(1)
    })
  })

  it('displays relative_path badge on material items when present', async () => {
    render(<UnifiedSubjectDetail />)

    const materialsTab = await screen.findByRole('button', { name: /^Materials/i })
    fireEvent.click(materialsTab)

    // Check that lecture1.pdf and its relative_path badge are rendered
    expect(await screen.findByText('lecture1.pdf')).toBeInTheDocument()
    expect(screen.getByText(/Week 1\/lecture1\.pdf/i)).toBeInTheDocument()
  })

  it('reloads materials and shows toast on folder:sync-event', async () => {
    render(<UnifiedSubjectDetail />)

    await waitFor(() => {
      expect(window.electronAPI.onFolderSync).toHaveBeenCalled()
    })

    expect(folderSyncCallback).toBeDefined()

    // Reset getMaterials to check it gets called again on event
    ;(window.electronAPI.getMaterials as jest.Mock).mockClear()

    act(() => {
      folderSyncCallback!({
        subjectId: 1,
        added: ['Week 2/lecture2.pdf'],
        updated: [],
        timestamp: new Date().toISOString()
      })
    })

    await waitFor(() => {
      expect(window.electronAPI.getMaterials).toHaveBeenCalledWith(1)
      expect(screen.getByText(/Synced folder/i)).toBeInTheDocument()
    })
  })
})
