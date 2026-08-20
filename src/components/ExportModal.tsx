import React, { useState, useEffect } from 'react'
import type { ExportData, ImportResult } from '../types'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  userId: number
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, userId }) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export')
  const [exportData, setExportData] = useState<ExportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setExportData(null)
      setImportResult(null)
      setError(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  const handleExport = async () => {
    setLoading(true)
    setError(null)
    try {
      const api = (window as any).electronAPI
      if (!api) throw new Error('No IPC bridge available')
      const data = await api.exportAllData(userId)
      setExportData(data)
    } catch (err: any) {
      setError(err.message || 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!exportData) return
    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const date = new Date().toISOString().split('T')[0]
    a.download = `neuron-export-${date}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setLoading(true)
      setError(null)
      try {
        const api = (window as any).electronAPI
        if (!api) throw new Error('No IPC bridge available')
        const text = await file.text()
        const data = JSON.parse(text) as ExportData
        if (!data.version || !data.subjects) {
          throw new Error('Invalid export file format')
        }
        const result = await api.importData(data, userId)
        setImportResult(result)
      } catch (err: any) {
        setError(err.message || 'Import failed')
      } finally {
        setLoading(false)
      }
    }
    input.click()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Import/Export cards"
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold dark:text-white">Data Management</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex mb-6 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'export'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Export
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'import'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Import
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Export your cards, schedules, and deadlines as a single JSON file. This includes all subjects and their data.
            </p>

            {!exportData ? (
              <button
                onClick={handleExport}
                disabled={loading}
                className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-xl font-medium transition-colors"
              >
                {loading ? 'Preparing export...' : 'Preview Export Data'}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <h4 className="font-medium text-sm dark:text-white mb-2">Export Summary</h4>
                  <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    <p>Subjects: {exportData.subjects.length}</p>
                    <p>Cards: {exportData.subjects.reduce((sum, s) => sum + (s.cards?.length || 0), 0)}</p>
                    <p>Deadlines: {exportData.deadlines.length}</p>
                    <p>Concepts tracked: {exportData.concept_mastery.length}</p>
                    <p>Folders: {exportData.folders.length}</p>
                  </div>
                </div>

                <button
                  onClick={handleDownload}
                  className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors"
                >
                  Download JSON File
                </button>
              </div>
            )}

            <p className="text-xs text-gray-400 dark:text-gray-500">
              Your data is exported in JSON format. You can import it later from any Neuron installation.
            </p>
          </div>
        )}

        {/* Import Tab */}
        {activeTab === 'import' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Import cards from a previously exported Neuron JSON file. This will create new subjects and cards.
            </p>

            {!importResult ? (
              <button
                onClick={handleImport}
                disabled={loading}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-xl font-medium transition-colors"
              >
                {loading ? 'Importing...' : 'Choose Export File'}
              </button>
            ) : (
              <div className="space-y-3">
                <div className={`p-4 rounded-xl ${
                  importResult.errors.length > 0
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200'
                    : 'bg-green-50 dark:bg-green-900/20 border border-green-200'
                }`}>
                  <h4 className="font-medium text-sm mb-2">Import Results</h4>
                  <div className="space-y-1 text-sm">
                    <p className="text-gray-700 dark:text-gray-300">Subjects created: {importResult.subjectsCreated}</p>
                    <p className="text-gray-700 dark:text-gray-300">Cards imported: {importResult.cardsImported}</p>
                    <p className="text-gray-700 dark:text-gray-300">Deadlines imported: {importResult.deadlinesImported}</p>
                    {importResult.errors.length > 0 && (
                      <div className="mt-2">
                        <p className="text-red-600 dark:text-red-400 text-xs font-medium">Warnings:</p>
                        {importResult.errors.slice(0, 5).map((e, i) => (
                          <p key={i} className="text-red-500 dark:text-red-400 text-xs">{e}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => { setImportResult(null); onClose() }}
                  className="w-full px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            <p className="text-xs text-gray-400 dark:text-gray-500">
              Importing adds data without removing existing content. You may get duplicate subjects.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ExportModal
