import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ClassCreationWizard from '../../src/pages/classes/ClassCreationWizard'
import { useAppStore } from '../../src/store/appStore'
import { FolderSyncService } from '../../electron/ipc/folderSyncService'
import { registerClassHandlers, setClassDatabase } from '../../electron/ipc/classHandlers'
import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'

// Mock react-router-dom
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn()
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

const registeredIpcHandlers = new Map<string, Function>()

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel: string, handler: Function) => {
      registeredIpcHandlers.set(channel, handler)
    })
  }
}))

function createTestDatabase(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')

  const statements = DB_SCHEMA.split(';').map((s) => s.trim()).filter((s) => s.length > 0)
  for (const statement of statements) {
    db.exec(statement + ';')
  }

  for (const migration of MIGRATIONS_SQL) {
    try {
      db.exec(migration)
    } catch {
      /* ignore */
    }
  }

  db.prepare("INSERT INTO users (id, name) VALUES (1, 'Test User')").run()
  return db
}

describe('ClassCreationWizard — Linked Folder Integration', () => {
  const mockUser = { id: 1, name: 'Test User', created_at: new Date().toISOString() }
  const onCloseMock = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()

    window.electronAPI.selectFolderDialog = jest.fn().mockResolvedValue('/Users/test/Documents/Bio101')
    window.electronAPI.classCreate = jest.fn().mockResolvedValue({
      success: true,
      subject: {
        id: 1,
        user_id: 1,
        name: 'Biology 101',
        status: 'active',
        subject_type: 'class',
        linked_folder_path: '/Users/test/Documents/Bio101',
        created_at: new Date().toISOString()
      },
      materials: [],
      deadlines: [],
      syllabusModules: [],
      syllabusGenerated: false
    })

    useAppStore.setState({
      user: mockUser,
      subjects: []
    })
  })

  async function navigateToMaterialsStep(): Promise<void> {
    fireEvent.change(screen.getByPlaceholderText(/e\.g\., Biology 101/i), {
      target: { value: 'Biology 101' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await waitFor(() => {
      expect(screen.getByText(/Upload your study materials/i)).toBeInTheDocument()
    })
  }

  it('renders "Link Local Folder" button in the Materials step', async () => {
    render(<ClassCreationWizard onClose={onCloseMock} />)
    await navigateToMaterialsStep()

    const linkButton = screen.getByRole('button', { name: /Link Local Folder/i })
    expect(linkButton).toBeInTheDocument()
  })

  it('clicking "Link Local Folder" calls selectFolderDialog and renders linked folder banner', async () => {
    render(<ClassCreationWizard onClose={onCloseMock} />)
    await navigateToMaterialsStep()

    const linkButton = screen.getByRole('button', { name: /Link Local Folder/i })
    fireEvent.click(linkButton)

    await waitFor(() => {
      expect(window.electronAPI.selectFolderDialog).toHaveBeenCalledTimes(1)
    })

    // Banner should display folder path and "Linked Folder" label
    await waitFor(() => {
      expect(screen.getByText(/Linked Folder/i)).toBeInTheDocument()
      expect(screen.getByText('/Users/test/Documents/Bio101')).toBeInTheDocument()
    })

    // Change and Remove buttons should be available
    expect(screen.getByRole('button', { name: /Change/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove/i })).toBeInTheDocument()
  })

  it('clicking "Remove" clears the linked folder and restores "Link Local Folder" button', async () => {
    render(<ClassCreationWizard onClose={onCloseMock} />)
    await navigateToMaterialsStep()

    // Link a folder first
    fireEvent.click(screen.getByRole('button', { name: /Link Local Folder/i }))
    await waitFor(() => {
      expect(screen.getByText('/Users/test/Documents/Bio101')).toBeInTheDocument()
    })

    // Click Remove
    fireEvent.click(screen.getByRole('button', { name: /Remove/i }))

    // Banner should disappear and Link Local Folder button should reappear
    await waitFor(() => {
      expect(screen.queryByText('/Users/test/Documents/Bio101')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Link Local Folder/i })).toBeInTheDocument()
    })
  })

  it('clicking "Change" allows selecting a different folder', async () => {
    render(<ClassCreationWizard onClose={onCloseMock} />)
    await navigateToMaterialsStep()

    // Link initial folder
    fireEvent.click(screen.getByRole('button', { name: /Link Local Folder/i }))
    await waitFor(() => {
      expect(screen.getByText('/Users/test/Documents/Bio101')).toBeInTheDocument()
    })

    // Prepare mock for changed folder
    window.electronAPI.selectFolderDialog = jest.fn().mockResolvedValue('/Users/test/Documents/Bio101-Updated')

    // Click Change
    fireEvent.click(screen.getByRole('button', { name: /Change/i }))

    await waitFor(() => {
      expect(window.electronAPI.selectFolderDialog).toHaveBeenCalledTimes(1)
      expect(screen.getByText('/Users/test/Documents/Bio101-Updated')).toBeInTheDocument()
    })
  })

  it('completing the wizard submits linkedFolderPath in class:create payload', async () => {
    render(<ClassCreationWizard onClose={onCloseMock} />)
    await navigateToMaterialsStep()

    // Select folder
    fireEvent.click(screen.getByRole('button', { name: /Link Local Folder/i }))
    await waitFor(() => {
      expect(screen.getByText('/Users/test/Documents/Bio101')).toBeInTheDocument()
    })

    // Continue to Deadlines
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await waitFor(() => {
      expect(screen.getByText(/Add key dates for this class/i)).toBeInTheDocument()
    })

    // Continue to Syllabus
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await waitFor(() => {
      expect(screen.getByText(/How do you want to set up the syllabus/i)).toBeInTheDocument()
    })

    // Continue to Review
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create Class/i })).toBeInTheDocument()
    })

    // Click Create Class
    fireEvent.click(screen.getByRole('button', { name: /Create Class/i }))

    await waitFor(() => {
      expect(window.electronAPI.classCreate).toHaveBeenCalledTimes(1)
      expect(window.electronAPI.classCreate).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          name: 'Biology 101',
          linkedFolderPath: '/Users/test/Documents/Bio101'
        })
      )
      expect(onCloseMock).toHaveBeenCalledTimes(1)
    })
  })
})

describe('classHandlers — class:create linkedFolderPath handling', () => {
  let db: any

  beforeEach(() => {
    registeredIpcHandlers.clear()
    jest.clearAllMocks()

    db = createTestDatabase()
    setClassDatabase(db)
    registerClassHandlers()

    jest.spyOn(FolderSyncService, 'startWatching').mockImplementation(() => {})
    jest.spyOn(FolderSyncService, 'scanAndSync').mockResolvedValue({
      success: true,
      addedCount: 2,
      updatedCount: 0
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('saves linked_folder_path to database and starts watching and triggers scanAndSync', async () => {
    const handler = registeredIpcHandlers.get('class:create')
    expect(handler).toBeDefined()
    if (!handler) throw new Error('Handler class:create not registered')

    const result = await handler(null, 1, {
      name: 'Neuroscience 201',
      subjectType: 'class',
      timeCommitmentMinutes: 90,
      status: 'active',
      materials: [],
      syllabusOption: 'later',
      linkedFolderPath: '/Users/test/Documents/Neuro201'
    })

    expect(result.success).toBe(true)
    expect(result.subject.linked_folder_path).toBe('/Users/test/Documents/Neuro201')

    // Verify persisted in database
    const row = db.prepare('SELECT linked_folder_path FROM subjects WHERE id = ?').get(result.subject.id)
    expect(row.linked_folder_path).toBe('/Users/test/Documents/Neuro201')

    // Verify FolderSyncService calls
    expect(FolderSyncService.startWatching).toHaveBeenCalledWith(
      result.subject.id,
      '/Users/test/Documents/Neuro201'
    )
    expect(FolderSyncService.scanAndSync).toHaveBeenCalledWith(
      db,
      result.subject.id,
      '/Users/test/Documents/Neuro201'
    )
  })
})
