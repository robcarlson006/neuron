import { useState, useEffect, useCallback } from 'react'
import type { Card, CardSchedule } from '../types'

interface UseCardsReturn {
  cards: Card[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  deleteCard: (cardId: number) => Promise<void>
}

export function useCards(subjectId: number): UseCardsReturn {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.electronAPI.getCards(subjectId)
      setCards(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cards')
    } finally {
      setLoading(false)
    }
  }, [subjectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function deleteCard(cardId: number): Promise<void> {
    await window.electronAPI.deleteCard(cardId)
    setCards(prev => prev.filter(c => c.id !== cardId))
  }

  return { cards, loading, error, refresh, deleteCard }
}

interface UseDueCardsReturn {
  dueCards: (Card & CardSchedule)[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useDueCards(userId: number, subjectId?: number): UseDueCardsReturn {
  const [dueCards, setDueCards] = useState<(Card & CardSchedule)[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.electronAPI.getDueCards(userId, subjectId) as (Card & CardSchedule)[]
      setDueCards(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load due cards')
    } finally {
      setLoading(false)
    }
  }, [userId, subjectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { dueCards, loading, error, refresh }
}
