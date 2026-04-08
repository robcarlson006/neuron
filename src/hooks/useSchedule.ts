import { useState, useEffect, useCallback } from 'react'
import { sm2 } from '../lib/sm2'
import type { CardSchedule, SM2Result } from '../types'

interface UseScheduleReturn {
  schedules: CardSchedule[]
  loading: boolean
  processReview: (cardId: number, quality: number) => Promise<SM2Result | null>
  refresh: () => Promise<void>
}

export function useSchedule(userId: number, subjectId?: number): UseScheduleReturn {
  const [schedules, setSchedules] = useState<CardSchedule[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.electronAPI.getAllSchedules(userId, subjectId) as CardSchedule[]
      setSchedules(data)
    } catch (err) {
      console.error('Failed to load schedules:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, subjectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function processReview(cardId: number, quality: number): Promise<SM2Result | null> {
    const schedule = schedules.find(s => s.card_id === cardId)
    if (!schedule) return null

    const result = sm2(quality, schedule)
    await window.electronAPI.updateSchedule(cardId, userId, result)

    setSchedules(prev =>
      prev.map(s =>
        s.card_id === cardId
          ? { ...s, ...result }
          : s
      )
    )

    return result
  }

  return { schedules, loading, processReview, refresh }
}
