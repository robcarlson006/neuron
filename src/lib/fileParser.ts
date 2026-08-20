/**
 * File parsing utilities for PDF, DOCX, PPTX, TXT, and MD files
 * This module is used in the Electron main process only via IPC
 */

export type SupportedFileType = 'pdf' | 'docx' | 'pptx' | 'txt' | 'md'

export function getFileType(filename: string): SupportedFileType | null {
  const ext = filename.toLowerCase().split('.').pop()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'pptx') return 'pptx'
  if (ext === 'txt') return 'txt'
  if (ext === 'md') return 'md'
  return null
}

export function truncateText(text: string, maxChars: number = 15000): string {
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
