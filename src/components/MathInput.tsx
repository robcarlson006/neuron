import React, { useEffect, useRef } from 'react'
import LatexText from './LatexText'
import { hasMathInput } from '../lib/mathFormatter'

interface MathInputProps {
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  placeholder?: string
  className?: string
  autoFocus?: boolean
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement>
  'data-testid'?: string
}

/**
 * A plain-text math field with a rendered companion preview. Keeping the raw
 * value means it remains editable and can still be sent to the tutor, while
 * expressions such as 5^2 and 5x/2 are shown as real mathematical notation.
 */
export default function MathInput({
  value,
  onChange,
  multiline = true,
  placeholder,
  className = '',
  autoFocus,
  onKeyDown,
  inputRef,
  'data-testid': testId
}: MathInputProps): React.JSX.Element {
  const internalRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const fieldRef = inputRef || internalRef

  useEffect(() => {
    const field = fieldRef.current
    if (!field || !multiline) return
    const textarea = field as HTMLTextAreaElement
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`
  }, [value, multiline, fieldRef])

  const field = multiline ? (
    <textarea
      ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown as React.KeyboardEventHandler<HTMLTextAreaElement>}
      placeholder={placeholder}
      autoFocus={autoFocus}
      rows={2}
      data-testid={testId}
      className={className}
    />
  ) : (
    <input
      ref={fieldRef as React.RefObject<HTMLInputElement>}
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown as React.KeyboardEventHandler<HTMLInputElement>}
      placeholder={placeholder}
      autoFocus={autoFocus}
      data-testid={testId}
      className={className}
    />
  )

  return (
    <div className="space-y-2">
      {field}
      {hasMathInput(value) && (
        <div className="rounded-lg border border-dashed border-violet-200 dark:border-violet-800/70 bg-violet-50/60 dark:bg-violet-950/20 px-3 py-2 text-sm text-slate-800 dark:text-slate-200">
          <span className="block text-[10px] font-semibold text-violet-500 dark:text-violet-400 mb-1">Math preview</span>
          <LatexText>{value}</LatexText>
        </div>
      )}
    </div>
  )
}
