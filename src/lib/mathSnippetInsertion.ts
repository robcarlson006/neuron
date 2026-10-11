import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'

export interface SnippetInsertion {
  value: string
  selectionStart: number
  selectionEnd: number
}

/**
 * Inserts a LaTeX snippet without losing the user's selection.  Template
 * snippets deliberately leave the caret in their first editable field.
 */
export function insertMathSnippet(value: string, snippet: string, start: number, end: number): SnippetInsertion {
  const selectionStart = Math.max(0, Math.min(start, value.length))
  const selectionEnd = Math.max(selectionStart, Math.min(end, value.length))
  const templateCaret = snippet.indexOf('{')
  const caretOffset = templateCaret === -1 ? snippet.length : templateCaret + 1

  return {
    value: `${value.slice(0, selectionStart)}${snippet}${value.slice(selectionEnd)}`,
    selectionStart: selectionStart + caretOffset,
    selectionEnd: selectionStart + caretOffset
  }
}

/**
 * Keeps selection restoration in the layout phase, after a controlled input
 * has rendered the new value but before the browser paints it.
 */
export function useMathSnippetInsertion(
  value: string,
  setValue: (value: string) => void,
  textareaRef: RefObject<HTMLTextAreaElement | null>
): (snippet: string) => void {
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)

  useLayoutEffect(() => {
    const selection = pendingSelection.current
    const textarea = textareaRef.current
    if (!selection || !textarea) return

    textarea.focus()
    textarea.setSelectionRange(selection.start, selection.end)
    pendingSelection.current = null
  }, [value, textareaRef])

  return useCallback((snippet: string) => {
    const textarea = textareaRef.current
    const insertion = insertMathSnippet(
      textarea?.value ?? value,
      snippet,
      textarea?.selectionStart ?? value.length,
      textarea?.selectionEnd ?? value.length
    )
    pendingSelection.current = { start: insertion.selectionStart, end: insertion.selectionEnd }
    setValue(insertion.value)
  }, [setValue, textareaRef, value])
}
