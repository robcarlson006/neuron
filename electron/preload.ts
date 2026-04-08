import { contextBridge, ipcRenderer } from 'electron'
import type {
  User,
  Subject,
  Card,
  CardSchedule,
  ReviewLog,
  Deadline,
  Diagnostic,
  SM2Result,
  GeneratedCards,
  EvaluationResult,
  MCStats
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
  saveMaterial: (material: { subject_id: number; filename: string; file_type: string; content_text: string }): Promise<{ id: number }> =>
    ipcRenderer.invoke('db:saveMaterial', material),

  // File operations
  openFileDialog: (): Promise<string | null> => ipcRenderer.invoke('file:openDialog'),
  parseFile: (filePath: string): Promise<{ filename: string; fileType: string; contentText: string; originalLength: number }> =>
    ipcRenderer.invoke('file:parseFile', filePath),

  // Gemini
  generateCards: (text: string, minCards?: number, minQuestions?: number): Promise<GeneratedCards> =>
    ipcRenderer.invoke('gemini:generateCards', text, minCards, minQuestions),
  evaluateAnswer: (question: string, modelAnswer: string, studentAnswer: string): Promise<EvaluationResult> =>
    ipcRenderer.invoke('gemini:evaluateAnswer', question, modelAnswer, studentAnswer),
  getApiKey: (): Promise<string> => ipcRenderer.invoke('gemini:getApiKey'),
  saveApiKey: (key: string): Promise<{ success: boolean }> => ipcRenderer.invoke('gemini:saveApiKey', key),
  checkApiKey: (): Promise<{ valid: boolean; error?: string }> => ipcRenderer.invoke('gemini:checkApiKey'),

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

  // Meta
  getMeta: (key: string): Promise<string | null> => ipcRenderer.invoke('db:getMeta', key),
  setMeta: (key: string, value: string): Promise<{ success: boolean }> => ipcRenderer.invoke('db:setMeta', key, value)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
