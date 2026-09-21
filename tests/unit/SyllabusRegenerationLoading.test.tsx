import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import UnifiedSubjectDetail from '../../src/pages/UnifiedSubjectDetail'
import ClassOverview from '../../src/pages/classes/ClassOverview'
import { useAppStore } from '../../src/store/appStore'
import type { Subject, Material } from '../../src/types'

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
  useParams: () => ({ id: '1' })
}))

jest.mock('../../src/components/PomodoroWidget', () => () => <div data-testid="pomodoro-widget" />)
jest.mock('../../src/components/classes/CurriculumView', () => () => <div data-testid="curriculum-view" />)
jest.mock('../../src/components/CardBrowser', () => () => <div data-testid="card-browser" />)

describe('Syllabus Regeneration Loading Progress Bar', () => {
  const mockUser = { id: 1, name: 'Test User', created_at: new Date().toISOString() }

  const baseSubject: Subject = {
    id: 1,
    user_id: 1,
    name: 'Biology 101',
    status: 'active',
    subject_type: 'class',
    syllabus_generated: 1,
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
    }
  ]

  const mockModules = [
    {
      id: 101,
      subject_id: 1,
      title: 'Module 1: Cellular Biology',
      description: 'Basics of cells',
      week_number: 1,
      status: 'completed' as const,
      sort_order: 0,
      created_at: new Date().toISOString()
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    window.confirm = jest.fn().mockReturnValue(true)

    window.electronAPI.getCards = jest.fn().mockResolvedValue([])
    window.electronAPI.getDeadlines = jest.fn().mockResolvedValue([])
    window.electronAPI.getFolders = jest.fn().mockResolvedValue([])
    window.electronAPI.getMaterials = jest.fn().mockResolvedValue(mockMaterials)
    window.electronAPI.syllabusListModules = jest.fn().mockResolvedValue(mockModules)
    window.electronAPI.syllabusListTopics = jest.fn().mockResolvedValue([])
    window.electronAPI.getConceptMastery = jest.fn().mockResolvedValue([])
    window.electronAPI.onFolderSync = jest.fn().mockReturnValue(jest.fn())

    useAppStore.setState({
      user: mockUser,
      subjects: [baseSubject]
    })
  })

  test('shows LoadingProgressBar in UnifiedSubjectDetail when regenerating syllabus', async () => {
    let resolveSyllabusGen: (val: any) => void = () => {}
    const syllabusGenPromise = new Promise(res => {
      resolveSyllabusGen = res
    })
    window.electronAPI.syllabusGenerateFromMaterials = jest.fn().mockImplementation(() => syllabusGenPromise)

    render(<UnifiedSubjectDetail />)

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Regenerate syllabus from materials')).toBeInTheDocument()
    })

    // Click regenerate button
    fireEvent.click(screen.getByText('Regenerate syllabus from materials'))

    // Loading bar should be shown
    await waitFor(() => {
      expect(screen.getByTestId('loading-progress-bar')).toBeInTheDocument()
      expect(screen.getByText('Structuring & Reconciling Curriculum...')).toBeInTheDocument()
      expect(screen.getByText('Regenerating syllabus...')).toBeInTheDocument()
    })

    // Resolve generation
    resolveSyllabusGen(mockModules)

    // Loading bar should disappear
    await waitFor(() => {
      expect(screen.queryByText('Structuring & Reconciling Curriculum...')).not.toBeInTheDocument()
      expect(screen.getByText('Regenerate syllabus from materials')).toBeInTheDocument()
    })
  })

  test('shows LoadingProgressBar in ClassOverview when regenerating syllabus', async () => {
    let resolveSyllabusGen: (val: any) => void = () => {}
    const syllabusGenPromise = new Promise(res => {
      resolveSyllabusGen = res
    })
    window.electronAPI.syllabusGenerateFromMaterials = jest.fn().mockImplementation(() => syllabusGenPromise)

    render(<ClassOverview />)

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Regenerate syllabus from materials')).toBeInTheDocument()
    })

    // Click regenerate button
    fireEvent.click(screen.getByText('Regenerate syllabus from materials'))

    // Loading bar should be shown
    await waitFor(() => {
      expect(screen.getByTestId('loading-progress-bar')).toBeInTheDocument()
      expect(screen.getByText('Structuring & Reconciling Curriculum...')).toBeInTheDocument()
      expect(screen.getByText('Regenerating syllabus...')).toBeInTheDocument()
    })

    // Resolve generation
    resolveSyllabusGen(mockModules)

    // Loading bar should disappear
    await waitFor(() => {
      expect(screen.queryByText('Structuring & Reconciling Curriculum...')).not.toBeInTheDocument()
      expect(screen.getByText('Regenerate syllabus from materials')).toBeInTheDocument()
    })
  })
})
