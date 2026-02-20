import Anthropic from '@anthropic-ai/sdk'
import type { BrowserWindow } from 'electron'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'

let client: Anthropic | null = null
let isOAuthToken = false

export function initAnthropicClient(): boolean {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return false
  }

  // OAuth tokens (from claude.ai / Claude Code) use Bearer auth with beta header
  isOAuthToken = apiKey.startsWith('sk-ant-oat')
  if (isOAuthToken) {
    client = new Anthropic({
      authToken: apiKey,
      apiKey: null,
      defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' }
    })
  } else {
    client = new Anthropic({ apiKey })
  }
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
  window: BrowserWindow,
  systemPrompt?: string
): Promise<string> {
  const anthropic = getClient()
  let fullResponse = ''

  const stream = anthropic.messages.stream({
    model,
    max_tokens: 4096,
    messages,
    ...(systemPrompt ? { system: systemPrompt } : {})
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
  try {
    const anthropic = getClient()

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
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
  } catch (err) {
    console.error('generateTitle API call failed, using fallback:', err)
  }

  // Fallback: use first few words of the user message
  const words = userMessage.trim().split(/\s+/).slice(0, 5).join(' ')
  return words.length > 40 ? words.slice(0, 40) + '...' : words
}

export async function extractMemories(
  messageContent: string,
  sentiment: 'positive' | 'negative' = 'positive'
): Promise<Array<{ text: string; category: string }>> {
  const anthropic = getClient()

  const positivePrompt = `Extract concise, actionable memory entries from the following message.
Each entry should be a single fact, decision, convention, or pattern worth repeating.
Return as JSON array only, no other text:

[{"text": "...", "category": "Tech Stack | Architecture | Conventions | Gotchas"}]

Only extract information that would be useful to remember across future conversations about this project.
Skip generic knowledge that any developer would know. Be specific to THIS project.
If nothing is worth remembering, return an empty array: []

Message:
${messageContent}`

  const negativePrompt = `Find concepts from this text that a user may want to prevent repeating in the future.
Each entry should describe a specific anti-pattern, mistake, or approach to avoid.
Phrase each entry as a clear warning starting with "AVOID:" (e.g., "AVOID: using inline styles for layout").
Return as JSON array only, no other text:

[{"text": "AVOID: ...", "category": "Tech Stack | Architecture | Conventions | Gotchas"}]

Only extract information that would be useful to remember across future conversations about this project.
Skip generic knowledge that any developer would know. Be specific to THIS project.
If nothing is worth flagging, return an empty array: []

Message:
${messageContent}`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: sentiment === 'positive' ? positivePrompt : negativePrompt
      }
    ]
  })

  const block = response.content[0]
  if (block.type !== 'text') return []

  try {
    const parsed = JSON.parse(block.text)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Record<string, unknown>).text === 'string' &&
        typeof (e as Record<string, unknown>).category === 'string'
    )
  } catch {
    return []
  }
}
