import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import SubjectAppearancePicker, { DEFAULT_SUBJECT_COLOR, DEFAULT_SUBJECT_ICON, SUBJECT_ICONS, getSubjectIcon } from '../../src/components/SubjectAppearancePicker'

describe('SubjectAppearancePicker', () => {
  it('exposes a large searchable icon catalog and falls back safely', () => {
    expect(SUBJECT_ICONS.length).toBeGreaterThan(35)
    expect(getSubjectIcon('missing-icon').name).toBe(DEFAULT_SUBJECT_ICON)
    render(<SubjectAppearancePicker onIconChange={jest.fn()} onColorChange={jest.fn()} />)
    expect(screen.getByLabelText('Choose book-open icon')).toBeInTheDocument()
  })

  it('filters icons and reports icon and color choices', () => {
    const onIconChange = jest.fn()
    const onColorChange = jest.fn()
    render(<SubjectAppearancePicker icon={DEFAULT_SUBJECT_ICON} color={DEFAULT_SUBJECT_COLOR} onIconChange={onIconChange} onColorChange={onColorChange} />)

    fireEvent.change(screen.getByLabelText('Browse icons'), { target: { value: 'science' } })
    expect(screen.getByLabelText('Choose flask icon')).toBeInTheDocument()
    expect(screen.queryByLabelText('Choose calendar icon')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Choose flask icon'))
    expect(onIconChange).toHaveBeenCalledWith('flask')

    fireEvent.click(screen.getByLabelText('Choose color #2563eb'))
    expect(onColorChange).toHaveBeenCalledWith('#2563eb')
  })

  it('supports a custom color input', () => {
    const onColorChange = jest.fn()
    render(<SubjectAppearancePicker onIconChange={jest.fn()} onColorChange={onColorChange} />)
    fireEvent.change(screen.getByLabelText('Choose custom logo color'), { target: { value: '#123456' } })
    expect(onColorChange).toHaveBeenCalledWith('#123456')
  })
})
