import { test, expect, _electron as electron } from '@playwright/test'
import { resolve } from 'path'

test.describe('Onboarding Flow', () => {
  test('complete onboarding and create a subject', async () => {
    // Launch Electron app
    const electronApp = await electron.launch({
      args: [resolve(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })

    const page = await electronApp.firstWindow()

    // Wait for app to load
    await page.waitForLoadState('domcontentloaded')

    // Should show onboarding page (no user yet)
    await expect(page.locator('[data-testid="name-input"]')).toBeVisible({ timeout: 10000 })

    // Enter name
    await page.fill('[data-testid="name-input"]', 'Test Student')

    // Submit onboarding
    await page.click('[data-testid="submit-onboarding"]')

    // Should navigate to dashboard
    await expect(page.locator('text=Test Student')).toBeVisible({ timeout: 10000 })

    // Dashboard should render
    await expect(page.locator('text=Cards due today')).toBeVisible()

    // Open Add Subject modal
    await page.click('text=Add Subject')

    // Fill in subject details
    await page.fill('[data-testid="subject-name-input"]', 'Mathematics')

    // Save subject
    await page.click('[data-testid="save-subject"]')

    // Subject should appear in dashboard
    await expect(page.locator('text=Mathematics')).toBeVisible({ timeout: 5000 })

    await electronApp.close()
  })

  test('app shows World History as pre-seeded subject', async () => {
    const electronApp = await electron.launch({
      args: [resolve(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })

    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // Complete onboarding if needed
    const nameInput = page.locator('[data-testid="name-input"]')
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.fill('[data-testid="name-input"]', 'Test User 2')
      await page.click('[data-testid="submit-onboarding"]')
    }

    // World History should be seeded
    await expect(page.locator('text=World History')).toBeVisible({ timeout: 10000 })

    await electronApp.close()
  })
})
