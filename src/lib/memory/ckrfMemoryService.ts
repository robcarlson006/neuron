/**
 * Cognitive Knowledge & Rating Fabric (CKRF) Memory Service
 *
 * Unified service providing psychometric ratings (Glicko-2 + 2PL-IRT),
 * continuous temporal decay (FSRS-5), diagnostic misconception tracking,
 * and episodic learning memory persistence for Neuron.
 */

import {
  updateRating,
  getCompetencyBand,
  getConfidenceInterval,
  difficultyToItemRating,
  type StudentRatingProfile,
  type AssessmentOutcome,
  type CompetencyBand
} from './glicko2RatingEngine'
import {
  applyTemporalDeviationDecay,
  isRefresherRecommended
} from './temporalDecay'

export interface DatabaseLike {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }
}

export interface TopicCompetencyRow {
  id: number
  user_id: number
  subject_id: number
  topic: string
  rating: number
  rating_deviation: number
  volatility: number
  highest_rating: number
  lowest_rating: number
  observations_count: number
  last_assessed_at: string
  decayed_at: string
}

export interface StudentMisconceptionRow {
  id: number
  user_id: number
  subject_id: number
  concept: string
  misconception_key: string
  misconception_title: string
  description: string
  remediation_status: 'active' | 'inoculating' | 'resolved'
  consecutive_successes: number
  occurrence_count: number
  first_observed_at: string
  last_observed_at: string
  resolved_at: string | null
}

export interface EpisodicMemoryRow {
  id: number
  user_id: number
  subject_id: number
  topic: string
  memory_type: 'breakthrough' | 'struggle' | 'analogy' | 'pedagogical_profile'
  importance_score: number
  summary: string
  context_snippet: string | null
  effective_intervention: string | null
  session_id: number | null
  created_at: string
}

/**
 * Retrieves the current competency rating for a topic, applying temporal decay
 * if days have elapsed since the last assessment.
 */
export function getDecayedTopicRating(
  db: DatabaseLike,
  userId: number,
  subjectId: number,
  topic: string
): {
  profile: StudentRatingProfile
  band: CompetencyBand
  confidenceInterval: [number, number]
  observationsCount: number
  refresherNeeded: boolean
  isNew: boolean
} {
  const row = db.prepare(`
    SELECT * FROM topic_competency_ratings
    WHERE user_id = ? AND subject_id = ? AND topic = ?
  `).get(userId, subjectId, topic) as TopicCompetencyRow | undefined

  if (!row) {
    const defaultProfile: StudentRatingProfile = {
      rating: 1500.0,
      ratingDeviation: 350.0,
      volatility: 0.06
    }
    return {
      profile: defaultProfile,
      band: getCompetencyBand(defaultProfile.rating),
      confidenceInterval: getConfidenceInterval(defaultProfile.rating, defaultProfile.ratingDeviation),
      observationsCount: 0,
      refresherNeeded: false,
      isNew: true
    }
  }

  // Calculate elapsed days since last decay/assessment
  const lastDate = new Date(row.decayed_at || row.last_assessed_at)
  const now = new Date()
  const elapsedMs = Math.max(0, now.getTime() - lastDate.getTime())
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24)

  const decayedRD = applyTemporalDeviationDecay(row.rating_deviation, elapsedDays)

  // If deviation decayed, update decayed_at in DB
  if (decayedRD !== row.rating_deviation && elapsedDays >= 1.0) {
    try {
      db.prepare(`
        UPDATE topic_competency_ratings
        SET rating_deviation = ?, decayed_at = datetime('now')
        WHERE id = ?
      `).run(decayedRD, row.id)
    } catch { /* non-fatal */ }
  }

  const profile: StudentRatingProfile = {
    rating: row.rating,
    ratingDeviation: decayedRD,
    volatility: row.volatility
  }

  return {
    profile,
    band: getCompetencyBand(profile.rating),
    confidenceInterval: getConfidenceInterval(profile.rating, profile.ratingDeviation),
    observationsCount: row.observations_count,
    refresherNeeded: isRefresherRecommended(decayedRD),
    isNew: false
  }
}

/**
 * Records an assessment outcome (from practice problems, quiz, or card review),
 * updating the Glicko-2 rating profile.
 */
export function recordTopicAssessment(
  db: DatabaseLike,
  userId: number,
  subjectId: number,
  topic: string,
  outcome: AssessmentOutcome
): StudentRatingProfile {
  const existing = getDecayedTopicRating(db, userId, subjectId, topic)
  const newProfile = updateRating(existing.profile, [outcome])

  const now = new Date().toISOString()

  if (existing.isNew) {
    db.prepare(`
      INSERT INTO topic_competency_ratings (
        user_id, subject_id, topic, rating, rating_deviation, volatility,
        highest_rating, lowest_rating, observations_count, last_assessed_at, decayed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      userId,
      subjectId,
      topic,
      newProfile.rating,
      newProfile.ratingDeviation,
      newProfile.volatility,
      newProfile.rating,
      newProfile.rating,
      now,
      now
    )
  } else {
    db.prepare(`
      UPDATE topic_competency_ratings
      SET rating = ?,
          rating_deviation = ?,
          volatility = ?,
          highest_rating = MAX(highest_rating, ?),
          lowest_rating = MIN(lowest_rating, ?),
          observations_count = observations_count + 1,
          last_assessed_at = ?,
          decayed_at = ?
      WHERE user_id = ? AND subject_id = ? AND topic = ?
    `).run(
      newProfile.rating,
      newProfile.ratingDeviation,
      newProfile.volatility,
      newProfile.rating,
      newProfile.rating,
      now,
      now,
      userId,
      subjectId,
      topic
    )
  }

  return newProfile
}

/**
 * Records or updates a diagnostic misconception in the student's ledger.
 */
export function recordMisconception(
  db: DatabaseLike,
  userId: number,
  subjectId: number,
  data: {
    concept: string
    misconceptionKey: string
    misconceptionTitle: string
    description: string
  }
): void {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO student_misconceptions (
      user_id, subject_id, concept, misconception_key, misconception_title,
      description, remediation_status, consecutive_successes, occurrence_count,
      first_observed_at, last_observed_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', 0, 1, ?, ?)
    ON CONFLICT(user_id, subject_id, misconception_key) DO UPDATE SET
      occurrence_count = occurrence_count + 1,
      consecutive_successes = 0,
      remediation_status = CASE WHEN remediation_status = 'resolved' THEN 'inoculating' ELSE remediation_status END,
      description = excluded.description,
      last_observed_at = excluded.last_observed_at
  `).run(
    userId,
    subjectId,
    data.concept,
    data.misconceptionKey,
    data.misconceptionTitle,
    data.description,
    now,
    now
  )
}

/**
 * Records a successful encounter with a concept, advancing remediation status
 * towards 'resolved' if misconceptions were tracked.
 */
export function recordConceptSuccess(
  db: DatabaseLike,
  userId: number,
  subjectId: number,
  concept: string
): void {
  const activeMisconceptions = db.prepare(`
    SELECT id, consecutive_successes, remediation_status
    FROM student_misconceptions
    WHERE user_id = ? AND subject_id = ? AND concept = ? AND remediation_status != 'resolved'
  `).all(userId, subjectId, concept) as Array<{ id: number; consecutive_successes: number; remediation_status: string }>

  const now = new Date().toISOString()

  for (const m of activeMisconceptions) {
    const nextSuccesses = m.consecutive_successes + 1
    if (nextSuccesses >= 3) {
      db.prepare(`
        UPDATE student_misconceptions
        SET consecutive_successes = ?,
            remediation_status = 'resolved',
            resolved_at = ?
        WHERE id = ?
      `).run(nextSuccesses, now, m.id)
    } else {
      const nextStatus = nextSuccesses >= 1 ? 'inoculating' : 'active'
      db.prepare(`
        UPDATE student_misconceptions
        SET consecutive_successes = ?,
            remediation_status = ?
        WHERE id = ?
      `).run(nextSuccesses, nextStatus, m.id)
    }
  }
}

/**
 * Records an episodic learning memory node (e.g. breakthrough, analogy, pacing preference).
 */
export function recordEpisodicMemory(
  db: DatabaseLike,
  data: {
    userId: number
    subjectId: number
    topic: string
    memoryType: 'breakthrough' | 'struggle' | 'analogy' | 'pedagogical_profile'
    importanceScore: number
    summary: string
    contextSnippet?: string
    effectiveIntervention?: string
    sessionId?: number
  }
): void {
  db.prepare(`
    INSERT INTO episodic_learning_memories (
      user_id, subject_id, topic, memory_type, importance_score,
      summary, context_snippet, effective_intervention, session_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    data.userId,
    data.subjectId,
    data.topic,
    data.memoryType,
    Math.max(1, Math.min(10, data.importanceScore)),
    data.summary,
    data.contextSnippet || null,
    data.effectiveIntervention || null,
    data.sessionId || null
  )
}

/**
 * Builds the comprehensive CKRF context block for Socratic Tutor and Practice generation prompts.
 */
export function buildCKRFMemoryBlock(
  db: DatabaseLike | undefined,
  userId: number | undefined,
  subjectId: number | undefined,
  targetTopic?: string
): string {
  if (!db || !userId || !subjectId) return ''

  try {
    const lines: string[] = []

    // 1. Glicko-2 Competency Ratings for active subject
    const ratings = db.prepare(`
      SELECT topic, rating, rating_deviation, observations_count, last_assessed_at
      FROM topic_competency_ratings
      WHERE user_id = ? AND subject_id = ?
      ORDER BY rating ASC, observations_count DESC
      LIMIT 15
    `).all(userId, subjectId) as Array<{
      topic: string
      rating: number
      rating_deviation: number
      observations_count: number
      last_assessed_at: string
    }>

    if (ratings.length > 0) {
      lines.push('COGNITIVE KNOWLEDGE & PSYCHOMETRIC RATINGS (GLICKO-2):')
      for (const r of ratings) {
        const band = getCompetencyBand(r.rating)
        const [low, high] = getConfidenceInterval(r.rating, r.rating_deviation)
        lines.push(
          `- ${r.topic}: Rating ${Math.round(r.rating)} ± ${Math.round(r.rating_deviation)} [${band}] (95% CI: ${low}-${high}, ${r.observations_count} assessments)`
        )
      }
      lines.push('')
    }

    // 2. Active & Inoculating Misconceptions
    const misconceptions = db.prepare(`
      SELECT concept, misconception_title, description, remediation_status, occurrence_count
      FROM student_misconceptions
      WHERE user_id = ? AND subject_id = ? AND remediation_status IN ('active', 'inoculating')
      ORDER BY occurrence_count DESC, last_observed_at DESC
      LIMIT 8
    `).all(userId, subjectId) as Array<{
      concept: string
      misconception_title: string
      description: string
      remediation_status: string
      occurrence_count: number
    }>

    if (misconceptions.length > 0) {
      lines.push('ACTIVE DIAGNOSTIC MISCONCEPTIONS & INOCULATION LEDGER:')
      for (const m of misconceptions) {
        const statusTag = m.remediation_status === 'inoculating' ? '[INOCULATING - 1-2 Successes]' : '[ACTIVE STRUGGLE]'
        lines.push(`- ${statusTag} ${m.concept}: "${m.misconception_title}" (Seen ${m.occurrence_count}x)`)
        lines.push(`  Details: ${m.description}`)
      }
      lines.push('PEDAGOGICAL DIRECTIVE: Before advancing in these topics, use hinge-point diagnostic questions to verify whether these misconceptions have been unlearned.')
      lines.push('')
    }

    // 3. Episodic Learning Memory Stream (Breakthroughs, Analogies, Pedagogical Profile)
    const episodicMemories = db.prepare(`
      SELECT topic, memory_type, summary, effective_intervention, importance_score
      FROM episodic_learning_memories
      WHERE user_id = ? AND subject_id = ?
      ORDER BY importance_score DESC, created_at DESC
      LIMIT 8
    `).all(userId, subjectId) as Array<{
      topic: string
      memory_type: string
      summary: string
      effective_intervention: string | null
      importance_score: number
    }>

    if (episodicMemories.length > 0) {
      lines.push('EPISODIC LEARNING MEMORY (BREAKTHROUGHS & EFFECTIVE INTERVENTIONS):')
      for (const e of episodicMemories) {
        const typeLabel = e.memory_type.toUpperCase()
        lines.push(`- [${typeLabel}] (${e.topic}, Importance ${e.importance_score}/10): ${e.summary}`)
        if (e.effective_intervention) {
          lines.push(`  Successful Method: ${e.effective_intervention}`)
        }
      }
      lines.push('')
    }

    return lines.join('\n')
  } catch (err) {
    console.error('Failed to build CKRF memory block:', err)
    return ''
  }
}
