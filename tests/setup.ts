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
  deleteCards: jest.fn().mockResolvedValue({ success: true, count: 1 }),
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
  getMaterial: jest.fn().mockResolvedValue(null),
  saveMaterial: jest.fn().mockResolvedValue({ id: 1 }),
  openFileDialog: jest.fn().mockResolvedValue(null),
  parseFile: jest.fn().mockResolvedValue({ filename: 'test.pdf', fileType: 'pdf', contentText: '', originalLength: 0 }),
  generateCards: jest.fn().mockResolvedValue({ flashcards: [], active_recall: [] }),
  evaluateAnswer: jest.fn().mockResolvedValue({ correct: true, score: 5, feedback: 'Great!' }),
  getAIConfig: jest.fn().mockResolvedValue({ provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: 'sk-...' }),
  saveAIConfig: jest.fn().mockResolvedValue({ success: true }),
  testAIConnection: jest.fn().mockResolvedValue({ success: true, message: 'OK', latencyMs: 500 }),
  getMasteryStats: jest.fn().mockResolvedValue([]),
  getStreakData: jest.fn().mockResolvedValue([]),
  getWeakestCards: jest.fn().mockResolvedValue([]),
  getMeta: jest.fn().mockResolvedValue(null),
  setMeta: jest.fn().mockResolvedValue({ success: true }),
  ragIndexMaterial: jest.fn().mockResolvedValue({ chunkCount: 5 }),
  ragSearch: jest.fn().mockResolvedValue([]),
  ragGetIndexStats: jest.fn().mockResolvedValue({ totalChunks: 0, indexedMaterials: 0 }),
  ragReindexAll: jest.fn().mockResolvedValue({ success: true, totalChunks: 0 }),
  ragDeleteIndex: jest.fn().mockResolvedValue({ success: true }),

  // Tutor
  tutorCreateSession: jest.fn().mockResolvedValue({ id: 1, subject_id: 1, user_id: 1, session_type: 'tutor', phase: 'structured_qa', cards_generated: 0 }),
  tutorGetSession: jest.fn().mockResolvedValue({ session: null, messages: [] }),
  tutorListSessions: jest.fn().mockResolvedValue([]),
  tutorUpdateSessionPhase: jest.fn().mockResolvedValue({ success: true }),
  tutorEndSession: jest.fn().mockResolvedValue({ success: true }),
  tutorDeleteSession: jest.fn().mockResolvedValue({ success: true }),
  tutorSaveMessage: jest.fn().mockResolvedValue({ id: 'mock-id', conversation_id: 1, role: 'user', content: '', content_type: 'text', created_at: new Date().toISOString() }),
  tutorGetMessageHistory: jest.fn().mockResolvedValue([]),
  tutorGenerateCards: jest.fn().mockResolvedValue(''),
  tutorCheckDuplicates: jest.fn().mockResolvedValue([]),
  tutorUpdateMastery: jest.fn().mockResolvedValue({ mastery_prob: 0.8 }),
  tutorStreamChat: jest.fn().mockResolvedValue({ success: true, fullResponse: '' }),
  onTutorChunk: jest.fn(),

  // Daily Plans
  planGetDailyPlan: jest.fn().mockResolvedValue([]),
  planGeneratePlan: jest.fn().mockResolvedValue([]),
  planGenerateFocusBlock: jest.fn().mockResolvedValue([]),
  planCompleteAction: jest.fn().mockResolvedValue({ success: true }),
  planDismissAction: jest.fn().mockResolvedValue({ success: true }),
  planGetCompletedTaskStats: jest.fn().mockResolvedValue({ completedTasksCount: 0, completedTopicsCount: 0, completedSessionsCount: 0, totalCompleted: 0 }),
  getCompletedTaskStats: jest.fn().mockResolvedValue({ completedTasksCount: 0, completedTopicsCount: 0, completedSessionsCount: 0, totalCompleted: 0 }),
  planAddPlanItem: jest.fn().mockResolvedValue({ id: 1, subject_name: 'Test' }),

  // Syllabus
  syllabusListModules: jest.fn().mockResolvedValue([]),
  syllabusCreateModule: jest.fn().mockResolvedValue({ id: 1 }),
  syllabusUpdateModule: jest.fn().mockResolvedValue({ success: true }),
  syllabusDeleteModule: jest.fn().mockResolvedValue({ success: true }),
  syllabusListTopics: jest.fn().mockResolvedValue([]),
  syllabusCreateTopic: jest.fn().mockResolvedValue({ id: 1 }),
  syllabusUpdateTopic: jest.fn().mockResolvedValue({ success: true }),
  syllabusDeleteTopic: jest.fn().mockResolvedValue({ success: true }),

  // Library
  libraryOpenFileDialog: jest.fn().mockResolvedValue(null),
  librarySaveFile: jest.fn().mockResolvedValue({ id: 1 }),
  libraryGetFiles: jest.fn().mockResolvedValue([]),
  libraryGetFileContent: jest.fn().mockResolvedValue(null),

  // Local AI & Hardware
  getHardwareProfile: jest.fn().mockResolvedValue({
    totalMemoryGb: 8,
    freeMemoryGb: 4,
    cpuModel: 'Apple M2',
    cpuCores: 8,
    arch: 'arm64',
    platform: 'darwin',
    tier: 'balanced',
    recommendedModelId: 'qwen-2.5-3b',
    tierReason: '8–12 GB RAM detected.'
  }),
  listLocalModels: jest.fn().mockResolvedValue([]),
  downloadLocalModel: jest.fn().mockResolvedValue({ success: true }),
  cancelModelDownload: jest.fn().mockResolvedValue({ success: true }),
  deleteLocalModel: jest.fn().mockResolvedValue({ success: true }),
  getLocalEngineStatus: jest.fn().mockResolvedValue({ isRunning: false }),
  startLocalEngine: jest.fn().mockResolvedValue({ success: true, port: 8080 }),
  stopLocalEngine: jest.fn().mockResolvedValue({ success: true }),
  onLocalDownloadProgress: jest.fn().mockReturnValue(() => {}),
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
