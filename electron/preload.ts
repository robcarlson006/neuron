import { contextBridge, ipcRenderer } from 'electron'
import type {
  User, Subject, Card, CardFolder, CardSchedule, ReviewLog, Deadline,
  Diagnostic, ConceptMastery, RetentionForecastPoint, SM2Result,
  GeneratedCards, EvaluationResult, MCStats, CardNote, Achievement,
  UserLevel, DailyQuest, ExportData, ImportResult, AnkiDeck, StudySession,
  FocusModeSettings, PublishedDeck, StudyGroup, StudyGroupMember,
  AnkiConnectNote, PluginEndpoint, AccessibilitySettings, OnboardingData,
  ReviewUndo, RAGSearchResult, RAGIndexStats, RAGIndexResult,
  TutorSession, TutorStreamParams, DailyPlan, Message, DuplicateCheckResult
} from '../src/types'

const electronAPI = {
  // User
  getUser: (): Promise<User | null> => ipcRenderer.invoke('db:getUser'),
  saveUser: (name: string): Promise<User> => ipcRenderer.invoke('db:saveUser', name),

  // Subjects
  getSubjects: (userId?: number): Promise<Subject[]> => ipcRenderer.invoke('db:getSubjects', userId),
  saveSubject: (subject: Partial<Subject>): Promise<Subject> => ipcRenderer.invoke('db:saveSubject', subject),
  deleteSubject: (subjectId: number): Promise<{ success: boolean }> => ipcRenderer.invoke('db:deleteSubject', subjectId),

  // Cards
  getCards: (subjectId: number): Promise<Card[]> => ipcRenderer.invoke('db:getCards', subjectId),
  saveCard: (card: Partial<Card>): Promise<Card> => ipcRenderer.invoke('db:saveCard', card),
  deleteCard: (cardId: number): Promise<{ success: boolean }> => ipcRenderer.invoke('db:deleteCard', cardId),
  saveManyCards: (cards: Partial<Card>[], userId: number): Promise<Card[]> => ipcRenderer.invoke('db:saveManyCards', cards, userId),

  // Schedule
  getSchedule: (cardId: number, userId: number): Promise<CardSchedule | undefined> => ipcRenderer.invoke('db:getSchedule', cardId, userId),
  updateSchedule: (cardId: number, userId: number, sm2Result: SM2Result): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:updateSchedule', cardId, userId, sm2Result),
  getDueCards: (userId: number, subjectId?: number): Promise<(Card & CardSchedule)[]> =>
    ipcRenderer.invoke('db:getDueCards', userId, subjectId),
  getAllCardsWithSchedule: (userId: number, subjectId?: number): Promise<(Card & CardSchedule)[]> =>
    ipcRenderer.invoke('db:getAllCardsWithSchedule', userId, subjectId),
  getAllSchedules: (userId: number, subjectId?: number): Promise<CardSchedule[]> =>
    ipcRenderer.invoke('db:getAllSchedules', userId, subjectId),
  processReview: (params: {
    cardId: number
    userId: number
    quality: number
    wasCorrect: boolean
    userAnswer?: string
    aiFeedback?: string
    responseTimeMs?: number
    currentSchedule: CardSchedule
  }): Promise<{ sm2Result: SM2Result; success: boolean }> =>
    ipcRenderer.invoke('db:processReview', params),

  // Review logs
  saveReviewLog: (log: Partial<ReviewLog>): Promise<{ id: number }> => ipcRenderer.invoke('db:saveReviewLog', log),
  getReviewLogs: (userId: number, days?: number): Promise<ReviewLog[]> => ipcRenderer.invoke('db:getReviewLogs', userId, days),
  getReviewLogsForCard: (cardId: number, userId: number): Promise<ReviewLog[]> =>
    ipcRenderer.invoke('db:getReviewLogsForCard', cardId, userId),

  // Deadlines
  getDeadlines: (subjectId?: number): Promise<Deadline[]> => ipcRenderer.invoke('db:getDeadlines', subjectId),
  saveDeadline: (deadline: Partial<Deadline>): Promise<Deadline> => ipcRenderer.invoke('db:saveDeadline', deadline),
  deleteDeadline: (deadlineId: number): Promise<{ success: boolean }> => ipcRenderer.invoke('db:deleteDeadline', deadlineId),

  // Diagnostics
  getDiagnostics: (subjectId: number): Promise<Diagnostic[]> => ipcRenderer.invoke('db:getDiagnostics', subjectId),
  saveDiagnostics: (diagnostic: Partial<Diagnostic>): Promise<{ id: number }> =>
    ipcRenderer.invoke('db:saveDiagnostics', diagnostic),

  // Materials
  getMaterials: (subjectId: number): Promise<unknown[]> => ipcRenderer.invoke('db:getMaterials', subjectId),
  getMaterial: (materialId: number): Promise<unknown> => ipcRenderer.invoke('db:getMaterial', materialId),
  saveMaterial: (material: { subject_id: number; filename: string; file_type: string; content_text: string }): Promise<{ id: number }> =>
    ipcRenderer.invoke('db:saveMaterial', material),
  deleteMaterial: (materialId: number): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:deleteMaterial', materialId),

  // File operations
  openFileDialog: (): Promise<string | null> => ipcRenderer.invoke('file:openDialog'),
  parseFile: (filePath: string): Promise<{ filename: string; fileType: string; contentText: string; originalLength: number }> =>
    ipcRenderer.invoke('file:parseFile', filePath),

  // AI (provider-agnostic layer)
  generateCards: (text: string, minCards?: number, minQuestions?: number): Promise<GeneratedCards> =>
    ipcRenderer.invoke('ai:generateCards', text, minCards, minQuestions),
  evaluateAnswer: (question: string, modelAnswer: string, studentAnswer: string): Promise<EvaluationResult> =>
    ipcRenderer.invoke('ai:evaluateAnswer', question, modelAnswer, studentAnswer),
  getAIConfig: (): Promise<{ provider: string; baseUrl: string; model: string; apiKey: string }> =>
    ipcRenderer.invoke('ai:getConfig'),
  saveAIConfig: (config: { provider: string; baseUrl: string; model: string; apiKey: string }): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('ai:saveConfig', config),
  testAIConnection: (): Promise<{ success: boolean; message: string; latencyMs?: number }> =>
    ipcRenderer.invoke('ai:testConnection'),

  // Analytics
  getMasteryStats: (userId: number, subjectId?: number): Promise<{ subject_id: number; interval: number; ease_factor: number }[]> =>
    ipcRenderer.invoke('db:getMasteryStats', userId, subjectId),
  getStreakData: (userId: number): Promise<{ date: string; count: number }[]> =>
    ipcRenderer.invoke('db:getStreakData', userId),
  getWeakestCards: (userId: number, limit?: number): Promise<(Card & { avg_quality: number })[]> =>
    ipcRenderer.invoke('db:getWeakestCards', userId, limit),

  // Multiple choice
  saveMCReview: (params: { cardId: number; userId: number; wasCorrect: boolean }): Promise<{ id: number }> =>
    ipcRenderer.invoke('db:saveMCReview', params),
  getMCStats: (userId: number, days?: number): Promise<MCStats> =>
    ipcRenderer.invoke('db:getMCStats', userId, days),

  // Folders
  getFolders: (subjectId: number): Promise<CardFolder[]> => ipcRenderer.invoke('db:getFolders', subjectId),
  saveFolder: (folder: Partial<CardFolder>): Promise<CardFolder> => ipcRenderer.invoke('db:saveFolder', folder),
  deleteFolder: (folderId: number): Promise<{ success: boolean }> => ipcRenderer.invoke('db:deleteFolder', folderId),
  updateCardFolder: (cardId: number, folderId: number | null): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:updateCardFolder', cardId, folderId),

  // Card stats
  getCardStats: (cardId: number, userId: number): Promise<{
    schedule: CardSchedule | null
    review_count: number
    avg_quality: number | null
    avg_response_time_ms: number | null
  }> => ipcRenderer.invoke('db:getCardStats', cardId, userId),

  // Response time analytics
  getAvgResponseTime: (userId: number): Promise<{ avg_ms: number | null }> =>
    ipcRenderer.invoke('db:getAvgResponseTime', userId),

  // Meta
  getMeta: (key: string): Promise<string | null> => ipcRenderer.invoke('db:getMeta', key),
  setMeta: (key: string, value: string): Promise<{ success: boolean }> => ipcRenderer.invoke('db:setMeta', key, value),

  // FSRS + knowledge tracing
  getConceptMastery: (userId: number, subjectId?: number): Promise<ConceptMastery[]> =>
    ipcRenderer.invoke('db:getConceptMastery', userId, subjectId),
  getRetentionForecast: (userId: number, horizonDays?: number, subjectId?: number): Promise<RetentionForecastPoint[]> =>
    ipcRenderer.invoke('db:getRetentionForecast', userId, horizonDays, subjectId),
  getCurrentRetentionBySubject: (userId: number): Promise<{ subject_id: number; retention: number; count: number }[]> =>
    ipcRenderer.invoke('db:getCurrentRetentionBySubject', userId),
  getDailyReviewStats: (userId: number, days?: number): Promise<{ date: string; reviews: number; correct: number; incorrect: number; avg_response_ms: number | null }[]> =>
    ipcRenderer.invoke('db:getDailyReviewStats', userId, days),
  getInterleavedDueCards: (userId: number, subjectId?: number): Promise<(Card & CardSchedule)[]> =>
    ipcRenderer.invoke('db:getInterleavedDueCards', userId, subjectId),

  // Auto-updater (background & manual)
  onUpdateAvailable: (cb: (version: string) => void) => ipcRenderer.on('update:available', (_e, v) => cb(v)),
  onUpdaterAvailable: (cb: (info: {
    currentVersion: string
    latestVersion: string
    updateAvailable: boolean
    downloadUrl: string | null
    releaseUrl: string
    releaseNotes: string
  }) => void) => ipcRenderer.on('updater:available', (_e, info) => cb(info)),
  onUpdateDownloaded: (cb: (version: string) => void) => ipcRenderer.on('update:downloaded', (_e, v) => cb(v)),
  onUpdaterDownloaded: (cb: (data: { filePath: string; version: string }) => void) =>
    ipcRenderer.on('updater:downloaded', (_e, d) => cb(d)),
  installUpdate: (filePath?: string): Promise<{ success: boolean; method?: string; error?: string }> => {
    if (filePath) {
      return ipcRenderer.invoke('updater:install', filePath)
    }
    return Promise.resolve({ success: false, error: 'No file path provided' })
  },

  // Manual update checker
  getVersion: (): Promise<string> => ipcRenderer.invoke('updater:getVersion'),
  checkGitHub: (): Promise<{
    currentVersion: string
    latestVersion: string
    updateAvailable: boolean
    downloadUrl: string | null
    releaseUrl: string
    releaseNotes: string
  }> => ipcRenderer.invoke('updater:checkGitHub'),
  downloadUpdate: (url: string, version: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('updater:download', url, version),
  installDownloadedUpdate: (filePath: string): Promise<{ success: boolean; method: string }> =>
    ipcRenderer.invoke('updater:install', filePath),
  openReleasePage: (url: string): Promise<void> => ipcRenderer.invoke('updater:openReleasePage', url),
  cleanupUpdateFile: (filePath: string): Promise<void> => ipcRenderer.invoke('updater:cleanupFile', filePath),
  onDownloadProgress: (cb: (pct: number) => void) => ipcRenderer.on('updater:download-progress', (_e, pct) => cb(pct)),
  onUpdateError: (cb: (message: string) => void) => ipcRenderer.on('update:error', (_e, msg) => cb(msg)),
  onUpdaterError: (cb: (message: string) => void) => ipcRenderer.on('updater:error', (_e, msg) => cb(msg)),

  // ── Cloze / Card Notes ──
  getCardsByNoteId: (noteId: number): Promise<Card[]> =>
    ipcRenderer.invoke('db:getCardsByNoteId', noteId),
  saveCardNote: (note: Partial<CardNote>): Promise<CardNote> =>
    ipcRenderer.invoke('db:saveCardNote', note),

  // ── Undo ──
  undoLastReview: (userId: number): Promise<{ success: boolean; restoredSchedule?: CardSchedule }> =>
    ipcRenderer.invoke('db:undoLastReview', userId),
  getUndoAvailable: (userId: number): Promise<ReviewUndo | null> =>
    ipcRenderer.invoke('db:getUndoAvailable', userId),

  // ── Export/Import ──
  exportAllData: (userId: number): Promise<ExportData> =>
    ipcRenderer.invoke('db:exportAllData', userId),
  importData: (data: ExportData, userId: number): Promise<ImportResult> =>
    ipcRenderer.invoke('db:importData', data, userId),

  // ── Anki Import ──
  parseAnkiDeck: (filePath: string): Promise<AnkiDeck> =>
    ipcRenderer.invoke('file:parseAnkiDeck', filePath),
  importAnkiDeck: (deck: AnkiDeck, userId: number, subjectId: number): Promise<Card[]> =>
    ipcRenderer.invoke('db:importAnkiDeck', deck, userId, subjectId),

  // ── Gamification ──
  getAchievements: (userId: number): Promise<Achievement[]> =>
    ipcRenderer.invoke('db:getAchievements', userId),
  getUserLevel: (userId: number): Promise<UserLevel> =>
    ipcRenderer.invoke('db:getUserLevel', userId),
  getDailyQuests: (userId: number): Promise<DailyQuest[]> =>
    ipcRenderer.invoke('db:getDailyQuests', userId),
  awardXP: (userId: number, amount: number, reason: string): Promise<{ newLevel: number; newXP: number; achievementsUnlocked: Achievement[] }> =>
    ipcRenderer.invoke('db:awardXP', userId, amount, reason),
  checkAchievements: (userId: number): Promise<Achievement[]> =>
    ipcRenderer.invoke('db:checkAchievements', userId),
  completeQuest: (questId: number): Promise<{ xpAwarded: number }> =>
    ipcRenderer.invoke('db:completeQuest', questId),

  // ── Study Sessions / Focus Mode ──
  startStudySession: (userId: number, subjectId?: number): Promise<StudySession> =>
    ipcRenderer.invoke('db:startStudySession', userId, subjectId),
  endStudySession: (sessionId: number, cardsReviewed: number, correctCount: number): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:endStudySession', sessionId, cardsReviewed, correctCount),
  getFocusModeSettings: (userId: number): Promise<FocusModeSettings> =>
    ipcRenderer.invoke('db:getFocusModeSettings', userId),
  saveFocusModeSettings: (userId: number, settings: FocusModeSettings): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:saveFocusModeSettings', userId, settings),
  getRecentStudySessions: (userId: number, limit?: number): Promise<StudySession[]> =>
    ipcRenderer.invoke('db:getRecentStudySessions', userId, limit),

  // ── Published Decks ──
  publishDeck: (subjectId: number, userId: number, description?: string): Promise<PublishedDeck> =>
    ipcRenderer.invoke('db:publishDeck', subjectId, userId, description),
  unpublishDeck: (subjectId: number): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:unpublishDeck', subjectId),
  getPublishedDecks: (): Promise<PublishedDeck[]> =>
    ipcRenderer.invoke('db:getPublishedDecks'),
  downloadPublishedDeck: (deckId: number, userId: number): Promise<ImportResult> =>
    ipcRenderer.invoke('db:downloadPublishedDeck', deckId, userId),
  getMyPublishedDecks: (userId: number): Promise<PublishedDeck[]> =>
    ipcRenderer.invoke('db:getMyPublishedDecks', userId),

  // ── Study Groups ──
  createStudyGroup: (name: string, description: string, createdBy: number): Promise<StudyGroup> =>
    ipcRenderer.invoke('db:createStudyGroup', name, description, createdBy),
  joinStudyGroup: (inviteCode: string, userId: number): Promise<StudyGroup | null> =>
    ipcRenderer.invoke('db:joinStudyGroup', inviteCode, userId),
  getStudyGroups: (userId: number): Promise<(StudyGroup & { member_count: number })[]> =>
    ipcRenderer.invoke('db:getStudyGroups', userId),
  getStudyGroupMembers: (groupId: number): Promise<StudyGroupMember[]> =>
    ipcRenderer.invoke('db:getStudyGroupMembers', groupId),
  shareSubjectWithGroup: (groupId: number, subjectId: number): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:shareSubjectWithGroup', groupId, subjectId),

  // ── AnkiConnect / Plugins ──
  registerPluginEndpoint: (endpoint: Partial<PluginEndpoint>): Promise<PluginEndpoint> =>
    ipcRenderer.invoke('db:registerPluginEndpoint', endpoint),
  getPluginEndpoints: (): Promise<PluginEndpoint[]> =>
    ipcRenderer.invoke('db:getPluginEndpoints'),
  ankiConnectAddNote: (note: AnkiConnectNote, userId: number): Promise<{ success: boolean; cardId?: number }> =>
    ipcRenderer.invoke('db:ankiConnectAddNote', note, userId),
  ankiConnectFindCards: (query: string, userId: number): Promise<number[]> =>
    ipcRenderer.invoke('db:ankiConnectFindCards', query, userId),

  // ── Semantic Evaluation ──
  getSemanticSimilarity: (text1: string, text2: string): Promise<{ score: number }> =>
    ipcRenderer.invoke('db:getSemanticSimilarity', text1, text2),

  // ── Accessibility ──
  getAccessibilitySettings: (): Promise<AccessibilitySettings> =>
    ipcRenderer.invoke('db:getAccessibilitySettings'),
  saveAccessibilitySettings: (settings: AccessibilitySettings): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:saveAccessibilitySettings', settings),

  // ── Onboarding ──
  saveOnboardingData: (data: OnboardingData): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:saveOnboardingData', data),
  getOnboardingData: (): Promise<OnboardingData | null> =>
    ipcRenderer.invoke('db:getOnboardingData'),

  // ── MemPalace Bridge ──
  mempalaceStore: (key: string, value: string, namespace?: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('mempalace:store', key, value, namespace),
  mempalaceSearch: (query: string, namespace?: string): Promise<Array<{ key: string; value: string; score: number }>> =>
    ipcRenderer.invoke('mempalace:search', query, namespace),
  mempalaceStatus: (): Promise<{ available: boolean }> =>
    ipcRenderer.invoke('mempalace:status'),

  // ── Personalized Retention ──
  getOptimalRetention: (userId: number): Promise<{ suggested: number; current: number; actualRecall: number }> =>
    ipcRenderer.invoke('db:getOptimalRetention', userId),
  recordRetentionProbe: (userId: number, desiredRetention: number, actualRecall: number): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:recordRetentionProbe', userId, desiredRetention, actualRecall),

  // ── RAG (Retrieval Augmented Generation) ──
  ragIndexMaterial: (materialId: number): Promise<RAGIndexResult> =>
    ipcRenderer.invoke('rag:indexMaterial', materialId),
  ragSearch: (query: string, subjectId?: number, topK?: number): Promise<RAGSearchResult[]> =>
    ipcRenderer.invoke('rag:search', query, subjectId, topK),
  ragGetIndexStats: (): Promise<RAGIndexStats> =>
    ipcRenderer.invoke('rag:getIndexStats'),
  ragReindexAll: (): Promise<{ success: boolean; totalChunks: number }> =>
    ipcRenderer.invoke('rag:reindexAll'),
  ragDeleteIndex: (materialId: number): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('rag:deleteIndex', materialId),

  // ── Tutor Sessions ──
  tutorCreateSession: (subjectId: number, userId: number, sessionType?: string, moduleId?: number, config?: {
    duration_minutes: number | null; depth_level: number; never_studied: number
  }): Promise<TutorSession> =>
    ipcRenderer.invoke('tutor:createSession', subjectId, userId, sessionType, moduleId, config),
  tutorGetSession: (sessionId: number): Promise<{ session: TutorSession; messages: Message[] } | null> =>
    ipcRenderer.invoke('tutor:getSession', sessionId),
  tutorListSessions: (subjectId: number, limit?: number): Promise<TutorSession[]> =>
    ipcRenderer.invoke('tutor:listSessions', subjectId, limit),
  tutorUpdateSessionPhase: (sessionId: number, phase: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('tutor:updateSessionPhase', sessionId, phase),
  tutorEndSession: (sessionId: number, summary?: string): Promise<{ success: boolean; evaluation?: import('../src/types').TutorSessionEvaluation | null }> =>
    ipcRenderer.invoke('tutor:endSession', sessionId, summary),
  tutorGetGapAnalysis: (subjectId: number, userId: number): Promise<import('../src/types').GapAnalysisResult> =>
    ipcRenderer.invoke('tutor:getGapAnalysis', subjectId, userId),
  tutorGetTopicMemories: (subjectId: number, userId: number): Promise<import('../src/types').TutorTopicMemory[]> =>
    ipcRenderer.invoke('tutor:getTopicMemories', subjectId, userId),
  tutorGetSessionEvaluation: (sessionId: number): Promise<import('../src/types').TutorSessionEvaluation | null> =>
    ipcRenderer.invoke('tutor:getSessionEvaluation', sessionId),
  tutorDeleteSession: (sessionId: number): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('tutor:deleteSession', sessionId),
  tutorSaveMessage: (params: { session_id: number; role: string; content: string; content_type?: string }): Promise<Message> =>
    ipcRenderer.invoke('tutor:saveMessage', params),
  tutorGetMessageHistory: (sessionId: number, limit?: number): Promise<Message[]> =>
    ipcRenderer.invoke('tutor:getMessageHistory', sessionId, limit),
  tutorGenerateCards: (sessionId: number, subjectId: number, sessionContent: string): Promise<string> =>
    ipcRenderer.invoke('tutor:generateCards', sessionId, subjectId, sessionContent),
  tutorCheckDuplicates: (subjectId: number, cards: { front: string; back: string }[]): Promise<DuplicateCheckResult[]> =>
    ipcRenderer.invoke('tutor:checkDuplicates', subjectId, cards),
  tutorUpdateMastery: (userId: number, subjectId: number, topic: string, score: number): Promise<{ mastery_prob: number }> =>
    ipcRenderer.invoke('tutor:updateMastery', userId, subjectId, topic, score),
  tutorStreamChat: (params: TutorStreamParams) =>
    ipcRenderer.invoke('tutor:streamTutorChat', params),
  onTutorChunk: (cb: (chunk: { conversationId: number; content: string; type: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { conversationId: number; content: string; type: string }): void => cb(data)
    ipcRenderer.on('tutor:chunk', handler)
    return () => { ipcRenderer.removeListener('tutor:chunk', handler) }
  },

  // ── Daily Plans ──
  planGetDailyPlan: (userId: number, date?: string): Promise<(DailyPlan & { subject_name: string })[]> =>
    ipcRenderer.invoke('plan:getDailyPlan', userId, date),
  planGeneratePlan: (userId: number, date: string): Promise<(DailyPlan & { subject_name: string })[]> =>
    ipcRenderer.invoke('plan:generatePlan', userId, date),
  planCompleteAction: (planId: number): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('plan:completeAction', planId),
  planDismissAction: (planId: number): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('plan:dismissAction', planId),
  planAddPlanItem: (item: { user_id: number; plan_date: string; subject_id: number; suggested_action: string; estimated_minutes?: number; priority?: number }): Promise<DailyPlan & { subject_name: string }> =>
    ipcRenderer.invoke('plan:addPlanItem', item),

  // ── Syllabus / Modules ──
  syllabusListModules: (subjectId: number): Promise<import('../src/types').SyllabusModule[]> =>
    ipcRenderer.invoke('syllabus:listModules', subjectId),
  syllabusCreateModule: (module: { subject_id: number; title: string; description?: string; week_number?: number; hours_estimated?: number; sort_order?: number }): Promise<import('../src/types').SyllabusModule> =>
    ipcRenderer.invoke('syllabus:createModule', module),
  syllabusUpdateModule: (moduleId: number, updates: Partial<import('../src/types').SyllabusModule>): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('syllabus:updateModule', moduleId, updates),
  syllabusDeleteModule: (moduleId: number): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('syllabus:deleteModule', moduleId),
  syllabusListTopics: (moduleId: number): Promise<import('../src/types').ModuleTopic[]> =>
    ipcRenderer.invoke('syllabus:listTopics', moduleId),
  syllabusCreateTopic: (topic: { module_id: number; title: string; description?: string; sort_order?: number }): Promise<import('../src/types').ModuleTopic> =>
    ipcRenderer.invoke('syllabus:createTopic', topic),
  syllabusUpdateTopic: (topicId: number, updates: Partial<import('../src/types').ModuleTopic>): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('syllabus:updateTopic', topicId, updates),
  syllabusDeleteTopic: (topicId: number): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('syllabus:deleteTopic', topicId),

  // ── Library (file attachment for tutor) ──
  libraryOpenFileDialog: (): Promise<string | null> => ipcRenderer.invoke('library:openFileDialog'),
  librarySaveFile: (filename: string, content: string, subjectId: number): Promise<{ id: number }> =>
    ipcRenderer.invoke('library:saveFile', filename, content, subjectId),
  libraryGetFiles: (subjectId: number): Promise<import('../src/types').LibraryFile[]> =>
    ipcRenderer.invoke('library:getFiles', subjectId),
  libraryGetFileContent: (fileId: number): Promise<{ content_text: string; filename: string } | null> =>
    ipcRenderer.invoke('library:getFileContent', fileId),

  // ── Syllabus AI Generation ──
  syllabusGenerateFromMaterials: (subjectId: number): Promise<import('../src/types').SyllabusModule[]> =>
    ipcRenderer.invoke('syllabus:generateFromMaterials', subjectId),
  syllabusUpdateFromMaterials: (subjectId: number, materialIds?: number[]): Promise<import('../src/types').SyllabusUpdateResult> =>
    ipcRenderer.invoke('syllabus:updateFromMaterials', subjectId, materialIds),
  syllabusGetModule: (moduleId: number): Promise<(import('../src/types').SyllabusModule & { topics: import('../src/types').ModuleTopic[] }) | null> =>
    ipcRenderer.invoke('syllabus:getModule', moduleId),
  syllabusReorderModules: (subjectId: number, moduleIds: number[]): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('syllabus:reorderModules', subjectId, moduleIds),
  syllabusSaveManualSyllabus: (subjectId: number, modules: { title: string; description?: string; week_number?: number; hours_estimated?: number; topics: { title: string; description?: string }[] }[]): Promise<import('../src/types').SyllabusModule[]> =>
    ipcRenderer.invoke('syllabus:saveManualSyllabus', subjectId, modules),
  syllabusEditDeadline: (subjectId: number, newDeadline: string): Promise<{ fits_deadline: boolean; proposed_adjustments?: string; new_weekly_hours?: number | null; summary?: string }> =>
    ipcRenderer.invoke('syllabus:editDeadline', subjectId, newDeadline),

  // ── Card Generation from Materials ──
  cardsAutoGenerate: (subjectId: number, materialId: number): Promise<{ success: boolean; count: number; error?: string; filename?: string }> =>
    ipcRenderer.invoke('cards:autoGenerate', subjectId, materialId),
  cardsBatchGenerate: (subjectId: number, materialIds?: number[]): Promise<{ success: boolean; results: { materialId: number; filename: string; success: boolean; count: number; error?: string }[]; totalGenerated: number; totalFailed: number; totalProcessed: number }> =>
    ipcRenderer.invoke('cards:batchGenerate', subjectId, materialIds),
  cardsGenerateStatus: (subjectId: number): Promise<{ totalFiles: number; filesWithCards: number; pending: number }> =>
    ipcRenderer.invoke('cards:generateStatus', subjectId),
  cardsGenerateFromModule: (
    subjectId: number,
    moduleId: number,
    options?: import('../src/types').ModuleCardGenOptions
  ): Promise<{ success: boolean; count: number; module_name?: string; error?: string; duplicates_filtered?: number }> =>
    ipcRenderer.invoke('cards:generateFromModule', subjectId, moduleId, options),
  cardsGenerateFlashcardsFromModule: (
    subjectId: number,
    moduleId: number,
    count?: number,
    userId?: number
  ): Promise<{ success: boolean; count: number; module_name?: string; error?: string; duplicates_filtered?: number }> =>
    ipcRenderer.invoke('cards:generateFlashcardsFromModule', subjectId, moduleId, count, userId),
  cardsGenerateActiveRecallFromModule: (
    subjectId: number,
    moduleId: number,
    count?: number,
    userId?: number
  ): Promise<{ success: boolean; count: number; module_name?: string; error?: string; duplicates_filtered?: number }> =>
    ipcRenderer.invoke('cards:generateActiveRecallFromModule', subjectId, moduleId, count, userId),
  cardsGenerateFromText: (
    subjectId: number,
    text: string,
    options?: import('../src/types').ModuleCardGenOptions & { folderId?: number | null }
  ): Promise<{ success: boolean; count: number; error?: string; duplicates_filtered?: number }> =>
    ipcRenderer.invoke('cards:generateFromText', subjectId, text, options),

  // ── Class operations ──
  classCreate: (userId: number, data: import('../src/types').ClassCreationData): Promise<{ success: boolean; subject: import('../src/types').Subject; materials: { id: number; filename: string; fileType: string }[]; deadlines: { id: number; label: string }[]; syllabusModules: import('../src/types').SyllabusModule[]; syllabusGenerated: boolean }> =>
    ipcRenderer.invoke('class:create', userId, data),
  classAddMaterials: (subjectId: number, materials: { filename: string; fileType: string; contentText: string }[]): Promise<{ success: boolean; materials: { id: number; filename: string }[]; materialCount: number }> =>
    ipcRenderer.invoke('class:addMaterials', subjectId, materials),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
