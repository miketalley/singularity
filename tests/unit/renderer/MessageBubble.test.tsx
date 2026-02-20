// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock syntax highlighter to avoid jsdom issues
vi.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }: { children: string }) => <pre>{children}</pre>
}))
vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: {}
}))

import MessageBubble from '../../../src/renderer/src/components/MessageBubble'

describe('MessageBubble', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. User message renders with content text visible
  it('renders user message with content text visible', () => {
    render(<MessageBubble role="user" content="Hello, world!" />)
    expect(screen.getByText('Hello, world!')).toBeTruthy()
  })

  // 2. Assistant message renders with markdown content
  it('renders assistant message with markdown content', () => {
    render(<MessageBubble role="assistant" content="This is **bold** text" />)
    expect(screen.getByText('bold')).toBeTruthy()
  })

  // 3. User message with status='pending' shows "Awaiting response..." text
  it('shows "Awaiting response..." for pending user message', () => {
    render(<MessageBubble role="user" content="My question" status="pending" />)
    expect(screen.getByText(/Awaiting response\.\.\./)).toBeTruthy()
  })

  // 4. User message with status='queued' shows "Queued" text
  it('shows "Queued" for queued user message', () => {
    render(<MessageBubble role="user" content="My question" status="queued" />)
    expect(screen.getByText('Queued')).toBeTruthy()
  })

  // 5. Content with [QUESTION_BLOCK]...[/QUESTION_BLOCK] renders a question card with "? Question" header
  it('renders question card with "? Question" header for QUESTION_BLOCK content', () => {
    const content = `Some intro text\n[QUESTION_BLOCK]\nWhat approach would you like?\n[/QUESTION_BLOCK]`
    render(<MessageBubble role="assistant" content={content} />)
    expect(screen.getByText('? Question')).toBeTruthy()
  })

  // 6. Question block with numbered options renders clickable option cards
  it('renders clickable option cards for numbered options in question block', () => {
    const content = `[QUESTION_BLOCK]\nWhich option do you prefer?\n1. **Option A** — Description of A\n2. **Option B** — Description of B\n[/QUESTION_BLOCK]`
    render(<MessageBubble role="assistant" content={content} />)

    expect(screen.getByText('Option A')).toBeTruthy()
    expect(screen.getByText('Description of A')).toBeTruthy()
    expect(screen.getByText('Option B')).toBeTruthy()
    expect(screen.getByText('Description of B')).toBeTruthy()

    // Options should be rendered as buttons (role="button")
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })

  // 7. Clicking an option card calls onQuestionOptionClick with formatted string
  it('calls onQuestionOptionClick with formatted string when option card is clicked', () => {
    const handleClick = vi.fn()
    const content = `[QUESTION_BLOCK]\nWhich option?\n1. **Option A** — Description of A\n2. **Option B** — Description of B\n[/QUESTION_BLOCK]`
    render(
      <MessageBubble
        role="assistant"
        content={content}
        onQuestionOptionClick={handleClick}
      />
    )

    // Click the first option card (the one containing "Option A")
    const optionA = screen.getByText('Option A').closest('[role="button"]')!
    fireEvent.click(optionA)

    expect(handleClick).toHaveBeenCalledTimes(1)
    expect(handleClick).toHaveBeenCalledWith('1. Option A — Description of A')
  })

  // 8. Content ending with a question mark paragraph shows "? Response Needed" trailing question card
  it('shows "? Response Needed" for content ending with a question paragraph', () => {
    const content = `Here is some information about the topic.\n\nWhat do you think about this?`
    render(<MessageBubble role="assistant" content={content} />)
    expect(screen.getByText('? Response Needed')).toBeTruthy()
  })

  // 9. Empty content renders without crashing
  it('renders without crashing when content is empty', () => {
    const { container } = render(<MessageBubble role="user" content="" />)
    expect(container).toBeTruthy()
  })

  it('renders without crashing when assistant content is empty', () => {
    const { container } = render(<MessageBubble role="assistant" content="" />)
    expect(container).toBeTruthy()
  })
})
