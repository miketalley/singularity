import { ipcMain, dialog, BrowserWindow } from 'electron'
import { basename } from 'path'
import {
  getAllWorkspaces,
  createWorkspace,
  deleteWorkspace,
  getConversationsByWorkspace,
  createConversation,
  getConversation,
  getDatabase,
  updateConversationTitle,
  updateConversationModel,
  deleteConversation,
  getWorkspaceForConversation,
  getMessagesByConversation,
  addMessage,
  getSetting,
  setSetting
} from './database'
import { generateTitle } from './anthropic'
import { sendClaudeMessage, generateSessionId, isClaudeAvailable } from './claude-cli'
import { log } from './logger'

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
    const sessionId = generateSessionId()
    return createConversation(workspaceId, 'New Conversation', model, sessionId)
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

  // Check if Claude CLI is available
  ipcMain.handle('get-api-key-status', () => {
    return isClaudeAvailable()
  })

  // Settings handlers
  ipcMain.handle('get-setting', (_event, key: string, defaultValue?: string) => {
    return getSetting(key, defaultValue)
  })

  ipcMain.handle('set-setting', (_event, key: string, value: string) => {
    setSetting(key, value)
    return true
  })

  // Message handlers
  ipcMain.handle('get-messages', (_event, conversationId: number) => {
    return getMessagesByConversation(conversationId)
  })

  ipcMain.handle(
    'send-message',
    async (event, conversationId: number, content: string, model: string) => {
      log('ipc', 'send-message', { conversationId, model, contentLength: content.length })

      // Save the user message
      addMessage(conversationId, 'user', content)

      // Get the BrowserWindow that sent the message
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) {
        throw new Error('Could not find browser window')
      }

      // Look up the conversation's session_id and workspace path
      const conv = getConversation(conversationId) as {
        title: string
        session_id: string | null
      } | undefined
      if (!conv) {
        throw new Error('Conversation not found')
      }

      const workspace = getWorkspaceForConversation(conversationId) as {
        name: string
        path: string
      } | undefined
      if (!workspace) {
        throw new Error('Workspace not found for conversation')
      }

      // Generate session_id if conversation doesn't have one (legacy conversations)
      let sessionId = conv.session_id
      if (!sessionId) {
        sessionId = generateSessionId()
        const db = getDatabase()
        db.prepare('UPDATE conversations SET session_id = ? WHERE id = ?').run(
          sessionId,
          conversationId
        )
      }

      // Determine if this is the first message (no previous assistant messages)
      const messages = getMessagesByConversation(conversationId) as Array<{
        role: string
      }>
      const hasAssistantMessages = messages.some((m) => m.role === 'assistant')
      const isFirstMessage = !hasAssistantMessages

      log('ipc', 'Sending via Claude CLI', {
        sessionId,
        isFirstMessage,
        workspacePath: workspace.path
      })

      // Send via Claude CLI
      const responseText = await sendClaudeMessage(
        conversationId,
        sessionId,
        content,
        workspace.path,
        model,
        window,
        isFirstMessage
      )

      // Save the assistant response
      addMessage(conversationId, 'assistant', responseText)

      // Generate title if conversation still has the default title
      if (conv.title === 'New Conversation') {
        try {
          const title = await generateTitle(content)
          updateConversationTitle(conversationId, title)
          window.webContents.send('conversation-title-updated', {
            conversationId,
            title
          })
        } catch (err) {
          console.error('Failed to generate title:', err)
        }
      }

      return responseText
    }
  )
}
