import { execSync } from 'child_process'

export default function globalSetup(): void {
  // Ensure better-sqlite3 is compiled for Electron's Node version
  console.log('Rebuilding native modules for Electron...')
  execSync('npx electron-rebuild -f -w better-sqlite3', { stdio: 'inherit' })

  // Re-sign binaries (required on macOS 26+)
  execSync('node scripts/sign-electron.js', { stdio: 'inherit' })

  console.log('Building Electron app for e2e tests...')
  execSync('npx electron-vite build', { stdio: 'inherit' })
}
