import Anthropic from '@anthropic-ai/sdk'
import type { BrowserWindow } from 'electron'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'

let client: Anthropic | null = null

export function initAnthropicClient(): boolean {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return false
  }
  client = new Anthropic({ apiKey })
  return true
}

export function getClient(): Anthropic {
  if (!client) {
    throw new Error('Anthropic client not initialized. Call initAnthropicClient() first.')
  }
  return client
}

export async function streamChatResponse(
  messages: MessageParam[],
  model: string,
  conversationId: number,
  window: BrowserWindow
): Promise<string> {
  const anthropic = getClient()
  let fullResponse = ''

  const stream = anthropic.messages.stream({
    model,
    max_tokens: 4096,
    messages
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const text = event.delta.text
      fullResponse += text
      window.webContents.send('stream-delta', { conversationId, text })
    }
  }

  window.webContents.send('stream-complete', { conversationId })

  return fullResponse
}

export async function generateTitle(userMessage: string): Promise<string> {
  const anthropic = getClient()

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 30,
    messages: [
      {
        role: 'user',
        content: `Generate a concise title (5 words max) for a conversation that starts with this message. Reply with only the title, no quotes or punctuation:\n\n${userMessage}`
      }
    ]
  })

  const block = response.content[0]
  if (block.type === 'text') {
    return block.text.trim()
  }

  return 'New Conversation'
}
