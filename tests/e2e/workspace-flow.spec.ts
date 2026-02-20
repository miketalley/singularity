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
  page = await electronApp.firstWindow({ timeout: 15000 })
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  // Clean up test workspaces via IPC, then close
  try {
    await page.evaluate(() => {
      return (window as any).electronAPI.testDeleteWorkspacesByPattern('%/__e2e_test_%')
    })
  } catch {
    // Best-effort cleanup
  }
  await electronApp.close()
})

test('workspace creation is reflected in UI', async () => {
  // Skip if the app shows ApiKeyMissing (sidebar isn't rendered)
  const hasWorkspacesLabel = await page
    .locator('text=Workspaces')
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  test.skip(!hasWorkspacesLabel, 'Sidebar not visible (Claude CLI not available)')

  const testWorkspaceName = '__e2e_test_workspace_1'
  const testWorkspacePath = `/tmp/__e2e_test_${Date.now()}_1`

  // Create workspace via test-only IPC handler (bypasses native dialog)
  await page.evaluate(
    ({ name, wsPath }) => {
      return (window as any).electronAPI.testCreateWorkspace(name, wsPath)
    },
    { name: testWorkspaceName, wsPath: testWorkspacePath }
  )

  // Reload so the sidebar picks up the new workspace
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Wait for the sidebar to show the workspace name
  const workspaceLocator = page.locator(`text=${testWorkspaceName}`)
  await expect(workspaceLocator.first()).toBeVisible({ timeout: 10000 })
})

test('multiple workspaces can exist', async () => {
  const hasWorkspacesLabel = await page
    .locator('text=Workspaces')
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  test.skip(!hasWorkspacesLabel, 'Sidebar not visible (Claude CLI not available)')

  const workspaces = [
    { name: '__e2e_test_workspace_A', wsPath: `/tmp/__e2e_test_${Date.now()}_A` },
    { name: '__e2e_test_workspace_B', wsPath: `/tmp/__e2e_test_${Date.now()}_B` }
  ]

  // Create workspaces via test-only IPC
  for (const ws of workspaces) {
    await page.evaluate(
      ({ name, wsPath }) => {
        return (window as any).electronAPI.testCreateWorkspace(name, wsPath)
      },
      { name: ws.name, wsPath: ws.wsPath }
    )
  }

  // Reload so the sidebar fetches fresh data
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Both workspaces should be visible in the sidebar
  for (const ws of workspaces) {
    const locator = page.locator(`text=${ws.name}`)
    await expect(locator.first()).toBeVisible({ timeout: 10000 })
  }
})
