import type { NavigateFunction } from 'react-router-dom'
import type { FocusBlockItem, TutorSessionConfig } from '../types'

/**
 * Automatically determine difficulty and duration for a Focus Block item,
 * and navigate to the appropriate route.
 */
export async function navigateToFocusBlockItem(
  item: FocusBlockItem,
  navigate: NavigateFunction,
  userId?: number
): Promise<void> {
  if (item.action_type === 'flashcards') {
    navigate(`/study/${item.subject_id}`)
    return
  }

  if (item.action_type === 'tutor_drill') {
    let depthLevel: 1 | 2 | 3 | 4 | 5 = 3

    if (userId && window.electronAPI?.getConceptMastery) {
      try {
        const mastery = (await window.electronAPI.getConceptMastery(userId, item.subject_id)) as {
          concept: string
          mastery_prob: number
        }[]

        if (item.target_topic && mastery?.length) {
          const targetLower = item.target_topic.toLowerCase()
          const found = mastery.find(
            m => m.concept.toLowerCase().includes(targetLower) || targetLower.includes(m.concept.toLowerCase())
          )
          if (found) {
            if (found.mastery_prob >= 0.8) depthLevel = 5
            else if (found.mastery_prob >= 0.6) depthLevel = 4
            else if (found.mastery_prob >= 0.4) depthLevel = 3
            else if (found.mastery_prob >= 0.2) depthLevel = 2
            else depthLevel = 1
          }
        } else if (mastery?.length) {
          const avg = mastery.reduce((acc, m) => acc + m.mastery_prob, 0) / mastery.length
          if (avg >= 0.75) depthLevel = 4
          else if (avg >= 0.45) depthLevel = 3
          else depthLevel = 2
        }
      } catch (err) {
        console.warn('Failed to calculate concept mastery for focus block item:', err)
      }
    }

    const config: TutorSessionConfig = {
      duration_minutes: item.estimated_minutes || 15,
      depth_level: depthLevel,
      never_studied: false,
      target_topic: item.target_topic || undefined
    }

    navigate(`/tutor/${item.subject_id}?config=${encodeURIComponent(JSON.stringify(config))}`)
    return
  }

  if (item.action_type === 'syllabus_read') {
    navigate(`/subject/${item.subject_id}`)
    return
  }

  // Fallback
  navigate(`/tutor/${item.subject_id}`)
}
