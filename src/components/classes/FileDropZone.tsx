import React, { useRef, useState } from 'react'

interface PendingFile {
  name: string
  path: string
  size: number
}

interface FileDropZoneProps {
  onFilesSelected: (files: PendingFile[]) => void
  pendingFiles: PendingFile[]
  onRemoveFile: (index: number) => void
  accept?: string
  maxFiles?: number
}

export default function FileDropZone({
  onFilesSelected,
  pendingFiles,
  onRemoveFile,
  accept = '.pdf,.docx,.pptx,.txt,.md',
  maxFiles = 20
}: FileDropZoneProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleClick(): void {
    fileInputRef.current?.click()
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    processFiles(files)
    // Reset so same file can be re-selected
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setDragOver(false)

    // In Electron, dropped files lose their File.path.
    // Fall back to opening the native dialog.
    handleClick()
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setDragOver(false)
  }

  function processFiles(files: File[]): void {
    const validExts = accept.split(',').map(s => s.trim().toLowerCase().replace('.', ''))
    const newFiles: PendingFile[] = []

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      if (!validExts.includes(ext)) continue

      // In Electron with contextIsolation, file.path is only available from a file input
      const filePath = (file as any).path || file.name

      newFiles.push({
        name: file.name,
        path: filePath,
        size: file.size
      })
    }

    if (newFiles.length > 0) {
      const combined = [...pendingFiles, ...newFiles].slice(0, maxFiles)
      onFilesSelected(combined)
    }
  }

  const fileTypeIcons: Record<string, string> = {
    pdf: '📄',
    docx: '📝',
    pptx: '📊',
    txt: '📃',
    md: '📋'
  }

  function getFileType(name: string): string {
    return name.split('.').pop()?.toLowerCase() || ''
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
          ${dragOver
            ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
            : 'border-slate-300 dark:border-slate-600 hover:border-emerald-300 dark:hover:border-emerald-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-2">
          <span className="text-3xl">📁</span>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Drop files here or click to browse
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Supported: PDF, DOCX, PPTX, TXT, MD
          </p>
        </div>
      </div>

      {/* File list */}
      {pendingFiles.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''} selected
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {pendingFiles.map((file, i) => {
              const ext = getFileType(file.name)
              return (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 group"
                >
                  <span className="text-base flex-shrink-0">
                    {fileTypeIcons[ext] || '📎'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {formatSize(file.size)}
                    </p>
                  </div>
                  <button
                    onClick={() => onRemoveFile(i)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-1"
                    title="Remove file"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
