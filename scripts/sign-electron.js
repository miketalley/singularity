// Ad-hoc signs the Electron binary for macOS 26.2+ compatibility.
// Without this, unsigned Electron dev binaries get SIGKILL'd by code signing enforcement.

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

if (process.platform !== 'darwin') {
  process.exit(0)
}

const electronApp = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app')

if (!fs.existsSync(electronApp)) {
  console.log('Electron.app not found, skipping signing')
  process.exit(0)
}

const entitlements = path.join(__dirname, 'entitlements.mac.plist')

// Patch the Info.plist so macOS menu bar and dock show "singularity" during development
const plistPath = path.join(electronApp, 'Contents', 'Info.plist')
try {
  execSync(`plutil -replace CFBundleName -string "singularity" "${plistPath}"`, { stdio: 'pipe' })
  execSync(`plutil -replace CFBundleDisplayName -string "singularity" "${plistPath}"`, {
    stdio: 'pipe'
  })
  console.log('Patched Electron.app Info.plist with app name "singularity"')
} catch (err) {
  console.warn('Warning: Failed to patch Info.plist:', err.message)
}

console.log('Signing Electron.app for macOS compatibility...')

try {
  // Sign nested dylibs
  execSync(
    `find "${electronApp}/Contents/Frameworks" -type f -name "*.dylib" -exec codesign --force --sign - --entitlements "${entitlements}" {} \\;`,
    { stdio: 'pipe' }
  )

  // Sign nested frameworks
  const frameworks = execSync(
    `find "${electronApp}/Contents/Frameworks" -type d -name "*.framework"`,
    { encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .reverse()

  for (const fw of frameworks) {
    execSync(`codesign --force --sign - --entitlements "${entitlements}" "${fw}"`, {
      stdio: 'pipe'
    })
  }

  // Sign nested apps
  const apps = execSync(
    `find "${electronApp}/Contents/Frameworks" -type d -name "*.app"`,
    { encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .reverse()

  for (const app of apps) {
    execSync(`codesign --force --deep --sign - --entitlements "${entitlements}" "${app}"`, {
      stdio: 'pipe'
    })
  }

  // Sign the main app
  execSync(
    `codesign --force --deep --sign - --entitlements "${entitlements}" "${electronApp}"`,
    { stdio: 'pipe' }
  )

  // Sign native .node modules so they match the Electron signature
  const nodeModulesDir = path.join(__dirname, '..', 'node_modules')
  const nodeFiles = execSync(
    `find "${nodeModulesDir}" -name "*.node" -type f`,
    { encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .filter(Boolean)

  for (const nodeFile of nodeFiles) {
    execSync(`codesign --force --sign - "${nodeFile}"`, { stdio: 'pipe' })
  }

  console.log('Electron.app signed successfully')
} catch (err) {
  console.warn('Warning: Failed to sign Electron.app:', err.message)
}
