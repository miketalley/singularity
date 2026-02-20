import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'

const MAIN_JS = path.join(__dirname, '../../out/main/index.js')

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [MAIN_JS],
    env: {
      ...process.env,
      NODE_ENV: 'test'
    },
    timeout: 30000
  })
  page = await electronApp.firstWindow({ timeout: 30000 })
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await electronApp.close()
})

test('app launches and shows window', async () => {
  expect(page).toBeTruthy()

  const title = await page.title()
  expect(typeof title).toBe('string')

  // Electron windows don't set viewportSize; check window.innerWidth/Height instead
  const dims = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }))
  expect(dims.width).toBeGreaterThan(0)
  expect(dims.height).toBeGreaterThan(0)
})

test('title bar shows singularity', async () => {
  const bodyText = await page.textContent('body')
  expect(bodyText).toBeTruthy()
  expect(bodyText!.toLowerCase()).toContain('singularity')
})

test('sidebar or api-key-missing is visible', async () => {
  // Wait for content to render
  await page.waitForTimeout(1000)

  // The app shows either the full layout (sidebar with Workspaces) or ApiKeyMissing
  const hasWorkspacesLabel = await page
    .locator('text=Workspaces')
    .isVisible()
    .catch(() => false)
  const hasClaudeCodeRequired = await page
    .locator('text=Claude Code Required')
    .isVisible()
    .catch(() => false)

  expect(hasWorkspacesLabel || hasClaudeCodeRequired).toBe(true)
})

test('shows welcome or api-key-missing view', async () => {
  const bodyText = await page.textContent('body')
  expect(bodyText).toBeTruthy()

  const hasWelcome = bodyText!.includes('Welcome to Singularity')
  const hasApiKeyMissing = bodyText!.includes('Claude Code Required')

  expect(hasWelcome || hasApiKeyMissing).toBe(true)

  if (hasWelcome) {
    expect(bodyText).toContain('Add a workspace')
  }

  if (hasApiKeyMissing) {
    expect(bodyText).toContain('claude-code')
  }
})
