// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import EphemeralText from '../../../src/renderer/src/components/EphemeralText'

describe('EphemeralText', () => {
  it('renders the text content', () => {
    render(<EphemeralText text="Let me look at the code..." />)
    expect(screen.getByText('Let me look at the code...')).toBeTruthy()
  })

  it('renders with italic styling', () => {
    const { container } = render(<EphemeralText text="Investigating..." />)
    const textEl = container.querySelector('[data-testid="ephemeral-text"]')
    expect(textEl).toBeTruthy()
    expect(textEl?.style.fontStyle).toBe('italic')
  })

  it('does not render a bubble wrapper', () => {
    const { container } = render(<EphemeralText text="Thinking..." />)
    // No element with assistant-bubble background
    const elements = container.querySelectorAll('*')
    const hasBubble = Array.from(elements).some(
      (el) => (el as HTMLElement).style.backgroundColor === 'var(--assistant-bubble)'
    )
    expect(hasBubble).toBe(false)
  })
})
