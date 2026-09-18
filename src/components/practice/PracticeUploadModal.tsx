import React, { useState } from "react"
import { X, Upload, FileText, Sparkles, AlertCircle, Loader2 } from "../icons"
import type { SyllabusModule, ModuleTopic } from "../../types"

interface PracticeUploadModalProps {
  subjectId: number
  modules: (SyllabusModule & { topics?: ModuleTopic[] })[]
  onClose: () => void
  onSuccess: () => void
}

export default function PracticeUploadModal({
  subjectId,
  modules,
  onClose,
  onSuccess
}: PracticeUploadModalProps): React.JSX.Element {
  const [tab, setTab] = useState<"file" | "paste">("file")
  const [selectedModuleId, setSelectedModuleId] = useState<number | undefined>()
  const [selectedTopicId, setSelectedTopicId] = useState<number | undefined>()
  const [pastedText, setPastedText] = useState<string>("")
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string } | null>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [loadingMessage, setLoadingMessage] = useState<string>("Extracting with AI…")
  const [error, setError] = useState<string | null>(null)

  const currentModule = modules.find((m) => m.id === selectedModuleId)

  const handleSelectFile = async () => {
    try {
      if (!window.electronAPI.openFileDialog) return
      const filePath = await window.electronAPI.openFileDialog()
      if (filePath) {
        const name = filePath.split("/").pop() || filePath
        setSelectedFile({ path: filePath, name })
        setError(null)
      }
    } catch (err) {
      setError(String(err))
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      const filePath = (file as any).path || file.name
      setSelectedFile({ path: filePath, name: file.name })
      setError(null)
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (tab === "paste") return // Allow standard text paste in textarea

    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          try {
            const reader = new FileReader()
            reader.onload = async () => {
              try {
                const dataUrl = reader.result as string
                if (window.electronAPI?.saveTempImage) {
                  const tempPath = await window.electronAPI.saveTempImage(dataUrl)
                  setSelectedFile({
                    path: tempPath,
                    name: `Screenshot_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.png`
                  })
                  setError(null)
                }
              } catch (saveErr) {
                setError("Failed to save clipboard screenshot: " + String(saveErr))
              }
            }
            reader.readAsDataURL(file)
          } catch (err) {
            setError("Could not read clipboard image: " + String(err))
          }
          return
        }
      }
    }
  }

  const handleExtract = async () => {
    setLoading(true)
    setError(null)
    try {
      if (tab === "file") {
        if (!selectedFile) {
          setError("Please select or drop a file first.")
          setLoading(false)
          return
        }

        const isVisual = /\.(png|jpe?g|webp|heic|bmp|tiff|pdf)$/i.test(selectedFile.name)
        setLoadingMessage(
          isVisual
            ? "Transcribing problem set & formulas (OCR / AI)…"
            : "Reading document content…"
        )

        // Parse file (includes OCR and Vision AI fallback for images & scanned PDFs)
        const parsed = await window.electronAPI.parseFile(selectedFile.path)
        if (!parsed.contentText || parsed.contentText.trim().length < 15) {
          setError("Could not extract sufficient text from this file. Ensure the image or PDF is clear and readable.")
          setLoading(false)
          return
        }

        setLoadingMessage("Generating structured practice problems with AI…")

        // Save as material first
        const matRes = await window.electronAPI.saveMaterial({
          subject_id: subjectId,
          filename: selectedFile.name,
          file_type: parsed.fileType,
          content_text: parsed.contentText
        })

        // Extract problems
        const res = await window.electronAPI.practiceExtractFromMaterial(
          subjectId,
          matRes.id,
          selectedModuleId,
          selectedTopicId
        )

        if (!res.success) {
          setError(res.error || "Failed to extract practice problems.")
          setLoading(false)
          return
        }
      } else {
        if (!pastedText.trim() || pastedText.trim().length < 20) {
          setError("Please paste the problems or lecture text (at least 20 characters).")
          setLoading(false)
          return
        }

        setLoadingMessage("Extracting practice problems from text…")

        const res = await window.electronAPI.practiceExtractFromText(
          subjectId,
          pastedText,
          selectedModuleId,
          selectedTopicId
        )

        if (!res.success) {
          setError(res.error || "Failed to extract practice problems from text.")
          setLoading(false)
          return
        }
      }

      onSuccess()
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onPaste={handlePaste}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <Upload size={16} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Drop Practice Problems</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Import lecture problem sets, past exams, or homework</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Ingestion method tabs */}
          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800/60 p-1">
            <button
              onClick={() => setTab("file")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                tab === "file" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs" : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Upload size={14} /> File or Screenshot (PDF, Image, DOCX)
            </button>
            <button
              onClick={() => setTab("paste")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                tab === "paste" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs" : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <FileText size={14} /> Paste Text
            </button>
          </div>

          {/* Curriculum Target Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Module (Optional)</label>
              <select
                value={selectedModuleId || ""}
                onChange={(e) => {
                  setSelectedModuleId(e.target.value ? Number(e.target.value) : undefined)
                  setSelectedTopicId(undefined)
                }}
                className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">-- Auto Assign to Module --</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Topic (Optional)</label>
              <select
                value={selectedTopicId || ""}
                disabled={!selectedModuleId || !currentModule?.topics?.length}
                onChange={(e) => setSelectedTopicId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              >
                <option value="">-- All Module Topics --</option>
                {currentModule?.topics?.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* File Picker or Paste Area */}
          {tab === "file" ? (
            <div
              onClick={handleSelectFile}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40 ring-4 ring-violet-500/20 scale-[1.01]"
                  : "border-slate-300 dark:border-slate-700 hover:border-violet-500 dark:hover:border-violet-400 bg-slate-50/50 dark:bg-slate-800/30"
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center mb-3 shadow-inner">
                <Upload size={22} />
              </div>
              {selectedFile ? (
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{selectedFile.name}</p>
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">Click, drop, or paste (⌘V) a different file</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {isDragging ? "Drop screenshot or problem set here" : "Click or drop problem set / screenshot"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Supports Screenshots (PNG, JPG), Scanned PDFs, DOCX, PPTX</p>
                  <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    <span>💡 Tip: Press</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-mono font-bold">⌘V</kbd>
                    <span>to paste a screenshot directly</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Paste Problems & Exercises</label>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste math problems, economics calculations, or lecture slide questions..."
                rows={7}
                className="w-full text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs border border-rose-200 dark:border-rose-900">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={handleExtract}
            disabled={loading || (tab === "file" && !selectedFile) || (tab === "paste" && !pastedText.trim())}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 active:scale-98 rounded-xl shadow-md transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>{loadingMessage}</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Extract Practice Problems</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
