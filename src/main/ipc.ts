import { ipcMain, dialog, BrowserWindow } from 'electron'
import { basename } from 'path'
import {
  getAllWorkspaces,
  createWorkspace,
  deleteWorkspace,
  getConversationsByWorkspace,
  createConversation,
  updateConversationTitle,
  updateConversationModel,
  deleteConversation,
  getMessagesByConversation,
  addMessage
} from './database'
import { streamChatResponse, generateTitle } from './anthropic'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'

export function registerIpcHandlers(): void {
  // Workspace handlers
  ipcMain.handle('get-workspaces', () => {
    return getAllWorkspaces()
  })

  ipcMain.handle('add-workspace', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const folderPath = result.filePaths[0]
    const name = basename(folderPath)

    try {
      return createWorkspace(name, folderPath)
    } catch {
      // Path might already exist (UNIQUE constraint)
      return null
    }
  })

  ipcMain.handle('delete-workspace', (_event, id: number) => {
    deleteWorkspace(id)
    return true
  })

  // Conversation handlers
  ipcMain.handle('get-conversations', (_event, workspaceId: number) => {
    return getConversationsByWorkspace(workspaceId)
  })

  ipcMain.handle('create-conversation', (_event, workspaceId: number, model: string) => {
    return createConversation(workspaceId, 'New Conversation', model)
  })

  ipcMain.handle('update-conversation-title', (_event, id: number, title: string) => {
    updateConversationTitle(id, title)
    return true
  })

  ipcMain.handle('update-conversation-model', (_event, id: number, model: string) => {
    updateConversationModel(id, model)
    return true
  })

  ipcMain.handle('delete-conversation', (_event, id: number) => {
    deleteConversation(id)
    return true
  })

  // Message handlers
  ipcMain.handle('get-messages', (_event, conversationId: number) => {
    return getMessagesByConversation(conversationId)
  })

  ipcMain.handle('send-message', async (event, conversationId: number, content: string, model: string) => {
    // Save the user message
    addMessage(conversationId, 'user', content)

    // Load full message history
    const messages = getMessagesByConversation(conversationId) as Array<{
      role: 'user' | 'assistant'
      content: string
    }>

    // Format messages for the Anthropic API
    const formattedMessages: MessageParam[] = messages.map((msg) => ({
      role: msg.role,
      content: msg.content
    }))

    // Get the BrowserWindow that sent the message
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      throw new Error('Could not find browser window')
    }

    // Stream the response
    const responseText = await streamChatResponse(
      formattedMessages,
      model,
      conversationId,
      window
    )

    // Save the assistant response
    addMessage(conversationId, 'assistant', responseText)

    // Generate title if this is the first user message in the conversation
    const userMessages = messages.filter((m) => m.role === 'user')
    if (userMessages.length === 1) {
      try {
        const title = await generateTitle(content)
        updateConversationTitle(conversationId, title)
        window.webContents.send('conversation-title-updated', {
          conversationId,
          title
        })
      } catch {
        // Title generation is non-critical, don't fail the whole operation
      }
    }

    return responseText
  })
}
