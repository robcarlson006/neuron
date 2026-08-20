import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import FileDropZone from '../../components/classes/FileDropZone'

interface PendingFile {
  name: string
  path: string
  size: number
}

interface DeadlineEntry {
  label: string
  deadline_date: string
  deadline_type: string
}

const DEADLINE_TYPES = [
  { value: 'exam', label: '📝 Exam' },
  { value: 'test', label: '📋 Test' },
  { value: 'quiz', label: '❓ Quiz' },
  { value: 'assignment', label: '📄 Assignment' },
  { value: 'presentation', label: '🎤 Presentation' },
  { value: 'personal', label: '📌 Personal' },
]

type Step = 'info' | 'materials' | 'deadlines' | 'syllabus' | 'review'

export default function ClassCreationWizard({
  onClose
}: {
  onClose: () => void
}): React.JSX.Element {
  const navigate = useNavigate()
  const { user, addSubject, addToast } = useAppStore()

  const [step, setStep] = useState<Step>('info')
  const [creating, setCreating] = useState(false)

  // Step 1: Info
  const [className, setClassName] = useState('')
  const [subjectType, setSubjectType] = useState<'class' | 'book'>('class')
  const [courseCode, setCourseCode] = useState('')
  const [timeCommitment, setTimeCommitment] = useState(60)
  const [classStatus, setClassStatus] = useState<'active' | 'ongoing'>('active')

  // Step 2: Materials
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [parsedFiles, setParsedFiles] = useState<{ name: string; fileType: string; contentText: string }[]>([])
  const [parsingFiles, setParsingFiles] = useState(false)

  // Step 3: Deadlines
  const [deadlines, setDeadlines] = useState<DeadlineEntry[]>([])

  // Step 4: Syllabus
  const [syllabusOption, setSyllabusOption] = useState<'generate' | 'later'>('generate')

  // ── File handling ──

  function handleFilesSelected(files: PendingFile[]): void {
    setPendingFiles(files)
  }

  function handleRemoveFile(index: number): void {
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
    setParsedFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function parsePendingFiles(): Promise<void> {
    if (parsingFiles || pendingFiles.length === 0) return
    setParsingFiles(true)
    try {
      const results: { name: string; fileType: string; contentText: string }[] = []
      for (const file of pendingFiles) {
        try {
          const result = await window.electronAPI.parseFile(file.path)
          results.push({
            name: result.filename,
            fileType: result.fileType,
            contentText: result.contentText
          })
        } catch (err) {
          console.error('Error parsing file:', file.name, err)
          results.push({
            name: file.name,
            fileType: 'txt',
            contentText: ''
          })
        }
      }
      setParsedFiles(results)
    } finally {
      setParsingFiles(false)
    }
  }

  // ── Deadline management ──

  function addDeadline(): void {
    setDeadlines(prev => [...prev, { label: '', deadline_date: '', deadline_type: 'personal' }])
  }

  function updateDeadline(index: number, field: keyof DeadlineEntry, value: string): void {
    setDeadlines(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d))
  }

  function removeDeadline(index: number): void {
    setDeadlines(prev => prev.filter((_, i) => i !== index))
  }

  // ── Navigation ──

  function canProceedFromInfo(): boolean {
    return className.trim().length > 0
  }

  function canProceedFromMaterials(): boolean {
    return pendingFiles.length > 0
  }

  // ── Create ──

  async function handleCreate(): Promise<void> {
    if (!user || creating) return
    setCreating(true)

    try {
      // Parse files if not already parsed
      if (parsedFiles.length === 0 && pendingFiles.length > 0) {
        await parsePendingFiles()
      }

      const data = {
        name: className.trim(),
        subjectType,
        courseCode: courseCode.trim() || undefined,
        timeCommitmentMinutes: timeCommitment,
        status: classStatus,
        materials: parsedFiles.length > 0 ? parsedFiles.map(f => ({
          filePath: '',
          filename: f.name,
          fileType: f.fileType,
          contentText: f.contentText,
          originalLength: f.contentText.length
        })) : [],
        deadlines: deadlines.filter(d => d.label && d.deadline_date).map(d => ({
          label: d.label,
          deadline_date: d.deadline_date,
          deadline_type: d.deadline_type
        })),
        syllabusOption
      }

      const result = await window.electronAPI.classCreate(user.id, data)
      if (result.success) {
        // Save subject to app store
        addSubject(result.subject)
        addToast({ type: 'success', title: 'Class Created', message: `"${className}" has been created.` })
        onClose()
        navigate(`/class/${result.subject.id}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addToast({ type: 'error', title: 'Creation Failed', message: msg })
    } finally {
      setCreating(false)
    }
  }

  // ── Steps ──

  function renderInfoStep(): React.JSX.Element {
    return (
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Class Name *
          </label>
          <input
            type="text"
            value={className}
            onChange={e => setClassName(e.target.value)}
            placeholder="e.g., Biology 101, Organic Chemistry"
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Type
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setSubjectType('class')}
              className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium border transition-all ${
                subjectType === 'class'
                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-400'
              }`}
            >
              🏫 Class
            </button>
            <button
              onClick={() => setSubjectType('book')}
              className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium border transition-all ${
                subjectType === 'book'
                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-400'
              }`}
            >
              📖 Book
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Course Code
            </label>
            <input
              type="text"
              value={courseCode}
              onChange={e => setCourseCode(e.target.value)}
              placeholder="e.g., BIO101"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Status
            </label>
            <select
              value={classStatus}
              onChange={e => setClassStatus(e.target.value as 'active' | 'ongoing')}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            >
              <option value="active">Active — Studying Now</option>
              <option value="ongoing">Ongoing — Taking It Slow</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Weekly Time Commitment: {timeCommitment} min/week
          </label>
          <input
            type="range"
            min={15}
            max={300}
            step={15}
            value={timeCommitment}
            onChange={e => setTimeCommitment(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>15 min</span>
            <span>~{Math.round(timeCommitment / 60 * 10) / 10}h</span>
            <span>5 hr</span>
          </div>
        </div>
      </div>
    )
  }

  function renderMaterialsStep(): React.JSX.Element {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Upload your study materials — lecture notes, textbook chapters, slides, or any course content.
          Neuron will extract the text and use it to build your curriculum.
        </p>

        <FileDropZone
          onFilesSelected={handleFilesSelected}
          pendingFiles={pendingFiles}
          onRemoveFile={handleRemoveFile}
        />

        {pendingFiles.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>⚠️ Files will be parsed when you create the class</span>
          </div>
        )}
      </div>
    )
  }

  function renderDeadlinesStep(): React.JSX.Element {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Add key dates for this class. Neuron uses these to plan your study schedule so you're ready on time.
        </p>

        {deadlines.map((dl, i) => (
          <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <div className="flex-1 grid grid-cols-3 gap-2">
              <input
                type="text"
                value={dl.label}
                onChange={e => updateDeadline(i, 'label', e.target.value)}
                placeholder="e.g., Midterm Exam"
                className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
              <input
                type="date"
                value={dl.deadline_date}
                onChange={e => updateDeadline(i, 'deadline_date', e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
              <div className="flex gap-1">
                <select
                  value={dl.deadline_type}
                  onChange={e => updateDeadline(i, 'deadline_type', e.target.value)}
                  className="flex-1 px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                >
                  {DEADLINE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeDeadline(i)}
                  className="px-2 py-2 text-slate-400 hover:text-red-500 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={addDeadline}
          className="w-full px-4 py-2.5 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-all"
        >
          + Add Deadline
        </button>
      </div>
    )
  }

  function renderSyllabusStep(): React.JSX.Element {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          How do you want to set up the syllabus for this class?
        </p>

        <button
          onClick={() => setSyllabusOption('generate')}
          className={`w-full text-left p-4 rounded-xl border transition-all ${
            syllabusOption === 'generate'
              ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
              : 'border-slate-300 dark:border-slate-600 hover:border-slate-400'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">🤖</span>
            <div>
              <p className="font-medium text-slate-800 dark:text-slate-200">Auto-generate from materials</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Neuron's AI will analyze your files and create a structured syllabus with modules, topics, and prerequisites.
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setSyllabusOption('later')}
          className={`w-full text-left p-4 rounded-xl border transition-all ${
            syllabusOption === 'later'
              ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
              : 'border-slate-300 dark:border-slate-600 hover:border-slate-400'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">✏️</span>
            <div>
              <p className="font-medium text-slate-800 dark:text-slate-200">I'll set it up myself</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Create the class first, then add modules and topics manually from the class overview page.
              </p>
            </div>
          </div>
        </button>
      </div>
    )
  }

  function renderReviewStep(): React.JSX.Element {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">{className}</h3>
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">
              {subjectType === 'class' ? '🏫 Class' : '📖 Book'}
            </span>
          </div>

          {courseCode && (
            <p className="text-sm text-slate-500">Course Code: {courseCode}</p>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-400">Status</p>
              <p className="text-slate-700 dark:text-slate-300 capitalize">{classStatus}</p>
            </div>
            <div>
              <p className="text-slate-400">Time/Week</p>
              <p className="text-slate-700 dark:text-slate-300">{timeCommitment} min</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
          <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
            Materials ({pendingFiles.length})
          </p>
          {pendingFiles.length > 0 ? (
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              {pendingFiles.map((f, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span>📎</span> {f.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No materials uploaded</p>
          )}
        </div>

        {deadlines.filter(d => d.label && d.deadline_date).length > 0 && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
            <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Deadlines</p>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              {deadlines.filter(d => d.label && d.deadline_date).map((d, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span>📅</span> {d.label} — {d.deadline_date}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
          <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Syllabus</p>
          <p className="text-sm text-slate-500 mt-1">
            {syllabusOption === 'generate'
              ? '🤖 Auto-generate from materials (AI will create modules and topics)'
              : '✏️ I will set it up manually'}
          </p>
        </div>
      </div>
    )
  }

  // ── Render ──

  const stepContent: Record<Step, React.JSX.Element> = {
    info: renderInfoStep(),
    materials: renderMaterialsStep(),
    deadlines: renderDeadlinesStep(),
    syllabus: renderSyllabusStep(),
    review: renderReviewStep()
  }

  const stepTitles: Record<Step, string> = {
    info: 'Class Info',
    materials: 'Materials',
    deadlines: 'Deadlines',
    syllabus: 'Syllabus',
    review: 'Review'
  }

  const stepIcons: Record<Step, string> = {
    info: '🏷️',
    materials: '📁',
    deadlines: '📅',
    syllabus: '📋',
    review: '✅'
  }

  const stepOrder: Step[] = ['info', 'materials', 'deadlines', 'syllabus', 'review']
  const currentIndex = stepOrder.indexOf(step)
  const progress = ((currentIndex + 1) / stepOrder.length) * 100

  function goNext(): void {
    if (step === 'info' && !canProceedFromInfo()) return
    if (step === 'materials' && !canProceedFromMaterials()) return
    const nextIndex = currentIndex + 1
    if (nextIndex < stepOrder.length) {
      setStep(stepOrder[nextIndex])
    }
  }

  function goBack(): void {
    const prevIndex = currentIndex - 1
    if (prevIndex >= 0) {
      setStep(stepOrder[prevIndex])
    }
  }

  const isLastStep = step === 'review'

  async function handleNextOrCreate(): Promise<void> {
    if (isLastStep) {
      await handleCreate()
    } else {
      // Parse files when leaving the materials step
      if (step === 'materials' && pendingFiles.length > 0 && parsedFiles.length === 0) {
        await parsePendingFiles()
      }
      goNext()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-lg">{stepIcons[step]}</span>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
              New {subjectType === 'class' ? 'Class' : 'Book'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Step label */}
        <div className="px-6 pt-3 pb-1">
          <p className="text-xs font-medium text-slate-400">
            Step {currentIndex + 1} of {stepOrder.length} — {stepTitles[step]}
          </p>
          <div className="mt-1.5 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step indicator dots */}
        <div className="flex justify-center gap-1.5 px-6 pt-2 pb-1">
          {stepOrder.map((s, i) => (
            <button
              key={s}
              onClick={() => {
                if (i <= currentIndex + 1 && i >= 0) setStep(s)
              }}
              disabled={i > currentIndex + 1}
              className={`w-2 h-2 rounded-full transition-all ${
                i === currentIndex
                  ? 'bg-emerald-500 scale-125'
                  : i < currentIndex
                  ? 'bg-emerald-300'
                  : 'bg-slate-300 dark:bg-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {stepContent[step]}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={currentIndex > 0 ? goBack : onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            {currentIndex > 0 ? '← Back' : 'Cancel'}
          </button>

          <button
            onClick={handleNextOrCreate}
            disabled={
              creating ||
              (step === 'info' && !canProceedFromInfo())
            }
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed flex items-center gap-2"
          >
            {creating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : isLastStep ? (
              '✨ Create Class'
            ) : (
              'Continue →'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
