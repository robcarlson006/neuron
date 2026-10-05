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
  subject_icon?: string
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
  file_type: string
  content_text: string
  file_path?: string | null
  uploaded_at: string
  file_mtime?: number | null
  file_size?: number | null
  file_sha256?: string | null
  relative_path?: string | null
  sort_order?: number
  /** Set to 1 once this material's content has been folded into the syllabus
   * (either at initial generation or by an incremental update). */
  syllabus_processed?: number
  /** Syllabus module this material's content was assigned to, if any. */
  module_id?: number | null
}

export interface ManualSyllabusWeek {
  id: number
  subject_id: number
  title: string
  sort_order: number
  created_at: string
  materials: Material[]
}

export interface SubjectNoteLink {
  material_id: number
  label: string
}

export interface SubjectNote {
  id: number
  subject_id: number
  body: string
  links_json?: string | null
  created_at: string
  updated_at: string
}

export interface SaveSubjectNoteInput {
  subject_id: number
  body: string
  links?: SubjectNoteLink[]
}

export type DocumentAnnotationKind = 'highlight' | 'comment' | 'cue' | 'question' | 'summary'

export interface DocumentLocator {
  page?: number
  slide?: number
  chapter?: string
  block?: string
  startOffset?: number
  endOffset?: number
  quote?: string
  /** Normalized rectangles for highlights rendered over the original visual page/slide. */
  rects?: Array<{ left: number; top: number; width: number; height: number }>
}

export interface DocumentAnnotation {
  id: number
  subject_id: number
  material_id?: number | null
  lecture_id?: number | null
  kind: DocumentAnnotationKind
  parent_id?: number | null
  color?: string | null
  body: string
  selected_text?: string | null
  locator_json?: string | null
  source_snapshot?: string | null
  source_hash?: string | null
  locator_status?: 'resolved' | 'needs_review'
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface SaveDocumentAnnotationInput {
  id?: number
  subject_id: number
  material_id?: number | null
  lecture_id?: number | null
  kind: DocumentAnnotationKind
  parent_id?: number | null
  color?: string | null
  body: string
  selected_text?: string | null
  locator?: DocumentLocator | null
  source_snapshot?: string | null
  source_hash?: string | null
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

export interface HighlightCardDraft {
  front: string
  back: string
  type: 'flashcard' | 'active_recall'
  concept?: string
}

export interface HighlightCardExtractionOptions {
  highlightText?: string
  sourceContext?: string
  materialTitle?: string
  feedback?: string
  previousCard?: HighlightCardDraft
}

export interface HighlightCardExtractionResult {
  success: boolean
  normalizedText?: string
  cards: HighlightCardDraft[]
  error?: string
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
  subjectId?: number
  materialName: string
  score: number
  chunkIndex: number
  sourceLabel?: string
  matchedTerms?: string[]
  retrievalMode?: 'semantic' | 'lexical'
}

export interface RAGIndexStats {
  totalChunks: number
  indexedMaterials: number
}

export interface RAGIndexResult {
  chunkCount: number
}

export interface GroundedAnswer {
  success: boolean
  answer: string
  confidence: 'high' | 'medium' | 'low' | 'not_found'
  evidence: RAGSearchResult[]
  error?: string
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

export type ConceptualLens = 'Attributes' | 'Differences' | 'Parts_Wholes' | 'Causes_Effects' | 'Implications'
export type BloomLevel = 'Remembering' | 'Understanding' | 'Applying' | 'Analyzing'
export type CardTypology = 'Basic_QA' | 'Two_Step_Vignette' | 'Differential' | 'Image_Occlusion' | 'Cloze'
export type SourceModality = 'slides' | 'textbook' | 'transcript' | 'multi_source' | 'general'

export interface AutoGeneratedFlashcard extends GeneratedFlashcard {
  concept?: string
  card_subtype?: 'definition' | 'mechanism' | 'application' | 'discrimination' | string
  card_type?: CardTypology
  conceptual_lens?: ConceptualLens
  bloom_level?: BloomLevel
  pedagogical_rationale?: string
  source_marker?: string
  concrete_example?: string
  common_mistake?: string
  mnemonic?: string
  checkpoints?: string[]
}

export interface AutoGeneratedActiveRecall extends GeneratedActiveRecall {
  concept?: string
  card_subtype?: string
  card_type?: CardTypology
  conceptual_lens?: ConceptualLens
  bloom_level?: BloomLevel
  pedagogical_rationale?: string
  source_marker?: string
  emphasis_marker_detected?: string
  concrete_example?: string
  common_mistake?: string
  mnemonic?: string
  checkpoints?: string[]
}

export interface AutoGeneratedCards {
  flashcards: AutoGeneratedFlashcard[]
  active_recall: AutoGeneratedActiveRecall[]
}

export interface AutoGradeResult {
  score: number // 0 to 1
  rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY'
  matchedConcepts: string[]
  missingConcepts: string[]
  feedback: string
  suggestedLabel: string
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

export type LearnerMemoryType = 'semantic_fact' | 'episodic' | 'teaching_preference' | 'source_fact' | 'session_state'
export type LearnerMemoryStatus = 'active' | 'uncertain' | 'superseded' | 'resolved'
export type LearningOutcome = 'correct' | 'partial' | 'incorrect' | 'unassessed'
export type TutorAssistanceLevel = 'none' | 'hint' | 'scaffold' | 'worked_example' | 'direct_answer' | 'unassessed'
export type TutorTeachBackStatus = 'pending' | 'needs_revision' | 'passed' | 'incomplete'

export interface TutorTeachBackGate {
  id?: number
  sessionId: number
  topicId?: number | null
  concept: string
  status: TutorTeachBackStatus
  attemptCount: number
  feedback?: string | null
  requiredAssessmentId?: number | null
  passedAssessmentId?: number | null
  createdAt?: string
  updatedAt?: string
}

export interface TutorPhaseTransitionResult {
  success: boolean
  blockedByTeachBack?: boolean
  gate?: TutorTeachBackGate | null
}

export interface AdaptiveConceptState {
  id?: number
  userId: number
  subjectId: number
  concept: string
  score: number
  uncertainty: number
  observations: number
  correctCount: number
  partialCount: number
  incorrectCount: number
  lastOutcome: LearningOutcome
  lastAssistance: TutorAssistanceLevel
  lastTaskType?: string
  lastAssessedAt?: string
  retention?: number
  misconceptionRisk?: number
}

export interface TutorTurnAssessment {
  id?: number
  sessionId: number
  studentMessageId?: string
  tutorMessageId?: string
  concept: string
  outcome: LearningOutcome
  score: number | null
  confidence: number
  assistanceLevel: TutorAssistanceLevel
  taskType?: string
  taskDifficulty?: number
  evidenceSpan?: string
  misconception?: string
  followedScaffold?: boolean
  changedGoal?: boolean
  teachBackStatus?: 'passed' | 'needs_revision'
  missingElements?: string[]
  ownWords?: boolean
  sourceEvidence?: EvidenceRef[]
  idempotencyKey?: string
  createdAt?: string
}

export interface AdaptiveDecision {
  concept: string
  mode: 'fixed' | 'adaptive'
  score: number
  visibleLevel: 1 | 2 | 3 | 4 | 5
  uncertainty: number
  targetSuccessMin: number
  targetSuccessMax: number
  action: 'explain' | 'basic_retrieval' | 'guided_application' | 'hint_scaffold' | 'parallel_problem' | 'counterexample' | 'interleaved_review' | 'teach_back' | 'novel_transfer'
  reason: string
  retentionStatus?: string
}

export interface SessionMemorySummary {
  sessionId: number
  summary: string
  coveredConcepts: string[]
  openLoops: string[]
  unresolvedMisconceptions: string[]
  nextRetrievalTargets: string[]
  updatedAt?: string
}

export interface TutorTaskProfile {
  id?: number
  subjectId: number
  concept: string
  taskType: string
  taskKey: string
  difficulty: number
  observations: number
  successCount: number
  updatedAt?: string
}

export interface EvidenceRef {
  materialId: number
  chunkIndex: number
  sourceLabel: string
  score: number
  text?: string
  retrievalMode?: 'semantic' | 'lexical' | 'hybrid'
}

export interface LearnerState {
  userId?: number
  subjectId: number
  concepts?: Array<{ concept: string; masteryProb?: number; confidence?: number; status?: string }>
  activeMisconceptions?: Array<{ concept: string; description: string; status: string }>
  dueTopics?: string[]
}

export interface MemoryRef {
  id?: number
  memoryType: LearnerMemoryType
  memoryKey: string
  value: Record<string, unknown>
  confidence: number
  status: LearnerMemoryStatus
  updatedAt?: string
  provenance?: { sessionId?: number; messageId?: string; evidence?: EvidenceRef[] }
}

export interface ContextBudgetReport {
  maxTokens: number
  usedTokens: number
  evidenceTokens: number
  memoryTokens: number
  historyTokens: number
  truncatedSections: string[]
}

export interface TutorMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface TutorContextInput {
  query: string
  subjectId: number
  materialId?: number
  sessionId: number
  learnerState?: LearnerState
  history?: TutorMessage[]
  evidence?: EvidenceRef[]
  memories?: MemoryRef[]
  systemInstruction?: string
}

export interface TutorContextResult {
  messages: TutorMessage[]
  evidence: EvidenceRef[]
  memories: MemoryRef[]
  budget: ContextBudgetReport
}

export interface StreamChunk {
  type: 'text' | 'done' | 'error' | 'diagram'
  content: string
  metadata?: string
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
  /** Curriculum graph revision from which this module was derived. */
  curriculum_revision?: number
}

export type TopicRetentionStatus = 'fresh' | 'fading' | 'overdue' | 'due_now' | 'due_today' | 'upcoming' | 'scheduled'

export type TopicReviewMode = 'tutor' | 'flashcards' | 'practice' | 'new_content' | 'manual'

export interface TopicReviewEvent {
  id: number
  topic_id: number
  user_id: number
  subject_id: number
  mode: TopicReviewMode
  prompt_text?: string | null
  answer_text?: string | null
  score?: number | null
  assistance_level: 'none' | 'hint' | 'worked_example' | 'direct_answer' | 'unassessed'
  duration_seconds?: number | null
  source_material_id?: number | null
  session_id?: number | null
  evidence_status: 'assessed' | 'unassessed' | 'invalid'
  created_at: string
}

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
  review_status?: TopicRetentionStatus
  urgency?: number
  recommended_mode?: TopicReviewMode
  estimated_minutes?: number
  new_content_state?: 'unseen' | 'learning' | 'verified' | 'deferred'
  concept_type?: string
  source_material_ids?: string
  // Flashcard coverage
  card_count?: number
  /** Stable graph node identifier, present for graph-backed curricula. */
  outcome_id?: number | null
  curriculum_revision?: number
}

/** A bounded, source-grounded statement the learner should be able to demonstrate. */
export type CurriculumRevisionStatus = 'draft' | 'applied' | 'superseded' | 'rejected'

export interface CurriculumRevision {
  id?: number
  subject_id: number
  revision_number: number
  parent_revision_id?: number | null
  status: CurriculumRevisionStatus
  source_hashes: string[]
  created_at?: string
  applied_at?: string | null
}

export interface CurriculumGenerationRequest {
  subject_id: number
  /** Revision observed before generation; stale responses must not apply. */
  expected_revision: number
  material_ids: number[]
  provider?: string
  model?: string
}

export interface CurriculumOutcome {
  id?: number
  subject_id: number
  revision_id?: number | null
  topic_id?: number | null
  outcome_key: string
  statement: string
  bloom_level?: BloomLevel | string | null
  sort_order: number
  source_evidence?: CurriculumEvidence[]
  practice_ids?: number[]
  mastery_id?: number | null
  created_at?: string
}

/** Immutable pointer into a source material/chunk. The quote is a display aid, not authority. */
export interface CurriculumEvidence {
  id?: number
  subject_id: number
  revision_id?: number | null
  material_id: number
  chunk_id?: string | null
  content_hash: string
  section?: string | null
  page?: number | null
  slide?: number | null
  start_offset?: number | null
  end_offset?: number | null
  quote: string
  created_at?: string
}

export type CurriculumPrerequisiteRelation = 'requires' | 'recommended'

/** Directed edge in the outcome prerequisite DAG. */
export interface CurriculumPrerequisite {
  id?: number
  subject_id: number
  revision_id?: number | null
  prerequisite_outcome_id: number
  dependent_outcome_id: number
  relation: CurriculumPrerequisiteRelation
  rationale?: string | null
  created_at?: string
}

export type CurriculumPracticeKind = 'worked_example' | 'independent' | 'retrieval' | 'transfer' | 'repair'

export interface CurriculumPractice {
  id?: number
  subject_id: number
  revision_id?: number | null
  outcome_id?: number | null
  kind: CurriculumPracticeKind
  prompt?: string | null
  instructions: string
  estimated_minutes: number
  retrieval_delay_days?: number | null
  sort_order: number
  created_at?: string
}

export type CurriculumMasteryEvidenceKind = 'assessment' | 'teach_back' | 'practice' | 'tutor' | 'manual'

export interface CurriculumMastery {
  id?: number
  subject_id: number
  revision_id?: number | null
  outcome_id?: number | null
  criterion: string
  evidence_kind: CurriculumMasteryEvidenceKind
  target_score?: number | null
  created_at?: string
}

export type CurriculumGenerationRunStatus = 'started' | 'applied' | 'rejected' | 'failed' | 'stale'

export interface CurriculumChangeSummary {
  new_outcome_count: number
  deepened_outcome_count: number
  preserved_progress_count: number
  source_coverage: number
  advisory_repairs?: string[]
}

export interface CurriculumGenerationRun {
  id?: number
  subject_id: number
  requested_revision: number
  resulting_revision?: number | null
  provider: string
  model: string
  prompt_version: string
  source_hashes: string[]
  output_hash?: string | null
  status: CurriculumGenerationRunStatus
  validation_score?: number | null
  repair_attempt: number
  error_details?: string[]
  change_summary?: CurriculumChangeSummary | null
  started_at?: string
  completed_at?: string | null
  duration_ms?: number | null
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
  /** Revision that was atomically applied, or the current revision when rejected. */
  curriculum_revision?: number
  /** Graph-backed entities for the applied revision. */
  outcomes?: CurriculumOutcome[]
  prerequisites?: CurriculumPrerequisite[]
  practices?: CurriculumPractice[]
  mastery?: CurriculumMastery[]
  change_summary?: CurriculumChangeSummary
  generation_run_id?: number
  rejected?: boolean
  diagnostics?: string[]
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
  difficulty_mode?: 'fixed' | 'adaptive'
  adaptive_score?: number
  adaptive_uncertainty?: number
  adaptive_reason?: string
  never_studied?: number
  targets?: TutorSessionTarget[]
}

export interface TutorSessionTarget {
  id: number
  session_id: number
  topic_id?: number | null
  topic_label: string
  sort_order: number
  gap_evidence_json?: string
  recommended_minutes?: number | null
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
  misconceptions?: Array<{ concept: string; misconception_title?: string; description: string }>
  breakthroughs?: string[]
  summary?: string
  created_at: string
  updatedTopics?: import('../lib/memory/topicSrsEngine').TopicRetentionMetrics[]
}

export interface GapAnalysisItem {
  type: 'struggled' | 'uncovered' | 'refresh'
  topic: string
  details?: string
  moduleId?: number
  moduleTitle?: string
  materialId?: number
  materialName?: string
  priority: 1 | 2 | 3
  estimatedMinutes?: number
  /** Canonical curriculum ID when this gap maps to a syllabus topic. */
  topicId?: number
  /** Signals merged into this single learner-facing gap. */
  gapKinds?: Array<'unseen' | 'new_content' | 'low_mastery' | 'struggling' | 'refresh'>
  /** Short, inspectable explanations for the signals above. */
  evidence?: Array<{ kind: 'unseen' | 'new_content' | 'low_mastery' | 'struggling' | 'refresh'; detail: string }>
  /** Preferred name for new consumers; `estimatedMinutes` remains compatible. */
  recommendedMinutes?: number
}

export interface GapAnalysisResult {
  /** Every detected gap, deduplicated and ordered by urgency. */
  items: GapAnalysisItem[]
  struggledTopics: GapAnalysisItem[]
  uncoveredTopics: GapAnalysisItem[]
  recommendedFocus: string
  recommendedTopics: string[]
  recommendedModuleId?: number
  recommendedMaterialId?: number
  recommendedEstimatedMinutes?: number
  totalGapsCount: number
  hasHistory: boolean
}

export interface TutorStreamParams {
  sessionId: number
  studentMessageId?: string
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
  depthLevel?: 1 | 2 | 3 | 4 | 5 | 'adaptive'
  difficultyMode?: 'fixed' | 'adaptive'
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
  annotationContext?: {
    materialIds?: number[]
    lectureIds?: number[]
    annotationIds?: number[]
  }
  targetTopic?: string
  targetTopics?: string[]
  isFillGaps?: boolean
  gapTopics?: string[]
  isSpacedReview?: boolean
  spacedReviewTopics?: string[]
  isActiveRecall?: boolean
  isQuickReview?: boolean
  quickReviewTopics?: QuickReviewTopic[]
}

export interface QuickReviewTopic {
  id: number
  module_id: number
  module_title: string
  title: string
  description?: string
  sort_order: number
}

export interface TutorSessionConfig {
  duration_minutes: number | null
  depth_level: 1 | 2 | 3 | 4 | 5 | 'adaptive'
  never_studied: boolean
  material_id?: number
  material_name?: string
  annotation_ids?: number[]
  lecture_ids?: number[]
  module_id?: number
  module_name?: string
  target_topic?: string
  target_topics?: string[]
  target_topic_id?: number
  target_topic_ids?: number[]
  is_fill_gaps?: boolean
  gap_topics?: string[]
  gap_topic_ids?: number[]
  /** Ordered IDs aligned 1:1 with gap_topics; null means an unmapped concept. */
  gap_target_ids?: Array<number | null>
  gap_evidence_by_topic_id?: Record<number, unknown>
  recommended_minutes_by_topic_id?: Record<number, number>
  is_spaced_review?: boolean
  spaced_review_topics?: string[]
  is_active_recall?: boolean
  is_quick_review?: boolean
  quick_review_topics?: QuickReviewTopic[]
}

export interface TutorSessionRuntime {
  config: TutorSessionConfig
  started_at: number
  time_elapsed_seconds: number
  time_remaining_seconds: number
  is_time_up: boolean
  is_paused?: boolean
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
  action_type?: 'flashcards' | 'tutor_drill' | 'syllabus_read' | 'new_content' | 'custom'
  learning_objective?: string
  target_topic?: string
  is_dismissed?: number
  reason_code?: string
  topic_id?: number | null
  evidence_json?: string
  success_criteria?: string
  fallback_action?: string
}

export interface CompletedTaskStats {
  completedTasksCount: number
  completedTopicsCount: number
  completedSessionsCount: number
  totalCompleted: number
}

export interface AnalyticsDailyPoint {
  date: string
  reviews: number
  correct: number
  incorrect: number
  accuracy: number | null
  study_minutes: number
  study_sessions: number
  tutor_minutes: number
  tutor_sessions: number
  practice_minutes: number
  practice_sessions: number
  focus_blocks: number
}

export type AnalyticsMode = 'flashcards' | 'tutor' | 'practice' | 'focus'

export interface AnalyticsModeStats {
  mode: AnalyticsMode
  sessions: number
  minutes: number | null
  items: number
  correct: number
  total: number
}

export interface AnalyticsSubjectStats {
  subject_id: number
  reviews: number
  correct: number
  accuracy: number | null
  study_minutes: number | null
  sessions: number
  retention: number | null
  mastery: number
  previous_reviews: number
  previous_correct: number
  previous_study_minutes: number | null
}

export interface AnalyticsSnapshot {
  range_days: number
  start_date: string
  end_date: string
  previous_start_date: string
  previous_end_date: string
  daily: AnalyticsDailyPoint[]
  modes: AnalyticsModeStats[]
  subjects: AnalyticsSubjectStats[]
  totals: {
    reviews: number
    correct: number
    accuracy: number | null
    study_minutes: number
    sessions: number
    current_retention: number | null
  }
  previous_totals: {
    reviews: number
    correct: number
    accuracy: number | null
    study_minutes: number
    sessions: number
  }
  maintenance: {
    due_cards: number
    overdue_cards: number
    fading_cards: number
  }
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
  subjectIcon?: string
  color?: string
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
  materialIds?: number[]
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

export const GOOGLE_CALENDAR_IPC_VERSION = 2

export interface CalendarSource {
  id: number
  user_id: number
  name: string
  type: 'ical' | 'manual' | 'google_oauth'
  url?: string
  color: string
  google_account_id?: number | null
  google_calendar_id?: string | null
  sync_token?: string | null
  provider_metadata_json?: string
  enabled?: number | boolean
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
  study_status?: 'planned' | 'completed' | 'skipped' | null
  focus_minutes?: number | null
  focus_action?: 'review' | 'tutor' | 'practice' | 'reading' | 'custom' | null
  daily_plan_id?: number | null
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

export interface GoogleCalendarConnection {
  id: number
  user_id: number
  status: 'connected' | 'reauthorize_required' | 'error'
  scopes: string[]
  last_synced_at?: string
  last_error?: string
  created_at: string
  updated_at: string
}

export interface GoogleCalendarSyncResult {
  success: boolean
  eventCount: number
  calendarCount: number
  error?: string
  stage?: 'authorization' | 'token' | 'calendar_list' | 'event_sync' | 'database'
  partial?: boolean
  warning?: string
}

export interface GoogleCalendarRuntimeStatus {
  appVersion: string
  integrationVersion: number
  handlerRegistered: boolean
  schemaReady: boolean
  clientIdConfigured: boolean
  clientIdSource: 'settings' | 'build' | 'missing' | 'invalid'
  accounts: GoogleCalendarConnection[]
  error?: string
}

// ── Local AI & Hardware Types ─────────────────────────────────────────────

export type HardwareTier = 'light' | 'balanced' | 'high' | 'unsupported'

export interface HardwareProfile {
  totalMemoryGb: number
  freeMemoryGb: number
  freeDiskGb?: number
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

export type LocalAIReadiness = 'downloading' | 'starting' | 'testing' | 'ready' | 'degraded' | 'failed'

export interface LocalAIHealth {
  readiness: LocalAIReadiness
  healthy: boolean
  port?: number
  modelId?: string
  latencyMs?: number
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

export type WebbsDOK = 'DOK1' | 'DOK2' | 'DOK3' | 'DOK4'
export type BloomsRevised = 'Remember' | 'Understand' | 'Apply' | 'Analyze' | 'Evaluate' | 'Create'
export type DisciplineParadigm =
  | 'stem_variation'
  | 'literature_tdq'
  | 'history_hat'
  | 'philosophy_logic'
  | 'clinical_legal'
  | 'taxonomic_contrast'
  | 'general'

export type DistractorStrategy =
  | 'sign_inversion'
  | 'intermediate_step'
  | 'nominal_conflation'
  | 'boundary_overextension'
  | 'causal_reversal'
  | 'other'

export interface DistractorAnalysis {
  option: string
  misconception_exposed: string
  distractor_strategy?: DistractorStrategy | string
}

export interface ItemValidation {
  cover_test_rationale?: string
  key_explanation?: string
  distractor_analysis?: Record<string, DistractorAnalysis>
}

export interface PracticeProblemOptions {
  A?: string
  B?: string
  C?: string
  D?: string
  [key: string]: string | undefined
}

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
  // Psychometric & Cognitive Demand Extensions
  stimulus?: string | null
  stem_lead_in?: string | null
  options_json?: string | null
  correct_key?: string | null
  blooms_revised?: BloomsRevised | string | null
  webbs_dok?: WebbsDOK | string | null
  discipline_paradigm?: DisciplineParadigm | string | null
  subgoals_json?: string | null
  item_validation_json?: string | null
  quality_score?: number | null
  cover_test_passed?: number | null
  verification_status?: 'verified' | 'needs_review' | 'legacy_unverified' | 'rejected' | string | null
  verification_json?: string | null
  solution_steps_json?: string | null
  source_ref?: string | null
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
  mode?: 'standard' | 'guided'
  guided_phase?: string | null
  guided_state_json?: string | null
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
  evaluation_json?: string | null
  assistance_level?: 'none' | 'hint' | 'worked_example' | 'direct_answer' | 'unassessed' | null
  self_explanation?: string | null
  retry_count?: number
  transfer_result?: string | null
}

export interface GuidedPracticeEvent {
  id: number
  session_id: number
  problem_id: number
  phase: string
  subgoal_index: number
  learner_response?: string | null
  hint_level: number
  evaluation_json?: string | null
  assistance_level: string
  created_at: string
}

export interface GuidedPracticeSessionConfig extends PracticeSessionConfig {
  mode: 'guided'
}

export interface GuidedHintResult {
  success: boolean
  hint?: string
  hintLevel?: number
  assistanceLevel?: string
  state?: string
  error?: string
}

export interface ExtractedPracticeProblem {
  title: string
  problem_text: string
  solution_steps: string
  final_answer: string
  difficulty: number
  principles: string[]
  suggested_topic?: string
  // Psychometric & Cognitive Architecture Metadata
  target_learning_objective?: string
  stimulus?: string
  stem_lead_in?: string
  options?: PracticeProblemOptions
  correct_key?: string
  blooms_revised?: BloomsRevised | string
  webbs_dok?: WebbsDOK | string
  cognitive_level?: { blooms_revised?: string; webbs_dok?: string }
  discipline_paradigm?: DisciplineParadigm | string
  subgoals?: string[]
  item_validation?: ItemValidation
  cover_test_passed?: boolean
  quality_score?: number
}

export interface PracticeSessionConfig {
  subjectId: number
  userId: number
  moduleId?: number | null
  topicId?: number | null
  problemCount: number // e.g. 3, 5, 10, or 999 for unlimited
  difficulty?: number | null
  learningGoal?: 'recommended' | 'reinforce' | 'review' | 'transfer' | null
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
  customInstructions?: string
}

export interface ModuleTutorStats {
  moduleId: number
  sessionCount: number
  totalMinutes: number
  avgDepthLevel: number
  depthLevels: number[]
  lastStudiedAt: string | null
}

export interface AutonomousPracticeGenResult {
  success: boolean
  count: number
  problems?: PracticeProblem[]
  error?: string
  rationale?: string
}

export interface MultiKeyVault {
  geminiKey: string
  openaiKey: string
  deepseekKey: string
  groqKey: string
  hasGeminiKey: boolean
  hasOpenaiKey: boolean
  hasDeepseekKey: boolean
  hasGroqKey: boolean
  visionProvider: 'gemini' | 'openai' | 'deepseek' | 'local' | 'auto'
  visionModel: string
}

// ── Exam Readiness & Cram Optimizer Types ────────────────────────────────────

export interface TopicReadinessBreakdown {
  topicId?: number
  topicTitle: string
  cardCount: number
  masteredCount: number
  retrievability: number // 0 - 1
  projectedScore: number // 0 - 100
  status: 'strong' | 'moderate' | 'weak' | 'gap'
  priorityRank: number
}

export interface ExamReadinessResult {
  subjectId: number
  deadlineId?: number
  deadlineLabel: string
  examDate: string
  daysRemaining: number
  projectedScore: number // 0 - 100
  confidenceMargin: number // e.g. ±4%
  tier: 'ready' | 'proficient' | 'borderline' | 'critical'
  tierLabel: string
  coveragePercent: number
  totalCards: number
  weakTopics: TopicReadinessBreakdown[]
  allTopics: TopicReadinessBreakdown[]
}

export interface CramPlanDay {
  dayNumber: number
  date: string
  focusTitle: string
  topics: string[]
  cardIds: number[]
  estimatedMinutes: number
  targetCardCount: number
  focusType: 'critical_gaps' | 'weak_reinforce' | 'retention_polish' | 'mock_drill'
}

export interface CramOptimizationResult {
  dailyMinutes: number
  daysCount: number
  totalCardsToReview: number
  currentScore: number
  projectedBoostedScore: number
  scoreDelta: number
  dailyPlan: CramPlanDay[]
}

// ── Interactive Concept Dependency & Knowledge Graph Types ────────────────────

export interface ConceptDependency {
  id?: number
  subject_id: number
  prerequisite_concept: string
  target_concept: string
  weight?: number
}

export type ConceptNodeStatus = 'mastered' | 'learning' | 'shaky' | 'gap' | 'blocked'

export interface ConceptGraphNode {
  id: string // normalized concept key
  label: string
  category?: string
  moduleId?: number
  topicId?: number
  masteryProb: number // 0.0 - 1.0 (BKT posterior or score)
  status: ConceptNodeStatus
  observations: number
  cardCount: number
  prerequisites: string[]
  dependents: string[]
  isBottleneck?: boolean
  bottleneckScore?: number
  optimalStudyRank?: number
  /** Evidence metadata keeps inferred curriculum structure distinct from observed mastery. */
  evidenceCount?: number
  evidenceSources?: string[]
  relationshipConfidence?: number
  evidenceKind?: 'observed' | 'curriculum' | 'manual' | 'inferred'
  retrievability?: number
  uncertainty?: number
  cardIds?: number[]
  materialIds?: number[]
  contextualPrerequisites?: string[]
  contextualDependents?: string[]
  layer?: number
  x?: number
  y?: number
  vx?: number
  vy?: number
}

export type ConceptGraphRelationshipType = 'manual_prerequisite' | 'curriculum_context' | 'card_topic_context'

export interface ConceptGraphEdge {
  id: string
  source: string
  target: string
  weight: number
  isPrerequisiteMet: boolean
  relationshipType: ConceptGraphRelationshipType
  blocks: boolean
  confidence: number
}

export interface ConceptGraphData {
  nodes: ConceptGraphNode[]
  edges: ConceptGraphEdge[]
  metrics: {
    totalConcepts: number
    masteredCount: number
    learningCount: number
    shakyCount: number
    gapCount: number
    blockedCount: number
    criticalBottlenecks: string[]
    suggestedNextConcept: string | null
  }
  layoutBounds?: {
    minX: number
    minY: number
    maxX: number
    maxY: number
    width: number
    height: number
  }
}
