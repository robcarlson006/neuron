export interface User {
  id: number
  name: string
  created_at: string
}

export interface Subject {
  id: number
  user_id: number
  name: string
  status: 'active' | 'ongoing' | 'archived'
  course_code?: string
  created_at: string
}

export interface Material {
  id: number
  subject_id: number
  filename: string
  file_type: 'pdf' | 'docx' | 'pptx'
  content_text: string
  uploaded_at: string
}

export interface Card {
  id: number
  subject_id: number
  material_id?: number
  type: 'flashcard' | 'active_recall'
  front: string
  back: string
  is_manual: number
  created_at: string
}

export interface CardSchedule {
  id: number
  card_id: number
  user_id: number
  interval: number
  repetitions: number
  ease_factor: number
  due_date: string
  last_reviewed_at?: string
}

export interface ReviewLog {
  id: number
  card_id: number
  user_id: number
  reviewed_at: string
  quality: number
  was_correct: number
  user_answer?: string
  ai_feedback?: string
}

export type DeadlineType = 'test' | 'quiz' | 'exam' | 'assignment' | 'presentation' | 'personal'

export interface Deadline {
  id: number
  subject_id: number
  label: string
  deadline_date: string
  deadline_type: DeadlineType
  created_at: string
}

export interface Diagnostic {
  id: number
  subject_id: number
  user_id: number
  ran_at: string
  summary_json: string
}

export interface DiagnosticSummary {
  strong: string[]
  moderate: string[]
  weak: string[]
  totalCards: number
  correctCount: number
  incorrectCount: number
}

export interface GeneratedFlashcard {
  front: string
  back: string
}

export interface GeneratedActiveRecall {
  question: string
  model_answer: string
}

export interface GeneratedCards {
  flashcards: GeneratedFlashcard[]
  active_recall: GeneratedActiveRecall[]
}

export interface EvaluationResult {
  correct: boolean
  score: number
  feedback: string
}

export interface SM2Result {
  interval: number
  repetitions: number
  ease_factor: number
  due_date: string
}

export interface SubjectWithStats {
  subject: Subject
  masteryPercent: number
  cardsDue: number
  nextDeadline?: Deadline
  totalCards: number
}

export interface StudySessionCard {
  card: Card
  schedule: CardSchedule
}

export interface ReviewResult {
  cardId: number
  quality: number
  wasCorrect: boolean
  userAnswer?: string
  aiFeedback?: string
}

export interface SessionSummary {
  total: number
  correct: number
  incorrect: number
  skipped: number
  cardsReviewed: ReviewResult[]
}

export interface MCReviewLog {
  id: number
  card_id: number
  user_id: number
  reviewed_at: string
  was_correct: number
}

export interface MCStats {
  total: number
  correct: number
}

export type Theme = 'light' | 'dark'

export interface AppSettings {
  theme: Theme
  dailyReminderTime?: string
  userName?: string
}

export interface DayStudyInfo {
  date: string
  cardsDue: number
  deadlines: Deadline[]
  subjects: { name: string; cardsDue: number }[]
}
