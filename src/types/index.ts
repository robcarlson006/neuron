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
  subject_type?: 'class' | 'book'
  total_pages?: number
  total_chapters?: number
  time_commitment_minutes?: number
  syllabus_generated?: number
  color?: string
  linked_folder_path?: string | null
  folder_last_synced_at?: string | null
  folder_sync_status?: 'idle' | 'syncing' | 'error'
  created_at: string
}

export interface Material {
  id: number
  subject_id: number
  filename: string
  file_type: 'pdf' | 'docx' | 'pptx'
  content_text: string
  uploaded_at: string
  file_mtime?: number | null
  file_size?: number | null
  relative_path?: string | null
  /** Set to 1 once this material's content has been folded into the syllabus
   * (either at initial generation or by an incremental update). */
  syllabus_processed?: number
  /** Syllabus module this material's content was assigned to, if any. */
  module_id?: number | null
}

export type LectureStatus = 'recording' | 'recorded' | 'transcribing' | 'ready' | 'failed'

export interface Lecture {
  id: number
  subject_id: number
  title: string
  audio_path: string
  audio_mime_type: string
  duration_seconds: number
  file_size_bytes: number
  status: LectureStatus
  raw_transcript?: string | null
  error_message?: string | null
  material_id?: number | null
  created_at: string
  updated_at: string
}

export interface CreateLectureParams {
  subject_id: number
  title: string
  audio_path: string
  audio_mime_type?: string
  duration_seconds?: number
  file_size_bytes?: number
  status?: LectureStatus
}

export interface UpdateLectureParams {
  title?: string
  duration_seconds?: number
  file_size_bytes?: number
  status?: LectureStatus
  raw_transcript?: string | null
  error_message?: string | null
  material_id?: number | null
}

export interface Card {
  id: number
  subject_id: number
  material_id?: number | null
  folder_id?: number | null
  type: 'flashcard' | 'active_recall' | 'cloze'
  front: string
  back: string
  is_manual: number
  concept?: string | null
  tags?: string
  image_url?: string
  media_json?: string
  source?: string
  topic_id?: number | null
  note_id?: number | null
  cloze_ordinal?: number
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
  matched_concepts?: string[]
  missing_concepts?: string[]
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

// ── Misc Extras ──
export type StudyGoal = 'medical' | 'language' | 'stem' | 'humanities' | 'certification' | 'other'

export interface OnboardingData {
  name: string
  goal?: StudyGoal
  hasCompleted: boolean
}

export interface AccessibilitySettings {
  reduceMotion: boolean
  highContrast: boolean
  largeText: boolean
  showMasteryIcons: boolean
}

// ── Card Notes / Cloze ──
export interface CardNote {
  id: number
  subject_id: number
  note_type: 'basic' | 'cloze'
  fields_json: string
  created_at: string
}

// ── Gamification ──
export interface Achievement {
  id: number
  user_id: number
  achievement_key: string
  unlocked_at: string
}

export interface UserLevel {
  user_id: number
  xp: number
  level: number
}

export interface DailyQuest {
  id: number
  user_id: number
  quest_key: string
  title: string
  description: string
  required: number
  progress: number
  xp_reward: number
  completed: number
  quest_date: string
}

export type AchievementKey =
  | 'first_review' | 'early_bird' | 'night_owl' | 'centurion'
  | 'streak_7' | 'streak_30' | 'streak_365'
  | 'master_subject' | 'master_concept'
  | 'deck_creator' | 'ai_cards_generated'
  | 'focus_warrior' | 'import_enthusiast'
  | 'speed_demon' | 'persistence'
  | 'level_5' | 'level_10' | 'level_25' | 'level_50'

export interface AchievementDef {
  key: AchievementKey
  title: string
  description: string
  icon: string
  xpReward: number
}

// ── Export / Import ──
export interface ExportData {
  version: number
  exported_at: string
  app_version: string
  subjects: Array<Subject & { cards: Array<Card & { schedule?: CardSchedule; review_logs?: ReviewLog[] }> }>
  deadlines: Deadline[]
  concept_mastery: ConceptMastery[]
  folders: CardFolder[]
  settings: Record<string, string>
}

export interface ImportResult {
  subjectsCreated: number
  cardsImported: number
  deadlinesImported: number
  errors: string[]
}

// ── Anki Import ──
export interface AnkiDeck {
  name: string
  cards: Array<{
    front: string
    back: string
    tags: string[]
    type: 'flashcard' | 'active_recall'
  }>
  cardCount: number
}

// ── Study Sessions / Focus Mode ──
export interface StudySession {
  id: number
  user_id: number
  subject_id?: number
  started_at: string
  ended_at?: string
  cards_reviewed: number
  correct_count: number
  duration_minutes: number
  focus_mode: number
}

export interface FocusModeSettings {
  focus_minutes: number
  break_minutes: number
  block_notifications: boolean
  show_fullscreen: boolean
  auto_start_break: boolean
}

export type FocusSessionState = 'idle' | 'focusing' | 'break' | 'paused' | 'completed'

// ── Published Decks ──
export interface PublishedDeck {
  id: number
  subject_id: number
  user_id: number
  public_slug: string
  title: string
  description?: string
  card_count: number
  download_count: number
  rating: number
  is_published: number
  created_at: string
}

// ── Study Groups ──
export interface StudyGroup {
  id: number
  name: string
  description?: string
  invite_code?: string
  created_by: number
  created_at: string
}

export interface StudyGroupMember {
  id: number
  group_id: number
  user_id: number
  role: 'admin' | 'member'
  joined_at: string
}

// ── AnkiConnect / Plugin System ──
export interface PluginEndpoint {
  id: number
  name: string
  description?: string
  endpoint_type: 'mcp' | 'http' | 'anki_connect'
  config_json: string
  is_active: number
  created_at: string
}

export interface AnkiConnectNote {
  deckName: string
  modelName: string
  fields: Record<string, string>
  tags: string[]
  options?: { allowDuplicate?: boolean }
}

// ── AI Provider Config ──
export interface AIProviderConfig {
  provider: string
  baseUrl: string
  model: string
  apiKey: string
}

// ── RAG (Retrieval Augmented Generation) ──
export interface RAGSearchResult {
  text: string
  materialId: number
  materialName: string
  score: number
  chunkIndex: number
}

export interface RAGIndexStats {
  totalChunks: number
  indexedMaterials: number
}

export interface RAGIndexResult {
  chunkCount: number
}

// ── Undo ──
export interface ReviewUndo {
  id: number
  user_id: number
  card_id: number
  review_log_id?: number
  previous_schedule_json: string
  created_at: string
}

// ── Cloze Parser ──
export interface ClozeNoteData {
  text: string
  clozes: Array<{ ordinal: number; answer: string }>
}

export type CalculatorSkin = 'numworks' | 'ti84'

export interface AppSettings {
  theme: Theme
  dailyReminderTime?: string
  userName?: string
  desiredRetention?: number      // FSRS target retention, 0.80..0.98
  interleaveQueue?: boolean      // Whether StudySession should interleave concepts
  calculatorSkin?: CalculatorSkin // 'numworks' (default) or 'ti84'
}

export interface AutoGeneratedFlashcard extends GeneratedFlashcard {
  card_subtype?: 'definition' | 'mechanism' | 'application' | 'discrimination'
  concrete_example?: string
  common_mistake?: string
  mnemonic?: string
}

export interface AutoGeneratedCards {
  flashcards: AutoGeneratedFlashcard[]
  active_recall: (GeneratedActiveRecall & {
    card_subtype?: string
    concrete_example?: string
    common_mistake?: string
    mnemonic?: string
  })[]
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

// ── Conversation / Message Types ──────────────────────────────────────────

export interface Conversation {
  id: number
  subject_id: number
  title: string
  model: string
  created_at: string
  updated_at: string
  message_count?: number
}

export interface Message {
  id: string
  conversation_id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  content_type: 'text' | 'diagram' | 'code'
  metadata?: string | null
  created_at: string
}

export interface StreamChunk {
  type: 'text' | 'done' | 'error' | 'diagram'
  content: string
}

// ── Library File Types ────────────────────────────────────────────────────

export interface LibraryFile extends Material {
  file_size?: number
  file_path?: string
  tags?: string[]
}

// ── Syllabus Types ────────────────────────────────────────────────────────

export interface SyllabusModule {
  id: number
  subject_id: number
  title: string
  description?: string
  week_number?: number
  status: 'pending' | 'in_progress' | 'completed'
  hours_estimated: number
  sort_order: number
  created_at: string
  chapter_number?: number
  chapter_title?: string
  page_start?: number
  page_end?: number
  prerequisites?: string
  topics?: ModuleTopic[]
  topic_count?: number
}

export type TopicRetentionStatus = 'fresh' | 'fading' | 'overdue'

export interface TopicSpacedMemory {
  id: number
  topic_id: number
  user_id: number
  subject_id: number
  stability: number
  difficulty: number
  retrievability: number
  reps: number
  lapses: number
  last_studied_at: string
  next_review_due: string
  status: TopicRetentionStatus
}

export interface ModuleTopic {
  id: number
  module_id: number
  title: string
  description?: string
  mastery_target: number
  sort_order: number
  created_at: string
  completed?: boolean
  studied?: boolean
  has_new_material?: boolean | number
  is_gap?: boolean | number
  // SRS retention fields
  retrievability?: number
  retention_status?: TopicRetentionStatus
  next_review_due?: string
  stability?: number
  days_overdue?: number
}

/** Result of a syllabus update or reconciliation (syllabus:updateFromMaterials or syllabus:generateFromMaterials). */
export interface SyllabusUpdateResult {
  modules: SyllabusModule[]
  new_module_count: number
  new_topic_count: number
  processed_material_count: number
  needs_updates: boolean
  preserved_completed_count?: number
  gap_topic_count?: number
  updated_topic_count?: number
}

// ── Tutor Session Types ───────────────────────────────────────────────────

export interface TutorSession {
  id: number
  subject_id: number
  user_id: number
  title?: string
  last_message_at?: number | string
  is_pinned?: boolean | number
  last_message_preview?: string
  message_count?: number
  subject_name?: string
  session_type: 'tutor' | 'general' | 'quiz'
  phase: 'structured_qa' | 'socratic' | 'summary' | 'complete'
  module_id?: number
  summary?: string
  cards_generated: number
  started_at: string
  ended_at?: string
  duration_minutes?: number
  depth_level?: number
  never_studied?: number
}

export interface TutorTopicMemory {
  id: number
  user_id: number
  subject_id: number
  topic: string
  mastery_level: 'struggling' | 'developing' | 'good' | 'mastered'
  strengths?: string
  struggles?: string
  session_id?: number
  last_studied_at: string
}

export interface TutorSessionEvaluation {
  id: number
  session_id: number
  user_id: number
  subject_id: number
  strengths: string[]
  struggles: string[]
  topics_covered: string[]
  summary?: string
  created_at: string
}

export interface GapAnalysisItem {
  type: 'struggled' | 'uncovered'
  topic: string
  details?: string
  moduleId?: number
  moduleTitle?: string
  materialId?: number
  materialName?: string
  priority: 1 | 2 | 3
}

export interface GapAnalysisResult {
  struggledTopics: GapAnalysisItem[]
  uncoveredTopics: GapAnalysisItem[]
  recommendedFocus: string
  recommendedTopics: string[]
  recommendedModuleId?: number
  recommendedMaterialId?: number
  totalGapsCount: number
  hasHistory: boolean
}

export interface TutorStreamParams {
  sessionId: number
  subjectId: number
  message: string
  sessionType: 'tutor' | 'general'
  phase: 'structured_qa' | 'socratic' | 'summary'
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
  moduleContext?: {
    moduleTitle?: string
    currentTopic?: string
    masteredTopics?: string[]
    weakTopics?: string[]
  }
  attachedContent?: string
  durationMinutes?: number | null
  depthLevel?: 1 | 2 | 3 | 4 | 5
  neverStudied?: boolean
  timeElapsedSeconds?: number
  timeRemainingSeconds?: number
  pacingStatus?: PacingStatus
  topicsCovered?: string[]
  questionsAsked?: string[]
  topicsMastered?: string[]
  weakTopicsConcerns?: string[]
  materialId?: number
  materialContent?: string
  targetTopic?: string
  targetTopics?: string[]
  isFillGaps?: boolean
  gapTopics?: string[]
  isSpacedReview?: boolean
  spacedReviewTopics?: string[]
}

export interface TutorSessionConfig {
  duration_minutes: number | null
  depth_level: 1 | 2 | 3 | 4 | 5
  never_studied: boolean
  material_id?: number
  material_name?: string
  module_id?: number
  module_name?: string
  target_topic?: string
  target_topics?: string[]
  is_fill_gaps?: boolean
  gap_topics?: string[]
  is_spaced_review?: boolean
  spaced_review_topics?: string[]
}

export interface TutorSessionRuntime {
  config: TutorSessionConfig
  started_at: number
  time_elapsed_seconds: number
  time_remaining_seconds: number
  is_time_up: boolean
  topics_covered: string[]
  questions_asked: string[]
  topics_mastered: string[]
  weak_topics: string[]
}

export type PacingStatus = 'AHEAD' | 'ON_TRACK' | 'BEHIND' | 'UNLIMITED'

export const DEPTH_LEVELS = [
  { level: 1, name: 'Beginner', icon: '🌱', description: 'No assumed knowledge. Build from absolute basics.' },
  { level: 2, name: 'Intermediate', icon: '📗', description: 'Core concepts with guided practice.' },
  { level: 3, name: 'Proficient', icon: '🛠️', description: 'Solid understanding with application and analysis.' },
  { level: 4, name: 'Expert', icon: '📚', description: 'Deep connections, edge cases, and critical thinking.' },
  { level: 5, name: 'Professor', icon: '🎓', description: 'Teach-back, novel synthesis, and full mastery.' },
] as const

export const DIFFICULTY_LABELS = ['', 'Beginner', 'Intermediate', 'Proficient', 'Expert', 'Professor'] as const

export const TIME_PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '3 hours', minutes: 180 },
  { label: 'Unlimited ★', minutes: null as null },
] as const

export const TIME_SLIDER_MIN = 5
export const TIME_SLIDER_MAX = 180
export const TIME_SLIDER_STEP = 5

export function autoDepthFromMinutes(minutes: number | null): 1 | 2 | 3 | 4 | 5 {
  if (minutes === null) return 5
  if (minutes <= 15) return 1
  if (minutes <= 30) return 2
  if (minutes <= 60) return 3
  if (minutes <= 120) return 4
  return 5
}

export interface DailyPlan {
  id: number
  user_id: number
  plan_date: string
  subject_id: number
  module_id?: number
  suggested_action: string
  estimated_minutes: number
  priority: number
  is_completed: number
  created_at: string
  action_type?: 'flashcards' | 'tutor_drill' | 'syllabus_read' | 'custom'
  learning_objective?: string
  target_topic?: string
  is_dismissed?: number
}

export interface CompletedTaskStats {
  completedTasksCount: number
  completedTopicsCount: number
  completedSessionsCount: number
  totalCompleted: number
}

export type FocusBlockItem = DailyPlan & { subject_name: string }

export interface PlanGenerationResult {
  plan: string
  modules: { title: string; description: string; week_number?: number; hours_estimated: number }[]
}

// ── Class / Syllabus Generation Types ─────────────────────────────────────────

export interface ClassCreationMaterial {
  filePath: string
  filename: string
  fileType: string
  contentText: string
  originalLength: number
}

export interface ClassCreationData {
  name: string
  subjectType: 'class' | 'book'
  courseCode?: string
  timeCommitmentMinutes: number
  status: 'active' | 'ongoing'
  materials: ClassCreationMaterial[]
  deadlines?: { label: string; deadline_date: string; deadline_type: string }[]
  syllabusOption: 'generate' | 'manual' | 'later'
  linkedFolderPath?: string | null
}

export interface SyllabusGenerationResult {
  modules: SyllabusModule[]
  totalModules: number
  totalTopics: number
}

export type ModuleCardGenType = 'flashcard' | 'active_recall'

export interface ModuleCardGenOptions {
  type: ModuleCardGenType
  count: number
  autoCount?: boolean
  flashcardCount?: number
  activeRecallCount?: number
  folderId?: number | null
  materialId?: number | null
  topicId?: number | null
  concept?: string | null
  userId?: number
}

export const CARD_GEN_PRESETS = [5, 10, 15, 20, 30, 50, 100] as const

export interface ParsedFlashcard {
  type: 'flashcard'
  front: string
  back: string
}

export interface ParsedRecallQuestion {
  type: 'active_recall'
  front: string
  back: string
}

export type ParsedCard = ParsedFlashcard | ParsedRecallQuestion

export interface DuplicateCheckResult {
  isDuplicate: boolean
  reason?: string
  matchedFront?: string
  similarity?: number
}

// ── Toast / Notifications ──────────────────────────────────────────────────

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'info'
  title: string
  message: string
}

// ── Calendar Events & Sources ─────────────────────────────────────────────

export type CalendarEventType = 'lecture' | 'seminar' | 'lab' | 'workshop' | 'study' | 'personal'

export interface CalendarSource {
  id: number
  user_id: number
  name: string
  type: 'ical' | 'manual' | 'google_oauth'
  url?: string
  color: string
  last_synced_at?: string
  created_at: string
}

export interface CalendarEvent {
  id: number
  user_id: number
  source_id?: number | null
  external_id?: string | null
  title: string
  description?: string | null
  location?: string | null
  start_time: string
  end_time: string
  all_day: boolean | number
  recurrence_rule?: string | null
  subject_id?: number | null
  event_type: CalendarEventType
  created_at: string
  updated_at: string
  subject_name?: string
  subject_color?: string
}

export interface CalendarScheduleContext {
  type: 'pre_event' | 'post_event'
  event: CalendarEvent
  minutesUntilStart?: number
  minutesSinceEnd?: number
}

// ── Local AI & Hardware Types ─────────────────────────────────────────────

export type HardwareTier = 'light' | 'balanced' | 'high' | 'unsupported'

export interface HardwareProfile {
  totalMemoryGb: number
  freeMemoryGb: number
  cpuModel: string
  cpuCores: number
  arch: string
  platform: string
  tier: HardwareTier
  recommendedModelId: string
  tierReason: string
}

export interface LocalModelInfo {
  id: string
  name: string
  description: string
  filename: string
  downloadUrl: string
  sizeBytes: number
  sizeDisplay: string
  ramRequirementDisplay: string
  status: 'not_downloaded' | 'downloading' | 'ready'
  isRecommended?: boolean
  localPath?: string
}

export interface DownloadProgress {
  modelId: string
  bytesDownloaded: number
  totalBytes: number
  percent: number
  status: 'downloading' | 'completed' | 'error' | 'cancelled'
  error?: string
}

export interface LocalEngineStatus {
  isRunning: boolean
  port?: number
  activeModelId?: string
  error?: string
}

// ── Linked Class Folder Sync Types ────────────────────────────────────────

export interface FolderSyncResult {
  success: boolean
  addedCount: number
  updatedCount: number
  error?: string
}

export interface FolderSyncEvent {
  subjectId: number
  added: string[]
  updated: string[]
  timestamp: string
}

// ── Practice Problems & Lab Types ─────────────────────────────────────────

export interface PracticeProblem {
  id: number
  subject_id: number
  module_id?: number | null
  topic_id?: number | null
  material_id?: number | null
  title: string
  problem_text: string
  solution_steps?: string | null
  final_answer?: string | null
  difficulty: number // 1 to 5
  principles_json: string // JSON array of string tags/principles
  is_ai_generated: number // 0 = original from material, 1 = generated variant
  parent_problem_id?: number | null
  created_at: string
}

export interface PracticeSession {
  id: number
  subject_id: number
  user_id: number
  module_id?: number | null
  topic_id?: number | null
  total_problems: number
  completed_problems: number
  correct_problems: number
  started_at: string
  ended_at?: string | null
  summary?: string | null
}

export interface PracticeProblemAttempt {
  id: number
  session_id: number
  problem_id: number
  user_answer?: string | null
  is_correct: number
  tutor_conversation_id?: number | null
  feedback?: string | null
  time_spent_seconds: number
  created_at: string
}

export interface ExtractedPracticeProblem {
  title: string
  problem_text: string
  solution_steps: string
  final_answer: string
  difficulty: number
  principles: string[]
  suggested_topic?: string
}

export interface PracticeSessionConfig {
  subjectId: number
  userId: number
  moduleId?: number | null
  topicId?: number | null
  problemCount: number // e.g. 3, 5, 10, or 999 for unlimited
}

export type PracticeErrorType =
  | 'correct'
  | 'execution_slip'
  | 'conceptual_misconception'
  | 'boundary_condition_error'
  | 'unit_mismatch'
  | 'other'

export interface PracticeEvaluationResult {
  is_correct: boolean
  error_type?: PracticeErrorType
  feedback: string
  pedagogical_remedy?: string
  step_analysis?: string[]
  identified_errors?: string[]
  key_principles?: string[]
  suggested_next_action?: 'continue' | 'variant' | 'review_concept'
}

export interface AutonomousPracticeGenOptions {
  subjectId: number
  userId: number
  moduleId?: number | null
  topicId?: number | null
  materialId?: number | null
  count?: number
  autoCount?: boolean
  difficultyFocus?: 'adaptive' | 'remediate_struggles' | 'foundational' | 'challenge'
}

export interface AutonomousPracticeGenResult {
  success: boolean
  count: number
  problems?: PracticeProblem[]
  error?: string
  rationale?: string
}




