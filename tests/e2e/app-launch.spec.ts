import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  })
  page = await electronApp.firstWindow()
  // Wait for the app to finish initial render
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await electronApp.close()
})

test('app launches and shows window', async () => {
  // The page object should exist (a window was created)
  expect(page).toBeTruthy()

  // The window should have a title (Electron sets it from the HTML or app name)
  const title = await page.title()
  expect(typeof title).toBe('string')

  // Window should have non-zero dimensions, proving it rendered
  const { width, height } = page.viewportSize() ?? { width: 0, height: 0 }
  expect(width).toBeGreaterThan(0)
  expect(height).toBeGreaterThan(0)
})

test('title bar shows singularity', async () => {
  // The App component renders a title bar div with the text "singularity"
  // This is visible in both the ApiKeyMissing and normal layout paths.
  // If ApiKeyMissing is shown (no Claude CLI), the heading is "Claude Code Required"
  // but the page still contains "Singularity" in the body text.
  // Either way, "singularity" or "Singularity" should appear somewhere on the page.
  const bodyText = await page.textContent('body')
  expect(bodyText).toBeTruthy()
  expect(bodyText!.toLowerCase()).toContain('singularity')
})

test('sidebar is visible', async () => {
  // When the app shows the full layout (hasApiKey = true), the sidebar renders with:
  //   - A "Workspaces" header label
  //   - A "+ Add" button
  // When ApiKeyMissing is shown, the sidebar is NOT rendered, but the full-screen
  // ApiKeyMissing component is present instead. We test for either case.

  const hasWorkspacesLabel = await page.locator('text=Workspaces').isVisible().catch(() => false)
  const hasAddButton = await page.locator('text=+ Add').isVisible().catch(() => false)
  const hasClaudeCodeRequired = await page
    .locator('text=Claude Code Required')
    .isVisible()
    .catch(() => false)

  // Either the sidebar is visible (full layout) or ApiKeyMissing is visible (no CLI)
  const sidebarVisible = hasWorkspacesLabel && hasAddButton
  const apiKeyMissingVisible = hasClaudeCodeRequired

  expect(sidebarVisible || apiKeyMissingVisible).toBe(true)
})

test('shows welcome or api-key-missing view', async () => {
  // Depending on whether Claude CLI is available in the test environment,
  // the app will show one of two views:
  //   1. WelcomeView: heading "Welcome to Singularity" + instructions text
  //   2. ApiKeyMissing: heading "Claude Code Required" + install instructions

  const bodyText = await page.textContent('body')
  expect(bodyText).toBeTruthy()

  const hasWelcome = bodyText!.includes('Welcome to Singularity')
  const hasApiKeyMissing = bodyText!.includes('Claude Code Required')

  // At least one of these views must be present, proving the app rendered
  // without crashing
  expect(hasWelcome || hasApiKeyMissing).toBe(true)

  // If WelcomeView is shown, also verify instruction text is present
  if (hasWelcome) {
    expect(bodyText).toContain('Add a workspace')
  }

  // If ApiKeyMissing is shown, verify install instructions
  if (hasApiKeyMissing) {
    expect(bodyText).toContain('claude-code')
  }
})
