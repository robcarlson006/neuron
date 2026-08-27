/**
 * File parsing utilities for PDF, DOCX, PPTX, TXT, MD, CSV, TSV, RTF, and HTML files.
 * This module is used in the Electron main process and renderer.
 */

export type SupportedFileType =
  | 'pdf'
  | 'docx'
  | 'doc'
  | 'pptx'
  | 'ppt'
  | 'txt'
  | 'md'
  | 'csv'
  | 'tsv'
  | 'rtf'
  | 'html'
  | 'json'

export function getFileType(filename: string): SupportedFileType | null {
  const ext = filename.toLowerCase().split('.').pop()
  if (!ext) return null

  if (ext === 'pdf') return 'pdf'
  if (['docx', 'docm', 'dotx'].includes(ext)) return 'docx'
  if (ext === 'doc') return 'doc'
  if (['pptx', 'pptm', 'potx', 'ppsx'].includes(ext)) return 'pptx'
  if (ext === 'ppt') return 'ppt'
  if (['txt', 'text'].includes(ext)) return 'txt'
  if (['md', 'markdown'].includes(ext)) return 'md'
  if (ext === 'csv') return 'csv'
  if (ext === 'tsv') return 'tsv'
  if (ext === 'rtf') return 'rtf'
  if (['html', 'htm'].includes(ext)) return 'html'
  if (ext === 'json') return 'json'

  return null
}

export function truncateText(text: string, maxChars: number = 25000): string {
  if (text.length <= maxChars) return text
  return text.substring(0, maxChars) + '\n...[content truncated for processing]'
}

export function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
