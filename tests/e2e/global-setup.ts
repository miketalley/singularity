import { execSync } from 'child_process'

export default function globalSetup(): void {
  console.log('Building Electron app for e2e tests...')
  execSync('npx electron-vite build', { stdio: 'inherit' })
}
