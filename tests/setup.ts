/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom'

// Mock window.electronAPI for renderer tests
const mockElectronAPI = {
  getUser: jest.fn().mockResolvedValue(null),
  saveUser: jest.fn().mockResolvedValue({ id: 1, name: 'Test User', created_at: new Date().toISOString() }),
  getSubjects: jest.fn().mockResolvedValue([]),
  saveSubject: jest.fn().mockResolvedValue({ id: 1, name: 'Test Subject', status: 'active', user_id: 1, created_at: new Date().toISOString() }),
  deleteSubject: jest.fn().mockResolvedValue({ success: true }),
  getCards: jest.fn().mockResolvedValue([]),
  saveCard: jest.fn().mockResolvedValue({ id: 1 }),
  deleteCard: jest.fn().mockResolvedValue({ success: true }),
  saveManyCards: jest.fn().mockResolvedValue([]),
  getSchedule: jest.fn().mockResolvedValue(null),
  updateSchedule: jest.fn().mockResolvedValue({ success: true }),
  getDueCards: jest.fn().mockResolvedValue([]),
  getAllSchedules: jest.fn().mockResolvedValue([]),
  processReview: jest.fn().mockResolvedValue({ sm2Result: {}, success: true }),
  saveReviewLog: jest.fn().mockResolvedValue({ id: 1 }),
  getReviewLogs: jest.fn().mockResolvedValue([]),
  getReviewLogsForCard: jest.fn().mockResolvedValue([]),
  getDeadlines: jest.fn().mockResolvedValue([]),
  saveDeadline: jest.fn().mockResolvedValue({ id: 1 }),
  deleteDeadline: jest.fn().mockResolvedValue({ success: true }),
  getDiagnostics: jest.fn().mockResolvedValue([]),
  saveDiagnostics: jest.fn().mockResolvedValue({ id: 1 }),
  getMaterials: jest.fn().mockResolvedValue([]),
  saveMaterial: jest.fn().mockResolvedValue({ id: 1 }),
  openFileDialog: jest.fn().mockResolvedValue(null),
  parseFile: jest.fn().mockResolvedValue({ filename: 'test.pdf', fileType: 'pdf', contentText: '', originalLength: 0 }),
  generateCards: jest.fn().mockResolvedValue({ flashcards: [], active_recall: [] }),
  evaluateAnswer: jest.fn().mockResolvedValue({ correct: true, score: 5, feedback: 'Great!' }),
  getApiKey: jest.fn().mockResolvedValue('AIzaSy...'),
  saveApiKey: jest.fn().mockResolvedValue({ success: true }),
  checkApiKey: jest.fn().mockResolvedValue({ valid: true }),
  getMasteryStats: jest.fn().mockResolvedValue([]),
  getStreakData: jest.fn().mockResolvedValue([]),
  getWeakestCards: jest.fn().mockResolvedValue([]),
  getMeta: jest.fn().mockResolvedValue(null),
  setMeta: jest.fn().mockResolvedValue({ success: true })
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true
})

// Mock react-router-dom
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
  useParams: () => ({})
}))
