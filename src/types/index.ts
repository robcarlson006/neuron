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
  folder_id?: number | null
  type: 'flashcard' | 'active_recall'
  front: string
  back: string
  is_manual: number
  concept?: string | null
  created_at: string
}

export interface CardFolder {
  id: number
  subject_id: number
  name: string
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
  // FSRS-5 fields (nullable during migration from SM-2)
  stability?: number | null
  difficulty?: number | null
  state?: number | null      // 0=new,1=learning,2=review,3=relearning
  lapses?: number | null
}

export interface ConceptMastery {
  id: number
  user_id: number
  subject_id: number
  concept: string
  mastery_prob: number
  observations: number
  updated_at: string
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
  response_time_ms?: number
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
  desiredRetention?: number      // FSRS target retention, 0.80..0.98
  interleaveQueue?: boolean      // Whether StudySession should interleave concepts
}

export interface RetentionForecastPoint {
  date: string
  retention: number
  count: number
}

export interface DayStudyInfo {
  date: string
  cardsDue: number
  deadlines: Deadline[]
  subjects: { name: string; cardsDue: number }[]
}
