import { useState, useEffect, useCallback } from 'react'
import type { Subject } from '../types'

interface UseSubjectsReturn {
  subjects: Subject[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  saveSubject: (subject: Partial<Subject>) => Promise<Subject>
  deleteSubject: (subjectId: number) => Promise<void>
}

export function useSubjects(userId?: number): UseSubjectsReturn {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.electronAPI.getSubjects(userId)
      setSubjects(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subjects')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function saveSubject(subject: Partial<Subject>): Promise<Subject> {
    const saved = await window.electronAPI.saveSubject(subject)
    if (subject.id) {
      setSubjects(prev => prev.map(s => s.id === subject.id ? saved : s))
    } else {
      setSubjects(prev => [saved, ...prev])
    }
    return saved
  }

  async function deleteSubject(subjectId: number): Promise<void> {
    await window.electronAPI.deleteSubject(subjectId)
    setSubjects(prev => prev.filter(s => s.id !== subjectId))
  }

  return { subjects, loading, error, refresh, saveSubject, deleteSubject }
}
