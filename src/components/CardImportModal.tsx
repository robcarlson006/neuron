import React, { useState, useMemo, useEffect, useRef } from 'react'
import type { Subject, CardFolder, ModuleCardGenType, ModuleCardGenOptions } from '../types'
import { CARD_GEN_PRESETS } from '../types'

interface CardImportModalProps {
  isOpen: boolean
  onClose: () => void
  subjectId?: number
  subjectName?: string
  subjects?: Subject[]
  folders?: CardFolder[]
  userId?: number
  onSuccess?: (count: number, mode: 'generate' | 'import') => void
  onManualSave?: (cards: { type: 'flashcard' | 'active_recall'; front: string; back: string; folder_id?: number | null }[]) => Promise<void>
}

export default function CardImportModal({
  isOpen,
  onClose,
  subjectId: initialSubjectId,
  subjectName: initialSubjectName,
  subjects = [],
  folders: initialFolders = [],
  userId,
  onSuccess,
  onManualSave
}: CardImportModalProps): React.JSX.Element | null {
  const [activeTab, setActiveTab] = useState<'generate' | 'manual'>('generate')
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    initialSubjectId ?? (subjects.length > 0 ? subjects[0].id : null)
  )

  // Subject folders
  const [subjectFolders, setSubjectFolders] = useState<CardFolder[]>(initialFolders)

  // ── AI Generation State ──
  const [sourceText, setSourceText] = useState('')
  const [cardType, setCardType] = useState<ModuleCardGenType>('flashcard')
  const [cardCount, setCardCount] = useState(15)
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiFolderId, setAiFolderId] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // ── Manual Import State ──
  const [manualText, setManualText] = useState('')
  const [termSep, setTermSep] = useState('...')
  const [cardSep, setCardSep] = useState(';')
  const [eachLineIsCard, setEachLineIsCard] = useState(false)
  const [manualCardType, setManualCardType] = useState<'flashcard' | 'active_recall'>('flashcard')
  const [manualFolderId, setManualFolderId] = useState<number | null>(null)
  const [savingManual, setSavingManual] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Update selected subject when prop changes
  useEffect(() => {
    if (initialSubjectId) {
      setSelectedSubjectId(initialSubjectId)
    } else if (subjects.length > 0 && !selectedSubjectId) {
      setSelectedSubjectId(subjects[0].id)
    }
  }, [initialSubjectId, subjects])

  // Load folders when selectedSubjectId changes
  useEffect(() => {
    if (selectedSubjectId && window.electronAPI?.getFolders) {
      window.electronAPI.getFolders(selectedSubjectId).then((f: CardFolder[]) => {
        setSubjectFolders(f || [])
      }).catch(() => {
        setSubjectFolders([])
      })
    }
  }, [selectedSubjectId])

  // Split calculation when "Both" is selected
  const flashcardSplit = useMemo(() => {
    if (cardType !== 'both') return 0
    return Math.max(3, Math.round(cardCount * 0.65))
  }, [cardType, cardCount])

  const activeRecallSplit = useMemo(() => {
    if (cardType !== 'both') return 0
    return Math.max(2, cardCount - flashcardSplit)
  }, [cardType, cardCount, flashcardSplit])

  // Manual parser
  const parsedManual = useMemo(() => {
    if (!manualText.trim() || !termSep.trim()) return []
    const sep = eachLineIsCard ? '\n' : cardSep
    if (!sep) return []
    return manualText
      .split(sep)
      .map(chunk => {
        const sepIndex = chunk.indexOf(termSep)
        if (sepIndex === -1) return null
        const front = chunk.slice(0, sepIndex).trim()
        const back = chunk.slice(sepIndex + termSep.length).trim()
        if (!front || !back) return null
        return { front, back }
      })
      .filter((c): c is { front: string; back: string } => c !== null)
  }, [manualText, termSep, cardSep, eachLineIsCard])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !isGenerating && !savingManual) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isGenerating, savingManual, onClose])

  if (!isOpen) return null

  const currentSubjectName =
    initialSubjectName ||
    subjects.find(s => s.id === selectedSubjectId)?.name ||
    'Select a subject'

  function handleSourceFileUpload(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = (ev.target?.result as string) || ''
      setSourceText(content)
      setErrorMessage(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleManualFileLoad(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = (ev.target?.result as string) || ''
      setManualText(content)
      if (ext === 'csv') {
        setTermSep(',')
        setEachLineIsCard(true)
        setDetectedFormat('CSV — comma separates front/back, each line is a card')
      } else if (ext === 'tsv') {
        setTermSep('\t')
        setEachLineIsCard(true)
        setDetectedFormat('TSV — tab separates front/back, each line is a card')
      } else {
        setDetectedFormat(`${ext?.toUpperCase()} file loaded — adjust separators below`)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleAIGenerate(): Promise<void> {
    if (!selectedSubjectId) {
      setErrorMessage('Please select a subject to add cards to.')
      return
    }
    if (!sourceText.trim()) {
      setErrorMessage('Please enter or paste some study material / notes.')
      textareaRef.current?.focus()
      return
    }

    setErrorMessage(null)
    setIsGenerating(true)

    try {
      const options: ModuleCardGenOptions & { folderId?: number | null } = {
        type: cardType,
        count: cardCount,
        flashcardCount: cardType === 'both' ? flashcardSplit : undefined,
        activeRecallCount: cardType === 'both' ? activeRecallSplit : undefined,
        folderId: aiFolderId,
        userId
      }

      const result = await window.electronAPI.cardsGenerateFromText(
        selectedSubjectId,
        sourceText.trim(),
        options
      )

      if (result.success) {
        onSuccess?.(result.count, 'generate')
        onClose()
      } else {
        setErrorMessage(result.error || 'Failed to generate cards.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error during generation'
      setErrorMessage(msg)
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleManualSave(): Promise<void> {
    if (!selectedSubjectId) {
      setErrorMessage('Please select a subject.')
      return
    }
    if (parsedManual.length === 0) return

    setSavingManual(true)
    setErrorMessage(null)

    try {
      if (onManualSave) {
        await onManualSave(
          parsedManual.map(c => ({
            ...c,
            type: manualCardType,
            folder_id: manualFolderId
          }))
        )
      } else if (window.electronAPI?.saveManyCards) {
        const uId = userId ?? 1
        await window.electronAPI.saveManyCards(
          parsedManual.map(c => ({
            subject_id: selectedSubjectId,
            front: c.front,
            back: c.back,
            type: manualCardType,
            folder_id: manualFolderId,
            is_manual: 1
          })),
          uId
        )
      }
      onSuccess?.(parsedManual.length, 'import')
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save cards'
      setErrorMessage(msg)
    } finally {
      setSavingManual(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in"
      onClick={() => {
        if (!isGenerating && !savingManual) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-import-modal-title"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-2xl animate-slide-up flex flex-col max-h-[92vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">✨</span>
                <h2
                  id="card-import-modal-title"
                  className="text-lg font-semibold text-slate-900 dark:text-slate-50"
                >
                  Import & Generate Cards
                </h2>
              </div>
              <div className="mt-1 flex items-center gap-2">
                {subjects.length > 0 && !initialSubjectId ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">Subject:</span>
                    <select
                      aria-label="Select subject"
                      className="text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md px-2 py-1 border border-slate-200 dark:border-slate-600 focus:outline-none"
                      value={selectedSubjectId ?? ''}
                      onChange={e => setSelectedSubjectId(Number(e.target.value))}
                    >
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Adding cards to <span className="font-medium text-slate-700 dark:text-slate-200">{currentSubjectName}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHelp(v => !v)}
                className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-400 hover:text-violet-600 hover:border-violet-400 transition-colors flex-shrink-0 text-sm font-semibold"
                title="Help"
              >
                ?
              </button>
              <button
                onClick={onClose}
                disabled={isGenerating || savingManual}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Help Box */}
          {showHelp && (
            <div className="mt-3 p-3.5 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-800 text-xs text-slate-700 dark:text-slate-300 space-y-1.5 animate-fade-in">
              <p className="font-semibold text-violet-700 dark:text-violet-300">How Card Creation Works</p>
              <p>• <strong>✨ Generate with AI</strong>: Paste any study notes, textbook excerpt, or outline. AI creates atomic flashcards & active recall questions while ensuring zero duplicates against your existing deck.</p>
              <p>• <strong>📥 Manual & File Import</strong>: Import cards from CSV, TSV, or text files using custom front/back separators without AI.</p>
            </div>
          )}

          {/* Tab Selector */}
          <div className="flex gap-2 mt-4 bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl">
            <button
              onClick={() => {
                setActiveTab('generate')
                setErrorMessage(null)
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'generate'
                  ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <span>✨</span>
              <span>Generate with AI</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('manual')
                setErrorMessage(null)
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'manual'
                  ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <span>📥</span>
              <span>Manual & File Import</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2 animate-fade-in">
              <span className="font-bold flex-shrink-0">⚠️</span>
              <p className="flex-1">{errorMessage}</p>
            </div>
          )}

          {activeTab === 'generate' ? (
            /* ─── TAB 1: GENERATE WITH AI ─── */
            <div className="space-y-5 animate-fade-in">
              {/* Source Material Area */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    1. Study Material or Notes
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium cursor-pointer transition-colors">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <path d="M7 1v8M7 1L4 4M7 1l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span>Load File (.txt, .md, .csv)</span>
                    <input
                      type="file"
                      accept=".txt,.md,.markdown,.csv,.tsv"
                      onChange={handleSourceFileUpload}
                      className="hidden"
                      disabled={isGenerating}
                    />
                  </label>
                </div>
                <textarea
                  ref={textareaRef}
                  value={sourceText}
                  onChange={e => {
                    setSourceText(e.target.value)
                    setErrorMessage(null)
                  }}
                  disabled={isGenerating}
                  placeholder="Paste lecture notes, textbook summary, article, or topic outline here..."
                  className="input min-h-[110px] resize-none text-sm leading-relaxed"
                />
              </div>

              {/* Card Format Selector */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
                  2. Choose Card Format
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCardType('flashcard')}
                    disabled={isGenerating}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      cardType === 'flashcard'
                        ? 'border-violet-500 bg-violet-50/70 dark:bg-violet-950/30 text-violet-900 dark:text-violet-100 ring-2 ring-violet-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">🃏</span>
                      <span className="text-xs font-semibold">Flashcards</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Atomic terms, definitions, key facts & cloze deletions.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCardType('active_recall')}
                    disabled={isGenerating}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      cardType === 'active_recall'
                        ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-100 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">🧠</span>
                      <span className="text-xs font-semibold">Active Recall</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Why & how questions, mechanisms, causal reasoning.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCardType('both')}
                    disabled={isGenerating}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      cardType === 'both'
                        ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">⚡</span>
                      <span className="text-xs font-semibold">Both (Mixed)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Balanced deck of core definitions + reasoning questions.
                    </p>
                  </button>
                </div>
              </div>

              {/* Quantity Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    3. How many cards do you want?
                  </label>
                  <span className="text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 rounded-full">
                    {cardCount} {cardType === 'active_recall' ? 'questions' : 'cards'}
                  </span>
                </div>

                {/* Preset Chips */}
                <div className="flex items-center gap-1.5 mb-3">
                  {CARD_GEN_PRESETS.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCardCount(preset)}
                      disabled={isGenerating}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                        cardCount === preset
                          ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                {/* Stepper + Slider */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCardCount(prev => Math.max(5, prev - 1))}
                    disabled={isGenerating || cardCount <= 5}
                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="1"
                    value={cardCount}
                    onChange={e => setCardCount(Number(e.target.value))}
                    disabled={isGenerating}
                    className="flex-1 accent-violet-600 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCardCount(prev => Math.min(50, prev + 1))}
                    disabled={isGenerating || cardCount >= 50}
                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                  >
                    +
                  </button>
                </div>

                {/* Breakdown indicator for "Both" */}
                {cardType === 'both' && (
                  <div className="mt-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200/80 dark:border-slate-700/80 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
                    <span>Deck Breakdown:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      🃏 {flashcardSplit} Flashcards + 🧠 {activeRecallSplit} Active Recall Questions
                    </span>
                  </div>
                )}
              </div>

              {/* Target Folder Selector */}
              {subjectFolders.length > 0 && (
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                    Target Folder (Optional)
                  </label>
                  <select
                    className="input text-sm"
                    value={aiFolderId ?? ''}
                    onChange={e => setAiFolderId(e.target.value ? Number(e.target.value) : null)}
                    disabled={isGenerating}
                  >
                    <option value="">No folder (General deck)</option>
                    {subjectFolders.map(f => (
                      <option key={f.id} value={f.id}>
                        📁 {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cognitive Science & Deduplication Badges */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 text-[11px] text-emerald-800 dark:text-emerald-300">
                  <span className="text-sm">🛡️</span>
                  <span><strong>AI Deduplication</strong>: Checks existing cards to prevent duplicates.</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200/60 dark:border-violet-800/40 text-[11px] text-violet-800 dark:text-violet-300">
                  <span className="text-sm">🧠</span>
                  <span><strong>High-Yield Prompts</strong>: Minimum Information Principle & Reasoning.</span>
                </div>
              </div>
            </div>
          ) : (
            /* ─── TAB 2: MANUAL & FILE IMPORT ─── */
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  Import from file
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 hover:border-violet-400 transition-colors text-sm text-slate-600 dark:text-slate-300 font-medium">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 1v8M7 1L4 4M7 1l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Choose file
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500">.txt · .csv · .tsv · .md</span>
                  <input
                    type="file"
                    accept=".txt,.csv,.tsv,.md,.markdown"
                    onChange={handleManualFileLoad}
                    className="hidden"
                    disabled={savingManual}
                  />
                </label>
                {detectedFormat && <p className="text-xs text-violet-600 dark:text-violet-400 mt-1.5">✓ {detectedFormat}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">
                    Front / Back separator
                  </label>
                  <input
                    type="text"
                    className="input font-mono text-sm"
                    value={termSep}
                    onChange={e => setTermSep(e.target.value)}
                    disabled={savingManual}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">
                    Card separator
                  </label>
                  <input
                    type="text"
                    className="input font-mono text-sm"
                    value={cardSep}
                    onChange={e => setCardSep(e.target.value)}
                    disabled={eachLineIsCard || savingManual}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={eachLineIsCard}
                  onChange={e => setEachLineIsCard(e.target.checked)}
                  disabled={savingManual}
                  className="rounded accent-violet-600"
                />
                <span className="text-xs text-slate-600 dark:text-slate-300">Each line is one card</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                    Card Type
                  </label>
                  <div className="flex gap-2">
                    {(['flashcard', 'active_recall'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setManualCardType(t)}
                        disabled={savingManual}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                          manualCardType === t
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-violet-400'
                        }`}
                      >
                        {t === 'flashcard' ? '🃏 Flashcard' : '🧠 Active Recall'}
                      </button>
                    ))}
                  </div>
                </div>

                {subjectFolders.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                      Target Folder
                    </label>
                    <select
                      className="input text-xs"
                      value={manualFolderId ?? ''}
                      onChange={e => setManualFolderId(e.target.value ? Number(e.target.value) : null)}
                      disabled={savingManual}
                    >
                      <option value="">No folder</option>
                      {subjectFolders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  Paste formatted cards
                </label>
                <textarea
                  className="input min-h-[90px] resize-none font-mono text-xs leading-relaxed"
                  placeholder={`Term${termSep}Definition${eachLineIsCard ? '\nAnother term' + termSep + 'Another definition' : cardSep + ' Another term' + termSep + 'Another definition'}`}
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                  disabled={savingManual}
                />
              </div>

              {/* Preview Table */}
              {manualText.trim() && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Preview</p>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        parsedManual.length > 0
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                          : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {parsedManual.length} card{parsedManual.length !== 1 ? 's' : ''} found
                    </span>
                  </div>
                  {parsedManual.length > 0 ? (
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                      {parsedManual.map((card, i) => (
                        <div key={i} className="flex items-start gap-3 px-3 py-2 bg-white dark:bg-slate-800 text-xs">
                          <span className="text-slate-300 dark:text-slate-600 font-mono mt-0.5 w-5 flex-shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0 flex items-start gap-2">
                            <p className="font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">{card.front}</p>
                            <span className="text-slate-300 dark:text-slate-600 flex-shrink-0">→</span>
                            <p className="text-slate-500 dark:text-slate-400 flex-1 truncate">{card.back}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-2.5 text-xs text-red-600 dark:text-red-400">
                      No cards could be parsed. Check that your separators match the text.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3 flex-shrink-0 bg-slate-50/50 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating || savingManual}
            className="btn-secondary flex-1 disabled:opacity-50 text-xs"
          >
            Cancel
          </button>

          {activeTab === 'generate' ? (
            <button
              type="button"
              onClick={handleAIGenerate}
              disabled={isGenerating || !sourceText.trim() || !selectedSubjectId}
              className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generating {cardCount} {cardType === 'active_recall' ? 'Questions' : 'Cards'}...</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>
                    Generate {cardCount} {cardType === 'flashcard' ? 'Flashcards' : cardType === 'active_recall' ? 'Questions' : 'Cards'}
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleManualSave}
              disabled={savingManual || parsedManual.length === 0 || !selectedSubjectId}
              className="btn-primary flex-1 disabled:opacity-50 text-xs flex items-center justify-center gap-2"
            >
              {savingManual ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>
                  Import {parsedManual.length > 0 ? parsedManual.length : ''} Card{parsedManual.length !== 1 ? 's' : ''}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
