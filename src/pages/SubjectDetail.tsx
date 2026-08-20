import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import PomodoroWidget from '../components/PomodoroWidget'
import CardBrowser from '../components/CardBrowser'
import type { Card, CardFolder, CardSchedule, Deadline } from '../types'

type Tab = 'cards' | 'deadlines'

export default function SubjectDetail(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const subjectId = Number(id)
  const navigate = useNavigate()
  const { user, subjects, updateSubject, removeSubject } = useAppStore()

  const subject = subjects.find(s => s.id === subjectId)

  const [cards, setCards] = useState<Card[]>([])
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [folders, setFolders] = useState<CardFolder[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('cards')
  const [newDeadlineLabel, setNewDeadlineLabel] = useState('')
  const [newDeadlineDate, setNewDeadlineDate] = useState('')
  const [showDeadlineForm, setShowDeadlineForm] = useState(false)
  const [showEditSubject, setShowEditSubject] = useState(false)
  const [editName, setEditName] = useState(subject?.name || '')
  const [editCode, setEditCode] = useState(subject?.course_code || '')
  const [editStatus, setEditStatus] = useState(subject?.status || 'active')
  const [showAddCard, setShowAddCard] = useState(false)
  const [newCardFront, setNewCardFront] = useState('')
  const [newCardBack, setNewCardBack] = useState('')
  const [newCardType, setNewCardType] = useState<'flashcard' | 'active_recall'>('flashcard')
  const [newCardFolderId, setNewCardFolderId] = useState<number | null>(null)
  const [cardSearch, setCardSearch] = useState('')
  const [cardTypeFilter, setCardTypeFilter] = useState<'all' | 'flashcard' | 'active_recall'>('all')
  const [folderFilter, setFolderFilter] = useState<'all' | 'uncategorized' | number>('all')
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [selectedCardForDetail, setSelectedCardForDetail] = useState<Card | null>(null)
  const [showTextImport, setShowTextImport] = useState(false)
  const [newCardImageUrl, setNewCardImageUrl] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (subject) {
      loadData()
      setEditName(subject.name)
      setEditCode(subject.course_code || '')
      setEditStatus(subject.status)
    }
  }, [subjectId])

  async function loadData(): Promise<void> {
    const [c, d, f] = await Promise.all([
      window.electronAPI.getCards(subjectId),
      window.electronAPI.getDeadlines(subjectId),
      window.electronAPI.getFolders(subjectId)
    ])
    setCards(c)
    setDeadlines(d as Deadline[])
    setFolders(f)
  }

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

  async function handleUpdateSubject(): Promise<void> {
    const updated = await window.electronAPI.saveSubject({
      id: subjectId,
      name: editName.trim(),
      course_code: editCode.trim() || undefined,
      status: editStatus as 'active' | 'ongoing' | 'archived'
    })
    updateSubject(updated)
    setShowEditSubject(false)
  }

  async function handleDeleteSubject(): Promise<void> {
    if (!confirm('Delete this subject and all its cards? This cannot be undone.')) return
    await window.electronAPI.deleteSubject(subjectId)
    removeSubject(subjectId)
    navigate('/')
  }

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
    await loadData()
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
      const api = (window as any).electronAPI
      if (!api) return
      const filePath = await api.openFileDialog()
      if (!filePath) return
      const deck = await api.parseAnkiDeck(filePath)
      if (!deck.cards || deck.cards.length === 0) {
        alert('No cards found in this Anki deck.')
        return
      }
      const confirmMsg = `Import "${deck.name}" with ${deck.cardCount} cards?`
      if (!confirm(confirmMsg)) return
      const saved = await api.importAnkiDeck(deck, user.id, subjectId)
      setToast({ message: `Imported ${saved.length} cards from Anki deck!`, type: 'success' })
      loadData()
    } catch (err: any) {
      setToast({ message: `Anki import failed: ${err.message}`, type: 'error' })
    }
  }

  const filteredCards = cards.filter(c => {
    const matchesType = cardTypeFilter === 'all' || c.type === cardTypeFilter
    const matchesSearch = !cardSearch.trim() ||
      c.front.toLowerCase().includes(cardSearch.toLowerCase()) ||
      c.back.toLowerCase().includes(cardSearch.toLowerCase())
    const matchesFolder =
      folderFilter === 'all' ||
      (folderFilter === 'uncategorized' ? !c.folder_id : c.folder_id === folderFilter)
    return matchesType && matchesSearch && matchesFolder
  })
  const flashcards = filteredCards.filter(c => c.type === 'flashcard')
  const activeRecalls = filteredCards.filter(c => c.type === 'active_recall')

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

  if (!subject) {
    return (
      <div className="p-8">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Subject not found.</p>
        <button onClick={() => navigate('/')} className="btn-secondary">Back to Dashboard</button>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl page-enter">
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
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              {subject.name}
            </h1>
            <span className={statusBadge[subject.status] || 'badge-slate'}>
              {statusLabel[subject.status] || subject.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-400 dark:text-slate-500 flex-wrap">
            {subject.course_code && (
              <span>{subject.course_code}</span>
            )}
            <span>{cards.length} cards total</span>
            {flashcards.length > 0 && (
              <span>{flashcards.length} flashcards</span>
            )}
            {activeRecalls.length > 0 && (
              <span>{activeRecalls.length} active recall</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <PomodoroWidget />
          <button
            onClick={() => setShowTextImport(true)}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M2 3h10M2 7h7M2 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M11 9v4M9 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Import
          </button>
          <button
            onClick={handleAnkiImport}
            className="px-3 py-1.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
          >
            Import Anki Deck (.apkg)
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

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-200 dark:border-slate-700">
        {([
          { id: 'cards', label: `Cards (${cards.length})` },
          { id: 'deadlines', label: `Deadlines (${deadlines.length})` }
        ] as { id: Tab; label: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cards Tab */}
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

          {/* Study this folder button — shown only when a specific folder is selected */}
          {typeof folderFilter === 'number' && (
            <div className="mb-3 flex justify-end">
              <SubjectDetailStudyMenu
                subjectId={subject.id}
                disabled={filteredCards.length === 0}
                folderId={folderFilter}
              />
            </div>
          )}

          {/* Search & filter */}
          {cards.length > 0 && (
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  type="text"
                  className="input pl-8 py-1.5 text-sm"
                  placeholder="Search cards..."
                  value={cardSearch}
                  onChange={e => setCardSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/50 rounded-lg p-1">
                {(['all', 'flashcard', 'active_recall'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setCardTypeFilter(type)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors font-medium ${
                      cardTypeFilter === type
                        ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {type === 'all' ? 'All' : type === 'flashcard' ? 'Flashcards' : 'Recall'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {cards.length === 0 ? (
            <div className="text-center py-14 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <p className="text-sm text-slate-400 dark:text-slate-500">No cards yet. Upload a document to generate cards.</p>
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <p className="text-sm text-slate-400 dark:text-slate-500">No cards match your search.</p>
              <button
                onClick={() => { setCardSearch(''); setCardTypeFilter('all') }}
                className="text-xs text-violet-500 hover:text-violet-700 dark:hover:text-violet-300 mt-2 transition-colors"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <CardBrowser
              cards={cards}
              folders={folders}
              onCardClick={(card) => {
                setSelectedCardForDetail(card)
              }}
              onDeleteCards={async (cardIds) => {
                for (const id of cardIds) {
                  await window.electronAPI.deleteCard(id)
                }
                loadData()
              }}
              onMoveCards={async (cardIds, folderId) => {
                for (const id of cardIds) {
                  await window.electronAPI.updateCardFolder(id, folderId)
                }
                loadData()
              }}
            />
          )}
        </div>
      )}

      {/* Deadlines Tab */}
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
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
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

      {/* Add Card Modal */}
      {showAddCard && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg p-6 animate-slide-up">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-1">Add Card Manually</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Create a card with a question and answer.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Type</label>
                <select
                  className="input"
                  value={newCardType}
                  onChange={e => setNewCardType(e.target.value as 'flashcard' | 'active_recall')}
                >
                  <option value="flashcard">Flashcard</option>
                  <option value="active_recall">Active Recall</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  {newCardType === 'flashcard' ? 'Term / Concept' : 'Question'}
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder={newCardType === 'flashcard' ? 'Enter the term or concept' : 'Enter the question'}
                  value={newCardFront}
                  onChange={e => setNewCardFront(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  {newCardType === 'flashcard' ? 'Definition / Explanation' : 'Model Answer'}
                </label>
                <textarea
                  className="input min-h-[100px] resize-none"
                  placeholder={newCardType === 'flashcard' ? 'Enter the definition' : 'Enter the model answer'}
                  value={newCardBack}
                  onChange={e => setNewCardBack(e.target.value)}
                />
              </div>
              <div className="mb-2">
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">Image URL (optional)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCardImageUrl}
                    onChange={(e) => setNewCardImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg dark:text-gray-200"
                  />
                </div>
                {newCardImageUrl && (
                  <img
                    src={newCardImageUrl}
                    alt="Preview"
                    className="mt-2 max-h-32 rounded-lg object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
              </div>
              {folders.length > 0 && (
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Folder (optional)</label>
                  <select
                    className="input"
                    value={newCardFolderId ?? ''}
                    onChange={e => setNewCardFolderId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">No folder</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddCard(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleAddCard}
                disabled={!newCardFront.trim() || !newCardBack.trim()}
                className="btn-primary flex-1"
              >
                Add Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Text Import Modal */}
      {showTextImport && (
        <TextImportModal
          folders={folders}
          onClose={() => setShowTextImport(false)}
          onSave={async (importedCards) => {
            if (!user) return
            await window.electronAPI.saveManyCards(
              importedCards.map(c => ({ subject_id: subjectId, ...c, is_manual: 1 })),
              user.id
            )
            await loadData()
            setShowTextImport(false)
          }}
        />
      )}

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

      {/* Edit Subject Modal */}
      {showEditSubject && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-5">Edit Subject</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Subject Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Subject name"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Course Code (optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. HIS-101"
                  value={editCode}
                  onChange={e => setEditCode(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Status</label>
                <select
                  className="input"
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value as 'active' | 'ongoing' | 'archived')}
                >
                  <option value="active">Active</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowEditSubject(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleUpdateSubject}
                disabled={!editName.trim()}
                className="btn-primary flex-1"
              >
                Save Changes
              </button>
            </div>
            <button
              onClick={handleDeleteSubject}
              className="w-full mt-3 py-2 text-sm text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
            >
              Delete Subject
            </button>
          </div>
        </div>
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
    if (!schedule || reviewCount === 0) return { label: 'New', color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-700' }
    if (schedule.interval >= 21 && schedule.ease_factor >= 2.5) return { label: 'Mastered', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40' }
    if (avgQuality !== null && avgQuality >= 4) return { label: 'Strong', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/40' }
    if (avgQuality !== null && avgQuality >= 2.5) return { label: 'Learning', color: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/40' }
    return { label: 'Needs Practice', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/40' }
  }

  const level = stats ? getUnderstandingLevel(stats.schedule, stats.avg_quality, stats.review_count) : null
  const avgSeconds = stats?.avg_response_time_ms != null ? (stats.avg_response_time_ms / 1000).toFixed(1) : null

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg p-6 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              card.type === 'flashcard'
                ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
            }`}>
              {card.type === 'flashcard' ? 'Flashcard' : 'Active Recall'}
            </span>
            {level && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${level.bg} ${level.color}`}>
                {level.label}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Front */}
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
            {card.type === 'flashcard' ? 'Term' : 'Question'}
          </p>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-relaxed bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4">
            {card.front}
          </p>
        </div>

        {/* Back */}
        <div className="mb-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
            {card.type === 'flashcard' ? 'Definition' : 'Model Answer'}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4">
            {card.back}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {stats?.review_count ?? '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Times practised</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {stats?.avg_quality != null ? (stats.avg_quality).toFixed(1) : '—'}
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">/5</span>
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Avg quality</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {avgSeconds != null ? `${avgSeconds}s` : '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Avg response</p>
          </div>
        </div>

        {/* Folder assignment */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Folder</label>
          <select
            className="input text-sm"
            value={card.folder_id ?? ''}
            onChange={e => onMoveToFolder(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">No folder</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}

// ── AI Prompt templates ───────────────────────────────────────────────────────

const FLASHCARD_PROMPT_LOCKED_PRE = `Generate `
const FLASHCARD_PROMPT_LOCKED_POST = ` high-quality flashcards from the study material I will attach. Use ONLY this exact format — no numbering, no extra text, no headers:

[front] ... [back] ; [front] ... [back] ; [front] ... [back]

Rules:
• Separate the front and back of each card with  ...  (three dots with spaces)
• Separate each card from the next with  ;  (semicolon)
• Front: a clear term, definition prompt, or concept question
• Back: a precise, concise answer or definition
• One idea per card — do not combine multiple concepts
• For any mathematical expression or equation, wrap it in $$ on each side, e.g. $$E = mc^2$$ or $$\\frac{d}{dx}[x^n] = nx^{n-1}$$

Only output the cards. Do not include any introduction, explanation, or closing remarks.`

const RECALL_PROMPT_LOCKED_PRE = `Generate `
const RECALL_PROMPT_LOCKED_POST = ` active recall questions from the study material I will attach. Use ONLY this exact format — no numbering, no extra text, no headers:

[question] ... [detailed answer] ; [question] ... [detailed answer]

Rules:
• Separate the question and answer with  ...  (three dots with spaces)
• Separate each question from the next with  ;  (semicolon)
• Questions should require genuine explanation, not a one-word answer
• Answers should be thorough enough to self-evaluate — typically 2–4 sentences
• Prioritise conceptual understanding, cause-and-effect, and application over surface recall
• For any mathematical expression or equation, wrap it in $$ on each side, e.g. $$ax^2 + bx + c = 0$$ or $$\\int_a^b f(x)\\,dx$$

Only output the questions. Do not include any introduction, explanation, or closing remarks.`

interface PromptBoxProps {
  type: 'flashcard' | 'recall'
}

function PromptBox({ type }: PromptBoxProps): React.JSX.Element {
  const STORAGE_KEY = `neuron_prompt_seen_${type}`
  const [open, setOpen] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [quantity, setQuantity] = useState('20')
  const [copied, setCopied] = useState(false)

  const isFlashcard = type === 'flashcard'
  const pre = isFlashcard ? FLASHCARD_PROMPT_LOCKED_PRE : RECALL_PROMPT_LOCKED_PRE
  const post = isFlashcard ? FLASHCARD_PROMPT_LOCKED_POST : RECALL_PROMPT_LOCKED_POST
  const fullPrompt = `${pre}${quantity}${post}`

  function handleOpen(): void {
    const seen = localStorage.getItem(STORAGE_KEY)
    setOpen(true)
    if (!seen) setShowInstructions(true)
  }

  function handleDismissInstructions(): void {
    if (dontShowAgain) localStorage.setItem(STORAGE_KEY, '1')
    setShowInstructions(false)
  }

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(fullPrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const label = isFlashcard ? 'Prompt for Flashcards' : 'Prompt for Active Recall'
  const icon = isFlashcard ? '🃏' : '🧠'

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button
        onClick={open ? () => setOpen(false) : handleOpen}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <span>{icon}</span>
          {label}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 16 16"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Instructions modal */}
      {showInstructions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <div className="text-2xl mb-3">{icon}</div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-1">
              How to use the {isFlashcard ? 'Flashcard' : 'Active Recall'} Prompt
            </h3>
            <ol className="mt-3 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center">1</span>
                <span>Copy the prompt below using the <strong>Copy</strong> button.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center">2</span>
                <span>Paste it into an AI like <strong>ChatGPT, Gemini, or Claude</strong>.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center">3</span>
                <span>Attach your notes, textbook pages, or any study material.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center">4</span>
                <span>Copy the AI's output and paste it into the <strong>Paste your cards</strong> box in this window.</span>
              </li>
            </ol>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
              Before copying, set how many {isFlashcard ? 'cards' : 'questions'} you want in the <strong>Count</strong> field — that's the only part you can edit.
            </p>
            <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={e => setDontShowAgain(e.target.checked)}
                className="rounded accent-violet-600"
              />
              <span className="text-sm text-slate-500 dark:text-slate-400">Don't show this again</span>
            </label>
            <button onClick={handleDismissInstructions} className="btn-primary w-full mt-4">
              Got it →
            </button>
          </div>
        </div>
      )}

      {open && !showInstructions && (
        <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 space-y-3">
          {/* Editable count */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 flex-shrink-0">
              Count
            </label>
            <input
              type="number"
              min={1}
              max={200}
              className="w-20 px-2 py-1 rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 text-slate-900 dark:text-slate-100 text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
            />
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {isFlashcard ? 'flashcards' : 'questions'} — only this can be edited
            </span>
          </div>

          {/* Prompt preview — locked sections are styled differently */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3 text-xs font-mono leading-relaxed text-slate-600 dark:text-slate-400 max-h-44 overflow-y-auto whitespace-pre-wrap select-all">
            <span className="text-slate-400 dark:text-slate-500 select-none">{pre}</span>
            <span className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-0.5 rounded font-bold">{quantity}</span>
            <span className="text-slate-400 dark:text-slate-500 select-none">{post}</span>
          </div>

          <button
            onClick={handleCopy}
            className={`w-full py-2 rounded-lg font-medium text-sm transition-colors ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-violet-600 hover:bg-violet-700 text-white'
            }`}
          >
            {copied ? '✓ Copied to clipboard!' : 'Copy Prompt'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function TextImportModal({ onClose, onSave, folders }: {
  onClose: () => void
  onSave: (cards: { type: 'flashcard' | 'active_recall'; front: string; back: string; folder_id?: number | null }[]) => Promise<void>
  folders: CardFolder[]
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [termSep, setTermSep] = useState('...')
  const [cardSep, setCardSep] = useState(';')
  const [eachLineIsCard, setEachLineIsCard] = useState(false)
  const [cardType, setCardType] = useState<'flashcard' | 'active_recall'>('flashcard')
  const [importFolderId, setImportFolderId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null)

  // Parse cards live
  const parsed = React.useMemo(() => {
    if (!text.trim() || !termSep.trim()) return []
    const sep = eachLineIsCard ? '\n' : cardSep
    if (!sep) return []
    return text
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
  }, [text, termSep, cardSep, eachLineIsCard])

  function handleFileLoad(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      setText(content)
      // Auto-configure separators for known formats
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

  async function handleSave(): Promise<void> {
    if (parsed.length === 0) return
    setSaving(true)
    try {
      await onSave(parsed.map(c => ({ ...c, type: cardType, folder_id: importFolderId })))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-2xl animate-slide-up flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Import Cards</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Paste text or load a file — no AI required.
              </p>
            </div>
            {/* Help button */}
            <button
              onClick={() => setShowHelp(v => !v)}
              className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-400 hover:text-violet-600 hover:border-violet-400 transition-colors flex-shrink-0 text-sm font-semibold"
              title="How does this work?"
            >
              ?
            </button>
          </div>

          {/* Help panel */}
          {showHelp && (
            <div className="mt-4 p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-800 text-sm text-slate-700 dark:text-slate-300 space-y-2 animate-fade-in">
              <p className="font-semibold text-violet-700 dark:text-violet-300">How import works</p>
              <p>Each card has a <strong>front</strong> (question/term) and a <strong>back</strong> (answer/definition). You need two separators:</p>
              <ul className="space-y-1 ml-3">
                <li>· <strong>Front/Back separator</strong> — splits a card's question from its answer. Default: <code className="bg-violet-100 dark:bg-violet-900 px-1 rounded">...</code></li>
                <li>· <strong>Card separator</strong> — splits one card from the next. Default: <code className="bg-violet-100 dark:bg-violet-900 px-1 rounded">;</code></li>
              </ul>
              <p className="font-medium">Example with defaults:</p>
              <code className="block bg-slate-100 dark:bg-slate-700 rounded-lg px-3 py-2 text-xs font-mono">
                What is H₂O...Water; What is photosynthesis...Plants converting sunlight to energy
              </code>
              <p className="font-medium mt-1">Supported file formats (no AI needed):</p>
              <ul className="space-y-1 ml-3">
                <li>· <strong>.txt / .md</strong> — plain text, use any separators you like</li>
                <li>· <strong>.csv</strong> — comma-separated: <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1 rounded">front,back</code> one card per line</li>
                <li>· <strong>.tsv</strong> — tab-separated: <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1 rounded">front[tab]back</code> one card per line</li>
              </ul>
            </div>
          )}
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">

          {/* File import */}
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
                onChange={handleFileLoad}
                className="hidden"
              />
            </label>
            {detectedFormat && (
              <p className="text-xs text-violet-600 dark:text-violet-400 mt-1.5 flex items-center gap-1">
                <span>✓</span> {detectedFormat}
              </p>
            )}
          </div>

          {/* Separators */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                Front / Back separator
              </label>
              <input
                type="text"
                className="input font-mono"
                value={termSep}
                onChange={e => setTermSep(e.target.value)}
                placeholder="e.g. ... or : or -"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                Card separator
              </label>
              <input
                type="text"
                className="input font-mono"
                value={cardSep}
                onChange={e => setCardSep(e.target.value)}
                disabled={eachLineIsCard}
                placeholder="e.g. ; or |"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={eachLineIsCard}
              onChange={e => setEachLineIsCard(e.target.checked)}
              className="rounded accent-violet-600"
            />
            <span className="text-sm text-slate-600 dark:text-slate-300">Each line is one card</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">(auto-set for CSV/TSV)</span>
          </label>

          {/* Card type */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
              Card Type
            </label>
            <div className="flex gap-2">
              {(['flashcard', 'active_recall'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setCardType(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    cardType === t
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-violet-400'
                  }`}
                >
                  {t === 'flashcard' ? 'Flashcard' : 'Active Recall'}
                </button>
              ))}
            </div>
          </div>

          {/* Folder assignment */}
          {folders.length > 0 && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                Add to Folder (optional)
              </label>
              <select
                className="input text-sm"
                value={importFolderId ?? ''}
                onChange={e => setImportFolderId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">No folder</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}

          {/* Paste area */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
              Paste your cards
            </label>
            <textarea
              className="input min-h-[120px] resize-none font-mono text-sm leading-relaxed"
              placeholder={`Term${termSep}Definition${eachLineIsCard ? '\nAnother term' + termSep + 'Another definition' : cardSep + ' Another term' + termSep + 'Another definition'}`}
              value={text}
              onChange={e => setText(e.target.value)}
              autoFocus={!detectedFormat}
            />
          </div>

          {/* AI Prompt helpers */}
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Generate with AI
            </label>
            <p className="text-xs text-slate-400 dark:text-slate-500 -mt-1">
              Copy a prompt into ChatGPT, Gemini, or Claude — attach your notes — paste the output above.
            </p>
            <PromptBox type="flashcard" />
            <PromptBox type="recall" />
          </div>

          {/* Live preview */}
          {text.trim() && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Preview</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  parsed.length > 0
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                }`}>
                  {parsed.length} card{parsed.length !== 1 ? 's' : ''} found
                </span>
              </div>
              {parsed.length > 0 ? (
                <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                  {parsed.map((card, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-2.5 bg-white dark:bg-slate-800">
                      <span className="text-xs text-slate-300 dark:text-slate-600 font-mono mt-0.5 w-5 flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0 flex items-start gap-2">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">{card.front}</p>
                        <span className="text-slate-300 dark:text-slate-600 flex-shrink-0 mt-0.5">→</span>
                        <p className="text-sm text-slate-500 dark:text-slate-400 flex-1 truncate">{card.back}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400">
                  No cards could be parsed. Check that your separators match the text, or click <strong>?</strong> for help.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-slate-100 dark:border-slate-700 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleSave}
            disabled={parsed.length === 0 || saving}
            className="btn-primary flex-1"
          >
            {saving ? 'Saving...' : `Import ${parsed.length > 0 ? parsed.length : ''} Card${parsed.length !== 1 ? 's' : ''}`}
          </button>
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
        {
          label: 'Flashcards',
          desc: 'Flip through cards in this folder — no schedule impact',
          route: `/study/${subjectId}?folderId=${folderId}`,
          dot: 'bg-violet-500'
        },
        {
          label: 'Multiple Choice',
          desc: 'Practice with answer options — no schedule impact',
          route: `/study/${subjectId}?mode=mc${folderSuffix}`,
          dot: 'bg-blue-500'
        },
        {
          label: 'Learn Mode',
          desc: 'Multiple-choice then written answers — no schedule impact',
          route: `/study/${subjectId}?mode=learn${folderSuffix}`,
          dot: 'bg-emerald-500'
        },
      ]
    : [
        {
          label: 'Study Now',
          desc: 'Flashcards & active recall with spaced repetition',
          route: `/study/${subjectId}`,
          dot: 'bg-violet-500'
        },
        {
          label: 'Multiple Choice',
          desc: 'Practice with answer options — no schedule impact',
          route: `/study/${subjectId}?mode=mc`,
          dot: 'bg-blue-500'
        },
        {
          label: 'Learn Mode',
          desc: 'Master cards through multiple-choice then written answers',
          route: `/study/${subjectId}?mode=learn`,
          dot: 'bg-emerald-500'
        },
      ]

  const buttonLabel = folderId != null ? 'Study this folder' : 'Study Now'

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
            <button
              key={opt.label}
              onClick={() => { setOpen(false); navigate(opt.route) }}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-start gap-3"
            >
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
