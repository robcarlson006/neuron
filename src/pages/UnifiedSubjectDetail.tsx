import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import PomodoroWidget from '../components/PomodoroWidget'
import CardBrowser from '../components/CardBrowser'
import LatexText from '../components/LatexText'
import CurriculumView from '../components/classes/CurriculumView'
import SessionConfigModal from '../components/tutor/SessionConfigModal'
import CurriculumProgressBar from '../components/classes/CurriculumProgressBar'
import CardImportModal from '../components/CardImportModal'
import type { Card, CardFolder, CardSchedule, Deadline, SyllabusModule, ModuleTopic, Material, FolderSyncEvent, Lecture, ModuleTutorStats } from '../types'
import { useLectureRecordingStore } from '../store/lectureRecordingStore'
import LectureAudioPlayer from '../components/classes/LectureAudioPlayer'
import LectureNotesModal from '../components/classes/LectureNotesModal'
import AudioDeviceSelector from '../components/classes/AudioDeviceSelector'
import LoadingProgressBar from '../components/common/LoadingProgressBar'
import PracticeHub from './PracticeHub'
import PracticeSessionPage from './PracticeSessionPage'

type Tab = 'cards' | 'curriculum' | 'practice' | 'materials' | 'lectures' | 'deadlines'

export default function UnifiedSubjectDetail(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const subjectId = Number(id)
  const navigate = useNavigate()
  const { user, subjects, updateSubject, removeSubject, addToast, calculatorSkin } = useAppStore()

  const subject = subjects.find(s => s.id === subjectId)

  // ── Shared state ──
  const [activeTab, setActiveTab] = useState<Tab>(
    subject?.subject_type === 'class' || subject?.subject_type === 'book' ? 'curriculum' : 'cards'
  )
  const [practiceSessionParams, setPracticeSessionParams] = useState<{
    moduleId?: number
    topicId?: number
    count?: number
  } | null>(null)
  const [showEditSubject, setShowEditSubject] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState<{
    subjectId: number
    subjectName: string
    materialId?: number
    materialName?: string
    initialTopic?: string
    initialTopics?: string[]
    moduleId?: number
    initialMode?: 'new_content' | 'quick_review' | 'fill_gaps' | 'active_recall' | 'syllabus' | 'material' | 'custom'
  } | null>(null)
  const [editName, setEditName] = useState(subject?.name || '')
  const [editCode, setEditCode] = useState(subject?.course_code || '')
  const [editStatus, setEditStatus] = useState(subject?.status || 'active')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Cards state (from SubjectDetail) ──
  const [cards, setCards] = useState<Card[]>([])
  const [folders, setFolders] = useState<CardFolder[]>([])
  const [folderFilter, setFolderFilter] = useState<'all' | 'uncategorized' | number>('all')
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [selectedCardForDetail, setSelectedCardForDetail] = useState<Card | null>(null)
  const [showAddCard, setShowAddCard] = useState(false)
  const [newCardFront, setNewCardFront] = useState('')
  const [newCardBack, setNewCardBack] = useState('')
  const [newCardType, setNewCardType] = useState<'flashcard' | 'active_recall'>('flashcard')
  const [newCardFolderId, setNewCardFolderId] = useState<number | null>(null)
  const [newCardImageUrl, setNewCardImageUrl] = useState('')
  const [showTextImport, setShowTextImport] = useState(false)
  const [selectedImportMaterialId, setSelectedImportMaterialId] = useState<number | null>(null)

  // ── Curriculum state (from ClassOverview) ──
  const [modules, setModules] = useState<(SyllabusModule & { topics?: ModuleTopic[] })[]>([])
  const [moduleTutorStats, setModuleTutorStats] = useState<Record<number, ModuleTutorStats>>({})
  const [loadingCards, setLoadingCards] = useState<Record<number, boolean>>({})
  const [, setStudyLog] = useState<Record<number, boolean>>({})

  // ── Materials state ──
  const [materials, setMaterials] = useState<Material[]>([])
  const [addingMaterial, setAddingMaterial] = useState(false)
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<number>>(new Set())
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [isGeneratingCards, setIsGeneratingCards] = useState(false)
  /** Material just uploaded to a subject that already has a syllabus — shows
   * the one-click "Update curriculum?" offer until acted on or dismissed. */
  const [pendingUpdateMaterial, setPendingUpdateMaterial] = useState<string | null>(null)
  const [updatingSyllabus, setUpdatingSyllabus] = useState(false)
  const [isRegeneratingSyllabus, setIsRegeneratingSyllabus] = useState(false)
  const [syncingFolder, setSyncingFolder] = useState(false)

  // ── Lectures state ──
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [selectedLectureForNotes, setSelectedLectureForNotes] = useState<Lecture | null>(null)
  const [showStartRecordModal, setShowStartRecordModal] = useState(false)
  const [lectureTitleInput, setLectureTitleInput] = useState('')
  const [startingLecture, setStartingLecture] = useState(false)
  const recordingStore = useLectureRecordingStore()

  // ── Deadlines state (from SubjectDetail) ──
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [newDeadlineLabel, setNewDeadlineLabel] = useState('')
  const [newDeadlineDate, setNewDeadlineDate] = useState('')
  const [showDeadlineForm, setShowDeadlineForm] = useState(false)

  // ── Load all data ──
  useEffect(() => {
    if (subjectId && user) {
      loadAllData()
      setEditName(subject?.name || '')
      setEditCode(subject?.course_code || '')
      setEditStatus(subject?.status || 'active')
    }
  }, [subjectId, user])

  // ── Lecture status event listener ──
  useEffect(() => {
    if (!window.electronAPI?.onLectureStatusUpdate) return

    const unsubscribe = window.electronAPI.onLectureStatusUpdate((data) => {
      loadAllData()
      if (data.status === 'ready') {
        addToast({ type: 'success', title: 'Lecture Processed', message: 'Structured notes added to class materials.' })
      } else if (data.status === 'failed') {
        addToast({ type: 'error', title: 'Transcription Failed', message: data.error || 'Check Settings for API configuration.' })
      }
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [subjectId])

  // ── Folder sync event listener ──
  useEffect(() => {
    if (!window.electronAPI?.onFolderSync) return

    const unsubscribe = window.electronAPI.onFolderSync((event: FolderSyncEvent) => {
      if (event.subjectId === subjectId) {
        loadAllData()
        const addedCount = event.added?.length || 0
        const updatedCount = event.updated?.length || 0
        const msg = `✨ Synced folder: ${addedCount} added, ${updatedCount} updated`
        setToast({ message: msg, type: 'success' })
        setTimeout(() => setToast(null), 4000)
        addToast({ type: 'success', title: 'Folder Synced', message: msg })
      }
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [subjectId, user])

  async function loadAllData(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const hasCurriculum = subject?.subject_type === 'class' || subject?.subject_type === 'book'

      const [c, d, f, mats, lecs] = await Promise.all([
        window.electronAPI.getCards(subjectId),
        window.electronAPI.getDeadlines(subjectId),
        window.electronAPI.getFolders(subjectId),
        window.electronAPI.getMaterials(subjectId),
        window.electronAPI.listLectures ? window.electronAPI.listLectures(subjectId) : Promise.resolve([])
      ])
      setCards(c)
      setDeadlines(d as Deadline[])
      setFolders(f)
      setMaterials(mats as Material[])
      setLectures((lecs as Lecture[]) || [])

      if (window.electronAPI.syllabusListModules) {
        try {
          const mods = (await window.electronAPI.syllabusListModules(subjectId)) as (SyllabusModule & { topic_count?: number })[]
          const modsWithTopics: (SyllabusModule & { topics?: ModuleTopic[] })[] = []
          for (const mod of (mods || [])) {
            const topList = window.electronAPI.syllabusListTopics
              ? ((await window.electronAPI.syllabusListTopics(mod.id, user?.id)) as ModuleTopic[])
              : []
            modsWithTopics.push({ ...mod, topics: topList || [] })
          }
          setModules(modsWithTopics)

          // Load module-level tutor stats
          if (window.electronAPI.tutorGetSubjectModuleStats) {
            try {
              const stats = await window.electronAPI.tutorGetSubjectModuleStats(subjectId, user?.id)
              setModuleTutorStats(stats || {})
            } catch { /* ignore */ }
          }

          // Load study log
          if (hasCurriculum && user) {
            try {
              const log: Record<number, boolean> = {}
              const mastery = await window.electronAPI.getConceptMastery(user.id, subjectId)
              for (const mod of modsWithTopics) {
                if (mod.topics) {
                  for (const topic of mod.topics) {
                    const hasMastery = Array.isArray(mastery) && mastery.some(
                      (m: { concept: string }) => m.concept === topic.title
                    )
                    if (hasMastery) log[topic.id] = true
                  }
                }
              }
              setStudyLog(log)
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('Error loading subject data:', err)
      setError('Failed to load subject data.')
    } finally {
      setLoading(false)
    }
  }

  // ── Card action handlers ──
  async function handleAddCard(): Promise<void> {
    if (!user || !newCardFront.trim() || !newCardBack.trim()) return
    await window.electronAPI.saveManyCards([{
      subject_id: subjectId,
      type: newCardType,
      front: newCardFront.trim(),
      back: newCardBack.trim(),
      image_url: newCardImageUrl || undefined,
      folder_id: newCardFolderId,
      is_manual: 1
    }], user.id)
    await loadAllData()
    setNewCardFront('')
    setNewCardBack('')
    setNewCardImageUrl('')
    setNewCardFolderId(null)
    setShowAddCard(false)
  }

  async function handleCreateFolder(): Promise<void> {
    if (!newFolderName.trim()) return
    const folder = await window.electronAPI.saveFolder({ subject_id: subjectId, name: newFolderName.trim() })
    setFolders(prev => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)))
    setNewFolderName('')
    setShowNewFolderInput(false)
  }

  async function handleDeleteFolder(folderId: number): Promise<void> {
    if (!confirm('Delete this folder? Cards inside will become uncategorised.')) return
    await window.electronAPI.deleteFolder(folderId)
    setFolders(prev => prev.filter(f => f.id !== folderId))
    setCards(prev => prev.map(c => c.folder_id === folderId ? { ...c, folder_id: null } : c))
    if (folderFilter === folderId) setFolderFilter('all')
  }

  async function handleMoveCard(cardId: number, folderId: number | null): Promise<void> {
    await window.electronAPI.updateCardFolder(cardId, folderId)
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, folder_id: folderId } : c))
    if (selectedCardForDetail?.id === cardId) {
      setSelectedCardForDetail(prev => prev ? { ...prev, folder_id: folderId } : null)
    }
  }

  const handleAnkiImport = async () => {
    if (!user) return
    try {
      const filePath = await window.electronAPI.openFileDialog()
      if (!filePath) return
      const deck = await window.electronAPI.parseAnkiDeck(filePath)
      if (!deck.cards || deck.cards.length === 0) {
        alert('No cards found in this Anki deck.')
        return
      }
      const confirmMsg = `Import "${deck.name}" with ${deck.cardCount} cards?`
      if (!confirm(confirmMsg)) return
      const saved = await window.electronAPI.importAnkiDeck(deck, user.id, subjectId)
      setToast({ message: `Imported ${saved.length} cards from Anki deck!`, type: 'success' })
      loadAllData()
    } catch (err: any) {
      setToast({ message: `Anki import failed: ${err.message}`, type: 'error' })
    }
  }

  // ── Deadline action handlers ──
  async function handleAddDeadline(): Promise<void> {
    if (!newDeadlineLabel.trim() || !newDeadlineDate) return
    const d = await window.electronAPI.saveDeadline({
      subject_id: subjectId,
      label: newDeadlineLabel.trim(),
      deadline_date: newDeadlineDate
    })
    setDeadlines(prev => [...prev, d as Deadline].sort(
      (a, b) => new Date(a.deadline_date).getTime() - new Date(b.deadline_date).getTime()
    ))
    setNewDeadlineLabel('')
    setNewDeadlineDate('')
    setShowDeadlineForm(false)
  }

  async function handleDeleteDeadline(deadlineId: number): Promise<void> {
    await window.electronAPI.deleteDeadline(deadlineId)
    setDeadlines(prev => prev.filter(d => d.id !== deadlineId))
  }

  // ── Subject action handlers ──
  async function handleUpdateSubject(): Promise<void> {
    const updated = await window.electronAPI.saveSubject({
      id: subjectId,
      name: editName.trim(),
      course_code: editCode.trim() || undefined,
      status: editStatus as 'active' | 'ongoing' | 'archived'
    })
    updateSubject(updated)
    if (editStatus === 'archived') {
      setCards([])
    }
    setShowEditSubject(false)
  }

  async function handleDeleteSubject(): Promise<void> {
    if (!confirm('Delete this subject and all its cards? This cannot be undone.')) return
    await window.electronAPI.deleteSubject(subjectId)
    removeSubject(subjectId)
    navigate('/')
  }

  // ── Curriculum action handlers ──
  function handleStartTutor(moduleId?: number, selectedTopics?: string[], mode?: string): void {
    if (subject) {
      setShowConfigModal({
        subjectId,
        subjectName: subject.name,
        moduleId,
        initialTopics: selectedTopics,
        initialMode: (mode as any) || (moduleId ? 'syllabus' : 'new_content')
      })
    }
  }

  function handleStartSpacedReview(moduleId?: number, selectedTopics?: string[]): void {
    if (subject) {
      const config: import('../types').TutorSessionConfig = {
        duration_minutes: 15,
        depth_level: 3,
        never_studied: false,
        module_id: moduleId,
        is_spaced_review: true,
        spaced_review_topics: selectedTopics
      }
      navigate(`/tutor/${subjectId}?config=${encodeURIComponent(JSON.stringify(config))}`)
    }
  }

  async function handleGenerateCards(moduleId: number, options?: import('../types').ModuleCardGenOptions): Promise<void> {
    setLoadingCards(prev => ({ ...prev, [moduleId]: true }))
    try {
      const result = await window.electronAPI.cardsGenerateFromModule(subjectId, moduleId, options)
      if (result.success) {
        const typeStr = options?.type === 'flashcard' ? 'flashcards' : options?.type === 'active_recall' ? 'active recall questions' : 'cards'
        const dupNote = result.duplicates_filtered && result.duplicates_filtered > 0 ? ` (${result.duplicates_filtered} duplicates skipped)` : ''
        addToast({
          type: 'success',
          title: 'Cards Generated',
          message: `${result.count} ${typeStr} created from ${result.module_name || 'module'}${dupNote}.`
        })
        await loadAllData()
      } else {
        addToast({ type: 'error', title: 'Generation Failed', message: result.error || 'Unknown error' })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addToast({ type: 'error', title: 'Generation Failed', message: msg })
    } finally {
      setLoadingCards(prev => ({ ...prev, [moduleId]: false }))
    }
  }

  async function handleToggleTopic(topicId: number, studied: boolean): Promise<void> {
    setStudyLog(prev => ({ ...prev, [topicId]: studied }))
    try {
      if (window.electronAPI.syllabusToggleTopicCompleted) {
        const res = await window.electronAPI.syllabusToggleTopicCompleted(topicId, studied, user?.id)
        if (res?.success) {
          setModules(prev =>
            prev.map(mod => {
              const containsTopic = mod.topics?.some(t => t.id === topicId) || (res.moduleId !== undefined && mod.id === res.moduleId)
              if (!containsTopic) {
                return mod
              }
              const updatedTopics = mod.topics?.map(t =>
                t.id === topicId ? { ...t, completed: studied, studied } : t
              )
              const newStatus = res.moduleStatus as 'pending' | 'in_progress' | 'completed' | undefined
              return {
                ...mod,
                status: newStatus || mod.status,
                topics: updatedTopics
              }
            })
          )
        }
      }
    } catch (err) {
      console.error('Failed to toggle topic completed:', err)
    }
  }

  // ── Material action handlers ──
  async function handleAddMaterial(): Promise<void> {
    setAddingMaterial(true)
    try {
      const filePath = await window.electronAPI.openFileDialog()
      if (!filePath) { setAddingMaterial(false); return }

      const parsed = await window.electronAPI.parseFile(filePath)
      if (!parsed) { setAddingMaterial(false); return }

      const result = await window.electronAPI.saveMaterial({
        subject_id: subjectId,
        filename: parsed.filename,
        file_type: parsed.fileType,
        content_text: parsed.contentText
      })

      if (result?.id) {
        setToast({ message: `Added "${parsed.filename}"`, type: 'success' })
        // If this class already has a syllabus, offer a non-destructive
        // incremental update instead of leaving the material unintegrated.
        if (subject?.syllabus_generated || modules.length > 0) {
          setPendingUpdateMaterial(parsed.filename)
        }
        loadAllData()
      }
    } catch (err: any) {
      setToast({ message: `Failed to add material: ${err.message}`, type: 'error' })
    } finally {
      setAddingMaterial(false)
    }
  }

  /** One-click incremental curriculum reconciliation from materials.
   * Restructures curriculum logically while preserving all completed topic progress. */
  async function handleUpdateCurriculum(): Promise<void> {
    setUpdatingSyllabus(true)
    try {
      const result = await window.electronAPI.syllabusUpdateFromMaterials(subjectId)
      const preserved = result.preserved_completed_count ?? 0
      const gaps = result.gap_topic_count ?? result.new_topic_count
      const updated = result.updated_topic_count ?? 0

      let details = ''
      if (preserved > 0) details += `${preserved} completed topic${preserved !== 1 ? 's' : ''} preserved. `
      if (gaps > 0) details += `${gaps} new learning gap${gaps !== 1 ? 's' : ''} added. `
      if (updated > 0) details += `${updated} topic${updated !== 1 ? 's' : ''} updated with new content. `

      addToast({
        type: 'success',
        title: 'Curriculum Reconciled',
        message: details || 'Your syllabus has been updated to reflect all materials.'
      })
      setPendingUpdateMaterial(null)
      loadAllData()
    } catch (err: any) {
      addToast({ type: 'error', title: 'Update Failed', message: err.message || 'Could not update the curriculum.' })
    } finally {
      setUpdatingSyllabus(false)
    }
  }

  /** Explicit full syllabus reconciliation. Progress on completed topics is preserved by the backend. */
  async function handleRegenerateSyllabus(): Promise<void> {
    const ok = confirm(
      'Reconcile and restructure the syllabus from ALL materials?\n\n' +
      'This organizes your curriculum into the most logical pedagogical sequence. ' +
      'All topic completions and study history will be preserved, and any newly identified topics will be highlighted.\n\nContinue?'
    )
    if (!ok) return
    setIsRegeneratingSyllabus(true)
    try {
      const result = await window.electronAPI.syllabusGenerateFromMaterials(subjectId)
      if (result?.length) {
        addToast({ type: 'success', title: 'Syllabus Reconciled', message: `${result.length} modules organized. Your progress was preserved.` })
        loadAllData()
      }
    } catch {
      addToast({ type: 'error', title: 'Generation Failed', message: 'Ensure materials are uploaded first.' })
    } finally {
      setIsRegeneratingSyllabus(false)
    }
  }

  const isThisClassRecording =
    recordingStore.isRecording && recordingStore.subjectId === subjectId

  async function handleStartRecording(): Promise<void> {
    if (!subject) return
    if (recordingStore.isRecording) {
      addToast({
        type: 'error',
        title: 'Recording in Progress',
        message: `Already recording for "${recordingStore.subjectName}". Please finish or stop that session first.`
      })
      return
    }

    setStartingLecture(true)
    const title = lectureTitleInput.trim() || undefined
    const success = await recordingStore.startRecording(subjectId, subject.name, title)
    setStartingLecture(false)
    setShowStartRecordModal(false)
    setLectureTitleInput('')

    if (success) {
      addToast({
        type: 'success',
        title: 'Recording Started',
        message: 'Audio is streaming to disk. You can navigate freely.'
      })
      loadAllData()
    } else {
      addToast({
        type: 'error',
        title: 'Failed to Start Recording',
        message: recordingStore.error || 'Please check microphone permissions in System Settings.'
      })
    }
  }

  async function handleDeleteLecture(lectureId: number, title: string): Promise<void> {
    if (!window.confirm(`Delete lecture "${title}" and its audio recording?`)) return
    try {
      await window.electronAPI.deleteLecture(lectureId, true)
      addToast({ type: 'success', title: 'Lecture Deleted', message: `Removed "${title}"` })
      loadAllData()
    } catch (err: any) {
      addToast({ type: 'error', title: 'Delete Failed', message: err?.message || 'Could not delete lecture' })
    }
  }

  async function handleRetryLecture(lectureId: number): Promise<void> {
    try {
      await window.electronAPI.retryLectureTranscription(lectureId)
      addToast({ type: 'success', title: 'Transcription Retrying', message: 'Processing in background...' })
      loadAllData()
    } catch (err: any) {
      addToast({ type: 'error', title: 'Retry Failed', message: err?.message || 'Could not retry' })
    }
  }



  async function handleDeleteMaterial(materialId: number, filename: string): Promise<void> {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return
    try {
      await window.electronAPI.deleteMaterial(materialId)
      setMaterials(prev => prev.filter(m => m.id !== materialId))
      setSelectedMaterialIds(prev => {
        const next = new Set(prev)
        next.delete(materialId)
        return next
      })
      setToast({ message: `Deleted "${filename}"`, type: 'success' })
    } catch (err: any) {
      setToast({ message: `Failed to delete material: ${err.message}`, type: 'error' })
    }
  }

  function toggleMaterialSelection(id: number) {
    setSelectedMaterialIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSelectAllMaterials() {
    if (selectedMaterialIds.size === materials.length) {
      setSelectedMaterialIds(new Set())
    } else {
      setSelectedMaterialIds(new Set(materials.map(m => m.id)))
    }
  }

  async function handleSynthesizeSelected(): Promise<void> {
    if (selectedMaterialIds.size < 2 || isSynthesizing) return
    setIsSynthesizing(true)
    const startMsg = `Scanning all text across ${selectedMaterialIds.size} materials without chunking...`
    setToast({ message: startMsg, type: 'success' })
    addToast({ type: 'info', title: 'Synthesizing Materials', message: startMsg })
    try {
      const result = await window.electronAPI.cardsGenerateFromMultiple(
        subjectId,
        Array.from(selectedMaterialIds)
      )
      if (result.success) {
        const successMsg = `Generated ${result.count} triangulated cards from ${result.filenames?.length || selectedMaterialIds.size} materials!`
        setToast({ message: successMsg, type: 'success' })
        addToast({ type: 'success', title: 'Cards Synthesized', message: successMsg })
        setTimeout(() => setToast(null), 5000)
        setSelectedMaterialIds(new Set())
        await loadAllData()
      } else {
        const errMsg = result.error || 'Unknown error'
        setToast({ message: `Synthesis failed: ${errMsg}`, type: 'error' })
        addToast({ type: 'error', title: 'Synthesis Failed', message: errMsg })
        setTimeout(() => setToast(null), 5000)
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Unknown error'
      setToast({ message: `Synthesis error: ${errMsg}`, type: 'error' })
      addToast({ type: 'error', title: 'Synthesis Error', message: errMsg })
      setTimeout(() => setToast(null), 5000)
    } finally {
      setIsSynthesizing(false)
    }
  }

  async function handleGenerateCardsSelected(): Promise<void> {
    if (selectedMaterialIds.size < 1 || isGeneratingCards) return
    setIsGeneratingCards(true)
    const startMsg = `Generating individual flashcards across ${selectedMaterialIds.size} materials...`
    setToast({ message: startMsg, type: 'success' })
    addToast({ type: 'info', title: 'Generating Flashcards', message: startMsg })
    try {
      const result = await window.electronAPI.cardsBatchGenerate(
        subjectId,
        Array.from(selectedMaterialIds)
      )
      if (result.success) {
        const successes = result.results.filter(r => r.success)
        if (result.totalGenerated > 0) {
          const successMsg = `Generated ${result.totalGenerated} cards across ${successes.length} material${successes.length !== 1 ? 's' : ''}!`
          setToast({ message: successMsg, type: 'success' })
          addToast({ type: 'success', title: 'Cards Generated', message: successMsg })
          setTimeout(() => setToast(null), 5000)
          setSelectedMaterialIds(new Set())
          await loadAllData()
        } else {
          const firstErr = result.results.find(r => !r.success)?.error || 'No valid cards passed quality check'
          setToast({ message: `Card generation failed: ${firstErr}`, type: 'error' })
          addToast({ type: 'error', title: 'Card Generation Failed', message: firstErr })
          setTimeout(() => setToast(null), 5000)
        }
      } else {
        setToast({ message: 'Card generation failed', type: 'error' })
        addToast({ type: 'error', title: 'Card Generation Failed', message: 'Failed to generate cards across selected materials' })
        setTimeout(() => setToast(null), 5000)
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Unknown error'
      setToast({ message: `Generation error: ${errMsg}`, type: 'error' })
      addToast({ type: 'error', title: 'Generation Error', message: errMsg })
      setTimeout(() => setToast(null), 5000)
    } finally {
      setIsGeneratingCards(false)
    }
  }


  // ── Linked folder action handlers ──
  function getFolderBaseName(folderPath: string): string {
    const normalized = folderPath.replace(/\\/g, '/').replace(/\/+$/, '')
    const parts = normalized.split('/')
    return parts[parts.length - 1] || folderPath
  }

  function formatLastSynced(timestamp?: string | null): string {
    if (!timestamp) return 'Never'
    try {
      const date = new Date(timestamp)
      const diffMs = Date.now() - date.getTime()
      if (diffMs < 60_000) return 'Just now'
      if (diffMs < 3600_000) {
        const mins = Math.floor(diffMs / 60_000)
        return `${mins}m ago`
      }
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    } catch {
      return timestamp
    }
  }

  async function handleLinkFolder(): Promise<void> {
    try {
      const folderPath = await window.electronAPI.selectFolderDialog()
      if (!folderPath) return

      setSyncingFolder(true)
      const res = await window.electronAPI.linkFolderToClass(subjectId, folderPath)
      if (res.success) {
        if (subject) {
          updateSubject({
            ...subject,
            linked_folder_path: folderPath,
            folder_sync_status: 'idle',
            folder_last_synced_at: new Date().toISOString()
          })
        }
        await loadAllData()
        const msg = `Linked folder "${getFolderBaseName(folderPath)}" (${res.addedCount} files added)`
        setToast({ message: msg, type: 'success' })
        setTimeout(() => setToast(null), 4000)
        addToast({ type: 'success', title: 'Folder Linked', message: msg })
      } else {
        const errMsg = res.error || 'Failed to link folder'
        setToast({ message: errMsg, type: 'error' })
        setTimeout(() => setToast(null), 4000)
        addToast({ type: 'error', title: 'Link Failed', message: errMsg })
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to link folder'
      setToast({ message: errMsg, type: 'error' })
      setTimeout(() => setToast(null), 4000)
      addToast({ type: 'error', title: 'Link Failed', message: errMsg })
    } finally {
      setSyncingFolder(false)
    }
  }

  async function handleSyncNow(): Promise<void> {
    if (!subject) return
    setSyncingFolder(true)
    try {
      const res = await window.electronAPI.syncClassFolder(subjectId)
      if (res.success) {
        if (subject) {
          updateSubject({
            ...subject,
            folder_last_synced_at: new Date().toISOString()
          })
        }
        await loadAllData()
        const msg = `✨ Synced folder: ${res.addedCount} added, ${res.updatedCount} updated`
        setToast({ message: msg, type: 'success' })
        setTimeout(() => setToast(null), 4000)
        addToast({ type: 'success', title: 'Folder Synced', message: msg })
      } else {
        const errMsg = res.error || 'Failed to sync folder'
        setToast({ message: errMsg, type: 'error' })
        setTimeout(() => setToast(null), 4000)
        addToast({ type: 'error', title: 'Sync Failed', message: errMsg })
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to sync folder'
      setToast({ message: errMsg, type: 'error' })
      setTimeout(() => setToast(null), 4000)
      addToast({ type: 'error', title: 'Sync Failed', message: errMsg })
    } finally {
      setSyncingFolder(false)
    }
  }

  async function handleUnlinkFolder(): Promise<void> {
    const confirmed = window.confirm(
      'Unlink this folder? Previously imported materials and cards will remain intact.'
    )
    if (!confirmed) return

    try {
      const res = await window.electronAPI.unlinkFolderFromClass(subjectId)
      if (res.success) {
        if (subject) {
          updateSubject({
            ...subject,
            linked_folder_path: null,
            folder_sync_status: 'idle',
            folder_last_synced_at: null
          })
        }
        await loadAllData()
        const msg = 'Folder unlinked'
        setToast({ message: msg, type: 'success' })
        setTimeout(() => setToast(null), 4000)
        addToast({ type: 'info', title: 'Folder Unlinked', message: msg })
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to unlink folder'
      setToast({ message: errMsg, type: 'error' })
      setTimeout(() => setToast(null), 4000)
      addToast({ type: 'error', title: 'Unlink Failed', message: errMsg })
    }
  }

  // ── Filtered cards ──
  const filteredCards = cards.filter(c => {
    return (
      folderFilter === 'all' ||
      (folderFilter === 'uncategorized' ? !c.folder_id : c.folder_id === folderFilter)
    )
  })
  const flashcards = cards.filter(c => c.type === 'flashcard')
  const activeRecalls = cards.filter(c => c.type === 'active_recall')

  const hasCurriculum = subject?.subject_type === 'class' || subject?.subject_type === 'book'
  const completedModules = modules.filter(m => m.status === 'completed').length

  const statusBadge: Record<string, string> = {
    active: 'badge-violet',
    ongoing: 'badge-blue',
    archived: 'badge-slate'
  }
  const statusLabel: Record<string, string> = {
    active: 'Active',
    ongoing: 'Ongoing',
    archived: 'Archived'
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (error || !subject) {
    return (
      <div className="p-8">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {error || 'Subject not found.'}
        </p>
        <button onClick={() => navigate('/')} className="btn-secondary">Back to Dashboard</button>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'cards', label: 'Cards', count: cards.length },
  ]
  if (hasCurriculum) {
    tabs.push({ id: 'curriculum', label: 'Curriculum', count: modules.length })
  }
  tabs.push(
    { id: 'practice', label: 'Practice Lab' },
    { id: 'materials', label: 'Materials', count: materials.length },
    { id: 'lectures', label: 'Lectures', count: lectures.length },
    { id: 'deadlines', label: 'Deadlines', count: deadlines.length }
  )

  if (practiceSessionParams && subject) {
    return (
      <div className="p-8 w-full page-enter">
        <PracticeSessionPage
          subject={subject}
          user={user}
          moduleId={practiceSessionParams.moduleId}
          topicId={practiceSessionParams.topicId}
          problemCount={practiceSessionParams.count}
          calculatorSkin={calculatorSkin}
          onExit={() => setPracticeSessionParams(null)}
        />
      </div>
    )
  }

  return (
    <div className="p-8 w-full page-enter">
      {/* Back navigation */}
      <div className="mb-5">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors group"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-transform group-hover:-translate-x-0.5">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Dashboard
        </button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              {subject.name}
            </h1>
            {subject.subject_type && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                {subject.subject_type === 'book' ? '📖 Book' : '🏫 Class'}
              </span>
            )}
            <span className={statusBadge[subject.status] || 'badge-slate'}>
              {statusLabel[subject.status] || subject.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-400 dark:text-slate-500 flex-wrap">
            {subject.course_code && <span>{subject.course_code}</span>}
            <span>{cards.length} card{cards.length !== 1 ? 's' : ''} total</span>
            {flashcards.length > 0 && <span>{flashcards.length} flashcard{flashcards.length !== 1 ? 's' : ''}</span>}
            {activeRecalls.length > 0 && <span>{activeRecalls.length} active recall</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <PomodoroWidget />
          {hasCurriculum && (
            <>
              <button
                onClick={() => subject && setShowConfigModal({ subjectId, subjectName: subject.name })}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Tutor
              </button>
              <button
                onClick={() => subject && setShowConfigModal({ subjectId, subjectName: subject.name, initialMode: 'quick_review' })}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                title="Quick Review: 1-3 questions across every topic in this class"
              >
                <span>⚡</span> Quick Review
              </button>
            </>
          )}
          <button
            onClick={() => setShowTextImport(true)}
            className="btn-secondary text-sm flex items-center gap-1.5"
            title="Generate or import flashcards"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M2 3h10M2 7h7M2 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M11 9v4M9 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Cards
          </button>
          <button
            onClick={handleAnkiImport}
            className="px-3 py-1.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
          >
            Anki
          </button>
          <button
            onClick={() => navigate(`/diagnostics/${subjectId}`)}
            className="btn-secondary text-sm"
          >
            Diagnostics
          </button>
          <SubjectDetailStudyMenu subjectId={subjectId} disabled={cards.length === 0} />
          <button
            onClick={() => setShowEditSubject(true)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            title="Edit subject"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {hasCurriculum && modules.length > 0 && (
        <div className="mb-4">
          <CurriculumProgressBar completed={completedModules} total={modules.length} />
        </div>
      )}

      {/* Archived Banner */}
      {subject.status === 'archived' && (
        <div className="mb-5 p-4 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📦</span>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                This class is archived
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Flashcards for this class have been removed. Materials, curriculum, and notes remain accessible.
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              const updated = await window.electronAPI.saveSubject({ ...subject, status: 'active' })
              updateSubject(updated)
              setEditStatus('active')
            }}
            className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap shadow-sm"
          >
            Restore Class
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-200 dark:border-slate-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ''}
          </button>
        ))}
      </div>

      {/* ═══ CARDS TAB ═══ */}
      {activeTab === 'cards' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {filteredCards.length}{filteredCards.length !== cards.length ? ` of ${cards.length}` : ''} card{cards.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setShowAddCard(true)}
              className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium transition-colors"
            >
              + Add card manually
            </button>
          </div>

          {/* Folder filter pills */}
          {cards.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['all', 'uncategorized'] as const).map(key => (
                  <button
                    key={key}
                    onClick={() => setFolderFilter(key)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors font-medium ${
                      folderFilter === key
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {key === 'all' ? 'All' : 'Uncategorised'}
                  </button>
                ))}
                {folders.map(folder => (
                  <div key={folder.id} className="flex items-center gap-0.5">
                    <button
                      onClick={() => setFolderFilter(folder.id)}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors font-medium ${
                        folderFilter === folder.id
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {folder.name}
                    </button>
                    <button
                      onClick={() => handleDeleteFolder(folder.id)}
                      className="w-4 h-4 flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 transition-colors rounded-full"
                      title={`Delete folder "${folder.name}"`}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                ))}
                {showNewFolderInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      autoFocus
                      className="px-2 py-1 text-xs rounded-full border border-violet-400 dark:border-violet-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none w-28"
                      placeholder="Folder name"
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setShowNewFolderInput(false); setNewFolderName('') } }}
                    />
                    <button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="px-2 py-1 text-xs bg-violet-600 text-white rounded-full disabled:opacity-50">Add</button>
                    <button onClick={() => { setShowNewFolderInput(false); setNewFolderName('') }} className="px-2 py-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewFolderInput(true)}
                    className="px-2.5 py-1 text-xs rounded-full border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 hover:border-violet-400 dark:hover:border-violet-600 transition-colors"
                  >
                    + New folder
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Study this folder button */}
          {typeof folderFilter === 'number' && (
            <div className="mb-3 flex justify-end">
              <SubjectDetailStudyMenu
                subjectId={subject.id}
                disabled={filteredCards.length === 0}
                folderId={folderFilter}
              />
            </div>
          )}


          {cards.length === 0 ? (
            <div className="text-center py-14 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              {subject.status === 'archived' ? (
                <div>
                  <span className="text-3xl mb-2 block">📦</span>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Flashcards removed for archived class
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                    This class is archived. Restore the class to active status if you want to generate or add cards again.
                  </p>
                  <button
                    onClick={async () => {
                      const updated = await window.electronAPI.saveSubject({ ...subject, status: 'active' })
                      updateSubject(updated)
                      setEditStatus('active')
                    }}
                    className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Restore Class to Active
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500">No cards yet. Upload a document or import cards to get started.</p>
              )}
            </div>
          ) : (
            <CardBrowser
              cards={cards}
              folders={folders}
              materials={materials}
              topics={[...modules, ...modules.flatMap((m) => m.topics || [])]}
              onCardClick={(card) => setSelectedCardForDetail(card)}
              onDeleteCards={async (cardIds) => {
                try {
                  if (window.electronAPI?.deleteCards) {
                    await window.electronAPI.deleteCards(cardIds)
                  } else {
                    for (const id of cardIds) {
                      await window.electronAPI.deleteCard(id)
                    }
                  }
                  setCards((prev) => prev.filter((c) => !cardIds.includes(c.id)))
                  setToast({ message: `Deleted ${cardIds.length} card${cardIds.length !== 1 ? 's' : ''}`, type: 'success' })
                  loadAllData()
                } catch (err: any) {
                  console.error('Failed to delete cards:', err)
                  setToast({ message: `Failed to delete cards: ${err?.message || 'Unknown error'}`, type: 'error' })
                  loadAllData()
                }
              }}
              onMoveCards={async (cardIds, folderId) => {
                for (const id of cardIds) {
                  await window.electronAPI.updateCardFolder(id, folderId)
                }
                loadAllData()
              }}
            />
          )}
        </div>
      )}

      {/* ═══ CURRICULUM TAB ═══ */}
      {activeTab === 'curriculum' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Curriculum</h2>
            {modules.length > 0 && (
              <span className="text-xs text-slate-400">
                {completedModules}/{modules.length} modules completed
              </span>
            )}
          </div>

          {/* Syllabus Regeneration Loading Bar */}
          {isRegeneratingSyllabus && (
            <div className="mb-4 p-4 rounded-xl bg-violet-50/80 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 animate-in fade-in">
              <LoadingProgressBar
                label="Structuring & Reconciling Curriculum..."
                sublabel="Analyzing uploaded course materials, mapping topics, and sequencing modules..."
                size="md"
              />
            </div>
          )}

          {/* Curriculum Update Loading Bar */}
          {updatingSyllabus && (
            <div className="mb-4 p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 animate-in fade-in">
              <LoadingProgressBar
                label="Updating Curriculum with New Materials..."
                sublabel="Reconciling learning gaps and expanding module topics while preserving completed progress..."
                size="md"
              />
            </div>
          )}

          {modules.length > 0 ? (
            <CurriculumView
              modules={modules}
              subjectName={subject?.name}
              moduleTutorStats={moduleTutorStats}
              onStartTutor={handleStartTutor}
              onStartSpacedReview={handleStartSpacedReview}
              onGenerateCards={handleGenerateCards}
              onToggleTopic={handleToggleTopic}
              loadingCards={loadingCards}
            />
          ) : (
            <div className="text-center py-14 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              <p className="text-sm text-slate-400 dark:text-slate-500 mb-1">No curriculum modules yet.</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                {materials.length > 0
                  ? 'Generate a syllabus from your uploaded materials.'
                  : 'Upload materials first, then generate a syllabus.'}
              </p>
              {materials.length > 0 ? (
                <button
                  onClick={async () => {
                    setIsRegeneratingSyllabus(true)
                    try {
                      const result = await window.electronAPI.syllabusGenerateFromMaterials(subjectId)
                      if (result?.length) {
                        addToast({ type: 'success', title: 'Syllabus Generated', message: `${result.length} modules created.` })
                        loadAllData()
                      }
                    } catch {
                      addToast({ type: 'error', title: 'Generation Failed', message: 'Ensure materials are uploaded first.' })
                    } finally {
                      setIsRegeneratingSyllabus(false)
                    }
                  }}
                  disabled={isRegeneratingSyllabus}
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-2"
                >
                  {isRegeneratingSyllabus && (
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {isRegeneratingSyllabus ? 'Generating Syllabus...' : 'Generate Syllabus from Materials'}
                </button>
              ) : (
                <button
                  onClick={() => setActiveTab('materials')}
                  className="text-violet-600 dark:text-violet-400 hover:underline text-xs font-medium"
                >
                  Go to Materials tab
                </button>
              )}
            </div>
          )}

          {pendingUpdateMaterial && modules.length > 0 && !updatingSyllabus && (
            <div className="mb-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
              <span className="text-lg">✨</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  New material added — "{pendingUpdateMaterial}"
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Update your curriculum to fold it in? Your existing modules and progress stay untouched.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={handleUpdateCurriculum}
                    disabled={updatingSyllabus}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-2"
                  >
                    {updatingSyllabus && (
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    {updatingSyllabus ? 'Updating…' : 'Update Curriculum'}
                  </button>
                  <button
                    onClick={() => setPendingUpdateMaterial(null)}
                    className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </div>
          )}

          {modules.length > 0 && (
            <div className="mt-4 text-center">
              <button
                onClick={handleRegenerateSyllabus}
                disabled={isRegeneratingSyllabus}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-50 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg transition-colors inline-flex items-center gap-2"
              >
                {isRegeneratingSyllabus && (
                  <span className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                )}
                {isRegeneratingSyllabus ? 'Regenerating syllabus...' : 'Regenerate syllabus from materials'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ PRACTICE LAB TAB ═══ */}
      {activeTab === 'practice' && subject && (
        <PracticeHub
          subject={subject}
          user={user}
          onStartSession={(modId, topId, count) =>
            setPracticeSessionParams({ moduleId: modId, topicId: topId, count })
          }
        />
      )}

      {/* ═══ MATERIALS TAB ═══ */}
      {activeTab === 'materials' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {materials.length} material{materials.length !== 1 ? 's' : ''}
                {selectedMaterialIds.size > 0 && ` (${selectedMaterialIds.size} selected)`}
              </span>
              {materials.length > 1 && (
                <button
                  onClick={handleSelectAllMaterials}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium transition-colors cursor-pointer"
                >
                  {selectedMaterialIds.size === materials.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedMaterialIds.size >= 1 && (
                <button
                  onClick={handleGenerateCardsSelected}
                  disabled={isGeneratingCards || isSynthesizing}
                  className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  title="Generate distinct flashcards for each selected material (preserves individual documents and folders)"
                >
                  <span className={isGeneratingCards ? 'animate-spin' : ''}>⚡</span>
                  <span>{isGeneratingCards ? 'Generating...' : `Generate Flashcards (${selectedMaterialIds.size})`}</span>
                </button>
              )}
              {selectedMaterialIds.size >= 2 && (
                <button
                  onClick={handleSynthesizeSelected}
                  disabled={isSynthesizing || isGeneratingCards}
                  className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer animate-pulse-subtle"
                  title="Synthesize and cross-reference selected materials into a unified deck (reads full text without chunking)"
                >
                  <span className={isSynthesizing ? 'animate-spin' : ''}>✨</span>
                  <span>{isSynthesizing ? 'Synthesizing...' : `Synthesize Selected (${selectedMaterialIds.size})`}</span>
                </button>
              )}
              {!subject?.linked_folder_path && (
                <button
                  onClick={handleLinkFolder}
                  disabled={syncingFolder}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  Link Folder
                </button>
              )}
              <button
                onClick={handleAddMaterial}
                disabled={addingMaterial}
                className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M2 3h10M2 7h7M2 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M11 9v4M9 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {addingMaterial ? 'Adding...' : 'Add Material'}
              </button>
            </div>
          </div>

          {/* Linked Folder Bar */}
          {subject?.linked_folder_path && (
            <div className="mb-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-lg">📁</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate"
                      title={subject.linked_folder_path}
                    >
                      {getFolderBaseName(subject.linked_folder_path)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Watching
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    Last synced: {formatLastSynced(subject.folder_last_synced_at)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSyncNow}
                  disabled={syncingFolder}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  title="Sync now"
                >
                  <svg
                    className={`w-3.5 h-3.5 ${syncingFolder ? 'animate-spin' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                  </svg>
                  <span>{syncingFolder ? 'Syncing...' : 'Sync Now'}</span>
                </button>
                <button
                  onClick={() => subject.linked_folder_path && window.electronAPI.openFolder(subject.linked_folder_path)}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
                  title="Open in Finder / File Explorer"
                >
                  Open in Finder
                </button>
                <button
                  onClick={handleUnlinkFolder}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Unlink folder"
                >
                  Unlink
                </button>
              </div>
            </div>
          )}

          {materials.length > 0 ? (
            <div className="space-y-1.5">
              {materials.map(mat => (
                <div
                  key={mat.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg bg-white dark:bg-slate-800 border transition-all ${
                    selectedMaterialIds.has(mat.id)
                      ? 'border-violet-500/70 dark:border-violet-500/70 bg-violet-50/20 dark:bg-violet-950/20 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedMaterialIds.has(mat.id)}
                    onChange={() => toggleMaterialSelection(mat.id)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500 cursor-pointer shrink-0"
                    title="Select material"
                  />
                  <span className="text-sm shrink-0">📄</span>

                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm text-slate-700 dark:text-slate-300 truncate">
                      {mat.filename}
                    </span>
                    {mat.relative_path && (mat.relative_path.includes('/') || mat.relative_path !== mat.filename) && (
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0"
                        title={mat.relative_path}
                      >
                        📁 {mat.relative_path}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 uppercase">
                    {mat.file_type}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {new Date(mat.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedImportMaterialId(mat.id)
                      setShowTextImport(true)
                    }}
                    className="px-2 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer"
                    title={`Generate flashcards from ${mat.filename}`}
                  >
                    <span>✨</span>
                    <span className="hidden sm:inline">Cards</span>
                  </button>
                  <button
                    onClick={() => setShowConfigModal({
                      subjectId: subject.id,
                      subjectName: subject.name,
                      materialId: mat.id,
                      materialName: mat.filename
                    })}
                    className="px-2 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors flex items-center gap-1 text-xs font-medium"
                    title={`Study ${mat.filename} with AI Tutor`}
                  >
                    <span className="hidden sm:inline">Study</span>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteMaterial(mat.id, mat.filename)}
                    className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 transition-colors"
                    title={`Delete ${mat.filename}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-14 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              <p className="text-sm text-slate-400 dark:text-slate-500 mb-1">No materials uploaded yet.</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Upload PDF, DOCX, PPTX, TXT, or Markdown files.</p>
              <button
                onClick={handleAddMaterial}
                disabled={addingMaterial}
                className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {addingMaterial ? 'Adding...' : 'Upload your first material'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ LECTURES TAB ═══ */}
      {activeTab === 'lectures' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Lecture Recordings & Notes
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Record your lectures, transcribe speech to text, and auto-generate structured notes for this class.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <AudioDeviceSelector compact className="hidden sm:flex" />
              {isThisClassRecording ? (
                <button
                  onClick={() => recordingStore.stopRecording()}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  Stop Recording
                </button>
              ) : (
                <button
                  onClick={() => setShowStartRecordModal(true)}
                  className="btn-primary text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="8" r="6" />
                  </svg>
                  Record Lecture
                </button>
              )}
            </div>
          </div>

          {/* Active recording banner */}
          {isThisClassRecording && (
            <div className="mb-5 p-4 rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  {!recordingStore.isPaused && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-3 w-3 ${
                      recordingStore.isPaused ? 'bg-amber-400' : 'bg-violet-600'
                    }`}
                  />
                </span>
                <div>
                  <div className="text-xs font-semibold text-violet-900 dark:text-violet-200">
                    {recordingStore.isPaused ? 'Recording Paused' : 'Recording in Progress…'}
                  </div>
                  <div className="text-xs text-violet-700 dark:text-violet-300">
                    {recordingStore.lectureTitle} • Streaming chunks safely to disk
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={recordingStore.isPaused ? recordingStore.resumeRecording : recordingStore.pauseRecording}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-200 bg-white dark:bg-slate-800 hover:bg-violet-50 transition-colors"
                >
                  {recordingStore.isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  onClick={() => recordingStore.stopRecording()}
                  className="px-3 py-1 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors"
                >
                  Finish & Save
                </button>
              </div>
            </div>
          )}

          {/* Lectures List */}
          {lectures.length > 0 ? (
            <div className="space-y-3">
              {lectures.map((lec) => {
                const linkedMaterial = materials.find((m) => m.id === lec.material_id)

                return (
                  <div
                    key={lec.id}
                    className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
                            {lec.title}
                          </h4>
                          {/* Status Badge */}
                          {lec.status === 'ready' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              ✓ Notes Ready
                            </span>
                          )}
                          {lec.status === 'transcribing' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                              <span className="w-2 h-2 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                              Transcribing & Structuring...
                            </span>
                          )}
                          {lec.status === 'recording' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-violet-600 animate-pulse" />
                              Recording
                            </span>
                          )}
                          {lec.status === 'failed' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                              ✕ Failed
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 mt-1">
                          <span>
                            {new Date(lec.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                          {lec.duration_seconds > 0 && (
                            <span>
                              ⏱️ {Math.floor(lec.duration_seconds / 60)}m {lec.duration_seconds % 60}s
                            </span>
                          )}
                          {lec.file_size_bytes > 0 && (
                            <span>
                              💾 {(lec.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {linkedMaterial && (
                          <button
                            onClick={() => setSelectedLectureForNotes(lec)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center gap-1 transition-colors"
                            title="View Markdown Notes"
                          >
                            <span>📝</span>
                            <span>Notes</span>
                          </button>
                        )}

                        {linkedMaterial && (
                          <button
                            onClick={() => {
                              setSelectedImportMaterialId(linkedMaterial.id)
                              setShowTextImport(true)
                            }}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-xs font-medium flex items-center gap-1 transition-colors"
                            title="Generate Flashcards from Notes"
                          >
                            <span>✨</span>
                            <span>Cards</span>
                          </button>
                        )}

                        {linkedMaterial && (
                          <button
                            onClick={() =>
                              setShowConfigModal({
                                subjectId: subject.id,
                                subjectName: subject.name,
                                materialId: linkedMaterial.id,
                                materialName: linkedMaterial.filename
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/60 text-xs font-medium flex items-center gap-1 transition-colors"
                            title="Study with AI Tutor"
                          >
                            <span>🎓</span>
                            <span>Tutor</span>
                          </button>
                        )}

                        {lec.status === 'failed' && (
                          <button
                            onClick={() => handleRetryLecture(lec.id)}
                            className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 hover:bg-amber-100 text-xs font-medium transition-colors"
                          >
                            Retry
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteLecture(lec.id, lec.title)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 transition-colors"
                          title="Delete lecture and audio"
                        >
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                            <path d="M2 3.5h10M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M11.5 3.5L11 12a1 1 0 01-1 1H4a1 1 0 01-1-1L2.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Embedded Audio Player */}
                    {lec.audio_path && (
                      <LectureAudioPlayer audioPath={lec.audio_path} title={lec.title} />
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-14 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              <span className="text-2xl mb-2 inline-block">🎙️</span>
              <p className="text-sm text-slate-400 dark:text-slate-500 mb-1">
                No lecture recordings yet.
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                Record your lectures right from your laptop or connected phone microphone.
              </p>
              <button
                onClick={() => setShowStartRecordModal(true)}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
              >
                Record your first lecture
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ DEADLINES TAB ═══ */}
      {activeTab === 'deadlines' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {deadlines.length} deadline{deadlines.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setShowDeadlineForm(true)}
              className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium transition-colors"
            >
              + Add deadline
            </button>
          </div>

          {deadlines.length === 0 && !showDeadlineForm ? (
            <div className="text-center py-14 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <p className="text-sm text-slate-400 dark:text-slate-500">No deadlines set yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {deadlines.map(d => {
                const days = Math.ceil((new Date(d.deadline_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        days <= 0 ? 'bg-red-400' : days <= 7 ? 'bg-amber-400' : 'bg-emerald-400'
                      }`} />
                      <div>
                        <span className="font-medium text-slate-800 dark:text-slate-100 text-sm">{d.label}</span>
                        <span className="text-slate-400 dark:text-slate-500 text-xs ml-2">
                          {new Date(d.deadline_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium ${
                        days <= 0 ? 'text-red-500 dark:text-red-400' :
                        days <= 7 ? 'text-amber-500 dark:text-amber-400' :
                        'text-slate-400 dark:text-slate-500'
                      }`}>
                        {days <= 0 ? 'Past due' : days === 1 ? 'Tomorrow' : `${days} days`}
                      </span>
                      <button
                        onClick={() => handleDeleteDeadline(d.id)}
                        className="text-slate-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 transition-colors p-1 rounded"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {showDeadlineForm && (
            <div className="mt-4 p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">New Deadline</h3>
              <input
                type="text"
                className="input"
                placeholder="Label (e.g. Final Exam)"
                value={newDeadlineLabel}
                onChange={e => setNewDeadlineLabel(e.target.value)}
                autoFocus
              />
              <input
                type="date"
                className="input"
                value={newDeadlineDate}
                onChange={e => setNewDeadlineDate(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => setShowDeadlineForm(false)} className="btn-secondary flex-1 text-sm">Cancel</button>
                <button
                  onClick={handleAddDeadline}
                  disabled={!newDeadlineLabel.trim() || !newDeadlineDate}
                  className="btn-primary flex-1 text-sm"
                >
                  Add Deadline
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Card Detail Modal */}
      {selectedCardForDetail && (
        <CardDetailModal
          card={selectedCardForDetail}
          folders={folders}
          userId={user?.id ?? 0}
          onClose={() => setSelectedCardForDetail(null)}
          onMoveToFolder={(folderId) => handleMoveCard(selectedCardForDetail.id, folderId)}
        />
      )}

      {/* Add Card Modal */}
      {showAddCard && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg p-6 animate-slide-up">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-1">Add Card Manually</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Create a card with a question and answer.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Type</label>
                <select className="input" value={newCardType} onChange={e => setNewCardType(e.target.value as 'flashcard' | 'active_recall')}>
                  <option value="flashcard">Flashcard</option>
                  <option value="active_recall">Active Recall</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  {newCardType === 'flashcard' ? 'Term / Concept' : 'Question'}
                </label>
                <input type="text" className="input" placeholder={newCardType === 'flashcard' ? 'Enter the term or concept' : 'Enter the question'} value={newCardFront} onChange={e => setNewCardFront(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  {newCardType === 'flashcard' ? 'Definition / Explanation' : 'Model Answer'}
                </label>
                <textarea className="input min-h-[100px] resize-none" placeholder={newCardType === 'flashcard' ? 'Enter the definition' : 'Enter the model answer'} value={newCardBack} onChange={e => setNewCardBack(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Image URL (optional)</label>
                <input type="text" value={newCardImageUrl} onChange={(e) => setNewCardImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" className="input" />
                {newCardImageUrl && (
                  <img src={newCardImageUrl} alt="Preview" className="mt-2 max-h-32 rounded-lg object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                )}
              </div>
              {folders.length > 0 && (
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Folder (optional)</label>
                  <select className="input" value={newCardFolderId ?? ''} onChange={e => setNewCardFolderId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">No folder</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddCard(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleAddCard} disabled={!newCardFront.trim() || !newCardBack.trim()} className="btn-primary flex-1">Add Card</button>
            </div>
          </div>
        </div>
      )}

      {/* Import & Card Generation Modal */}
      {showTextImport && (
        <CardImportModal
          isOpen={showTextImport}
          subjectId={subjectId}
          subjectName={subject?.name}
          folders={folders}
          userId={user?.id}
          initialMaterialId={selectedImportMaterialId}
          initialMaterialIds={
            selectedMaterialIds.size > 0
              ? Array.from(selectedMaterialIds)
              : (selectedImportMaterialId ? [selectedImportMaterialId] : undefined)
          }
          initialAutoCount={selectedImportMaterialId || selectedMaterialIds.size > 0 ? true : false}
          onClose={() => {
            setShowTextImport(false)
            setSelectedImportMaterialId(null)
          }}
          onSuccess={async (count, mode) => {
            await loadAllData()
            addToast({
              type: 'success',
              title: mode === 'generate' ? 'Cards Generated' : 'Cards Imported',
              message: `${count} card${count !== 1 ? 's' : ''} added to ${subject?.name || 'subject'}.`
            })
          }}
          onManualSave={async (importedCards) => {
            if (!user) return
            await window.electronAPI.saveManyCards(
              importedCards.map(c => ({ subject_id: subjectId, ...c, is_manual: 1 })),
              user.id
            )
            await loadAllData()
          }}
        />
      )}

      {/* Edit Subject Modal */}
      {showEditSubject && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-5">Edit Subject</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Subject Name</label>
                <input type="text" className="input" placeholder="Subject name" value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Course Code (optional)</label>
                <input type="text" className="input" placeholder="e.g. HIS-101" value={editCode} onChange={e => setEditCode(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Status</label>
                <select className="input" value={editStatus} onChange={e => setEditStatus(e.target.value as 'active' | 'ongoing' | 'archived')}>
                  <option value="active">Active</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowEditSubject(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleUpdateSubject} disabled={!editName.trim()} className="btn-primary flex-1">Save Changes</button>
            </div>
            <button onClick={handleDeleteSubject} className="w-full mt-3 py-2 text-sm text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors">Delete Subject</button>
          </div>
        </div>
      )}

      {/* Session Config Modal */}
      {showConfigModal && (
        <SessionConfigModal
          subjectId={showConfigModal.subjectId}
          subjectName={showConfigModal.subjectName}
          materialId={showConfigModal.materialId}
          materialName={showConfigModal.materialName}
          initialTopic={showConfigModal.initialTopic}
          initialTopics={showConfigModal.initialTopics}
          initialModuleId={showConfigModal.moduleId}
          initialMode={showConfigModal.initialMode}
          onClose={() => setShowConfigModal(null)}
        />
      )}

      {/* Start Recording Modal */}
      {showStartRecordModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => !startingLecture && setShowStartRecordModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  Record Lecture
                </h3>
              </div>
              <button
                disabled={startingLecture}
                onClick={() => setShowStartRecordModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              Neuron streams your audio to disk in real-time. Even if the laptop battery dies or app closes, recordings are preserved safely.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  Lecture Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder={`e.g. ${subject?.name || 'Class'} - Lecture ${lectures.length + 1}`}
                  value={lectureTitleInput}
                  onChange={e => setLectureTitleInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !startingLecture) {
                      handleStartRecording()
                    }
                  }}
                  className="input w-full text-sm"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  Microphone Input
                </label>
                <AudioDeviceSelector />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2.5">
                <span className="text-base leading-none">🤫</span>
                <p className="leading-relaxed">
                  <strong>Stealth indicator:</strong> Recording appears as a small, subtle dot in the top navigation bar. You can freely switch subjects, study flashcards, or take notes while recording.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={startingLecture}
                onClick={() => setShowStartRecordModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={startingLecture}
                onClick={handleStartRecording}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                {startingLecture ? 'Starting...' : 'Start Recording'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lecture Notes Preview Modal */}
      {selectedLectureForNotes && (
        <LectureNotesModal
          title={selectedLectureForNotes.title}
          markdown={
            materials.find(m => m.id === selectedLectureForNotes.material_id)?.content_text ||
            selectedLectureForNotes.raw_transcript ||
            'No notes available.'
          }
          onClose={() => setSelectedLectureForNotes(null)}
          onGenerateCards={
            selectedLectureForNotes.material_id
              ? () => {
                  setSelectedImportMaterialId(selectedLectureForNotes.material_id!)
                  setShowTextImport(true)
                }
              : undefined
          }
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-[100] px-4 py-2 rounded-lg shadow-lg text-sm text-white animate-slide-up"
          style={{ backgroundColor: toast.type === 'success' ? '#059669' : '#dc2626' }}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline utility components (imported from SubjectDetail.tsx)
// ─────────────────────────────────────────────────────────────────────────────

function CardDetailModal({
  card,
  folders,
  userId,
  onClose,
  onMoveToFolder
}: {
  card: Card
  folders: CardFolder[]
  userId: number
  onClose: () => void
  onMoveToFolder: (folderId: number | null) => void
}): React.JSX.Element {
  const [stats, setStats] = useState<{
    schedule: CardSchedule | null
    review_count: number
    avg_quality: number | null
    avg_response_time_ms: number | null
  } | null>(null)

  useEffect(() => {
    window.electronAPI.getCardStats(card.id, userId).then(setStats)
  }, [card.id, userId])

  function getUnderstandingLevel(schedule: CardSchedule | null, avgQuality: number | null, reviewCount: number) {
    if (!schedule || reviewCount === 0) return { label: 'New', color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-700' }
    if (schedule.interval >= 21 && schedule.ease_factor >= 2.5) return { label: 'Mastered', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40' }
    if (avgQuality !== null && avgQuality >= 4) return { label: 'Strong', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/40' }
    if (avgQuality !== null && avgQuality >= 2.5) return { label: 'Learning', color: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/40' }
    return { label: 'Needs Practice', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/40' }
  }

  const level = stats ? getUnderstandingLevel(stats.schedule, stats.avg_quality, stats.review_count) : null
  const avgSeconds = stats?.avg_response_time_ms != null ? (stats.avg_response_time_ms / 1000).toFixed(1) : null

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${card.type === 'flashcard' ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'}`}>
              {card.type === 'flashcard' ? 'Flashcard' : 'Active Recall'}
            </span>
            {level && <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${level.bg} ${level.color}`}>{level.label}</span>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">{card.type === 'flashcard' ? 'Term' : 'Question'}</p>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-relaxed bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4"><LatexText>{card.front}</LatexText></div>
        </div>
        <div className="mb-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">{card.type === 'flashcard' ? 'Definition' : 'Model Answer'}</p>
          <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4"><LatexText>{card.back}</LatexText></div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{stats?.review_count ?? '—'}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Times practised</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{stats?.avg_quality != null ? (stats.avg_quality).toFixed(1) : '—'}<span className="text-xs font-normal text-slate-400 dark:text-slate-500">/5</span></p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Avg quality</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{avgSeconds != null ? `${avgSeconds}s` : '—'}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Avg response</p>
          </div>
        </div>
        {/* Source info & Triangulation badges */}
        {card.source && (
          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Source Materials</p>
            <div className="flex flex-wrap gap-1.5">
              {(() => {
                try {
                  if (card.source.startsWith('[') && card.source.endsWith(']')) {
                    const sources = JSON.parse(card.source)
                    if (Array.isArray(sources) && sources.length > 0) {
                      return sources.map((s, idx) => (
                        <span key={idx} className="text-xs px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 font-medium">
                          🔗 {s}
                        </span>
                      ))
                    }
                  }
                } catch {}
                return (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                    {card.source}
                  </span>
                )
              })()}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Folder</label>
          <select className="input text-sm" value={card.folder_id ?? ''} onChange={e => onMoveToFolder(e.target.value ? Number(e.target.value) : null)}>
            <option value="">No folder</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>

      </div>
    </div>
  )
}

function SubjectDetailStudyMenu({ subjectId, disabled, folderId }: { subjectId: number; disabled: boolean; folderId?: number }): React.JSX.Element {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    window.addEventListener('mousedown', closeMenu)
    return () => window.removeEventListener('mousedown', closeMenu)
  }, [open, closeMenu])

  const folderSuffix = folderId != null ? `&folderId=${folderId}` : ''

  const options = folderId != null
    ? [
        { label: 'Flashcards', desc: 'Study cards in this folder with progress tracking', route: `/study/${subjectId}?folderId=${folderId}`, dot: 'bg-violet-500' },
        { label: 'Multiple Choice', desc: 'Practice with answer options — no schedule impact', route: `/study/${subjectId}?mode=mc${folderSuffix}`, dot: 'bg-blue-500' },
        { label: 'Learn Mode', desc: 'Multiple-choice then written answers — no schedule impact', route: `/study/${subjectId}?mode=learn${folderSuffix}`, dot: 'bg-emerald-500' },
      ]
    : [
        { label: 'Study Now', desc: 'Flashcards & active recall with spaced repetition', route: `/study/${subjectId}`, dot: 'bg-violet-500' },
        { label: 'Multiple Choice', desc: 'Practice with answer options — no schedule impact', route: `/study/${subjectId}?mode=mc`, dot: 'bg-blue-500' },
        { label: 'Learn Mode', desc: 'Master cards through multiple-choice then written answers', route: `/study/${subjectId}?mode=learn`, dot: 'bg-emerald-500' },
      ]

  const buttonLabel = folderId != null ? 'Study this folder' : 'Study Flashcards'

  return (
    <div className="relative" ref={ref}>
      <button
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {buttonLabel}
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg py-1.5 z-50">
          {options.map(opt => (
            <button key={opt.label} onClick={() => { setOpen(false); navigate(opt.route) }} className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-start gap-3">
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${opt.dot}`} />
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{opt.label}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
