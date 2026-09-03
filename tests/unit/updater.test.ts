import { isNewer, pickAsset, buildMacInstallScript } from '../../electron/ipc/updaterHandlers'

describe('Updater - isNewer semver comparison', () => {
  test('returns true when patch version is higher', () => {
    expect(isNewer('3.1.0', '3.1.1')).toBe(true)
  })

  test('returns true when minor version is higher', () => {
    expect(isNewer('3.1.0', '3.2.0')).toBe(true)
  })

  test('returns true when major version is higher', () => {
    expect(isNewer('3.1.0', '4.0.0')).toBe(true)
  })

  test('returns false when current version is higher or equal', () => {
    expect(isNewer('3.1.0', '3.1.0')).toBe(false)
    expect(isNewer('3.2.0', '3.1.9')).toBe(false)
    expect(isNewer('4.0.0', '3.9.9')).toBe(false)
  })

  test('handles v prefix correctly', () => {
    expect(isNewer('v3.1.0', 'v3.1.1')).toBe(true)
    expect(isNewer('3.1.0', 'v3.1.1')).toBe(true)
    expect(isNewer('v3.1.1', '3.1.0')).toBe(false)
  })

  test('handles prerelease suffixes gracefully', () => {
    expect(isNewer('3.1.0', '3.1.1-beta.1')).toBe(true)
    expect(isNewer('3.1.0-alpha', '3.1.0')).toBe(false)
  })

  test('handles missing or empty inputs', () => {
    expect(isNewer('', '3.1.0')).toBe(false)
    expect(isNewer('3.1.0', '')).toBe(false)
  })
})

describe('Updater - pickAsset selection', () => {
  const sampleAssets = [
    { name: 'Neuron-3.2.0-arm64.dmg', browser_download_url: 'https://github.com/downloads/Neuron-3.2.0-arm64.dmg' },
    { name: 'Neuron-3.2.0-x64.dmg', browser_download_url: 'https://github.com/downloads/Neuron-3.2.0-x64.dmg' },
    { name: 'Neuron-3.2.0-mac.zip', browser_download_url: 'https://github.com/downloads/Neuron-3.2.0-mac.zip' },
    { name: 'Neuron-Setup-3.2.0.exe', browser_download_url: 'https://github.com/downloads/Neuron-Setup-3.2.0.exe' },
    { name: 'Neuron-3.2.0.AppImage', browser_download_url: 'https://github.com/downloads/Neuron-3.2.0.AppImage' },
    { name: 'latest-mac.yml', browser_download_url: 'https://github.com/downloads/latest-mac.yml' }
  ]

  test('picks arm64 DMG on macOS arm64', () => {
    const url = pickAsset(sampleAssets, 'darwin', 'arm64')
    expect(url).toBe('https://github.com/downloads/Neuron-3.2.0-arm64.dmg')
  })

  test('picks x64 DMG on macOS x64', () => {
    const url = pickAsset(sampleAssets, 'darwin', 'x64')
    expect(url).toBe('https://github.com/downloads/Neuron-3.2.0-x64.dmg')
  })

  test('respects preferredArch override on macOS', () => {
    const url = pickAsset(sampleAssets, 'darwin', 'arm64', 'x64')
    expect(url).toBe('https://github.com/downloads/Neuron-3.2.0-x64.dmg')
  })

  test('picks NSIS exe on Windows', () => {
    const url = pickAsset(sampleAssets, 'win32', 'x64')
    expect(url).toBe('https://github.com/downloads/Neuron-Setup-3.2.0.exe')
  })

  test('picks AppImage on Linux', () => {
    const url = pickAsset(sampleAssets, 'linux', 'x64')
    expect(url).toBe('https://github.com/downloads/Neuron-3.2.0.AppImage')
  })

  test('returns null for empty asset list', () => {
    expect(pickAsset([], 'darwin', 'arm64')).toBeNull()
  })
})

describe('Updater - buildMacInstallScript', () => {
  test('generates valid shell script with mount and quarantine commands', () => {
    const script = buildMacInstallScript('/tmp/Neuron-update.dmg')
    expect(script).toContain('#!/bin/bash')
    expect(script).toContain('hdiutil attach')
    expect(script).toContain('xattr -cr')
    expect(script).toContain('hdiutil detach')
    expect(script).toContain('/Applications/Neuron.app')
  })
})

describe('Updater - GitHub configuration', () => {
  test('has correct GitHub repo identifiers defined', async () => {
    const { GITHUB_OWNER, GITHUB_REPO, GITHUB_REPO_ID } = await import('../../electron/ipc/updaterHandlers')
    expect(GITHUB_OWNER).toBe('robmcarlson006')
    expect(GITHUB_REPO).toBe('neuron')
    expect(GITHUB_REPO_ID).toBe('1205182997')
  })
})

