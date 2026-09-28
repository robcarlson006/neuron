import { test, expect, _electron as electron } from '@playwright/test'
import { resolve } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'

const runningApps: Array<{ app: Awaited<ReturnType<typeof electron.launch>>; userDataDir: string }> = []

test.afterEach(async () => {
  for (const { app, userDataDir } of runningApps.splice(0)) {
    await app.close().catch(() => {})
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test.describe('Onboarding Flow', () => {
  test('complete onboarding and create a subject', async () => {
    const userDataDir = mkdtempSync(resolve(tmpdir(), 'neuron-e2e-'))
    // Launch Electron app
    const electronApp = await electron.launch({
      args: [resolve(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        NEURON_TEST_USER_DATA_DIR: userDataDir
      }
    })
    runningApps.push({ app: electronApp, userDataDir })

    const page = await electronApp.firstWindow()

    // Wait for app to load
    await page.waitForLoadState('domcontentloaded')

    // A unique user-data directory makes this deterministic and disposable.
    await expect(page.locator('[data-testid="name-input"]')).toBeVisible({ timeout: 10000 })

    // Enter name
    await page.fill('[data-testid="name-input"]', 'Test Student')

    // Submit onboarding
    await page.click('[data-testid="submit-onboarding"]')

    await expect(page.getByText(/Test Student/i)).toBeVisible({ timeout: 10000 })

    // Open Add Subject modal
    await page.click('text=Add Subject')

    // Complete the current five-step class wizard without optional materials.
    await page.getByPlaceholder('e.g., Biology 101, Organic Chemistry').fill('Mathematics')
    for (let step = 0; step < 4; step++) {
      await page.getByRole('button', { name: 'Continue →' }).click()
    }
    await page.getByRole('button', { name: /Create Class/ }).click()

    // Subject should appear in dashboard
    await expect(page.locator('text=Mathematics')).toBeVisible({ timeout: 5000 })

  })

  test('a fresh isolated profile starts without an existing account', async () => {
    const userDataDir = mkdtempSync(resolve(tmpdir(), 'neuron-e2e-'))
    const electronApp = await electron.launch({
      args: [resolve(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        NEURON_TEST_USER_DATA_DIR: userDataDir
      }
    })
    runningApps.push({ app: electronApp, userDataDir })

    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('[data-testid="name-input"]')).toBeVisible({ timeout: 10000 })

  })
})
