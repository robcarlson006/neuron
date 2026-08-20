import { parseClozeText, renderClozeHtml } from '../../src/lib/clozeParser'

describe('parseClozeText', () => {
  it('parses a single cloze deletion', () => {
    const result = parseClozeText('The {{c1::capital}} of France')
    expect(result.clozes).toEqual([{ ordinal: 1, answer: 'capital' }])
    expect(result.segments).toHaveLength(3)
  })

  it('parses multiple clozes with ordinals', () => {
    const result = parseClozeText('{{c1::Paris}} is the {{c2::capital}}')
    expect(result.clozes).toHaveLength(2)
    expect(result.clozes[1].ordinal).toBe(2)
  })

  it('returns empty clozes for text without cloze markers', () => {
    const result = parseClozeText('No clozes here')
    expect(result.clozes).toEqual([])
    expect(result.segments).toEqual([{ type: 'text', content: 'No clozes here' }])
  })

  it('returns empty result for empty string', () => {
    const result = parseClozeText('')
    expect(result.segments).toEqual([])
    expect(result.clozes).toEqual([])
  })

  it('trims the cloze answer', () => {
    const result = parseClozeText('{{c1::  padded answer  }}')
    expect(result.clozes[0].answer).toBe('padded answer')
  })
})

describe('renderClozeHtml', () => {
  it('shows blanks for unrevealed clozes', () => {
    const html = renderClozeHtml('{{c1::answer}}', new Set())
    expect(html).toContain('cloze-blank')
    expect(html).not.toContain('answer')
  })

  it('reveals the answer for revealed ordinals', () => {
    const html = renderClozeHtml('{{c1::answer}}', new Set([1]))
    expect(html).toContain('answer')
  })

  it('escapes HTML special characters', () => {
    const html = renderClozeHtml('<b> & "quote"', new Set())
    expect(html).toContain('&lt;b&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;')
  })
})
